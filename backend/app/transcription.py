import httpx

from .config import settings


def transcribe_audio(content: bytes, filename: str, content_type: str) -> str | None:
    config = settings()
    if not config.openai_api_key:
        return None
    try:
        response = httpx.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {config.openai_api_key}"},
            data={"model": config.transcription_model},
            files={"file": (filename, content, content_type)},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None
    text = payload.get("text")
    return str(text).strip() if text else None
