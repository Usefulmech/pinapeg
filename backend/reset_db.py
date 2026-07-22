"""Utility script to reset and clear all data from the database."""
import sys
from pathlib import Path

# Ensure app package is in path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import settings
from app.database import engine
from sqlalchemy import text


def reset_database():
    db_url = settings().sqlalchemy_database_url
    if not db_url:
        print("❌ DATABASE_URL is not set in backend/.env")
        return

    print("⚠️  Connecting to database to clear all data...")
    db_engine = engine()
    
    try:
        with db_engine.connect() as conn:
            print("🧹 Truncating tables: users, entries, oauth_connections, entry_embeddings, habit_logs...")
            conn.execute(
                text(
                    "TRUNCATE TABLE users, entries, oauth_connections, entry_embeddings, habit_logs RESTART IDENTITY CASCADE;"
                )
            )
            conn.commit()
        print("✅ All user data cleared successfully! Your Neon DB is now on a clean slate.")
    except Exception as e:
        print(f"Notice: {e}")
        print("Creating tables afresh...")
        from app.models import Base
        Base.metadata.create_all(db_engine)
        print("✅ Fresh database tables created!")


if __name__ == "__main__":
    reset_database()
