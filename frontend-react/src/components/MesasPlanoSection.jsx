import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api } from '../services/api'
import RestaurantMap from './RestaurantMap'

const ZONAS = [
  { valor: 'SALON', etiqueta: 'Salón' },
  { valor: 'TERRAZA', etiqueta: 'Terraza' },
  { valor: 'BAR', etiqueta: 'Bar' },
  { valor: 'VIP', etiqueta: 'VIP' },
  { valor: 'OTRA', etiqueta: 'Otra' },
]

const FORMAS = [
  { valor: 'ROUND', etiqueta: 'Redonda' },
  { valor: 'RECT', etiqueta: 'Rectangular' },
  { valor: 'SMALL', etiqueta: 'Pequeña' },
]

function limitarCoordenada(valor) {
  const numero = Number(valor)

  if (!Number.isFinite(numero)) {
    return 0
  }

  return Math.min(100, Math.max(0, numero))
}

function obtenerFormaInicial(mesa) {
  const capacidad = Number(mesa.capacidad || 0)

  if (capacidad <= 2) {
    return 'SMALL'
  }

  if (capacidad >= 6) {
    return 'RECT'
  }

  return 'ROUND'
}

function obtenerZonaInicial(mesa) {
  const ubicacion = String(
    mesa.ubicacion || '',
  ).toUpperCase()

  if (ubicacion.includes('TERRAZA')) {
    return 'TERRAZA'
  }

  if (ubicacion.includes('BAR')) {
    return 'BAR'
  }

  if (ubicacion.includes('VIP')) {
    return 'VIP'
  }

  return 'SALON'
}

function crearLayoutInicial(mesa, indice) {
  const columnas = 4
  const columna = indice % columnas
  const fila = Math.floor(indice / columnas)

  return {
    mesa_id: mesa.id,
    zona: obtenerZonaInicial(mesa),
    pos_x: 15 + columna * 22,
    pos_y: 20 + (fila % 3) * 28,
    forma: obtenerFormaInicial(mesa),
  }
}

