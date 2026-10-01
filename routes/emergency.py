from flask import Blueprint, request, jsonify
from config import supabase


emergency_bp = Blueprint(
    "emergency",
    __name__,
    url_prefix="/api/emergency"
)


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

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


# --------------------------------------------------
# GET EMERGENCY CONTACTS
# --------------------------------------------------

@emergency_bp.route("/contacts", methods=["GET"])
def get_contacts():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:
        response = (
            supabase
            .table("emergency_contacts")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at")
            .execute()
        )

        return jsonify({
            "status": "success",
            "contacts": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# ADD EMERGENCY CONTACT
# --------------------------------------------------

@emergency_bp.route("/contacts", methods=["POST"])
def add_contact():

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
                "message": "No contact data provided"
            }), 400

        name = data.get("name")
        phone = data.get("phone")
        relationship = data.get("relationship")
        use_for = data.get("use_for", "emergency")

        if not name or not phone:
            return jsonify({
                "status": "error",
                "message": "Name and phone are required"
            }), 400

        contact_data = {
            "user_id": user.id,
            "name": name,
            "phone": phone,
            "relationship": relationship,
            "use_for": use_for
        }

        response = (
            supabase
            .table("emergency_contacts")
            .insert(contact_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Emergency contact added successfully",
            "contact": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# DELETE EMERGENCY CONTACT
# --------------------------------------------------

@emergency_bp.route("/contacts/<contact_id>", methods=["DELETE"])
def delete_contact(contact_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("emergency_contacts")
            .delete()
            .eq("id", contact_id)
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Emergency contact deleted successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# GET SOS EVENTS
# --------------------------------------------------

@emergency_bp.route("/events", methods=["GET"])
def get_sos_events():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("sos_events")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "events": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500