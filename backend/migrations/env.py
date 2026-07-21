from alembic import context
from sqlalchemy import engine_from_config, pool
from app.config import settings

config = context.config
database_url = settings().sqlalchemy_database_url
if not database_url:
    raise RuntimeError("Set DATABASE_URL in backend/.env before running Alembic migrations.")
config.set_main_option("sqlalchemy.url", database_url)

def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), literal_binds=True)
    with context.begin_transaction(): context.run_migrations()

def run_migrations_online() -> None:
    engine = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction(): context.run_migrations()

if context.is_offline_mode(): run_migrations_offline()
else: run_migrations_online()
