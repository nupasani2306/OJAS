from flask import Blueprint, g

from routes.common import body, db_error_code, error, ok, require_auth

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")

# Columns in the original schema.
BASE_FIELDS = ["step_length_cm", "daily_step_goal", "daily_water_goal_ml", "daily_calorie_goal",
               "sleep_goal_minutes", "notifications_enabled"]
# Columns added by supabase/migrations/20261003000000_app_settings_and_policies.sql.
APP_FIELDS = ["emergency_message", "sos_message", "weekly_workout_goal", "qr_include_contacts"]

DEFAULTS = {
    "daily_step_goal": 10000, "daily_water_goal_ml": 2000, "sleep_goal_minutes": 480,
    "notifications_enabled": True, "weekly_workout_goal": 4, "qr_include_contacts": True,
    "emergency_message": None, "sos_message": None,
}


def is_missing_column(exc):
    return db_error_code(exc) in ("42703", "PGRST204")


@settings_bp.route("", methods=["GET"])
@require_auth
def get_settings():
    response = g.db.table("user_settings").select("*").eq("user_id", g.user.id).maybe_single().execute()
    row = response.data if response else None
    settings = {**DEFAULTS, **(row or {})}
    migrated = row is None or all(field in row for field in APP_FIELDS)
    if row is None:
        # Check whether the new columns exist without a saved row to look at.
        try:
            g.db.table("user_settings").select(",".join(APP_FIELDS)).limit(1).execute()
        except Exception as exc:
            if not is_missing_column(exc):
                raise
            migrated = False
    return ok(settings=settings, migration_applied=migrated)


@settings_bp.route("", methods=["PUT"])
@require_auth
def update_settings():
    data = body()
    update = {f: data[f] for f in BASE_FIELDS + APP_FIELDS if f in data}
    if not update:
        return error("No valid settings provided")
    for field in ("emergency_message", "sos_message"):
        if update.get(field) and len(update[field]) > 300:
            return error("Messages can be at most 300 characters")
    goal = update.get("weekly_workout_goal")
    if goal is not None and not (isinstance(goal, int) and 1 <= goal <= 14):
        return error("weekly_workout_goal must be a whole number from 1 to 14")

    update["user_id"] = g.user.id
    try:
        response = g.db.table("user_settings").upsert(update, on_conflict="user_id").execute()
    except Exception as exc:
        if not is_missing_column(exc):
            raise
        wanted = [f for f in APP_FIELDS if f in update]
        base = {k: v for k, v in update.items() if k not in APP_FIELDS}
        if len(base) > 1:   # more than just user_id: save what the current schema supports
            g.db.table("user_settings").upsert(base, on_conflict="user_id").execute()
        return error("These settings need the latest database migration: " + ", ".join(wanted),
                     409, migration_needed=True, unsaved=wanted)
    return ok(message="Settings saved", settings={**DEFAULTS, **response.data[0]})
