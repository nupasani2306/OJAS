from flask import Blueprint, request, jsonify
from config import supabase

devices_bp = Blueprint(
    "devices",
    __name__,
    url_prefix="/api/devices"
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


@devices_bp.route("", methods=["GET"])
def get_devices():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("devices")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "devices": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@devices_bp.route("/pair", methods=["POST"])
def pair_device():

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
                "message": "No device data provided"
            }), 400

        device_id = data.get("device_id")
        device_name = data.get("device_name", "OJAS Band")

        if not device_id:
            return jsonify({
                "status": "error",
                "message": "device_id is required"
            }), 400

        existing = (
            supabase
            .table("devices")
            .select("*")
            .eq("device_id", device_id)
            .execute()
        )

        if existing.data:

            response = (
                supabase
                .table("devices")
                .update({
                    "user_id": user.id,
                    "device_name": device_name,
                    "is_active": True
                })
                .eq("device_id", device_id)
                .execute()
            )

        else:

            device_data = {
                "user_id": user.id,
                "device_id": device_id,
                "device_name": device_name,
                "is_active": True
            }

            response = (
                supabase
                .table("devices")
                .insert(device_data)
                .execute()
            )

        return jsonify({
            "status": "success",
            "message": "OJAS device paired successfully",
            "device": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@devices_bp.route("/<device_id>", methods=["PUT"])
def update_device(device_id):

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
                "message": "No device data provided"
            }), 400

        allowed_fields = [
            "device_name",
            "is_active"
        ]

        update_data = {}

        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]

        if not update_data:
            return jsonify({
                "status": "error",
                "message": "No valid device fields provided"
            }), 400

        response = (
            supabase
            .table("devices")
            .update(update_data)
            .eq("device_id", device_id)
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Device updated successfully",
            "device": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@devices_bp.route("/<device_id>", methods=["DELETE"])
def unpair_device(device_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        (
            supabase
            .table("devices")
            .update({
                "is_active": False
            })
            .eq("device_id", device_id)
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "OJAS device unpaired successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500