from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from supabase import create_client
import os

# --------------------------------------------------
# Load environment variables
# --------------------------------------------------

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --------------------------------------------------
# Check Supabase configuration
# --------------------------------------------------

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL is missing from .env")

if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY is missing from .env")

# --------------------------------------------------
# Create Supabase client
# --------------------------------------------------

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)

# --------------------------------------------------
# Create Flask application
# --------------------------------------------------

app = Flask(__name__)

# Allow Flutter/frontend to communicate with Flask
CORS(app)


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