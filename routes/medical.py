from flask import Blueprint, g

from routes.common import body, error, ok, require_auth

medical_bp = Blueprint("medical", __name__, url_prefix="/api/medical")

MEDICAL_FIELDS = ["blood_group", "allergies", "medical_conditions", "medications", "emergency_notes"]
BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


@medical_bp.route("", methods=["GET"])
@require_auth
def get_medical_info():
    response = g.db.table("medical_info").select("*").eq("user_id", g.user.id).maybe_single().execute()
    return ok(medical_info=(response.data if response else None))


@medical_bp.route("", methods=["PUT"])
@require_auth
def update_medical_info():
    data = body()
    update = {field: data[field] for field in MEDICAL_FIELDS if field in data}
    if not update:
        return error("No valid medical fields provided")
    update = {k: (None if v == "" else v) for k, v in update.items()}
    if update.get("blood_group") and update["blood_group"] not in BLOOD_GROUPS:
        return error("Blood group must be one of " + ", ".join(sorted(BLOOD_GROUPS)))

    update["user_id"] = g.user.id
    response = g.db.table("medical_info").upsert(update, on_conflict="user_id").execute()
    return ok(message="Medical information saved successfully", medical_info=response.data[0] if response.data else None)
