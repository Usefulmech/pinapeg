import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlencode

import httpx

from .config import settings

Provider = Literal["calendar", "gmail"]

PROVIDERS = {
    "calendar": {
        "storage_key": "google_calendar",
        "scopes": ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
    },
    "gmail": {
        "storage_key": "google_gmail",
        "scopes": ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"],
    },
}


def _state_secret() -> bytes:
    config = settings()
    raw = config.google_oauth_state_secret or config.token_encryption_key or "pinapeg-development-oauth-state"
    return raw.encode("utf-8")


def _sign(payload: str) -> str:
    return hmac.new(_state_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def encode_state(user_id: str, provider: Provider) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"user_id": user_id, "provider": provider, "exp": (datetime.now(UTC) + timedelta(minutes=15)).timestamp()}).encode("utf-8")).decode("utf-8")
    return f"{payload}.{_sign(payload)}"


def decode_state(state: str) -> tuple[str, Provider]:
    payload, signature = state.split(".", 1)
    if not hmac.compare_digest(_sign(payload), signature):
        raise ValueError("Invalid OAuth state")
    data = json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8"))
    if datetime.now(UTC).timestamp() > float(data["exp"]):
        raise ValueError("Expired OAuth state")
    provider = data["provider"]
    if provider not in PROVIDERS:
        raise ValueError("Invalid OAuth provider")
    return str(data["user_id"]), provider


def authorization_url(user_id: str, provider: Provider) -> str:
    config = settings()
    if not config.google_client_id:
        raise RuntimeError("GOOGLE_CLIENT_ID is required")
    provider_config = PROVIDERS[provider]
    params = {
        "client_id": config.google_client_id,
        "redirect_uri": config.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider_config["scopes"]),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": encode_state(user_id, provider),
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    config = settings()
    if not config.google_client_id or not config.google_client_secret:
        raise RuntimeError("Google OAuth client credentials are required")
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": config.google_client_id,
            "client_secret": config.google_client_secret,
            "redirect_uri": config.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def userinfo(access_token: str) -> dict:
    response = httpx.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    response.raise_for_status()
    return response.json()


def refresh_access_token(refresh_token: str) -> str:
    config = settings()
    if not config.google_client_id or not config.google_client_secret:
        raise RuntimeError("Google OAuth client credentials are required")
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": config.google_client_id,
            "client_secret": config.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    response.raise_for_status()
    return str(response.json()["access_token"])


def calendar_event_count(access_token: str, max_results: int = 10) -> int:
    response = httpx.get(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": max_results,
        },
        timeout=15,
    )
    response.raise_for_status()
    return len(response.json().get("items", []))


def gmail_message_count(access_token: str, max_results: int = 10) -> int:
    response = httpx.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"maxResults": max_results, "q": "newer_than:30d"},
        timeout=15,
    )
    response.raise_for_status()
    return len(response.json().get("messages", []))
