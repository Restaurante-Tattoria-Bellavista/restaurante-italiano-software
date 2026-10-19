from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings


@lru_cache
def get_engine():
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": settings.database_connect_timeout},
    )


def get_db():
    session_factory = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)
    with session_factory() as session:
        yield session
