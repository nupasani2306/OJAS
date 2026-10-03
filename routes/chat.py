from flask import Blueprint, g

from routes.common import body, error, ok, require_auth

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")

MAX_LENGTH = 1000


def generate_reply(history, name):
    """Return the assistant's reply to the last user message.

    Connect the AI model here later (keep the API key in .env, never in the frontend).
    `history` is the conversation so far: [{"sender": "user" | "assistant", "message": "..."}, ...].
    Until then it answers a few common questions.
    """
    q = history[-1]["message"].lower()

    def has(*words):
        return any(w in q for w in words)

    if has("sos", "emergency", "help me", "chest pain", "can't breathe"):
        return "If this is an emergency, press and hold the SOS button on the home page, or call your local emergency number right away."
    if has("heart", "pulse", "bpm"):
        return "For adults at rest, a heart rate of 60–100 bpm is generally considered normal. Your latest reading is on the Heart Rate history page."
    if has("spo2", "spo₂", "oxygen"):
        return "SpO₂ is the percentage of oxygen in your blood. Readings of 95% or higher are usually considered normal."
    if has("sleep"):
        return "Most adults need 7–9 hours of sleep. Keep a regular bedtime, avoid screens for an hour before bed, and keep your room cool and dark."
    if has("water", "hydrat", "drink"):
        return "Many adults need about 2–3 L of fluids a day, more when it is hot or you are active."
    if has("step", "walk", "calorie"):
        return "A short walk after meals is an easy way to add steps and burn a few more calories."
    if has("hi", "hello", "hey"):
        return f"Hi {name}! Ask me about your heart rate, SpO₂, sleep, steps or water."
    return "I'm running in demo mode, so I can only answer a few questions for now. Try asking about your heart rate, SpO₂, sleep, steps or water."


@chat_bp.route("", methods=["GET"])
@require_auth
def get_messages():
    response = (g.db.table("chat_messages").select("*").eq("user_id", g.user.id)
                .order("created_at", desc=True).limit(100).execute())
    return ok(messages=list(reversed(response.data)))


@chat_bp.route("", methods=["POST"])
@require_auth
def send_message():
    """Save the user's message, generate the reply, save it, and return both."""
    text = (body().get("message") or "").strip()
    if not text:
        return error("Message cannot be empty")
    if len(text) > MAX_LENGTH:
        return error(f"Messages can be at most {MAX_LENGTH} characters")

    user_msg = g.db.table("chat_messages").insert(
        {"user_id": g.user.id, "sender": "user", "message": text}).execute().data[0]

    recent = (g.db.table("chat_messages").select("sender,message").eq("user_id", g.user.id)
              .order("created_at", desc=True).limit(20).execute().data)
    profile = g.db.table("user_profiles").select("full_name").eq("user_id", g.user.id).execute().data
    name = ((profile[0]["full_name"] if profile else "") or "there").split()[0]

    reply_text = generate_reply(list(reversed(recent)), name)
    reply = g.db.table("chat_messages").insert(
        {"user_id": g.user.id, "sender": "assistant", "message": reply_text}).execute().data[0]
    return ok(201, user_message=user_msg, reply=reply)


@chat_bp.route("", methods=["DELETE"])
@require_auth
def delete_chat():
    deleted = g.db.table("chat_messages").delete().eq("user_id", g.user.id).execute().data
    remaining = g.db.table("chat_messages").select("id").eq("user_id", g.user.id).limit(1).execute().data
    if remaining and not deleted:
        return error("Clearing the chat needs the latest database migration (delete policy for chat_messages).",
                     409, migration_needed=True)
    return ok(message="Chat history deleted successfully")