function MesasPlanoSection({ mesas = [] }) {
  const [layouts, setLayouts] = useState({})
  const [
    mesaSeleccionadaId,
    setMesaSeleccionadaId,
  ] = useState(null)
  const [modoEdicion, setModoEdicion] =
    useState(false)
  const [cargando, setCargando] =
    useState(true)
  const [guardandoId, setGuardandoId] =
    useState(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const mesasActivas = useMemo(
    () =>
      mesas.filter(
        (mesa) => mesa.activo !== false,
      ),
    [mesas],
  )

  const cargarLayouts = useCallback(async () => {
    try {
      setCargando(true)
      setError('')
      setMensaje('')

      const resultados = await Promise.all(
        mesasActivas.map(async (mesa, indice) => {
          try {
            const layout =
              await api.getMesaLayout(mesa.id)

            return [
              mesa.id,
              {
                ...layout,
                mesa_id: mesa.id,
                pos_x: Number(layout.pos_x),
                pos_y: Number(layout.pos_y),
              },
            ]
          } catch {
            return [
              mesa.id,
              crearLayoutInicial(mesa, indice),
            ]
          }
        }),
      )

      setLayouts(Object.fromEntries(resultados))

      setMesaSeleccionadaId((idActual) => {
        const sigueExistiendo =
          mesasActivas.some(
            (mesa) =>
              Number(mesa.id) ===
              Number(idActual),
          )

        if (sigueExistiendo) {
          return idActual
        }

        return mesasActivas[0]?.id ?? null
      })
    } catch (err) {
      setError(
        err.message ||
          'No fue posible cargar el plano.',
      )
    } finally {
      setCargando(false)
    }
  }, [mesasActivas])

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => {
        cargarLayouts()
      },
      0,
    )

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [cargarLayouts])

  const mesaSeleccionada = mesasActivas.find(
    (mesa) =>
      Number(mesa.id) ===
      Number(mesaSeleccionadaId),
  )

  const layoutSeleccionado =
    mesaSeleccionadaId !== null
      ? layouts[mesaSeleccionadaId]
      : null

  function seleccionarMesa(mesaId) {
    setMesaSeleccionadaId(mesaId)
    setError('')
    setMensaje('')
  }

  function actualizarLayoutLocal(
    mesaId,
    cambios,
  ) {
    setLayouts((layoutsActuales) => ({
      ...layoutsActuales,
      [mesaId]: {
        ...layoutsActuales[mesaId],
        ...cambios,
        mesa_id: mesaId,
      },
    }))
  }

  function actualizarPosicion(
    mesaId,
    posicion,
  ) {
    actualizarLayoutLocal(mesaId, {
      pos_x: limitarCoordenada(
        posicion.pos_x,
      ),
      pos_y: limitarCoordenada(
        posicion.pos_y,
      ),
    })
  }

  function cambiarDatoSeleccionado(evento) {
    if (mesaSeleccionadaId === null) {
      return
    }

    const { name, value } = evento.target

    actualizarLayoutLocal(
      mesaSeleccionadaId,
      {
        [name]:
          name === 'pos_x' || name === 'pos_y'
            ? limitarCoordenada(value)
            : value,
      },
    )

    setMensaje('')
  }

  async function guardarLayout(mesaId) {
    const layout = layouts[mesaId]

    if (!layout) {
      return
    }

    try {
      setGuardandoId(mesaId)
      setError('')
      setMensaje('')

      const datos = {
        zona: layout.zona || 'SALON',
        pos_x: Number(
          limitarCoordenada(layout.pos_x).toFixed(
            2,
          ),
        ),
        pos_y: Number(
          limitarCoordenada(layout.pos_y).toFixed(
            2,
          ),
        ),
        forma: layout.forma || 'ROUND',
      }

      const guardado =
        await api.saveMesaLayout(
          mesaId,
          datos,
        )

      setLayouts((layoutsActuales) => ({
        ...layoutsActuales,
        [mesaId]: {
          ...datos,
          ...guardado,
          mesa_id: mesaId,
          pos_x: Number(
            guardado?.pos_x ?? datos.pos_x,
          ),
          pos_y: Number(
            guardado?.pos_y ?? datos.pos_y,
          ),
        },
      }))

      setMensaje(
        `La posición de la Mesa ${
          mesaSeleccionada?.numero ?? mesaId
        } fue guardada.`,
      )
    } catch (err) {
      setError(
        err.message ||
          'No fue posible guardar la posición.',
      )
    } finally {
      setGuardandoId(null)
    }
  }

  async function guardarMesaSeleccionada() {
    if (mesaSeleccionadaId === null) {
      return
    }

    await guardarLayout(
      mesaSeleccionadaId,
    )
  }

  function alternarModoEdicion() {
    setModoEdicion((valorActual) => {
      const nuevoValor = !valorActual

      if (!nuevoValor) {
        setMensaje('')
      }

      return nuevoValor
    })
  }

  if (cargando) {
    return (
      <section className="content-card map-section">
        <div className="empty-state">
          Cargando plano del restaurante...
        </div>
      </section>
    )
  }

  if (mesasActivas.length === 0) {
    return (
      <section className="content-card map-section">
        <div className="section-toolbar">
          <div>
            <p className="eyebrow">
              DISTRIBUCIÓN
            </p>

            <h2>Plano del restaurante</h2>

            <p>
              Ubicación visual de las mesas por
              zonas.
            </p>
          </div>
        </div>

        <div className="empty-state">
          No existen mesas activas para mostrar en
          el plano.
        </div>
      </section>
    )
  }

  return (
    <section className="content-card map-section">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">
            DISTRIBUCIÓN
          </p>

          <h2>Plano interactivo</h2>

          <p>
            Consulta la ubicación de las mesas y
            organiza su posición mediante arrastre.
          </p>
        </div>

        <div className="map-toolbar-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={guardandoId !== null}
            onClick={cargarLayouts}
          >
            ↻ Recargar plano
          </button>

          <button
            type="button"
            className={
              modoEdicion
                ? 'button button-primary'
                : 'button button-outline'
            }
            disabled={guardandoId !== null}
            onClick={alternarModoEdicion}
          >
            {modoEdicion
              ? 'Finalizar edición'
              : 'Editar posiciones'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="form-message error"
          role="alert"
        >
          {error}
        </div>
      )}

      {mensaje && (
        <div
          className="form-message success"
          role="status"
        >
          {mensaje}
        </div>
      )}

      <div className="map-layout">
        <RestaurantMap
          mesas={mesasActivas}
          layouts={layouts}
          mesaSeleccionadaId={
            mesaSeleccionadaId
          }
          seleccionarMesa={seleccionarMesa}
          modoEdicion={modoEdicion}
          actualizarPosicion={
            actualizarPosicion
          }
          guardandoId={guardandoId}
        />

        <aside className="map-selection-panel">
          <div className="map-selection-heading">
            <p className="eyebrow">
              MESA SELECCIONADA
            </p>

            <h3>
              {mesaSeleccionada
                ? `Mesa ${mesaSeleccionada.numero}`
                : 'Selecciona una mesa'}
            </h3>

            {mesaSeleccionada && (
              <p>
                Capacidad:{' '}
                {mesaSeleccionada.capacidad}{' '}
                personas
              </p>
            )}
          </div>

          {mesaSeleccionada &&
            layoutSeleccionado && (
              <>
                <div className="map-selection-fields">
                  <div className="form-field">
                    <label htmlFor="layout-zona">
                      Zona
                    </label>

                    <select
                      id="layout-zona"
                      name="zona"
                      value={
                        layoutSeleccionado.zona ||
                        'SALON'
                      }
                      disabled={
                        guardandoId !== null
                      }
                      onChange={
                        cambiarDatoSeleccionado
                      }
                    >
                      {ZONAS.map((zona) => (
                        <option
                          key={zona.valor}
                          value={zona.valor}
                        >
                          {zona.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="layout-forma">
                      Forma
                    </label>

                    <select
                      id="layout-forma"
                      name="forma"
                      value={
                        layoutSeleccionado.forma ||
                        'ROUND'
                      }
                      disabled={
                        guardandoId !== null
                      }
                      onChange={
                        cambiarDatoSeleccionado
                      }
                    >
                      {FORMAS.map((forma) => (
                        <option
                          key={forma.valor}
                          value={forma.valor}
                        >
                          {forma.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="map-coordinates">
                    <div className="form-field">
                      <label htmlFor="layout-pos-x">
                        Posición X
                      </label>

                      <input
                        id="layout-pos-x"
                        name="pos_x"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={
                          layoutSeleccionado.pos_x
                        }
                        disabled={
                          guardandoId !== null
                        }
                        onChange={
                          cambiarDatoSeleccionado
                        }
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="layout-pos-y">
                        Posición Y
                      </label>

                      <input
                        id="layout-pos-y"
                        name="pos_y"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={
                          layoutSeleccionado.pos_y
                        }
                        disabled={
                          guardandoId !== null
                        }
                        onChange={
                          cambiarDatoSeleccionado
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="map-selected-summary">
                  <span>
                    Estado
                  </span>

                  <strong>
                    {mesaSeleccionada.estado}
                  </strong>
                </div>

                <button
                  type="button"
                  className="button button-primary full"
                  disabled={
                    guardandoId !== null
                  }
                  onClick={
                    guardarMesaSeleccionada
                  }
                >
                  {guardandoId ===
                  mesaSeleccionadaId
                    ? 'Guardando...'
                    : 'Guardar ubicación'}
                </button>

                <small className="map-save-status">
                  Activa el modo de edición para
                  mover la mesa sobre el plano.
                  Después guarda su ubicación.
                </small>
              </>
            )}
        </aside>
      </div>
    </section>
  )
}

export default MesasPlanoSection