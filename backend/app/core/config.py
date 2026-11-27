from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Trattoria Bellavista API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://restaurant:restaurant@localhost:5432/restaurant"
    database_connect_timeout: int = 3
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_model_respaldo: str = "gemini-3.1-flash-lite"
    voz_device_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
