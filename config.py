import os
from dotenv import load_dotenv
from supabase import create_client, ClientOptions

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")   # publishable / anon key (never the service_role key)

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL is missing from .env")

if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY is missing from .env")

# Shared client used ONLY to verify access tokens (auth.get_user(token) is stateless).
# Never sign in or sign out on it: that would change the session for every request.
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def user_db(access_token):
    """A fresh client that acts as the user who sent `access_token`.

    Database queries and storage calls made with it run as that user, so the
    Row Level Security policies (auth.uid() = user_id) apply to the right person.
    """
    return create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(headers={"Authorization": f"Bearer {access_token}"}),
    )


def auth_client():
    """A throwaway client for sign-up, sign-in and token refresh."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)
