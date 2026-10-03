from flask import Blueprint, request, jsonify
from config import supabase

medical_bp = Blueprint(
    "medical",
    __name__,
    url_prefix="/api/medical"
)


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


@medical_bp.route("", methods=["GET"])
def get_medical_info():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("medical_info")
            .select("*")
            .eq("user_id", user.id)
            .single()
            .execute()
        )

        return jsonify({
            "status": "success",
            "medical_info": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@medical_bp.route("", methods=["PUT"])
def update_medical_info():

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
                "message": "No medical information provided"
            }), 400

        allowed_fields = [
            "allergies",
            "medical_conditions",
            "medications",
            "notes"
        ]

        medical_data = {}

        for field in allowed_fields:
            if field in data:
                medical_data[field] = data[field]

        if not medical_data:
            return jsonify({
                "status": "error",
                "message": "No valid medical fields provided"
            }), 400

        existing = (
            supabase
            .table("medical_info")
            .select("user_id")
            .eq("user_id", user.id)
            .execute()
        )

        if existing.data:

            response = (
                supabase
                .table("medical_info")
                .update(medical_data)
                .eq("user_id", user.id)
                .execute()
            )

        else:

            medical_data["user_id"] = user.id

            response = (
                supabase
                .table("medical_info")
                .insert(medical_data)
                .execute()
            )

        return jsonify({
            "status": "success",
            "message": "Medical information saved successfully",
            "medical_info": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500