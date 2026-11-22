import { useEffect, useState } from 'react'
import RegistroRostroWizard from '../components/RegistroRostroWizard'
import { api } from '../services/api'

const MENSAJES_CAMPO = {
  'body.username':
    'El usuario debe tener al menos 3 caracteres y solo puede usar minúsculas, números, punto, guion o guion bajo (sin espacios).',
  'body.nombre': 'El nombre debe tener al menos 2 caracteres.',
  'body.rol': 'Selecciona un rol válido.',
  'body.password': 'La contraseña debe tener al menos 8 caracteres.',
  'body.plantillas':
    'Registra al menos 3 posiciones del rostro. Si el problema continúa, recarga la página con Ctrl+F5.',
}

function mensajeDeError(err) {
  if (err.detalles?.length) {
    return err.detalles
      .map(
        (d) =>
          MENSAJES_CAMPO[d.field] ||
          `Dato inválido en ${d.field}.`,
      )
      .join(' ')
  }
  return err.message
}

const FORMULARIO_VACIO = {
  username: '',
  nombre: '',
  rol: 'PERSONAL',
  password: '',
}

function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO)
  const [registrandoId, setRegistrandoId] = useState(null)

  useEffect(() => {
    let activo = true

    api
      .getUsuarios()
      .then((datos) => {
        if (activo) {
          setUsuarios(datos)
        }
      })
      .catch((err) => {
        if (activo) {
          setError(err.message)
        }
      })
      .finally(() => {
        if (activo) {
          setCargando(false)
        }
      })

    return () => {
      activo = false
    }
  }, [])

  async function cargarUsuarios() {
    try {
      setUsuarios(await api.getUsuarios())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  async function crearUsuario(evento) {
    evento.preventDefault()
    setError('')
    setMensaje('')
    try {
      await api.createUsuario(formulario)
      setFormulario(FORMULARIO_VACIO)
      setMensaje('Usuario creado.')
      await cargarUsuarios()
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  function abrirRegistroRostro(usuarioId) {
    setError('')
    setMensaje('')
    setRegistrandoId(usuarioId)
  }

  function cerrarRegistroRostro() {
    setRegistrandoId(null)
  }

  async function guardarRostro(plantillas) {
    try {
      await api.setRostroUsuario(registrandoId, plantillas)
      setMensaje('Rostro registrado con varias posiciones.')
      cerrarRegistroRostro()
      await cargarUsuarios()
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  async function quitarRostro(usuarioId) {
    setError('')
    setMensaje('')
    try {
      await api.deleteRostroUsuario(usuarioId)
      setMensaje('Rostro eliminado.')
      await cargarUsuarios()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="content-card usuarios-page">
      <h2>Usuarios y acceso</h2>
      <p className="page-subtitle">
        Crea usuarios y registra su rostro desde varias posiciones para el ingreso facial.
      </p>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {mensaje && <p role="status">{mensaje}</p>}

      <form className="dialog-form" onSubmit={crearUsuario}>
        <label className="form-field">
          <span>Usuario</span>
          <input
            type="text"
            value={formulario.username}
            onChange={(e) =>
              setFormulario({ ...formulario, username: e.target.value })
            }
            pattern="[a-z0-9._\-]+"
            title="Solo minúsculas, números, punto, guion o guion bajo"
            minLength={3}
            required
          />
        </label>

        <label className="form-field">
          <span>Nombre</span>
          <input
            type="text"
            value={formulario.nombre}
            onChange={(e) =>
              setFormulario({ ...formulario, nombre: e.target.value })
            }
            minLength={2}
            required
          />
        </label>

        <label className="form-field">
          <span>Rol</span>
          <select
            value={formulario.rol}
            onChange={(e) =>
              setFormulario({ ...formulario, rol: e.target.value })
            }
          >
            <option value="PERSONAL">Personal</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </label>

        <label className="form-field">
          <span>Contraseña (mín. 8)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={formulario.password}
            onChange={(e) =>
              setFormulario({ ...formulario, password: e.target.value })
            }
            minLength={8}
            required
          />
        </label>

        <button type="submit" className="button">
          Crear usuario
        </button>
      </form>

      {cargando ? (
        <p>Cargando usuarios...</p>
      ) : (
        <table className="clients-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Rostro</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.nombre}</td>
                <td>{usuario.username}</td>
                <td>
                  {usuario.rol === 'ADMIN'
                    ? 'Administrador'
                    : 'Personal'}
                </td>
                <td>
                  {usuario.tiene_rostro
                    ? 'Registrado'
                    : 'Sin registrar'}
                </td>
                <td>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => abrirRegistroRostro(usuario.id)}
                  >
                    {usuario.tiene_rostro
                      ? 'Reemplazar rostro'
                      : 'Registrar rostro'}
                  </button>
                  {usuario.tiene_rostro && (
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => quitarRostro(usuario.id)}
                    >
                      Quitar rostro
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {registrandoId !== null && (
        <RegistroRostroWizard
          nombre={
            usuarios.find((u) => u.id === registrandoId)?.nombre || ''
          }
          onGuardar={guardarRostro}
          onCancelar={cerrarRegistroRostro}
        />
      )}
    </section>
  )
}

export default UsuariosPage
