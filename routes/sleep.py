from datetime import datetime

from flask import Blueprint, g

from routes.common import body, error, ok, require_auth

sleep_bp = Blueprint("sleep", __name__, url_prefix="/api/sleep")

QUALITIES = {"POOR", "FAIR", "GOOD", "EXCELLENT"}
SOURCES = {"band", "app", "manual", "backend"}


def parse(ts):
    return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))


@sleep_bp.route("", methods=["GET"])
@require_auth
def get_sleep_sessions():
    response = (g.db.table("sleep_sessions").select("*").eq("user_id", g.user.id)
                .order("start_time", desc=True).limit(100).execute())
    return ok(sleep_sessions=response.data)


@sleep_bp.route("", methods=["POST"])
@require_auth
def add_sleep_session():
    data = body()
    start_time, end_time = data.get("start_time"), data.get("end_time")
    if not start_time or not end_time:
        return error("start_time and end_time are required")
    try:
        start, end = parse(start_time), parse(end_time)
    except ValueError:
        return error("start_time and end_time must be ISO dates, e.g. 2026-10-02T23:15:00+05:30")
    if end <= start:
        return error("end_time must be after start_time")

    session = {
        "user_id": g.user.id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "duration_minutes": int(data.get("duration_minutes") or round((end - start).total_seconds() / 60)),
        "source": data.get("source", "app"),
    }
    if session["source"] not in SOURCES:
        return error("source must be one of " + ", ".join(sorted(SOURCES)))
    quality = data.get("sleep_quality") or data.get("quality")
    if quality:
        if quality.upper() not in QUALITIES:
            return error("sleep_quality must be one of " + ", ".join(sorted(QUALITIES)))
        session["sleep_quality"] = quality.upper()
    if data.get("sleep_score") is not None:
        session["sleep_score"] = data["sleep_score"]
    if data.get("device_id"):
        session["device_id"] = data["device_id"]

    response = g.db.table("sleep_sessions").insert(session).execute()
    return ok(201, message="Sleep session saved successfully", sleep_session=response.data[0])


@sleep_bp.route("/<session_id>", methods=["DELETE"])
@require_auth
def delete_sleep_session(session_id):
    response = g.db.table("sleep_sessions").delete().eq("id", session_id).eq("user_id", g.user.id).execute()
    if not response.data:
        # Also returned until the delete policy from the 2026-10-03 migration is applied.
        return error("Sleep session not found (or the latest database migration is not applied yet)", 404)
    return ok(message="Sleep session deleted successfully")
