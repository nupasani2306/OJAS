from flask import Blueprint, request, jsonify
from config import supabase

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# ==================================================
# SIGNUP
# ==================================================

@auth_bp.route("/signup", methods=["POST"])
def signup():

    try:
        data = request.get_json()

        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({
                "status": "error",
                "message": "Email and password are required"
            }), 400

        response = supabase.auth.sign_up({
            "email": email,
            "password": password
        })

        return jsonify({
            "status": "success",
            "message": "Signup request successful",
            "user": response.user.model_dump() if response.user else None
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# ==================================================
# LOGIN
# ==================================================

@auth_bp.route("/login", methods=["POST"])
def login():

    try:
        data = request.get_json()

        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({
                "status": "error",
                "message": "Email and password are required"
            }), 400

        response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        return jsonify({
            "status": "success",
            "message": "Login successful",
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": response.user.model_dump()
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 401


# ==================================================
# LOGOUT
# ==================================================

@auth_bp.route("/logout", methods=["POST"])
def logout():

    try:

        supabase.auth.sign_out()

        return jsonify({
            "status": "success",
            "message": "Logout successful"
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500