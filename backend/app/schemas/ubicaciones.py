from pydantic import BaseModel, Field


class LecturaEtiqueta(BaseModel):
    etiqueta: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    rssi: int = Field(ge=-120, le=0)


class LecturasGateway(BaseModel):
    zona: str = Field(min_length=1, max_length=60, pattern=r"^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]+$")
    lecturas: list[LecturaEtiqueta] = Field(max_length=100)


class EtiquetaUpdate(BaseModel):
    etiqueta: str | None = Field(default=None, min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
