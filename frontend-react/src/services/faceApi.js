// Reconocimiento facial en el navegador con @vladmandic/face-api.
// La imagen de la cámara no sale del equipo: solo se envía el descriptor numérico (128 valores).
import * as faceapi from '@vladmandic/face-api'

const RUTA_MODELOS = '/models'

// Umbrales de pose. Son aproximados: calibrarlos con la cámara real usando las medidas que muestra el asistente.
export const UMBRAL_GIRO = 0.18
export const RAZON_ARRIBA = 0.33
export const RAZON_ABAJO = 0.5

// Tamaño del rostro respecto al alto del cuadro (0 a 1). Fuera de este rango el descriptor se vuelve
// ruidoso: lejos hay pocos píxeles y muy cerca se recorta la frente o el mentón. Aproximados:
// la pantalla los muestra para poder ajustarlos con la cámara real.
export const TAMANO_MIN = 0.3
export const TAMANO_MAX = 0.7
// Confianza mínima del detector y desviación máxima del centro (fracción del ancho) para usar un cuadro.
export const PUNTAJE_MIN = 0.8
export const DESCENTRADO_MAX = 0.2

let cargaModelos = null

export function cargarModelosFaciales() {
  if (!cargaModelos) {
    cargaModelos = Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(RUTA_MODELOS),
      faceapi.nets.faceLandmark68Net.loadFromUri(RUTA_MODELOS),
      faceapi.nets.faceRecognitionNet.loadFromUri(RUTA_MODELOS),
    ]).catch((error) => {
      cargaModelos = null
      throw error
    })
  }
  return cargaModelos
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Eye Aspect Ratio: cae cerca de 0 cuando el ojo está cerrado.
function relacionOjo(puntos) {
  return (
    (distancia(puntos[1], puntos[5]) + distancia(puntos[2], puntos[4])) /
    (2 * distancia(puntos[0], puntos[3]))
  )
}

function promedio(puntos) {
  const suma = puntos.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  )
  return { x: suma.x / puntos.length, y: suma.y / puntos.length }
}

// Estima la pose de la cabeza a partir de los puntos faciales.
// yaw > 0: gira hacia la izquierda de la persona. razon: posición vertical de la nariz entre ojos y mentón.
export function estimarPose(landmarks) {
  const ojoIzq = promedio(landmarks.getLeftEye())
  const ojoDer = promedio(landmarks.getRightEye())
  const nariz = landmarks.positions[30]
  const mentón = landmarks.positions[8]

  const centroX = (ojoIzq.x + ojoDer.x) / 2
  const separacion = Math.abs(ojoDer.x - ojoIzq.x) || 1
  const yaw = (nariz.x - centroX) / separacion

  const centroY = (ojoIzq.y + ojoDer.y) / 2
  const razon = (nariz.y - centroY) / (mentón.y - centroY)

  let pose = 'FRENTE'
  if (yaw > UMBRAL_GIRO) {
    pose = 'IZQUIERDA'
  } else if (yaw < -UMBRAL_GIRO) {
    pose = 'DERECHA'
  } else if (razon < RAZON_ARRIBA) {
    pose = 'ARRIBA'
  } else if (razon > RAZON_ABAJO) {
    pose = 'ABAJO'
  }

  return {
    pose,
    yaw: Number(yaw.toFixed(3)),
    razon: Number(razon.toFixed(3)),
  }
}

// Instrucción para cada pose, tal como se muestra a la persona.
export const TEXTO_POSE = {
  FRENTE: 'Mira de frente a la cámara.',
  IZQUIERDA: 'Gira la cabeza despacio hacia tu izquierda.',
  DERECHA: 'Gira la cabeza despacio hacia tu derecha.',
  ARRIBA: 'Levanta un poco la barbilla, mirando hacia arriba.',
  ABAJO: 'Baja un poco la cabeza, mirando hacia abajo.',
}

// Evalúa si un cuadro sirve para reconocer. Devuelve null si es bueno o el consejo para el usuario.
// poseEsperada: exigir esa pose (login con reto); null = cualquiera (el registro valida la pose aparte).
export function evaluarCalidad(rostro, { poseEsperada = null } = {}) {
  if (rostro.puntaje < PUNTAJE_MIN) {
    return 'Mejora la iluminación o mira a la cámara.'
  }
  if (rostro.tamano < TAMANO_MIN) {
    return 'Acércate un poco a la cámara.'
  }
  if (rostro.tamano > TAMANO_MAX) {
    return 'Aléjate un poco de la cámara.'
  }
  if (rostro.descentrado > DESCENTRADO_MAX) {
    return 'Centra tu rostro en la imagen.'
  }
  if (poseEsperada && rostro.pose !== poseEsperada) {
    return TEXTO_POSE[poseEsperada] || 'Ajusta la posición de la cabeza.'
  }
  return null
}

// Promedia varios descriptores de la misma persona: reduce el ruido de un solo cuadro.
export function promediarDescriptores(descriptores) {
  const n = descriptores.length
  return descriptores[0].map(
    (_, i) => descriptores.reduce((suma, d) => suma + d[i], 0) / n,
  )
}

// Devuelve el descriptor, la pose estimada, la apertura de los ojos (para parpadeo) y la calidad del cuadro.
export async function extraerRostro(video) {
  const deteccion = await faceapi
    .detectSingleFace(
      video,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor()

  if (!deteccion) {
    return null
  }

  const ojos =
    (relacionOjo(deteccion.landmarks.getLeftEye()) +
      relacionOjo(deteccion.landmarks.getRightEye())) /
    2

  const caja = deteccion.detection.box
  const anchoVideo = video.videoWidth || 1
  const altoVideo = video.videoHeight || 1

  return {
    descriptor: Array.from(deteccion.descriptor),
    ojos,
    puntaje: deteccion.detection.score,
    caja: {
      x: caja.x / anchoVideo,
      y: caja.y / altoVideo,
      ancho: caja.width / anchoVideo,
      alto: caja.height / altoVideo,
    },
    tamano: Number((caja.height / altoVideo).toFixed(3)),
    descentrado: Number(
      Math.abs((caja.x + caja.width / 2) / anchoVideo - 0.5).toFixed(3),
    ),
    ...estimarPose(deteccion.landmarks),
  }
}
