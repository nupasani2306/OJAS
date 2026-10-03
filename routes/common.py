"""Shared helpers for the OJAS API routes."""
from functools import wraps

from flask import g, jsonify, request

from config import supabase, user_db


def ok(status_code=200, **data):
    return jsonify({"status": "success", **data}), status_code


def error(message, status_code=400, **extra):
    return jsonify({"status": "error", "message": message, **extra}), status_code


def body():
    """The JSON body as a dict (empty dict if there is none)."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def db_error_message(exc):
    """A readable message from a Supabase/PostgREST error."""
    message = getattr(exc, "message", None)
    if message:
        return message
    if exc.args and isinstance(exc.args[0], dict):
        return exc.args[0].get("message") or str(exc.args[0])
    return str(exc)


def db_error_code(exc):
    code = getattr(exc, "code", None)
    if code:
        return code
    if exc.args and isinstance(exc.args[0], dict):
        return exc.args[0].get("code")
    return None


def require_auth(view):
    """Reject requests without a valid `Authorization: Bearer <access_token>` header.

    On success sets:
      g.user  - the Supabase user
      g.token - the caller's access token
      g.db    - a Supabase client that acts as that user (RLS applies)
    """
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("Invalid or missing authentication token", 401)
        token = header.split(" ", 1)[1].strip()
        if not token or token in ("undefined", "null"):
            return error("Invalid or missing authentication token", 401)
        try:
            user = supabase.auth.get_user(token).user
        except Exception:
            user = None
        if not user:
            return error("Invalid or missing authentication token", 401)

        g.user = user
        g.token = token
        g.db = user_db(token)
        try:
            return view(*args, **kwargs)
        except Exception as exc:   # database / storage errors -> readable JSON instead of a crash
            return error(db_error_message(exc), 500)

    return wrapper
