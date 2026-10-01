from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import os

app = Flask(__name__)

# -----------------------------
# Configuration
# -----------------------------

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:YOUR_PASSWORD@localhost:5432/ojas_db"
)

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY",
    "ojas_secret_key_change_this"
)

# -----------------------------
# Initialize extensions
# -----------------------------

db = SQLAlchemy(app)
jwt = JWTManager(app)

CORS(app)


# -----------------------------
# Home / API test
# -----------------------------

@app.route("/")
def home():
    return jsonify({
        "project": "OJAS",
        "message": "OJAS Backend is Running!",
        "status": "success"
    })


# -----------------------------
# Backend health check
# -----------------------------

@app.route("/api/health")
def backend_health():

    return jsonify({
        "backend": "online",
        "database": "configured",
        "project": "OJAS"
    })


# -----------------------------
# Database connection test
# -----------------------------

@app.route("/api/test-db")
def test_database():

    try:

        db.session.execute(db.text("SELECT 1"))

        return jsonify({
            "status": "success",
            "message": "PostgreSQL connected successfully!"
        })

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# -----------------------------
# Run server
# -----------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )