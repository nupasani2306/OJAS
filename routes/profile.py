from flask import Blueprint, request, jsonify
from config import supabase


profile_bp = Blueprint(
    "profile",
    __name__,
    url_prefix="/api/profile"
)


# =========================================================
# Helper: get logged-in user
# =========================================================

def get_current_user():
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    access_token = auth_header.split(" ", 1)[1]

    try:
        response = supabase.auth.get_user(access_token)
        return response.user
    except Exception:
        return None


# =========================================================
# GET PROFILE
# GET /api/profile
# =========================================================

@profile_bp.route("", methods=["GET"])
def get_profile():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .single()
            .execute()
        )

        return jsonify({
            "status": "success",
            "profile": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# =========================================================
# UPDATE PROFILE
# PUT /api/profile
# =========================================================

@profile_bp.route("", methods=["PUT"])
def update_profile():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "No profile data provided"
            }), 400


        # -------------------------------------------------
        # Fields used by the current OJAS Profile screen
        # -------------------------------------------------

        allowed_fields = [
            "full_name",
            "date_of_birth",
            "gender",
            "height_cm",
            "weight_kg",
            "blood_group",
            "phone"
        ]


        update_data = {}

        for field in allowed_fields:

            if field in data:
                update_data[field] = data[field]


        if not update_data:

            return jsonify({
                "status": "error",
                "message": "No valid profile fields provided"
            }), 400


        # -------------------------------------------------
        # Update user's profile
        # -------------------------------------------------

        response = (
            supabase
            .table("user_profiles")
            .update(update_data)
            .eq("user_id", user.id)
            .execute()
        )


        return jsonify({
            "status": "success",
            "message": "Profile updated successfully",
            "profile": response.data
        }), 200


    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500