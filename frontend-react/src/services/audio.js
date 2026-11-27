// Convierte cualquier audio que el navegador sepa decodificar (mp3, m4a, ogg, webm, wav...)
// a WAV mono de 16 kHz y 16 bits, que es lo que entiende el backend (y el mismo formato del ESP32).
const TASA = 16000
export const MAX_SEGUNDOS = 30

function escribirTexto(vista, desplazamiento, texto) {
  for (let i = 0; i < texto.length; i += 1) {
    vista.setUint8(desplazamiento + i, texto.charCodeAt(i))
  }
}

function codificarWav(muestras) {
  const datos = muestras.length * 2
  const buffer = new ArrayBuffer(44 + datos)
  const vista = new DataView(buffer)

  escribirTexto(vista, 0, 'RIFF')
  vista.setUint32(4, 36 + datos, true)
  escribirTexto(vista, 8, 'WAVEfmt ')
  vista.setUint32(16, 16, true)
  vista.setUint16(20, 1, true)
  vista.setUint16(22, 1, true)
  vista.setUint32(24, TASA, true)
  vista.setUint32(28, TASA * 2, true)
  vista.setUint16(32, 2, true)
  vista.setUint16(34, 16, true)
  escribirTexto(vista, 36, 'data')
  vista.setUint32(40, datos, true)

  for (let i = 0; i < muestras.length; i += 1) {
    const m = Math.max(-1, Math.min(1, muestras[i]))
    vista.setInt16(44 + i * 2, m < 0 ? m * 0x8000 : m * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function convertirAWav(archivo) {
  const Contexto = window.AudioContext || window.webkitAudioContext
  if (!Contexto) {
    throw new Error('Este navegador no puede procesar audio.')
  }

  const contexto = new Contexto()
  let decodificado

  try {
    decodificado = await contexto.decodeAudioData(
      await archivo.arrayBuffer(),
    )
  } catch {
    throw new Error(
      'No se pudo leer el audio. Prueba con un archivo WAV, MP3, M4A u OGG.',
    )
  } finally {
    contexto.close()
  }

  const segundos = Math.min(decodificado.duration, MAX_SEGUNDOS)
  const largo = Math.max(1, Math.round(segundos * TASA))
  const fuera = new OfflineAudioContext(1, largo, TASA)
  const fuente = fuera.createBufferSource()
  fuente.buffer = decodificado
  fuente.connect(fuera.destination)
  fuente.start()

  const renderizado = await fuera.startRendering()

  return {
    wav: codificarWav(renderizado.getChannelData(0)),
    segundos,
    recortado: decodificado.duration > MAX_SEGUNDOS,
  }
}
