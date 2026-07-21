from collections.abc import Generator
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from .config import settings


@lru_cache
def engine():
    database_url = settings().sqlalchemy_database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL is required when STORAGE_MODE=postgres")
    return create_engine(database_url, pool_pre_ping=True)


@lru_cache
def session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=engine(), autoflush=False, expire_on_commit=False)


def sessions() -> Generator[Session, None, None]:
    session = session_factory()()
    try:
        yield session
    finally:
        session.close()
