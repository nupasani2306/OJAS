from flask import Blueprint, request, jsonify
from config import supabase

chat_bp = Blueprint(
    "chat",
    __name__,
    url_prefix="/api/chat"
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


@chat_bp.route("", methods=["GET"])
def get_messages():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("chat_messages")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at")
            .execute()
        )

        return jsonify({
            "status": "success",
            "messages": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@chat_bp.route("", methods=["POST"])
def send_message():

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
                "message": "No message provided"
            }), 400

        message = data.get("message")
        sender = data.get("sender", "user")

        if not message:
            return jsonify({
                "status": "error",
                "message": "Message cannot be empty"
            }), 400

        message_data = {
            "user_id": user.id,
            "message": message,
            "sender": sender
        }

        response = (
            supabase
            .table("chat_messages")
            .insert(message_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Message saved successfully",
            "chat_message": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@chat_bp.route("", methods=["DELETE"])
def delete_chat():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        (
            supabase
            .table("chat_messages")
            .delete()
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Chat history deleted successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500