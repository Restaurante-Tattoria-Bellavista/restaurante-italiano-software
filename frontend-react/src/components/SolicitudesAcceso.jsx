import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { conectarTiempoReal } from '../services/tiempoReal'
import '../styles/solicitudes.css'

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatearFecha(valor) {
  return valor ? FORMATO_FECHA.format(new Date(valor)) : ''
}

// Solicitudes de acceso hechas desde la pantalla de ingreso: el administrador las aprueba o las rechaza.
// Se actualiza sola cuando llega una nueva.
function SolicitudesAcceso({ onResuelta }) {
  const [pendientes, setPendientes] = useState([])
  const [historial, setHistorial] = useState([])
  const [verHistorial, setVerHistorial] = useState(false)
  const [roles, setRoles] = useState({})
  const [motivos, setMotivos] = useState({})
  const [ocupadoId, setOcupadoId] = useState(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true
    Promise.all([
      api.getSolicitudes('PENDIENTE'),
      verHistorial ? api.getSolicitudes('TODAS') : Promise.resolve([]),
    ])
      .then(([cola, todas]) => {
        if (vigente) {
          setPendientes(cola)
          setHistorial(todas.filter((s) => s.estado !== 'PENDIENTE'))
        }
      })
      .catch((err) => {
        if (vigente) {
          setError(err.message)
        }
      })
    return () => {
      vigente = false
    }
  }, [recarga, verHistorial])

  // Si otra persona envía o resuelve una solicitud, la lista se refresca sin recargar la página.
  useEffect(() => {
    return conectarTiempoReal({
      onCambio: (tablas) => {
        if (tablas.includes('solicitudes_acceso')) {
          setRecarga((n) => n + 1)
        }
      },
    })
  }, [])

  async function resolver(solicitud, accion) {
    setError('')
    setMensaje('')
    setOcupadoId(solicitud.id)
    try {
      if (accion === 'aprobar') {
        await api.aprobarSolicitud(solicitud.id, roles[solicitud.id] || 'PERSONAL')
        setMensaje(`Se aprobó a ${solicitud.nombre}: ya puede iniciar sesión con "${solicitud.username}".`)
      } else {
        await api.rechazarSolicitud(solicitud.id, motivos[solicitud.id] || '')
        setMensaje(`Se rechazó la solicitud de ${solicitud.nombre}.`)
      }
      setRecarga((n) => n + 1)
      onResuelta?.()
    } catch (err) {
      setError(err.message)
      setRecarga((n) => n + 1)
    } finally {
      setOcupadoId(null)
    }
  }

  return (
    <section className="solicitudes-acceso" aria-labelledby="solicitudes-titulo">
      <div className="solicitudes-cabecera">
        <h3 id="solicitudes-titulo">
          Solicitudes de acceso
          {pendientes.length > 0 && (
            <span className="solicitudes-contador">{pendientes.length}</span>
          )}
        </h3>
        <button
          type="button"
          className="button button-outline"
          onClick={() => setVerHistorial((v) => !v)}
        >
          {verHistorial ? 'Ocultar historial' : 'Ver historial'}
        </button>
      </div>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {mensaje && <p role="status">{mensaje}</p>}

      {pendientes.length === 0 ? (
        <p className="page-subtitle">No hay solicitudes pendientes.</p>
      ) : (
        <div className="solicitudes-lista">
          {pendientes.map((s) => (
            <article key={s.id} className="solicitud-tarjeta">
              <div className="solicitud-datos">
                <strong>{s.nombre}</strong>
                <span>
                  Usuario: <code>{s.username}</code> · {formatearFecha(s.created_at)}
                </span>
              </div>

              <div className="solicitud-acciones">
                <label>
                  <span>Rol</span>
                  <select
                    value={roles[s.id] || 'PERSONAL'}
                    disabled={ocupadoId === s.id}
                    onChange={(e) => setRoles((r) => ({ ...r, [s.id]: e.target.value }))}
                  >
                    <option value="PERSONAL">Personal</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </label>
                <label>
                  <span>Motivo si rechazas (opcional)</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={motivos[s.id] || ''}
                    disabled={ocupadoId === s.id}
                    onChange={(e) => setMotivos((m) => ({ ...m, [s.id]: e.target.value }))}
                  />
                </label>
                <div className="solicitud-botones">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={ocupadoId === s.id}
                    onClick={() => resolver(s, 'aprobar')}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    className="button button-danger-outline"
                    disabled={ocupadoId === s.id}
                    onClick={() => resolver(s, 'rechazar')}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {verHistorial && (
        <div className="solicitudes-historial">
          <h4>Solicitudes resueltas</h4>
          {historial.length === 0 ? (
            <p className="page-subtitle">Todavía no hay solicitudes resueltas.</p>
          ) : (
            <ul>
              {historial.map((s) => (
                <li key={s.id}>
                  <span className={`solicitud-estado ${s.estado.toLowerCase()}`}>
                    {s.estado === 'APROBADA' ? 'Aprobada' : 'Rechazada'}
                  </span>{' '}
                  <strong>{s.nombre}</strong> (<code>{s.username}</code>) · {formatearFecha(s.resuelta_at)}
                  {s.resuelta_por ? ` · por ${s.resuelta_por}` : ''}
                  {s.motivo ? ` · “${s.motivo}”` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export default SolicitudesAcceso
