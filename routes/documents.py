from flask import Blueprint, request, jsonify
from config import supabase
import uuid
import os

documents_bp = Blueprint(
    "documents",
    __name__,
    url_prefix="/api/documents"
)


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


@documents_bp.route("", methods=["GET"])
def get_documents():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("documents")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "documents": response.data
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@documents_bp.route("/upload", methods=["POST"])
def upload_document():

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        if "file" not in request.files:
            return jsonify({
                "status": "error",
                "message": "No file provided"
            }), 400

        file = request.files["file"]

        if not file or file.filename == "":
            return jsonify({
                "status": "error",
                "message": "Invalid file"
            }), 400

        original_filename = file.filename
        extension = os.path.splitext(original_filename)[1].lower()

        unique_filename = f"{uuid.uuid4()}{extension}"

        storage_path = f"{user.id}/{unique_filename}"

        file_data = file.read()

        supabase.storage \
            .from_("medical-documents") \
            .upload(
                storage_path,
                file_data,
                {
                    "content-type":
                        file.content_type or
                        "application/octet-stream"
                }
            )

        document_data = {
            "user_id": user.id,
            "file_name": original_filename,
            "storage_path": storage_path,
            "file_type": file.content_type,
            "file_size": len(file_data)
        }

        response = (
            supabase
            .table("documents")
            .insert(document_data)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Document uploaded successfully",
            "document": response.data
        }), 201

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@documents_bp.route("/<document_id>", methods=["DELETE"])
def delete_document(document_id):

    user = get_current_user()

    if not user:
        return jsonify({
            "status": "error",
            "message": "Invalid or missing authentication token"
        }), 401

    try:

        response = (
            supabase
            .table("documents")
            .select("*")
            .eq("id", document_id)
            .eq("user_id", user.id)
            .single()
            .execute()
        )

        document = response.data

        if not document:
            return jsonify({
                "status": "error",
                "message": "Document not found"
            }), 404

        storage_path = document["storage_path"]

        supabase.storage \
            .from_("medical-documents") \
            .remove([storage_path])

        (
            supabase
            .table("documents")
            .delete()
            .eq("id", document_id)
            .eq("user_id", user.id)
            .execute()
        )

        return jsonify({
            "status": "success",
            "message": "Document deleted successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500