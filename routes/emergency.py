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


# ------------------------------------------------------------------ alert the contacts
DEFAULT_MESSAGES = {   # same wording as the app's defaults (api.js ojasAlert.defaultMessage)
    "SOS": "SOS! {name} needs immediate help. Please check on me or call emergency services.",
    "FALL": "This is {name}. I need help urgently. Please call me or come to my location as soon as possible.",
}


def alert_text(event):
    """The user's saved SOS / emergency message (or the default), plus a map link when known."""
    field = "sos_message" if event["event_type"] == "SOS" else "emergency_message"
    text = None
    try:
        row = (g.db.table("user_settings").select(field).eq("user_id", g.user.id)
               .maybe_single().execute())
        text = row.data.get(field) if row and row.data else None
    except Exception:
        pass   # column not added yet (migration not applied): use the default message
    if not text:
        profile = (g.db.table("user_profiles").select("full_name").eq("user_id", g.user.id)
                   .maybe_single().execute())
        full_name = (profile.data or {}).get("full_name") if profile else None
        text = DEFAULT_MESSAGES[event["event_type"]].format(name=(full_name or "OJAS user").split()[0])
    if event.get("latitude") is not None and event.get("longitude") is not None:
        text += (f"\n\nMy location: https://maps.google.com/?q="
                 f"{float(event['latitude']):.6f},{float(event['longitude']):.6f}")
    return text


@emergency_bp.route("/events/<event_id>/message", methods=["GET"])
@require_auth
def alert_message(event_id):
    """The text and phone numbers for an event's alert: SOS -> SOS contacts,
    FALL -> emergency contacts. The app opens the Messages app with them."""
    found = (g.db.table("sos_events").select("*").eq("id", event_id).eq("user_id", g.user.id)
             .maybe_single().execute())
    event = found.data if found else None
    if not event:
        return error("Event not found", 404)
    if event["status"] == "CANCELLED":
        return error("This alert was cancelled", 409)

    flag = "use_for_sos" if event["event_type"] == "SOS" else "use_for_emergency"
    contacts = (g.db.table("emergency_contacts").select("name,phone").eq("user_id", g.user.id)
                .eq(flag, True).execute()).data
    if not contacts:
        kind = "SOS" if event["event_type"] == "SOS" else "emergency"
        return error(f"No {kind} contacts saved. Add them on the Emergency page.", 400, no_contacts=True)

    return ok(text=alert_text(event), phones=[c["phone"] for c in contacts],
              names=[c["name"] for c in contacts], already_sent=event["status"] != "PENDING")
