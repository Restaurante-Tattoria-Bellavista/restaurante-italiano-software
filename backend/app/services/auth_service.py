"""Logica de reconocimiento facial: validacion de descriptores y coincidencia por plantillas."""
import math
import statistics
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


# ---------------------------------------------------------------- ingreso con reto (varias capturas)

# Tolerancia extra: ninguna captura individual puede alejarse mas de esto del umbral.
TOLERANCIA_PEOR_CAPTURA = 0.10

# Un registro facial coherente: las poses de una misma persona no deben distar tanto entre si.
MAXIMA_DISTANCIA_ENTRE_POSES = 0.80

# Si un rostro nuevo queda a menos de esto de otra persona ya registrada, se considera el mismo rostro.
UMBRAL_ROSTRO_DUPLICADO = 0.40


def verificar_poses_del_reto(
    pedidas: Sequence[str], capturas: Sequence[tuple[str, Sequence[float]]]
) -> list[list[float]]:
    """Comprueba que las capturas sean exactamente las poses pedidas, en orden. Devuelve los descriptores."""
    if [pose for pose, _ in capturas] != list(pedidas):
        raise DescriptorInvalido("Las capturas no corresponden al reto pedido.")
    return [validar_descriptor(descriptor) for _, descriptor in capturas]


def hay_variacion_suficiente(descriptores: Sequence[Sequence[float]], minimo: float) -> bool:
    """Dos capturas de poses distintas nunca son identicas en una persona real.

    Una foto fija o un mismo vector repetido producen descriptores casi iguales: se rechazan.
    """
    for i in range(len(descriptores)):
        for j in range(i + 1, len(descriptores)):
            if distancia(descriptores[i], descriptores[j]) < minimo:
                return False
    return True


def identificar_con_capturas(
    descriptores: Sequence[Sequence[float]],
    plantillas_por_usuario: Mapping[Any, Sequence[Sequence[float]]],
    *,
    umbral: float,
    margen: float = MARGEN_AMBIGUEDAD,
    solo_usuario: Any | None = None,
) -> tuple[Any | None, float | None]:
    """Identifica a la persona usando TODAS las capturas del reto.

    La puntuacion de cada usuario es la mediana de la distancia de sus capturas a sus plantillas:
    un cuadro con ruido no decide. Devuelve (usuario_id | None, distancia del mejor candidato).
    Con solo_usuario se verifica 1:1 (sin ambiguedad posible) y no se compara con nadie mas.
    """
    candidatos = (
        {solo_usuario: plantillas_por_usuario.get(solo_usuario, ())}
        if solo_usuario is not None
        else plantillas_por_usuario
    )
    puntajes = []
    for usuario_id, plantillas in candidatos.items():
        por_captura = [distancia_minima(d, plantillas) for d in descriptores]
        if not por_captura or any(v is None for v in por_captura):
            continue
        puntajes.append((statistics.median(por_captura), max(por_captura), usuario_id))
    if not puntajes:
        return None, None
    puntajes.sort(key=lambda p: p[0])
    mediana, peor, mejor = puntajes[0]
    if mediana > umbral or peor > umbral + TOLERANCIA_PEOR_CAPTURA:
        return None, mediana
    if solo_usuario is None and len(puntajes) > 1 and puntajes[1][0] - mediana < margen:
        return None, mediana
    return mejor, mediana


def validar_coherencia_registro(plantillas: Sequence[tuple[str, Sequence[float]]]) -> None:
    """Rechaza un registro cuyas poses no parecen ser de la misma persona (p. ej. entro otra cara a mitad)."""
    for i in range(len(plantillas)):
        for j in range(i + 1, len(plantillas)):
            if distancia(plantillas[i][1], plantillas[j][1]) > MAXIMA_DISTANCIA_ENTRE_POSES:
                raise DescriptorInvalido(
                    "Las capturas no parecen ser de la misma persona. Repite el registro con un solo rostro frente a la cámara."
                )


def rostro_ya_registrado(
    plantillas_nuevas: Sequence[Sequence[float]],
    plantillas_por_usuario: Mapping[Any, Sequence[Sequence[float]]],
) -> Any | None:
    """Devuelve el usuario al que ya pertenece este rostro (otra cuenta), o None."""
    for usuario_id, existentes in plantillas_por_usuario.items():
        for nueva in plantillas_nuevas:
            minima = distancia_minima(nueva, existentes)
            if minima is not None and minima < UMBRAL_ROSTRO_DUPLICADO:
                return usuario_id
    return None
