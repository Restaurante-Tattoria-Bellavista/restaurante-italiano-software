import secrets
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Trattoria Bellavista API"
    environment: str = "development"
    # Sin valor por defecto: la URL con la contraseña debe venir de DATABASE_URL (ver .env.example).
    database_url: str = ""
    database_connect_timeout: int = 3
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_model_respaldo: str = "gemini-3.1-flash-lite"
    voz_device_key: str | None = None

    # Clave para firmar los tokens de sesion. Definir AUTH_SECRET en produccion:
    # si no se define, se genera una nueva en cada arranque y las sesiones se cierran al reiniciar.
    auth_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    auth_token_ttl_seconds: int = 8 * 60 * 60

    # Token que usan los gateways BLE (ESP32) para enviar lecturas. No es una sesión de usuario.
    gateway_token: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
