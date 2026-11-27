import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

const COLUMNAS = [
  {
    estado: 'ABIERTO',
    titulo: 'Nuevos',
    siguiente: 'EN_PREPARACION',
    accion: 'Empezar a preparar',
  },
  {
    estado: 'EN_PREPARACION',
    titulo: 'En preparación',
    siguiente: 'LISTO',
    accion: 'Marcar listo',
  },
  {
    estado: 'LISTO',
    titulo: 'Listos para entregar',
    siguiente: 'ENTREGADO',
    accion: 'Entregado',
  },
]

const REFRESCO_MS = 4000
const DESTACADO_MS = 20000

function hora(fecha) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(fecha))
}

function CocinaPage() {
  const [pedidos, setPedidos] = useState([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [nuevos, setNuevos] = useState({})
  const [ocupado, setOcupado] = useState(0)
  const conocidos = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const datos = await api.getCocina()
      const ids = new Set(datos.map((p) => p.id))

      // Primera carga: todo es "conocido". Despues, lo que aparezca se destaca unos segundos.
      if (conocidos.current === null) {
        conocidos.current = ids
      } else {
        const recien = datos.filter(
          (p) => !conocidos.current.has(p.id),
        )
        if (recien.length) {
          const ahora = Date.now()
          setNuevos((previo) => {
            const copia = { ...previo }
            recien.forEach((p) => {
              copia[p.id] = ahora
            })
            return copia
          })
        }
        conocidos.current = ids
      }

      setPedidos(datos)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    const intervalo = window.setInterval(cargar, REFRESCO_MS)
    return () => window.clearInterval(intervalo)
  }, [cargar])

  // Quita la marca "NUEVO" pasado un rato.
  useEffect(() => {
    const limpiar = window.setInterval(() => {
      const limite = Date.now() - DESTACADO_MS
      setNuevos((previo) => {
        const restantes = Object.entries(previo).filter(
          ([, t]) => t > limite,
        )
        return restantes.length === Object.keys(previo).length
          ? previo
          : Object.fromEntries(restantes)
      })
    }, 2000)
    return () => window.clearInterval(limpiar)
  }, [])

  async function avanzar(pedido, siguiente) {
    setOcupado(pedido.id)
    try {
      await api.cambiarEstadoPedido(pedido.id, siguiente)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(0)
    }
  }

  const total = pedidos.length
  const porEstado = (estado) =>
    pedidos.filter((p) => p.estado === estado)

  return (
    <section className="cocina-page">
      <div className="cocina-resumen">
        <strong>
          {total === 0
            ? 'Sin pedidos pendientes'
            : `${total} pedido${total === 1 ? '' : 's'} en cocina`}
        </strong>
        <span>
          Se actualiza solo cada {REFRESCO_MS / 1000} s
        </span>
      </div>

      {error && (
        <div className="cocina-error" role="alert">
          {error}
        </div>
      )}

      <div className="cocina-tablero">
        {COLUMNAS.map((columna) => {
          const lista = porEstado(columna.estado)

          return (
            <section
              key={columna.estado}
              className="cocina-columna"
            >
              <header>
                <h2>{columna.titulo}</h2>
                <span className="cocina-contador">
                  {lista.length}
                </span>
              </header>

              {cargando && (
                <p className="cocina-vacio">Cargando...</p>
              )}

              {!cargando && lista.length === 0 && (
                <p className="cocina-vacio">Nada por aquí</p>
              )}

              {lista.map((pedido) => (
                <article
                  key={pedido.id}
                  className={`cocina-tarjeta ${
                    nuevos[pedido.id] ? 'cocina-nuevo' : ''
                  }`}
                >
                  <header>
                    <strong>Mesa {pedido.mesa_numero}</strong>
                    <span>
                      #{pedido.id} · {hora(pedido.created_at)}
                    </span>
                    {nuevos[pedido.id] && (
                      <em className="cocina-badge">NUEVO</em>
                    )}
                  </header>

                  <ul>
                    {pedido.detalles.map((d, i) => (
                      <li key={i}>
                        <b>{d.cantidad}×</b> {d.producto}
                        {d.observacion && (
                          <small> — {d.observacion}</small>
                        )}
                      </li>
                    ))}
                    {pedido.detalles.length === 0 && (
                      <li>
                        <small>Sin productos todavía</small>
                      </li>
                    )}
                  </ul>

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={
                      ocupado === pedido.id ||
                      pedido.detalles.length === 0
                    }
                    onClick={() =>
                      avanzar(pedido, columna.siguiente)
                    }
                  >
                    {columna.accion}
                  </button>
                </article>
              ))}
            </section>
          )
        })}
      </div>
    </section>
  )
}

export default CocinaPage
