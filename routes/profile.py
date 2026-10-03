from datetime import date

from flask import Blueprint, g, request

from routes.common import body, error, ok, require_auth

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")

BUCKET = "medical-documents"   # storage policies allow each user only their own "<user_id>/..." folder
PROFILE_FIELDS = ["full_name", "phone", "date_of_birth", "gender", "height_cm", "weight_kg"]
MAX_PHOTO_BYTES = 5 * 1024 * 1024


def age_from(date_of_birth):
    if not date_of_birth:
        return None
    born = date.fromisoformat(str(date_of_birth)[:10])
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def signed_url(path, seconds=3600):
    if not path:
        return None
    try:
        result = g.db.storage.from_(BUCKET).create_signed_url(path, seconds)
        return result.get("signedURL") or result.get("signedUrl")
    except Exception:
        return None


@profile_bp.route("", methods=["GET"])
@require_auth
def get_profile():
    response = g.db.table("user_profiles").select("*").eq("user_id", g.user.id).maybe_single().execute()
    profile = response.data if response else None
    if not profile:
        return error("Profile not found", 404)
    profile["age"] = age_from(profile.get("date_of_birth"))
    profile["photo_url"] = signed_url(profile.get("profile_photo_url"))
    return ok(profile=profile)


@profile_bp.route("", methods=["PUT"])
@require_auth
def update_profile():
    data = body()
    update = {field: data[field] for field in PROFILE_FIELDS if field in data}
    if not update:
        return error("No valid profile fields provided")
    if "full_name" in update and not str(update["full_name"] or "").strip():
        return error("Name cannot be empty")
    # Empty strings from forms become NULL (the columns are dates/numbers).
    update = {k: (None if v == "" else v) for k, v in update.items()}

    response = g.db.table("user_profiles").update(update).eq("user_id", g.user.id).execute()
    if not response.data:
        return error("Profile not found", 404)
    profile = response.data[0]
    profile["age"] = age_from(profile.get("date_of_birth"))
    return ok(message="Profile updated successfully", profile=profile)


@profile_bp.route("/photo", methods=["POST"])
@require_auth
def upload_photo():
    file = request.files.get("file")
    if not file or not file.filename:
        return error("No photo provided")
    if not (file.content_type or "").startswith("image/"):
        return error("The profile photo must be an image")
    data = file.read()
    if len(data) > MAX_PHOTO_BYTES:
        return error("The photo is larger than 5 MB")

    path = f"{g.user.id}/profile-photo"
    g.db.storage.from_(BUCKET).upload(path, data, {"content-type": file.content_type, "upsert": "true"})
    g.db.table("user_profiles").update({"profile_photo_url": path}).eq("user_id", g.user.id).execute()
    return ok(201, message="Photo uploaded", photo_url=signed_url(path))
