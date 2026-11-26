import { useEffect, useRef, useState } from 'react'
import CamaraFacial from './CamaraFacial'
import { api } from '../services/api'
import { TEXTO_POSE } from '../services/faceApi'

// Tras un rechazo se pide un reto nuevo y se repite; pasado este número se sugiere la contraseña.
const FALLOS_PARA_SUGERIR_CLAVE = 3
const PAUSA_REINTENTO_MS = 1200

const ETIQUETA = {
  FRENTE: 'de frente',
  IZQUIERDA: 'izquierda',
  DERECHA: 'derecha',
}

// Ingreso facial con reto: el servidor decide qué poses hacer y en qué orden, y cada reto sirve una sola vez.
// Se capturan todas las poses y se envían juntas; el servidor comprueba que sean de la misma persona.
function LoginFacial({ onSesion, username = '' }) {
  const [reto, setReto] = useState(null)
  const [paso, setPaso] = useState(0)
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState('')
  const [detenido, setDetenido] = useState(false)

  const [intento, setIntento] = useState(0)
  const [fallos, setFallos] = useState(0)

  const capturasRef = useRef([])
  const retoRef = useRef(null)
  const usernameRef = useRef(username)
  const activoRef = useRef(true)
  const ocupadoRef = useRef(false)

  useEffect(() => {
    usernameRef.current = username
  }, [username])

  useEffect(() => {
    activoRef.current = true
    return () => {
      activoRef.current = false
    }
  }, [])

  // Cada intento (el primero y los reintentos) pide un reto nuevo: un reto sirve una sola vez.
  useEffect(() => {
    let vigente = true
    api
      .faceChallenge()
      .then((nuevo) => {
        if (!vigente) {
          return
        }
        retoRef.current = nuevo
        capturasRef.current = []
        ocupadoRef.current = false
        setReto(nuevo)
        setPaso(0)
        setVerificando(false)
      })
      .catch((err) => {
        if (vigente) {
          setError(err.message)
          setDetenido(true)
        }
      })
    return () => {
      vigente = false
    }
  }, [intento])

  async function enviar() {
    setVerificando(true)
    try {
      const sesion = await api.faceLogin(
        retoRef.current.challenge_id,
        capturasRef.current,
        usernameRef.current.trim().toLowerCase(),
      )
      onSesion(sesion)
    } catch (err) {
      if (!activoRef.current) {
        return
      }
      setFallos((n) => n + 1)
      if (err.status === 429 || err.status === 423) {
        // Bloqueo temporal: reintentar solo empeora las cosas.
        setError(err.message)
        setDetenido(true)
        return
      }
      setError(
        err.status === 401
          ? 'No pude reconocerte. Vuelve a intentarlo o usa tu contraseña.'
          : err.message,
      )
      window.setTimeout(() => {
        if (activoRef.current) {
          setIntento((n) => n + 1)
        }
      }, PAUSA_REINTENTO_MS)
    }
  }

  function alDescriptor(descriptor, pose) {
    const actual = retoRef.current
    if (!actual || ocupadoRef.current || pose !== actual.poses[capturasRef.current.length]) {
      return
    }
    setError('')
    capturasRef.current = [...capturasRef.current, { pose, descriptor }]
    if (capturasRef.current.length < actual.poses.length) {
      setPaso(capturasRef.current.length)
      return
    }
    ocupadoRef.current = true
    enviar()
  }

  if (detenido) {
    return (
      <div className="login-facial">
        <p className="form-message error" role="alert">{error}</p>
      </div>
    )
  }

  const poseActual = reto && !verificando ? reto.poses[paso] : null

  return (
    <div className="login-facial">
      <ol className="registro-rostro-pasos">
        {(reto?.poses || []).map((pose, indice) => (
          <li
            key={`${pose}-${indice}`}
            className={indice < paso || verificando ? 'hecho' : indice === paso ? 'actual' : ''}
          >
            {ETIQUETA[pose] || pose.toLowerCase()}
          </li>
        ))}
      </ol>

      <p role="status">
        {!reto && 'Preparando verificación...'}
        {verificando && 'Verificando...'}
        {poseActual && (
          <>
            <strong>Paso {paso + 1} de {reto.poses.length}:</strong> {TEXTO_POSE[poseActual]}
          </>
        )}
      </p>

      {reto && (
        <CamaraFacial
          activa
          poseEsperada={poseActual || reto.poses[reto.poses.length - 1]}
          onDescriptor={alDescriptor}
        />
      )}

      {error && <p className="form-message error" role="alert">{error}</p>}
      {fallos >= FALLOS_PARA_SUGERIR_CLAVE && (
        <p className="page-subtitle">¿Sigue sin funcionar? Usa tu usuario y contraseña.</p>
      )}
    </div>
  )
}

export default LoginFacial
