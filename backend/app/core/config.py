from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Trattoria Bellavista API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://restaurant:restaurant@localhost:5432/restaurant"
    database_connect_timeout: int = 3

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
