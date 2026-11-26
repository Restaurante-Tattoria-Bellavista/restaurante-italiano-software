import secrets
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Trattoria Bellavista API"
    environment: str = "development"
    # Sin valor por defecto: la URL con la contraseña debe venir de DATABASE_URL (ver .env.example).
    database_url: str = ""
    database_connect_timeout: int = 3

    # Clave para firmar los tokens de sesion. Definir AUTH_SECRET en produccion:
    # si no se define, se genera una nueva en cada arranque y las sesiones se cierran al reiniciar.
    auth_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    auth_token_ttl_seconds: int = 8 * 60 * 60

    # Token que usan los gateways BLE (ESP32) para enviar lecturas. No es una sesión de usuario.
    gateway_token: str = ""

    # Ingreso facial. Distancia euclidiana maxima entre el rostro y las plantillas (face-api usa 0.6 como
    # referencia). Mas bajo = mas estricto. La auditoria guarda la distancia de cada intento para calibrarlo.
    face_umbral: float = 0.55
    # En el ingreso 1:1 (con usuario) hay un solo candidato, asi que se tolera algo mas de distancia.
    face_umbral_1a1: float = 0.60
    # Distancia minima entre las capturas de poses distintas de un reto; menos que eso es una foto fija o un vector repetido.
    face_variacion_minima: float = 0.08
    face_reto_ttl_segundos: int = 60

    # Pedidos por voz. Sin GEMINI_API_KEY el asistente usa solo el interprete local por reglas.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-lite-latest"
    # Si el principal esta saturado (503/429) o tarda demasiado se prueba este antes de caer a reglas.
    gemini_model_respaldo: str = "gemini-3.1-flash-lite"
    # Clave de la terminal ESP32 (header X-Device-Key) para POST /api/v1/voz/audio. Sin ella el endpoint se rechaza.
    voz_device_key: str = ""

    # hide_input_in_errors: si la validacion falla, el error no imprime los valores de la configuracion
    # (contrasena de la base, claves...) y asi no terminan en los logs del pod.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", hide_input_in_errors=True
    )

    @model_validator(mode="after")
    def _exigir_secreto_en_produccion(self):
        """En produccion la llave de los tokens debe venir del entorno (Secret de Kubernetes) y ser fuerte.

        Si se generara al azar en cada arranque, cada replica firmaria con una llave distinta y las sesiones
        fallarian de forma intermitente. Mejor no arrancar que arrancar mal.
        """
        if self.environment.lower() != "production":
            return self
        if "auth_secret" not in self.model_fields_set:
            raise ValueError("AUTH_SECRET es obligatorio cuando ENVIRONMENT=production (usa un Secret).")
        if len(self.auth_secret) < 32 or self.auth_secret.upper().startswith("CAMBIAR"):
            raise ValueError("AUTH_SECRET es demasiado corto o sigue con el valor de ejemplo (minimo 32 caracteres).")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
