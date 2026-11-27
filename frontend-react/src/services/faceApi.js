// Reconocimiento facial en el navegador con @vladmandic/face-api.
// La imagen de la cámara no sale del equipo: solo se envía el descriptor numérico (128 valores).
import * as faceapi from '@vladmandic/face-api'

const RUTA_MODELOS = '/models'

// Umbrales de pose. Son aproximados: calibrarlos con la cámara real usando las medidas que muestra el asistente.
export const UMBRAL_GIRO = 0.18
export const RAZON_ARRIBA = 0.33
export const RAZON_ABAJO = 0.5

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

// Devuelve el descriptor, la pose estimada y la apertura de los ojos (para parpadeo).
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

  return {
    descriptor: Array.from(deteccion.descriptor),
    ojos,
    ...estimarPose(deteccion.landmarks),
  }
}
