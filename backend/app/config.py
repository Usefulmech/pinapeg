from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Runtime configuration; secrets stay in the backend environment only."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_env: str = "development"
    allow_dev_identity: bool = True
    database_url: str | None = None

    storage_mode: str = "memory"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    openai_api_key: str | None = None
    embedding_model: str = "text-embedding-3-small"
    transcription_model: str = "whisper-1"
    summary_model: str = "gpt-4o-mini"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/v1/integrations/google/callback"
    google_oauth_state_secret: str | None = None
    frontend_app_url: str = "http://localhost:5173"
    token_encryption_key: str | None = None
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlalchemy_database_url(self) -> str | None:
        """Accept Neon/Postgres dashboard URLs and force the installed Psycopg 3 driver."""

        if not self.database_url:
            return None
        url = self.database_url.strip()
        if url.startswith("postgresql+psycopg://"):
            return url
        if url.startswith("postgresql://"):
            return f"postgresql+psycopg://{url.removeprefix('postgresql://')}"
        if url.startswith("postgres://"):
            return f"postgresql+psycopg://{url.removeprefix('postgres://')}"
        return url




@lru_cache
def settings() -> Settings:
    return Settings()
