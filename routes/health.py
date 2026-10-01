from flask import Blueprint, request, jsonify
from config import supabase


health_bp = Blueprint(
    "health",
    __name__,
    url_prefix="/api/health"
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
# GET HEALTH READINGS
# --------------------------------------------------

@health_bp.route("/readings", methods=["GET"])
def get_readings():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        metric = request.args.get("metric")

        query = (
            supabase
            .table("health_readings")
            .select("*")
            .eq("user_id", user.id)
            .order("recorded_at", desc=True)
        )

        if metric:
            query = query.eq("metric", metric)

        response = query.execute()

        return jsonify({
            "status": "success",
            "readings": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# ADD HEALTH READING
# --------------------------------------------------

@health_bp.route("/readings", methods=["POST"])
def add_reading():

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
                "message": "No health data provided"
            }), 400

        metric = data.get("metric")
        value = data.get("value")
        recorded_at = data.get("recorded_at")
        device_id = data.get("device_id")
        source = data.get("source", "app")

        allowed_metrics = [
            "heart_rate",
            "spo2",
            "steps",
            "calories",
            "water"
        ]

        if metric not in allowed_metrics:
            return jsonify({
                "status": "error",
                "message": "Invalid health metric"
            }), 400

        if value is None:
            return jsonify({
                "status": "error",
                "message": "Value is required"
            }), 400

        reading_data = {
            "user_id": user.id,
            "metric": metric,
            "value": value,
            "source": source
        }

        if device_id:
            reading_data["device_id"] = device_id

        if recorded_at:
            reading_data["recorded_at"] = recorded_at

        response = (
            supabase
            .table("health_readings")
            .insert(reading_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Health reading saved successfully",
            "reading": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# --------------------------------------------------
# DAILY HEALTH SUMMARY
# --------------------------------------------------

@health_bp.route("/summary", methods=["GET"])
def get_daily_summary():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("daily_health_summary")
            .select("*")
            .eq("user_id", user.id)
            .order("date", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "summary": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500