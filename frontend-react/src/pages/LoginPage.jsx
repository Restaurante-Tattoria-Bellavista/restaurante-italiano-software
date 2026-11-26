import { useState } from 'react'
import LoginFacial from '../components/LoginFacial'
import SolicitarAcceso from '../components/SolicitarAcceso'
import { api } from '../services/api'

function LoginPage({ onSesion }) {
  const [modo, setModo] = useState('rostro')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

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

        <h1>{modo === 'registro' ? 'Solicitar acceso' : 'Iniciar sesión'}</h1>

        {modo === 'registro' ? (
          <SolicitarAcceso onVolver={() => cambiarModo('clave')} />
        ) : modo === 'rostro' ? (
          <>
            <p className="page-subtitle">
              Sigue las indicaciones frente a la cámara. Si escribes tu usuario, la
              verificación es más segura.
            </p>

            <label className="form-field">
              <span>Usuario (opcional)</span>
              <input
                type="text"
                autoComplete="username"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
              />
            </label>

            <LoginFacial onSesion={onSesion} username={usuario} />

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

        <button
          type="button"
          className="button button-outline login-switch"
          onClick={() => cambiarModo(modo === 'registro' ? 'clave' : 'registro')}
        >
          {modo === 'registro'
            ? 'Ya tengo cuenta: iniciar sesión'
            : '¿No tienes cuenta? Solicitar acceso'}
        </button>
      </section>
    </div>
  )
}

export default LoginPage
