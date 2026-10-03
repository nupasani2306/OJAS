import os
import uuid

from flask import Blueprint, g, request

from routes.common import error, ok, require_auth

documents_bp = Blueprint("documents", __name__, url_prefix="/api/documents")

BUCKET = "medical-documents"
MAX_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = ("application/pdf", "image/", "application/msword",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@documents_bp.route("", methods=["GET"])
@require_auth
def get_documents():
    response = (g.db.table("documents").select("*").eq("user_id", g.user.id)
                .order("uploaded_at", desc=True).execute())
    return ok(documents=response.data)


@documents_bp.route("/upload", methods=["POST"])
@require_auth
def upload_document():
    file = request.files.get("file")
    if not file or not file.filename:
        return error("No file provided")
    content_type = file.content_type or "application/octet-stream"
    if not any(content_type.startswith(t) for t in ALLOWED_TYPES):
        return error("Only PDF, image and Word documents can be uploaded")
    data = file.read()
    if len(data) > MAX_BYTES:
        return error("The file is larger than 10 MB")

    extension = os.path.splitext(file.filename)[1].lower()
    storage_path = f"{g.user.id}/{uuid.uuid4()}{extension}"   # first folder must be the user id (storage policy)
    g.db.storage.from_(BUCKET).upload(storage_path, data, {"content-type": content_type})

    try:
        response = g.db.table("documents").insert({
            "user_id": g.user.id,
            "document_name": file.filename,
            "document_type": content_type,
            "storage_path": storage_path,
        }).execute()
    except Exception:
        g.db.storage.from_(BUCKET).remove([storage_path])   # don't leave an orphaned file
        raise
    return ok(201, message="Document uploaded successfully", document=response.data[0])


@documents_bp.route("/<document_id>/url", methods=["GET"])
@require_auth
def document_url(document_id):
    """A temporary link (1 hour) to view or download the document."""
    response = (g.db.table("documents").select("storage_path,document_name").eq("id", document_id)
                .eq("user_id", g.user.id).maybe_single().execute())
    doc = response.data if response else None
    if not doc:
        return error("Document not found", 404)
    result = g.db.storage.from_(BUCKET).create_signed_url(doc["storage_path"], 3600)
    return ok(url=result.get("signedURL") or result.get("signedUrl"), name=doc["document_name"])


@documents_bp.route("/<document_id>", methods=["DELETE"])
@require_auth
def delete_document(document_id):
    response = (g.db.table("documents").select("storage_path").eq("id", document_id)
                .eq("user_id", g.user.id).maybe_single().execute())
    doc = response.data if response else None
    if not doc:
        return error("Document not found", 404)
    g.db.storage.from_(BUCKET).remove([doc["storage_path"]])
    g.db.table("documents").delete().eq("id", document_id).eq("user_id", g.user.id).execute()
    return ok(message="Document deleted")
