from flask import Blueprint, request, jsonify
from config import supabase


workouts_bp = Blueprint(
    "workouts",
    __name__,
    url_prefix="/api/workouts"
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
# GET WORKOUTS
# --------------------------------------------------

@workouts_bp.route("", methods=["GET"])
def get_workouts():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("workouts")
            .select("*")
            .eq("user_id", user.id)
            .order("started_at", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "workouts": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# CREATE WORKOUT
# --------------------------------------------------

@workouts_bp.route("", methods=["POST"])
def create_workout():

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
                "message": "No workout data provided"
            }), 400

        workout_data = {
            "user_id": user.id,
            "type": data.get("type"),
            "name": data.get("name"),
            "started_at": data.get("started_at"),
            "duration_minutes": data.get("duration_minutes"),
            "calories": data.get("calories"),
            "distance": data.get("distance")
        }

        # Remove fields that were not provided
        workout_data = {
            key: value
            for key, value in workout_data.items()
            if value is not None
        }

        response = (
            supabase
            .table("workouts")
            .insert(workout_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Workout created successfully",
            "workout": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# GET ONE WORKOUT WITH EXERCISES
# --------------------------------------------------

@workouts_bp.route("/<workout_id>", methods=["GET"])
def get_workout(workout_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        workout_response = (
            supabase
            .table("workouts")
            .select("*")
            .eq("id", workout_id)
            .eq("user_id", user.id)
            .single()
            .execute()
        )

        workout = workout_response.data

        exercises_response = (
            supabase
            .table("workout_exercises")
            .select("*")
            .eq("workout_id", workout_id)
            .order("exercise_order")
            .execute()
        )

        exercises = exercises_response.data

        # Get sets for each exercise
        for exercise in exercises:

            sets_response = (
                supabase
                .table("workout_sets")
                .select("*")
                .eq("workout_exercise_id", exercise["id"])
                .order("set_number")
                .execute()
            )

            exercise["sets"] = sets_response.data

        workout["exercises"] = exercises

        return jsonify({
            "status": "success",
            "workout": workout
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# ADD EXERCISE TO WORKOUT
# --------------------------------------------------

@workouts_bp.route("/<workout_id>/exercises", methods=["POST"])
def add_exercise(workout_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        # Make sure workout belongs to current user
        workout = (
            supabase
            .table("workouts")
            .select("id")
            .eq("id", workout_id)
            .eq("user_id", user.id)
            .execute()
        )

        if not workout.data:
            return jsonify({
                "status": "error",
                "message": "Workout not found"
            }), 404

        data = request.get_json()

        if not data:
            return jsonify({
                "status": "error",
                "message": "No exercise data provided"
            }), 400

        exercise_data = {
            "workout_id": workout_id,
            "exercise_name": data.get("exercise_name"),
            "exercise_order": data.get("exercise_order", 1)
        }

        response = (
            supabase
            .table("workout_exercises")
            .insert(exercise_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Exercise added successfully",
            "exercise": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# ADD SET TO EXERCISE
# --------------------------------------------------

@workouts_bp.route(
    "/exercises/<exercise_id>/sets",
    methods=["POST"]
)
def add_set(exercise_id):

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
                "message": "No set data provided"
            }), 400

        # Make sure the exercise belongs to the user's workout
        exercise_response = (
            supabase
            .table("workout_exercises")
            .select("workout_id")
            .eq("id", exercise_id)
            .execute()
        )

        if not exercise_response.data:
            return jsonify({
                "status": "error",
                "message": "Exercise not found"
            }), 404

        workout_id = exercise_response.data[0]["workout_id"]

        workout_response = (
            supabase
            .table("workouts")
            .select("id")
            .eq("id", workout_id)
            .eq("user_id", user.id)
            .execute()
        )

        if not workout_response.data:
            return jsonify({
                "status": "error",
                "message": "Unauthorized workout"
            }), 403

        set_data = {
            "workout_exercise_id": exercise_id,
            "set_number": data.get("set_number"),
            "weight_kg": data.get("weight_kg"),
            "reps": data.get("reps"),
            "completed": data.get("completed", False)
        }

        set_data = {
            key: value
            for key, value in set_data.items()
            if value is not None
        }

        response = (
            supabase
            .table("workout_sets")
            .insert(set_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Workout set saved successfully",
            "set": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# DELETE WORKOUT
# --------------------------------------------------

@workouts_bp.route("/<workout_id>", methods=["DELETE"])
def delete_workout(workout_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("workouts")
            .delete()
            .eq("id", workout_id)
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Workout deleted successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500