import re
from datetime import datetime, timezone

from flask import Blueprint, g

from routes.common import body, error, ok, require_auth

emergency_bp = Blueprint("emergency", __name__, url_prefix="/api/emergency")

RELATIONSHIPS = {"Family", "Parent", "Spouse", "Sibling", "Friend", "Doctor", "Other"}


def valid_phone(phone):
    digits = re.sub(r"\D", "", phone or "")
    return bool(re.fullmatch(r"[\d\s+()-]+", phone or "")) and 6 <= len(digits) <= 15


# ------------------------------------------------------------------ contacts
@emergency_bp.route("/contacts", methods=["GET"])
@require_auth
def get_contacts():
    response = (g.db.table("emergency_contacts").select("*").eq("user_id", g.user.id)
                .order("created_at").execute())
    return ok(contacts=response.data)


@emergency_bp.route("/contacts", methods=["POST"])
@require_auth
def add_contact():
    data = body()
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    relationship = data.get("relationship") or "Family"
    group = data.get("group", "both")   # "emergency", "sos" or "both"

    if not name or not phone:
        return error("Name and phone are required")
    if not valid_phone(phone):
        return error("Enter a valid phone number (6 to 15 digits)")
    if relationship not in RELATIONSHIPS:
        return error("Relationship must be one of " + ", ".join(sorted(RELATIONSHIPS)))
    if group not in ("emergency", "sos", "both"):
        return error('group must be "emergency", "sos" or "both"')

    response = g.db.table("emergency_contacts").insert({
        "user_id": g.user.id,
        "name": name,
        "phone": phone,
        "relationship": relationship,
        "use_for_emergency": group in ("emergency", "both"),
        "use_for_sos": group in ("sos", "both"),
    }).execute()
    return ok(201, message="Emergency contact added successfully", contact=response.data[0])


@emergency_bp.route("/contacts/<contact_id>", methods=["PUT"])
@require_auth
def update_contact(contact_id):
    data = body()
    update = {k: data[k] for k in ("name", "phone", "relationship", "use_for_emergency", "use_for_sos") if k in data}
    if not update:
        return error("No valid contact fields provided")
    if "phone" in update and not valid_phone(update["phone"]):
        return error("Enter a valid phone number (6 to 15 digits)")
    response = (g.db.table("emergency_contacts").update(update).eq("id", contact_id)
                .eq("user_id", g.user.id).execute())
    if not response.data:
        return error("Contact not found", 404)
    return ok(contact=response.data[0])


@emergency_bp.route("/contacts/<contact_id>", methods=["DELETE"])
@require_auth
def delete_contact(contact_id):
    response = (g.db.table("emergency_contacts").delete().eq("id", contact_id)
                .eq("user_id", g.user.id).execute())
    if not response.data:
        return error("Contact not found", 404)
    return ok(message="Emergency contact deleted successfully")


# ------------------------------------------------------------------ SOS / fall events
@emergency_bp.route("/events", methods=["GET"])
@require_auth
def get_events():
    response = (g.db.table("sos_events").select("*").eq("user_id", g.user.id)
                .order("triggered_at", desc=True).limit(100).execute())
    return ok(events=response.data)


@emergency_bp.route("/events", methods=["POST"])
@require_auth
def create_event():
    """Log an SOS button press or a detected fall (from the app or the band)."""
    data = body()
    event_type = (data.get("event_type") or "SOS").upper()
    if event_type not in ("SOS", "FALL"):
        return error('event_type must be "SOS" or "FALL"')
    event = {"user_id": g.user.id, "event_type": event_type, "status": "PENDING"}
    for key in ("latitude", "longitude", "device_id", "triggered_at"):
        if data.get(key) is not None:
            event[key] = data[key]
    response = g.db.table("sos_events").insert(event).execute()
    return ok(201, message=f"{event_type} event recorded", event=response.data[0])


@emergency_bp.route("/events/<event_id>", methods=["PATCH"])
@require_auth
def update_event(event_id):
    status = (body().get("status") or "").upper()
    if status not in ("SENT", "CANCELLED", "RESOLVED"):
        return error('status must be "SENT", "CANCELLED" or "RESOLVED"')
    update = {"status": status}
    if status == "CANCELLED":
        update["cancelled_at"] = datetime.now(timezone.utc).isoformat()
    response = (g.db.table("sos_events").update(update).eq("id", event_id)
                .eq("user_id", g.user.id).execute())
    if not response.data:
        return error("Event not found", 404)
    return ok(event=response.data[0])
