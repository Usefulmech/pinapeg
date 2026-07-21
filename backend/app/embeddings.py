from dataclasses import dataclass
from typing import Sequence

import httpx

from .config import settings


@dataclass(frozen=True)
class EmbeddingResult:
    values: list[float]
    model: str


def embed_texts(texts: Sequence[str]) -> list[EmbeddingResult]:
    clean_texts = [text.strip() for text in texts if text.strip()]
    config = settings()
    if not clean_texts or not config.openai_api_key:
        return []

    try:
        response = httpx.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {config.openai_api_key}"},
            json={"model": config.embedding_model, "input": clean_texts},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    model = str(payload.get("model") or config.embedding_model)
    return [EmbeddingResult(values=item["embedding"], model=model) for item in sorted(payload.get("data", []), key=lambda item: item["index"])]


def embed_text(text: str) -> EmbeddingResult | None:
    results = embed_texts([text])
    return results[0] if results else None
