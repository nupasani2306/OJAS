"""Sending SMS for emergency alerts (Twilio).

Set these in .env to turn on automatic alerts:
    TWILIO_ACCOUNT_SID=ACxxxxxxxx...
    TWILIO_AUTH_TOKEN=...
    TWILIO_FROM_NUMBER=+1xxxxxxxxxx         # your Twilio phone number
    SMS_DEFAULT_COUNTRY_CODE=+91            # used for contacts saved without a country code

Without them, the app falls back to opening the phone's Messages app.
"""
import os
import re

import httpx


def configured():
    return all(os.getenv(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"))


def to_e164(phone):
    """'+91 98765 43210' / '098765 43210' / '9876543210' -> '+919876543210' (None if unusable)."""
    raw = (phone or "").strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        number = "+" + digits
    elif digits.startswith("00"):
        number = "+" + digits[2:]
    else:
        country = "+" + re.sub(r"\D", "", os.getenv("SMS_DEFAULT_COUNTRY_CODE", "+91"))
        number = country + digits.lstrip("0")
    return number if 8 <= len(number) - 1 <= 15 else None


def send(phone, text):
    """Send one SMS. Returns (True, None) or (False, reason)."""
    number = to_e164(phone)
    if not number:
        return False, "invalid phone number"
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    try:
        response = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data={"To": number, "From": os.getenv("TWILIO_FROM_NUMBER"), "Body": text},
            auth=(sid, os.getenv("TWILIO_AUTH_TOKEN")),
            timeout=15,
        )
    except httpx.HTTPError:
        return False, "could not reach the SMS service"
    if response.status_code in (200, 201):
        return True, None
    try:
        reason = response.json().get("message") or f"SMS service error {response.status_code}"
    except ValueError:
        reason = f"SMS service error {response.status_code}"
    return False, reason
