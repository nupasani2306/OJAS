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
