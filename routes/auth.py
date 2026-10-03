import re

import httpx
from flask import Blueprint, request

from config import SUPABASE_KEY, SUPABASE_URL, auth_client
from routes.common import body, error, ok

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def session_payload(session):
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_at": session.expires_at,
    }


def user_payload(user):
    meta = user.user_metadata or {}
    return {"id": user.id, "email": user.email, "full_name": meta.get("full_name", "")}


@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()

    if not email or not password:
        return error("Email and password are required")
    if len(password) < 8:
        return error("Use at least 8 characters for your password")

    try:
        # full_name goes into the user metadata; the handle_new_user trigger copies it to user_profiles.
        response = auth_client().auth.sign_up({
            "email": email,
            "password": password,
            "options": {"data": {"full_name": full_name}},
        })
    except Exception as exc:
        return error(str(exc), 400)

    if not response.user:
        return error("Sign up failed", 400)

    payload = {"user": user_payload(response.user)}
    if response.session:            # present when "Confirm email" is off in Supabase
        payload.update(session_payload(response.session))
    else:
        payload["message"] = "Check your email to confirm your account, then sign in."
    return ok(201, **payload)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = body()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return error("Email and password are required")

    try:
        response = auth_client().auth.sign_in_with_password({"email": email, "password": password})
    except Exception as exc:
        return error(str(exc), 401)

    return ok(message="Login successful", user=user_payload(response.user), **session_payload(response.session))


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    refresh_token = body().get("refresh_token")
    if not refresh_token:
        return error("refresh_token is required")
    try:
        response = auth_client().auth.refresh_session(refresh_token)
    except Exception as exc:
        return error(str(exc), 401)
    return ok(user=user_payload(response.user), **session_payload(response.session))


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Revoke only the caller's own session (other users are not affected)."""
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        try:
            httpx.post(
                f"{SUPABASE_URL}/auth/v1/logout?scope=local",
                headers={"apikey": SUPABASE_KEY, "Authorization": header},
                timeout=10,
            )
        except Exception:
            pass   # the app discards its tokens anyway
    return ok(message="Logout successful")


# ------------------------------------------------------------------ forgot password
# Supabase emails a one-time reset link. The link opens reset-password.html with a short-lived
# recovery token, which that page sends to /reset-password together with the new password.
# The old password is never read or shown (Supabase only stores a hash of it).
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def supabase_message(response, fallback):
    try:
        data = response.json()
    except ValueError:
        return fallback
    return data.get("msg") or data.get("message") or data.get("error_description") or fallback


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = body()
    email = (data.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return error("Enter a valid email address")
    redirect_to = (data.get("redirect_to") or "").strip()
    params = {"redirect_to": redirect_to} if re.match(r"^https?://", redirect_to) else {}
    try:
        response = httpx.post(
            f"{SUPABASE_URL}/auth/v1/recover",
            params=params,
            json={"email": email},
            headers={"apikey": SUPABASE_KEY},
            timeout=15,
        )
    except httpx.HTTPError:
        return error("Could not reach the sign-in service. Please try again.", 502)
    if response.status_code == 429:
        return error("Too many reset emails were requested. Please wait a while and try again.", 429)
    if response.status_code >= 500:
        return error("The sign-in service could not send the email. Please try again later.", 502)
    if response.status_code >= 400:
        return error(supabase_message(response, "Could not send the reset email."), 400)
    # Same answer whether or not an account exists, so this cannot be used to find accounts.
    return ok(message="If an account exists for this email, we've sent a link to reset your password. "
                      "Check your inbox (and spam folder).")


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.startswith("Bearer ") else ""
    if not token or token in ("undefined", "null"):
        return error("This reset link is not valid. Request a new one from the sign-in page.", 401)
    password = body().get("password") or ""
    if len(password) < 8:
        return error("Use at least 8 characters for your password")

    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"}
    try:
        response = httpx.put(f"{SUPABASE_URL}/auth/v1/user", json={"password": password},
                             headers=headers, timeout=15)
    except httpx.HTTPError:
        return error("Could not reach the sign-in service. Please try again.", 502)
    if response.status_code in (401, 403):
        return error("This reset link has expired or was already used. Request a new one from the sign-in page.", 401)
    if response.status_code >= 400:
        return error(supabase_message(response, "Could not change the password."), 400)

    try:   # end the recovery session; the person signs in with the new password
        httpx.post(f"{SUPABASE_URL}/auth/v1/logout?scope=local", headers=headers, timeout=10)
    except httpx.HTTPError:
        pass
    return ok(message="Your password has been changed. Sign in with your new password.")
