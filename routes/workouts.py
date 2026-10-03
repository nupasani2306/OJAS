from flask import Blueprint, g

from routes.common import body, error, ok, require_auth

workouts_bp = Blueprint("workouts", __name__, url_prefix="/api/workouts")

TYPES = {"Strength", "HIIT", "Running", "Cycling", "Cardio", "Yoga"}
STATUSES = {"ACTIVE", "COMPLETED", "CANCELLED"}
NESTED = "*, workout_exercises(*, workout_sets(*))"


def tidy(workout):
    """Sort nested exercises/sets and rename them to friendlier keys."""
    exercises = sorted(workout.pop("workout_exercises", []) or [], key=lambda e: e.get("order_no") or 0)
    for ex in exercises:
        ex["sets"] = sorted(ex.pop("workout_sets", []) or [], key=lambda s: s.get("set_number") or 0)
    workout["exercises"] = exercises
    return workout


def owned_workout(workout_id):
    rows = g.db.table("workouts").select("id").eq("id", workout_id).eq("user_id", g.user.id).execute().data
    return bool(rows)


@workouts_bp.route("", methods=["GET"])
@require_auth
def get_workouts():
    response = (g.db.table("workouts").select(NESTED).eq("user_id", g.user.id)
                .order("started_at", desc=True).limit(200).execute())
    return ok(workouts=[tidy(w) for w in response.data])


@workouts_bp.route("", methods=["POST"])
@require_auth
def create_workout():
    """Save a workout, optionally with its exercises and sets in one request:
    {workout_type, workout_name, started_at, ended_at, duration_minutes, calories_burned, distance_km,
     status, exercises: [{exercise_name, exercise_type?, sets: [{weight_kg, reps, completed}]}]}"""
    data = body()
    workout_type = data.get("workout_type")
    if workout_type not in TYPES:
        return error("workout_type must be one of " + ", ".join(sorted(TYPES)))
    status = (data.get("status") or "COMPLETED").upper()
    if status not in STATUSES:
        return error("status must be one of " + ", ".join(sorted(STATUSES)))

    workout = {"user_id": g.user.id, "workout_type": workout_type, "status": status}
    for key in ("workout_name", "started_at", "ended_at", "duration_minutes", "calories_burned", "distance_km"):
        if data.get(key) not in (None, ""):
            workout[key] = data[key]
    exercises = data.get("exercises") or []
    if not isinstance(exercises, list):
        return error("exercises must be a list")

    saved = g.db.table("workouts").insert(workout).execute().data[0]
    try:
        for order, ex in enumerate(exercises, start=1):
            name = (ex.get("exercise_name") or "").strip()
            if not name:
                continue
            ex_row = g.db.table("workout_exercises").insert({
                "workout_id": saved["id"], "exercise_name": name,
                "exercise_type": ex.get("exercise_type"), "order_no": order,
            }).execute().data[0]
            sets = [{
                "workout_exercise_id": ex_row["id"],
                "set_number": n,
                "weight_kg": s.get("weight_kg"),
                "reps": s.get("reps"),
                "completed": bool(s.get("completed")),
            } for n, s in enumerate(ex.get("sets") or [], start=1)]
            if sets:
                g.db.table("workout_sets").insert(sets).execute()
    except Exception:
        g.db.table("workouts").delete().eq("id", saved["id"]).execute()   # exercises/sets cascade
        raise

    full = g.db.table("workouts").select(NESTED).eq("id", saved["id"]).single().execute().data
    return ok(201, message="Workout saved", workout=tidy(full))


@workouts_bp.route("/<workout_id>", methods=["GET"])
@require_auth
def get_workout(workout_id):
    response = (g.db.table("workouts").select(NESTED).eq("id", workout_id).eq("user_id", g.user.id)
                .maybe_single().execute())
    if not response or not response.data:
        return error("Workout not found", 404)
    return ok(workout=tidy(response.data))


@workouts_bp.route("/<workout_id>/exercises", methods=["POST"])
@require_auth
def add_exercise(workout_id):
    if not owned_workout(workout_id):
        return error("Workout not found", 404)
    data = body()
    name = (data.get("exercise_name") or "").strip()
    if not name:
        return error("exercise_name is required")
    response = g.db.table("workout_exercises").insert({
        "workout_id": workout_id, "exercise_name": name,
        "exercise_type": data.get("exercise_type"), "order_no": data.get("order_no", 1),
    }).execute()
    return ok(201, message="Exercise added successfully", exercise=response.data[0])


@workouts_bp.route("/exercises/<exercise_id>/sets", methods=["POST"])
@require_auth
def add_set(exercise_id):
    exercise = g.db.table("workout_exercises").select("workout_id").eq("id", exercise_id).execute().data
    if not exercise or not owned_workout(exercise[0]["workout_id"]):
        return error("Exercise not found", 404)
    data = body()
    if not isinstance(data.get("set_number"), int) or data["set_number"] < 1:
        return error("set_number must be a whole number of 1 or more")
    response = g.db.table("workout_sets").insert({
        "workout_exercise_id": exercise_id,
        "set_number": data["set_number"],
        "weight_kg": data.get("weight_kg"),
        "reps": data.get("reps"),
        "completed": bool(data.get("completed", False)),
    }).execute()
    return ok(201, message="Workout set saved successfully", set=response.data[0])


@workouts_bp.route("/<workout_id>", methods=["DELETE"])
@require_auth
def delete_workout(workout_id):
    response = g.db.table("workouts").delete().eq("id", workout_id).eq("user_id", g.user.id).execute()
    if not response.data:
        return error("Workout not found", 404)
    return ok(message="Workout deleted successfully")
