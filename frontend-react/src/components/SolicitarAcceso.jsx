import { useState } from 'react'
import { api } from '../services/api'
import '../styles/solicitudes.css'

const MENSAJES_CAMPO = {
  'body.username':
    'El usuario debe tener al menos 3 caracteres y solo puede usar letras minúsculas, números, punto, guion o guion bajo (sin espacios).',
  'body.nombre': 'Escribe tu nombre (mínimo 2 caracteres).',
  'body.password': 'La contraseña debe tener al menos 8 caracteres.',
}

function mensajeDeError(err) {
  if (err.detalles?.length) {
    return err.detalles
      .map((d) => MENSAJES_CAMPO[d.field] || `Dato inválido en ${d.field}.`)
      .join(' ')
  }
  return err.message
}

// Formulario para pedir una cuenta desde la pantalla de ingreso. Un administrador la aprueba después.
function SolicitarAcceso({ onVolver }) {
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviada, setEnviada] = useState('')

  async function enviar(evento) {
    evento.preventDefault()
    setError('')

    if (clave !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    try {
      const respuesta = await api.solicitarAcceso({
        nombre: nombre.trim(),
        username: usuario.trim().toLowerCase(),
        password: clave,
      })
      setEnviada(respuesta.mensaje)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  if (enviada) {
    return (
      <div className="solicitud-enviada" role="status">
        <span className="solicitud-icono" aria-hidden="true">✓</span>
        <h2>Solicitud enviada</h2>
        <p>{enviada}</p>
        <p className="page-subtitle">
          Cuando un administrador la apruebe podrás entrar con el usuario{' '}
          <strong>{usuario.trim().toLowerCase()}</strong> y la contraseña que elegiste.
        </p>
        <button type="button" className="button" onClick={onVolver}>
          Volver a iniciar sesión
        </button>
      </div>
    )
  }

  return (
    <>
      <p className="page-subtitle">
        Pide tu cuenta. Un administrador revisará la solicitud antes de que puedas entrar.
      </p>

      <form className="login-form" onSubmit={enviar}>
        <label className="form-field">
          <span>Nombre completo</span>
          <input
            type="text"
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            minLength={2}
            maxLength={120}
            required
          />
        </label>

        <label className="form-field">
          <span>Usuario</span>
          <input
            type="text"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            minLength={3}
            maxLength={60}
            pattern="[A-Za-z0-9._\-]+"
            title="Letras, números, punto, guion o guion bajo, sin espacios."
            required
          />
        </label>

        <label className="form-field">
          <span>Contraseña (mínimo 8 caracteres)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={8}
            maxLength={200}
            required
          />
        </label>

        <label className="form-field">
          <span>Repite la contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            minLength={8}
            maxLength={200}
            required
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button" disabled={enviando}>
          {enviando ? 'Enviando...' : 'Solicitar acceso'}
        </button>
      </form>
    </>
  )
}

export default SolicitarAcceso
