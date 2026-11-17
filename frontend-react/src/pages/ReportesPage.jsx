import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api } from '../services/api'

function formatearDinero(valor) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor || 0))
}

function obtenerTotalPedidos(reporte) {
  if (reporte?.pedidos_hoy !== undefined) {
    return Number(reporte.pedidos_hoy || 0)
  }

  const pedidosPorEstado =
    reporte?.pedidos_por_estado || {}

  return Object.values(pedidosPorEstado).reduce(
    (total, cantidad) =>
      total + Number(cantidad || 0),
    0,
  )
}

function obtenerVentas(reporte) {
  return Number(
    reporte?.ventas_hoy ??
      reporte?.ventas_pagadas ??
      0,
  )
}

function ReportesPage() {
  const [reporte, setReporte] = useState(null)
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargarReportes = useCallback(async () => {
    try {
      setCargando(true)
      setError('')

      const [datosReporte, datosProductos] =
        await Promise.all([
          api.getReportDashboard(),
          api.getReportProductos(),
        ])

      setReporte(datosReporte || {})

      setProductos(
        Array.isArray(datosProductos)
          ? datosProductos
          : [],
      )
    } catch (err) {
      setError(
        err.message ||
          'No fue posible consultar los reportes.',
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      cargarReportes()
    }, 0)

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [cargarReportes])

  const pedidosHoy = useMemo(
    () => obtenerTotalPedidos(reporte),
    [reporte],
  )

  const ventasHoy = useMemo(
    () => obtenerVentas(reporte),
    [reporte],
  )

  const ticketPromedio = useMemo(() => {
    if (reporte?.ticket_promedio !== undefined) {
      return Number(reporte.ticket_promedio || 0)
    }

    if (pedidosHoy <= 0) {
      return 0
    }

    return ventasHoy / pedidosHoy
  }, [pedidosHoy, reporte, ventasHoy])

  const reservasHoy = Number(
    reporte?.reservas_hoy || 0,
  )

  const productosOrdenados = useMemo(
    () =>
      [...productos].sort(
        (productoA, productoB) =>
          Number(productoB.unidades || 0) -
          Number(productoA.unidades || 0),
      ),
    [productos],
  )

  const maximoUnidades = Math.max(
    1,
    ...productosOrdenados.map((producto) =>
      Number(producto.unidades || 0),
    ),
  )

  const productoMasVendido =
    reporte?.producto_mas_vendido ||
    productosOrdenados[0] ||
    null

  const mesaMasUtilizada =
    reporte?.mesa_mas_utilizada || null

  const contratoCompleto =
    reporte?.ventas_hoy !== undefined &&
    reporte?.pedidos_hoy !== undefined &&
    reporte?.ticket_promedio !== undefined &&
    reporte?.reservas_hoy !== undefined

  if (cargando) {
    return (
      <section
        className="empty-state"
        aria-live="polite"
      >
        <span className="loading-indicator" />

        <h2>Cargando reportes</h2>

        <p>
          Estamos consultando los indicadores del
          restaurante.
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section
        className="empty-state"
        role="alert"
      >
        <h2>No fue posible cargar los reportes</h2>

        <p>{error}</p>

        <button
          type="button"
          className="button button-primary"
          onClick={cargarReportes}
        >
          Intentar nuevamente
        </button>
      </section>
    )
  }

  return (
    <div className="reports-page">
      {!contratoCompleto && (
        <div
          className="message-action warning"
          role="status"
        >
          Algunos indicadores se están calculando con
          la información disponible. El backend debe
          completar ventas, pedidos, ticket promedio y
          reservas correspondientes al día actual.
        </div>
      )}

      <section
        className="reports-grid"
        aria-label="Indicadores principales"
      >
        <article className="report-metric">
          <span>Ventas del día</span>

          <strong>
            {formatearDinero(ventasHoy)}
          </strong>

          <small>Ingresos registrados en COP</small>
        </article>

        <article className="report-metric">
          <span>Pedidos del día</span>

          <strong>{pedidosHoy}</strong>

          <small>
            {pedidosHoy === 1
              ? '1 pedido registrado'
              : `${pedidosHoy} pedidos registrados`}
          </small>
        </article>

        <article className="report-metric">
          <span>Ticket promedio</span>

          <strong>
            {formatearDinero(ticketPromedio)}
          </strong>

          <small>Valor promedio por pedido</small>
        </article>

        <article className="report-metric">
          <span>Reservas del día</span>

          <strong>{reservasHoy}</strong>

          <small>
            {reservasHoy === 1
              ? '1 reserva registrada'
              : `${reservasHoy} reservas registradas`}
          </small>
        </article>
      </section>

      <section className="reports-layout">
        <article className="content-card">
          <div className="section-toolbar">
            <div>
              <p className="eyebrow">
                PRODUCTOS
              </p>

              <h2>Productos más vendidos</h2>

              <p>
                Clasificación por unidades vendidas.
              </p>
            </div>

            <button
              type="button"
              className="button button-outline"
              onClick={cargarReportes}
            >
              ↻ Actualizar
            </button>
          </div>

          {productosOrdenados.length > 0 ? (
            <div className="ranking">
              {productosOrdenados.map(
                (producto, indice) => {
                  const unidades = Number(
                    producto.unidades || 0,
                  )

                  const porcentaje =
                    unidades === 0
                      ? 0
                      : Math.max(
                          5,
                          (unidades /
                            maximoUnidades) *
                            100,
                        )

                  return (
                    <div
                      className="rank-row"
                      key={
                        producto.producto_id ||
                        producto.id ||
                        producto.nombre
                      }
                    >
                      <span className="rank-position">
                        {indice + 1}
                      </span>

                      <strong>
                        {producto.nombre ||
                          'Producto sin nombre'}
                      </strong>

                      <div className="rank-track">
                        <div
                          className="rank-bar"
                          style={{
                            width: `${porcentaje}%`,
                          }}
                        />
                      </div>

                      <span className="rank-value">
                        {unidades} uds.
                      </span>
                    </div>
                  )
                },
              )}
            </div>
          ) : (
            <div className="empty-state compact">
              <h3>Aún no existen ventas</h3>

              <p>
                El ranking aparecerá cuando existan
                productos asociados a pedidos pagados.
              </p>
            </div>
          )}
        </article>

        <article className="content-card highlight-card">
          <p className="eyebrow">
            RESUMEN OPERATIVO
          </p>

          <h2>Información destacada</h2>

          <div className="highlight-block">
            <span>Producto más vendido</span>

            <strong>
              {productoMasVendido?.nombre ||
                'Sin información'}
            </strong>

            {productoMasVendido && (
              <small>
                {Number(
                  productoMasVendido.cantidad ??
                    productoMasVendido.unidades ??
                    0,
                )}{' '}
                unidades
              </small>
            )}
          </div>

          <div className="highlight-block">
            <span>Mesa más utilizada</span>

            <strong>
              {mesaMasUtilizada
                ? `Mesa ${
                    mesaMasUtilizada.numero ??
                    mesaMasUtilizada.mesa_numero ??
                    mesaMasUtilizada.id ??
                    ''
                  }`
                : 'Sin información'}
            </strong>

            {mesaMasUtilizada && (
              <small>
                {Number(
                  mesaMasUtilizada.pedidos || 0,
                )}{' '}
                pedidos
              </small>
            )}
          </div>

          <div className="highlight-block">
            <span>Estado de la operación</span>

            <strong>
              {pedidosHoy > 0
                ? 'Actividad registrada'
                : 'Sin actividad'}
            </strong>

            <small>
              Información calculada con los datos
              disponibles.
            </small>
          </div>
        </article>
      </section>
    </div>
  )
}

export default ReportesPage