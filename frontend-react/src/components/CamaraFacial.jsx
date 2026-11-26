import { useEffect, useRef, useState } from 'react'
import '../styles/facial.css'
import {
  cargarModelosFaciales,
  evaluarCalidad,
  extraerRostro,
  promediarDescriptores,
} from '../services/faceApi'

// El parpadeo se mide contra los ojos abiertos de cada persona, no con un valor fijo.
// Así funciona con distinta distancia a la cámara, luz y forma de los ojos.
const UMBRAL_CIERRE = 0.75
const UMBRAL_APERTURA = 0.9
const VENTANA_PARPADEO_MS = 8000
// Cuadros buenos y seguidos que se promedian antes de entregar el descriptor.
const MUESTRAS_POR_DESCRIPTOR = 3

// Muestra la cámara y llama a onDescriptor cuando hay un rostro de buena calidad: bien iluminado,
// de frente, a la distancia correcta y centrado. Entrega el promedio de varios cuadros seguidos.
// Si el cuadro no sirve, le dice a la persona qué corregir (acércate, aléjate, centra...).
// Con requiereParpadeo, solo entrega el descriptor si la persona parpadeó hace poco
// (prueba de vida básica; no reemplaza una verificación en el servidor).
// La cámara se apaga al desmontar el componente o cuando activa pasa a false.
function CamaraFacial({
  activa = true,
  intervaloMs = 300,
  requiereParpadeo = false,
  poseEsperada = 'FRENTE',
  onDescriptor,
  onRostro,
}) {
  const videoRef = useRef(null)
  const onDescriptorRef = useRef(onDescriptor)
  const onRostroRef = useRef(onRostro)
  const poseRef = useRef(poseEsperada)
  const muestrasRef = useRef([])
  const [mensaje, setMensaje] = useState(
    'Iniciando cámara...',
  )
  // Recuadro del rostro detectado (relativo al video) y proporción real de la cámara.
  const [caja, setCaja] = useState(null)
  const [relacion, setRelacion] = useState(4 / 3)

  useEffect(() => {
    onDescriptorRef.current = onDescriptor
    onRostroRef.current = onRostro
  }, [onDescriptor, onRostro])

  // Al cambiar la pose pedida se descartan los cuadros acumulados, pero la cámara sigue encendida.
  useEffect(() => {
    poseRef.current = poseEsperada
    muestrasRef.current = []
  }, [poseEsperada])

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
        if (cancelado) {
          return
        }
        if (!rostro) {
          setCaja(null)
          setMensaje('No veo tu rostro. Colócate frente a la cámara.')
          return
        }
        registrarOjos(rostro.ojos)
        onRostroRef.current?.(rostro)

        const consejo = evaluarCalidad(rostro, { poseEsperada: poseRef.current })
        setCaja({ ...rostro.caja, ok: !consejo })
        if (consejo) {
          muestrasRef.current = []
          setMensaje(consejo)
          return
        }

        if (requiereParpadeo) {
          const parpadeoReciente =
            Date.now() - ultimoParpadeo < VENTANA_PARPADEO_MS
          if (!parpadeoReciente) {
            setMensaje('Parpadea una vez para confirmar tu identidad.')
            return
          }
        }
        muestrasRef.current.push(rostro.descriptor)
        if (muestrasRef.current.length < MUESTRAS_POR_DESCRIPTOR) {
          setMensaje('Perfecto, no te muevas...')
          return
        }
        setMensaje('Rostro detectado.')
        const promedio = promediarDescriptores(muestrasRef.current)
        muestrasRef.current = []
        onDescriptorRef.current?.(promedio, poseRef.current)
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
          // Más resolución = más píxeles en el rostro cuando la persona está algo lejos.
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (cancelado) {
          detener()
          return
        }

        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        if (video.videoWidth && video.videoHeight) {
          setRelacion(video.videoWidth / video.videoHeight)
        }

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
      <div
        className={`camara-facial-visor ${caja ? (caja.ok ? 'ok' : 'aviso') : ''}`}
        style={{ aspectRatio: relacion, '--relacion': relacion }}
      >
        <video
          ref={videoRef}
          className="camara-facial-video"
          muted
          playsInline
          aria-label="Vista de la cámara para reconocimiento facial"
        />
        <div className="camara-facial-guia" aria-hidden="true" />
        {caja && (
          <div
            className={`camara-facial-caja ${caja.ok ? 'ok' : 'aviso'}`}
            aria-hidden="true"
            style={{
              left: `${caja.x * 100}%`,
              top: `${caja.y * 100}%`,
              width: `${caja.ancho * 100}%`,
              height: `${caja.alto * 100}%`,
            }}
          />
        )}
      </div>
      <p className="camara-facial-estado" role="status">
        {mensaje}
      </p>
    </div>
  )
}

export default CamaraFacial
