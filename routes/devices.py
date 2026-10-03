import re

from flask import Blueprint, g

from routes.common import body, db_error_code, error, ok, require_auth

devices_bp = Blueprint("devices", __name__, url_prefix="/api/devices")

# Device codes are printed on the band: OJAS-XXXX-XXXX, letters/digits without 0, O, 1 or I.
CODE_RE = re.compile(r"^[A-HJ-NP-Z2-9]{8}$")
UPDATE_FIELDS = ["device_name", "battery_level", "is_connected", "firmware_version", "last_seen_at"]


def normalize_code(raw):
    code = re.sub(r"[^A-Z0-9]", "", (raw or "").upper())
    if code.startswith("OJAS"):
        code = code[4:]
    return code


@devices_bp.route("", methods=["GET"])
@require_auth
def get_devices():
    response = (g.db.table("devices").select("*").eq("user_id", g.user.id)
                .order("paired_at", desc=True).execute())
    return ok(devices=response.data)


@devices_bp.route("/pair", methods=["POST"])
@require_auth
def pair_device():
    data = body()
    code = normalize_code(data.get("code") or data.get("device_uid"))
    if not CODE_RE.match(code):
        return error("Enter the 8-character device code from your band (no 0, O, 1 or I)")
    device_uid = f"OJAS-{code[:4]}-{code[4:]}"

    # Already paired to this user? Return it.
    mine = g.db.table("devices").select("*").eq("device_uid", device_uid).eq("user_id", g.user.id).execute()
    if mine.data:
        return ok(message="This band is already connected to your account", device=mine.data[0])

    try:
        response = g.db.table("devices").insert({
            "user_id": g.user.id,
            "device_uid": device_uid,
            "device_name": data.get("device_name") or "OJAS Band",
            "is_connected": True,
        }).execute()
    except Exception as exc:
        if db_error_code(exc) == "23505":   # device_uid is unique: another account has it
            return error("This band is already paired with another account. Unpair it there first.", 409)
        raise
    return ok(201, message="OJAS Band paired successfully", device=response.data[0])


@devices_bp.route("/<device_id>", methods=["PUT"])
@require_auth
def update_device(device_id):
    data = body()
    update = {f: data[f] for f in UPDATE_FIELDS if f in data}
    if not update:
        return error("No valid device fields provided")
    level = update.get("battery_level")
    if level is not None and not (isinstance(level, int) and 0 <= level <= 100):
        return error("battery_level must be a whole number from 0 to 100")
    response = g.db.table("devices").update(update).eq("id", device_id).eq("user_id", g.user.id).execute()
    if not response.data:
        return error("Device not found", 404)
    return ok(message="Device updated successfully", device=response.data[0])


@devices_bp.route("/<device_id>", methods=["DELETE"])
@require_auth
def unpair_device(device_id):
    response = g.db.table("devices").delete().eq("id", device_id).eq("user_id", g.user.id).execute()
    if not response.data:
        return error("Device not found", 404)
    return ok(message="OJAS Band unpaired")
