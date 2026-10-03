from flask import Blueprint, request, jsonify
from config import supabase

sleep_bp = Blueprint(
    "sleep",
    __name__,
    url_prefix="/api/sleep"
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


@sleep_bp.route("", methods=["GET"])
def get_sleep_sessions():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("sleep_sessions")
            .select("*")
            .eq("user_id", user.id)
            .order("start_time", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "sleep_sessions": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@sleep_bp.route("", methods=["POST"])
def add_sleep_session():

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
                "message": "No sleep data provided"
            }), 400

        start_time = data.get("start_time")
        end_time = data.get("end_time")
        duration_minutes = data.get("duration_minutes")
        quality = data.get("quality")
        source = data.get("source", "app")
        device_id = data.get("device_id")

        if not start_time or not end_time:
            return jsonify({
                "status": "error",
                "message": "start_time and end_time are required"
            }), 400

        sleep_data = {
            "user_id": user.id,
            "start_time": start_time,
            "end_time": end_time,
            "source": source
        }

        if duration_minutes is not None:
            sleep_data["duration_minutes"] = duration_minutes

        if quality is not None:
            sleep_data["quality"] = quality

        if device_id:
            sleep_data["device_id"] = device_id

        response = (
            supabase
            .table("sleep_sessions")
            .insert(sleep_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Sleep session saved successfully",
            "sleep_session": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@sleep_bp.route("/<session_id>", methods=["DELETE"])
def delete_sleep_session(session_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        (
            supabase
            .table("sleep_sessions")
            .delete()
            .eq("id", session_id)
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Sleep session deleted successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500