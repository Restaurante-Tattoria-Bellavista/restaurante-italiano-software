import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { conectarTiempoReal } from '../services/tiempoReal'

// Una lectura se considera "en zona" si llegó hace menos de este tiempo.
const SEGUNDOS_EN_ZONA = 30
// Refresco periódico: no depende solo de los eventos en tiempo real.
const INTERVALO_REFRESCO_MS = 5000

function PersonalPage({ esAdmin = false }) {
  const [personal, setPersonal] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [etiquetas, setEtiquetas] = useState({})

  const recargarRef = useRef(null)

  async function cargar() {
    try {
      const datos = await api.getUbicaciones()
      setPersonal(datos)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargarRef.current = cargar
  })

  useEffect(() => {
    let activo = true
    api
      .getUbicaciones()
      .then((datos) => {
        if (activo) {
          setPersonal(datos)
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

    const desconectar = conectarTiempoReal({
      onCambio: (tablas) => {
        if (tablas.some((t) => t === 'ubicaciones_actuales' || t === 'etiquetas_ubicacion')) {
          recargarRef.current?.()
        }
      },
    })

    // Refresco periódico de datos: si el WebSocket se corta, la pantalla sigue al día.
    const intervalo = window.setInterval(() => {
      recargarRef.current?.()
    }, INTERVALO_REFRESCO_MS)

    return () => {
      activo = false
      desconectar()
      window.clearInterval(intervalo)
    }
  }, [])

  async function guardarEtiqueta(usuarioId) {
    const valor = (etiquetas[usuarioId] ?? '').trim()
    setError('')
    setMensaje('')
    try {
      await api.setEtiquetaUsuario(usuarioId, valor || null)
      setMensaje(valor ? 'Etiqueta asignada.' : 'Etiqueta quitada.')
      setEtiquetas((actual) => {
        const siguiente = { ...actual }
        delete siguiente[usuarioId]
        return siguiente
      })
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  if (cargando) {
    return <p role="status">Cargando personal...</p>
  }

  return (
    <section className="content-card usuarios-page">
      <h2>Personal en tiempo real</h2>
      <p className="page-subtitle">
        Zona actual de cada mesero según las etiquetas BLE de los gateways. Solo se muestra la última zona detectada.
      </p>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {mensaje && <p role="status">{mensaje}</p>}

      <table className="clients-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Estado</th>
            <th>Zona</th>
            <th>Distancia aprox.</th>
            <th>Etiqueta BLE</th>
          </tr>
        </thead>
        <tbody>
          {personal.map((persona) => {
            const antiguedad = persona.segundos_desde
            const enZona =
              antiguedad != null && antiguedad <= SEGUNDOS_EN_ZONA
            return (
              <tr key={persona.id}>
                <td>{persona.nombre}</td>
                <td>
                  {enZona ? (
                    <strong>En zona</strong>
                  ) : persona.etiqueta_id ? (
                    'Sin señal'
                  ) : (
                    'Sin etiqueta'
                  )}
                </td>
                <td>{enZona ? persona.zona : '—'}</td>
                <td>
                  {enZona && persona.distancia_m != null
                    ? `~${persona.distancia_m} m (${persona.banda}) · ${persona.rssi} dBm · hace ${antiguedad} s`
                    : antiguedad != null
                      ? `hace ${antiguedad} s`
                      : '—'}
                </td>
                <td>
                  {esAdmin ? (
                    <>
                      <input
                        type="text"
                        aria-label={`Etiqueta de ${persona.nombre}`}
                        placeholder={persona.etiqueta_id || 'TB-M01'}
                        value={etiquetas[persona.id] ?? ''}
                        onChange={(e) =>
                          setEtiquetas({ ...etiquetas, [persona.id]: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() => guardarEtiqueta(persona.id)}
                      >
                        Guardar
                      </button>
                    </>
                  ) : (
                    persona.etiqueta_id || '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export default PersonalPage
