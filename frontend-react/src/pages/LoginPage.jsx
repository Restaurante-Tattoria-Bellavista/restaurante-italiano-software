import { useCallback, useRef, useState } from 'react'
import CamaraFacial from '../components/CamaraFacial'
import { api } from '../services/api'

const ESPERA_ENTRE_INTENTOS_MS = 1500

function LoginPage({ onSesion }) {
  const [modo, setModo] = useState('rostro')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const ocupadoRef = useRef(false)
  const ultimoIntentoRef = useRef(0)

  const intentarRostro = useCallback(
    async (descriptor) => {
      const ahora = Date.now()
      if (
        ocupadoRef.current ||
        ahora - ultimoIntentoRef.current < ESPERA_ENTRE_INTENTOS_MS
      ) {
        return
      }

      ocupadoRef.current = true
      ultimoIntentoRef.current = ahora
      try {
        const sesion = await api.faceLogin(descriptor)
        onSesion(sesion)
      } catch (err) {
        setError(
          err.status === 401
            ? 'Rostro no reconocido. Vuelve a intentarlo o usa tu contraseña.'
            : err.message,
        )
      } finally {
        ocupadoRef.current = false
      }
    },
    [onSesion],
  )

  async function enviarClave(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const sesion = await api.login(usuario.trim(), clave)
      onSesion(sesion)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  function cambiarModo(nuevoModo) {
    setError('')
    setModo(nuevoModo)
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">TB</div>
          <div>
            <strong>Trattoria</strong>
            <span>Bellavista</span>
          </div>
        </div>

        <h1>Iniciar sesión</h1>

        {modo === 'rostro' ? (
          <>
            <p className="page-subtitle">
              Mira a la cámara para entrar automáticamente.
            </p>

            <CamaraFacial
              activa
              onDescriptor={intentarRostro}
            />

            <button
              type="button"
              className="button button-outline login-switch"
              onClick={() => cambiarModo('clave')}
            >
              Usar usuario y contraseña
            </button>
          </>
        ) : (
          <>
            <p className="page-subtitle">
              Ingresa tus datos de acceso.
            </p>

            <form className="login-form" onSubmit={enviarClave}>
              <label className="form-field">
                <span>Usuario</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                />
              </label>

              <label className="form-field">
                <span>Contraseña</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  required
                />
              </label>

              <button
                type="submit"
                className="button"
                disabled={enviando}
              >
                {enviando ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>

            <button
              type="button"
              className="button button-outline login-switch"
              onClick={() => cambiarModo('rostro')}
            >
              Usar reconocimiento facial
            </button>
          </>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}

export default LoginPage
