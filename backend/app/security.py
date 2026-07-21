import base64
import hashlib

from cryptography.fernet import Fernet

from .config import settings


def _secret() -> str:
    config = settings()
    if config.token_encryption_key:
        return config.token_encryption_key
    if config.app_env == "development":
        return "pinapeg-development-token-key"
    raise RuntimeError("TOKEN_ENCRYPTION_KEY is required")


def _fernet() -> Fernet:
    digest = hashlib.sha256(_secret().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
