import { useEffect, useRef, useState } from 'react'
import {
  cargarModelosFaciales,
  extraerRostro,
} from '../services/faceApi'

// El parpadeo se mide contra los ojos abiertos de cada persona, no con un valor fijo.
// Así funciona con distinta distancia a la cámara, luz y forma de los ojos.
const UMBRAL_CIERRE = 0.75
const UMBRAL_APERTURA = 0.9
const VENTANA_PARPADEO_MS = 8000

// Muestra la cámara y llama a onDescriptor cuando detecta un rostro.
// Con requiereParpadeo, solo entrega el descriptor si la persona parpadeó hace poco
// (prueba de vida básica; no reemplaza una verificación en el servidor).
// La cámara se apaga al desmontar el componente o cuando activa pasa a false.
function CamaraFacial({
  activa = true,
  intervaloMs = 1200,
  requiereParpadeo = false,
  onDescriptor,
  onRostro,
}) {
  const videoRef = useRef(null)
  const onDescriptorRef = useRef(onDescriptor)
  const onRostroRef = useRef(onRostro)
  const [mensaje, setMensaje] = useState(
    'Iniciando cámara...',
  )

  useEffect(() => {
    onDescriptorRef.current = onDescriptor
    onRostroRef.current = onRostro
  }, [onDescriptor, onRostro])

  useEffect(() => {
    if (!activa) {
      return undefined
    }

    let cancelado = false
    let stream = null
    let intervalo = null
    let analizando = false
    let ojosCerrados = false
    let ultimoParpadeo = 0

    function detener() {
      if (intervalo) {
        window.clearInterval(intervalo)
      }
      stream?.getTracks().forEach((pista) => pista.stop())
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }

    let aperturaReferencia = 0

    function registrarOjos(ojos) {
      if (aperturaReferencia === 0) {
        aperturaReferencia = ojos
      }
      if (!ojosCerrados) {
        aperturaReferencia = aperturaReferencia * 0.9 + ojos * 0.1
      }

      if (!ojosCerrados && ojos < aperturaReferencia * UMBRAL_CIERRE) {
        ojosCerrados = true
      } else if (ojosCerrados && ojos > aperturaReferencia * UMBRAL_APERTURA) {
        ojosCerrados = false
        ultimoParpadeo = Date.now()
      }
    }

    async function analizar() {
      const video = videoRef.current
      if (analizando || !video || video.readyState < 2) {
        return
      }
      analizando = true
      try {
        const rostro = await extraerRostro(video)
        if (cancelado || !rostro) {
          return
        }
        registrarOjos(rostro.ojos)
        onRostroRef.current?.(rostro)

        if (requiereParpadeo) {
          const parpadeoReciente =
            Date.now() - ultimoParpadeo < VENTANA_PARPADEO_MS
          if (!parpadeoReciente) {
            setMensaje('Parpadea una vez para confirmar tu identidad.')
            return
          }
        }
        setMensaje('Rostro detectado.')
        onDescriptorRef.current?.(rostro.descriptor)
      } catch {
        // Fotograma no válido o error transitorio: se intenta de nuevo en el siguiente ciclo.
      } finally {
        analizando = false
      }
    }

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMensaje(
          'Este navegador no permite usar la cámara en esta dirección. Usa HTTPS o localhost.',
        )
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        })

        if (cancelado) {
          detener()
          return
        }

        const video = videoRef.current
        video.srcObject = stream
        await video.play()

        await cargarModelosFaciales()
        if (cancelado) {
          return
        }

        setMensaje('Ubica tu rostro frente a la cámara.')
        intervalo = window.setInterval(analizar, intervaloMs)
      } catch (error) {
        if (cancelado) {
          return
        }
        setMensaje(
          error?.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Actívalo en el navegador o usa la contraseña.'
            : 'No fue posible iniciar la cámara o el reconocimiento facial.',
        )
      }
    }

    iniciar()

    return () => {
      cancelado = true
      detener()
    }
  }, [activa, intervaloMs, requiereParpadeo])

  return (
    <div className="camara-facial">
      <video
        ref={videoRef}
        className="camara-facial-video"
        muted
        playsInline
        aria-label="Vista de la cámara para reconocimiento facial"
      />
      <p className="camara-facial-estado" role="status">
        {mensaje}
      </p>
    </div>
  )
}

export default CamaraFacial
