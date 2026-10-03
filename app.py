import os

from flask import Flask, jsonify
from flask_cors import CORS

from config import SUPABASE_KEY, SUPABASE_URL

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
from routes.settings import settings_bp


# ==================================================
# CREATE FLASK APPLICATION
# ==================================================

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 11 * 1024 * 1024   # uploads up to ~10 MB

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
app.register_blueprint(settings_bp)


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
    """Checks that Flask can reach Supabase. (Table data needs a signed-in user, because of RLS.)"""
    import httpx

    try:
        response = httpx.get(f"{SUPABASE_URL}/auth/v1/health", headers={"apikey": SUPABASE_KEY}, timeout=10)
        response.raise_for_status()
        return jsonify({"status": "success", "message": "Flask connected to Supabase successfully!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==================================================
# JSON ERRORS (instead of HTML error pages)
# ==================================================

@app.errorhandler(404)
def not_found(_):
    return jsonify({"status": "error", "message": "Not found"}), 404


@app.errorhandler(405)
def method_not_allowed(_):
    return jsonify({"status": "error", "message": "Method not allowed"}), 405


@app.errorhandler(413)
def too_large(_):
    return jsonify({"status": "error", "message": "The file is too large"}), 413


# ==================================================
# RUN SERVER
# ==================================================

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", 5000)),
        debug=os.getenv("FLASK_DEBUG", "1") == "1"
    )