from flask import Flask, jsonify
from flask_cors import CORS

from config import supabase

# --------------------------------------------------
# ROUTES
# --------------------------------------------------

from routes.auth import auth_bp
from routes.profile import profile_bp
from routes.medical import medical_bp
from routes.documents import documents_bp
from routes.emergency import emergency_bp
from routes.devices import devices_bp
from routes.health import health_bp
from routes.sleep import sleep_bp
from routes.workouts import workouts_bp
from routes.chat import chat_bp


# ==================================================
# CREATE FLASK APPLICATION
# ==================================================

app = Flask(__name__)

# Allow Flutter / frontend to communicate with Flask
CORS(app)


# ==================================================
# REGISTER BLUEPRINTS
# ==================================================

app.register_blueprint(auth_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(medical_bp)
app.register_blueprint(documents_bp)
app.register_blueprint(emergency_bp)
app.register_blueprint(devices_bp)
app.register_blueprint(health_bp)
app.register_blueprint(sleep_bp)
app.register_blueprint(workouts_bp)
app.register_blueprint(chat_bp)


# ==================================================
# HOME
# ==================================================

@app.route("/")
def home():

    return jsonify({
        "project": "OJAS",
        "message": "OJAS Backend is Running!",
        "status": "success"
    })


# ==================================================
# BACKEND HEALTH CHECK
# ==================================================

@app.route("/api/health")
def backend_health():

    return jsonify({
        "backend": "online",
        "database": "Supabase",
        "project": "OJAS"
    })


# ==================================================
# SUPABASE CONNECTION TEST
# ==================================================

@app.route("/api/test-supabase")
def test_supabase():

    try:

        response = (
            supabase
            .table("user_profiles")
            .select("*")
            .limit(1)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Flask connected to Supabase successfully!",
            "data": response.data
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# ==================================================
# RUN SERVER
# ==================================================

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )