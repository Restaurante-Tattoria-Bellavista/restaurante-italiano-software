"""Logica de reconocimiento facial: validacion de descriptores y coincidencia por plantillas."""
import math
from typing import Any, Iterable, Mapping, Sequence

DESCRIPTOR_LONGITUD = 128

# Posiciones que se piden al registrar el rostro (ver PlantillaRostro en schemas).
POSES = ("FRENTE", "IZQUIERDA", "DERECHA", "ARRIBA", "ABAJO")
POSES_MINIMAS = 3

# Distancia euclidiana maxima entre el rostro actual y la mejor plantilla de una persona.
# face-api.js usa 0.6 como referencia; 0.55 equilibra falsos rechazos y falsos aceptados.
UMBRAL_DISTANCIA = 0.55

# Si dos personas quedan casi igual de cerca, no se acepta a ninguna (evita entrar con la cuenta equivocada).
MARGEN_AMBIGUEDAD = 0.05


class DescriptorInvalido(ValueError):
    pass


def validar_descriptor(valores: Sequence[float]) -> list[float]:
    if len(valores) != DESCRIPTOR_LONGITUD:
        raise DescriptorInvalido(f"El descriptor facial debe tener {DESCRIPTOR_LONGITUD} valores.")
    try:
        resultado = [float(v) for v in valores]
    except (TypeError, ValueError) as exc:
        raise DescriptorInvalido("El descriptor facial contiene valores no numericos.") from exc
    if not all(math.isfinite(v) for v in resultado):
        raise DescriptorInvalido("El descriptor facial contiene valores no finitos.")
    return resultado


def validar_plantillas(plantillas: Sequence[tuple[str, Sequence[float]]]) -> list[tuple[str, list[float]]]:
    """Valida el conjunto de poses de un registro facial. Devuelve (pose, descriptor) normalizados."""
    poses = [pose for pose, _ in plantillas]
    if len(set(poses)) != len(poses):
        raise DescriptorInvalido("Cada pose debe aparecer una sola vez.")
    if len(poses) < POSES_MINIMAS:
        raise DescriptorInvalido(f"Registra al menos {POSES_MINIMAS} posiciones del rostro.")
    return [(pose, validar_descriptor(descriptor)) for pose, descriptor in plantillas]


def distancia(a: Sequence[float], b: Sequence[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def distancia_minima(descriptor: Sequence[float], plantillas: Iterable[Sequence[float]]) -> float | None:
    """Menor distancia entre el rostro y cualquiera de las plantillas de una persona."""
    valores = [distancia(descriptor, plantilla) for plantilla in plantillas]
    return min(valores) if valores else None


def buscar_usuario(
    descriptor: Sequence[float],
    plantillas_por_usuario: Mapping[Any, Sequence[Sequence[float]]],
) -> Any | None:
    """Devuelve el id del usuario cuyo rostro coincide con el descriptor, o None.

    Para cada usuario se usa la plantilla mas parecida (las varias perspectivas registradas).
    """
    mejores = []
    for usuario_id, plantillas in plantillas_por_usuario.items():
        minima = distancia_minima(descriptor, plantillas)
        if minima is not None:
            mejores.append((minima, usuario_id))
    if not mejores:
        return None
    mejores.sort(key=lambda par: par[0])
    mejor_distancia, mejor = mejores[0]
    if mejor_distancia > UMBRAL_DISTANCIA:
        return None
    if len(mejores) > 1 and mejores[1][0] - mejor_distancia < MARGEN_AMBIGUEDAD:
        return None
    return mejor
