import { useEffect, useMemo, useState } from 'react'
import MesaDialog from '../components/MesaDialog'
import { api } from '../services/api'

const nombresEstados = {
  LIBRE: 'Libre',
  RESERVADA: 'Reservada',
  OCUPADA: 'Ocupada',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
}

const filtrosEstado = [
  {
    valor: 'TODOS',
    etiqueta: 'Todos los estados',
  },
  {
    valor: 'LIBRE',
    etiqueta: 'Libres',
  },
  {
    valor: 'RESERVADA',
    etiqueta: 'Reservadas',
  },
  {
    valor: 'OCUPADA',
    etiqueta: 'Ocupadas',
  },
  {
    valor: 'FUERA_DE_SERVICIO',
    etiqueta: 'Fuera de servicio',
  },
]

function ordenarMesas(lista) {
  return [...lista].sort(
    (mesaA, mesaB) =>
      Number(mesaA.numero) - Number(mesaB.numero),
  )
}

function MesasPage() {
  const [mesas, setMesas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] =
    useState('TODOS')
  const [filtroActividad, setFiltroActividad] =
    useState('ACTIVAS')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)
  const [mesaSeleccionada, setMesaSeleccionada] =
    useState(null)
  const [guardando, setGuardando] = useState(false)
  const [actualizandoId, setActualizandoId] =
    useState(null)

  async function cargarMesas() {
    try {
      setCargando(true)
      setError('')

      const respuesta = await api.getMesas()

      setMesas(
        ordenarMesas(
          Array.isArray(respuesta) ? respuesta : [],
        ),
      )
    } catch (err) {
      setError(
        err.message ||
          'No fue posible consultar las mesas.',
      )
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      cargarMesas()
    }, 0)

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [])
  
  function abrirCreacion() {
    setMesaSeleccionada(null)
    setMostrarFormulario(true)
  }

  function abrirEdicion(mesa) {
    setMesaSeleccionada(mesa)
    setMostrarFormulario(true)
  }

  function cerrarFormulario() {
    if (guardando) {
      return
    }

    setMostrarFormulario(false)
    setMesaSeleccionada(null)
  }

  async function guardarMesa(datos) {
    try {
      setGuardando(true)
      setError('')

      let mesaGuardada

      if (mesaSeleccionada) {
        mesaGuardada = await api.updateMesa(
          mesaSeleccionada.id,
          datos,
        )
      } else {
        mesaGuardada = await api.createMesa(datos)
      }

      setMesas((mesasActuales) => {
        const existe = mesasActuales.some(
          (mesa) => mesa.id === mesaGuardada.id,
        )

        const nuevaLista = existe
          ? mesasActuales.map((mesa) =>
              mesa.id === mesaGuardada.id
                ? mesaGuardada
                : mesa,
            )
          : [...mesasActuales, mesaGuardada]

        return ordenarMesas(nuevaLista)
      })

      cerrarFormulario()
    } catch (err) {
      window.alert(
        `No fue posible guardar la mesa: ${
          err.message || 'Error desconocido'
        }`,
      )
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarActividad(mesa) {
    const nuevoEstado = !mesa.activo
    const accion = nuevoEstado
      ? 'reactivar'
      : 'desactivar'

    const confirmado = window.confirm(
      `¿Deseas ${accion} la mesa ${mesa.numero}?`,
    )

    if (!confirmado) {
      return
    }

    try {
      setActualizandoId(mesa.id)
      setError('')

      const mesaActualizada = await api.updateMesa(
        mesa.id,
        {
          activo: nuevoEstado,
        },
      )

      setMesas((mesasActuales) =>
        ordenarMesas(
          mesasActuales.map((item) =>
            item.id === mesaActualizada.id
              ? mesaActualizada
              : item,
          ),
        ),
      )
    } catch (err) {
      window.alert(
        `No fue posible ${accion} la mesa: ${
          err.message || 'Error desconocido'
        }`,
      )
    } finally {
      setActualizandoId(null)
    }
  }

  const resumen = useMemo(
    () => ({
      total: mesas.length,
      libres: mesas.filter(
        (mesa) => mesa.activo && mesa.estado === 'LIBRE',
      ).length,
      reservadas: mesas.filter(
        (mesa) =>
          mesa.activo && mesa.estado === 'RESERVADA',
      ).length,
      ocupadas: mesas.filter(
        (mesa) =>
          mesa.activo && mesa.estado === 'OCUPADA',
      ).length,
    }),
    [mesas],
  )

  const mesasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    return mesas.filter((mesa) => {
      const coincideBusqueda =
        !texto ||
        String(mesa.numero).includes(texto) ||
        String(mesa.ubicacion || '')
          .toLowerCase()
          .includes(texto)

      const coincideEstado =
        filtroEstado === 'TODOS' ||
        mesa.estado === filtroEstado

      const coincideActividad =
        filtroActividad === 'TODAS' ||
        (filtroActividad === 'ACTIVAS' &&
          mesa.activo) ||
        (filtroActividad === 'INACTIVAS' &&
          !mesa.activo)

      return (
        coincideBusqueda &&
        coincideEstado &&
        coincideActividad
      )
    })
  }, [
    mesas,
    busqueda,
    filtroEstado,
    filtroActividad,
  ])

  if (cargando) {
    return (
      <div className="empty-state">
        Cargando mesas...
      </div>
    )
  }

  if (error && mesas.length === 0) {
    return (
      <div className="empty-state">
        <p>
          No fue posible consultar las mesas: {error}
        </p>

        <button
          type="button"
          className="button button-primary"
          onClick={cargarMesas}
        >
          Intentar nuevamente
        </button>
      </div>
    )
  }

  return (
    <>
      <section className="table-metrics">
        <article className="table-metric">
          <span>Total de mesas</span>
          <strong>{resumen.total}</strong>
          <small>Mesas registradas</small>
        </article>

        <article className="table-metric table-metric-free">
          <span>Libres</span>
          <strong>{resumen.libres}</strong>
          <small>Disponibles para atención</small>
        </article>

        <article className="table-metric table-metric-reserved">
          <span>Reservadas</span>
          <strong>{resumen.reservadas}</strong>
          <small>Con reserva asignada</small>
        </article>

        <article className="table-metric table-metric-occupied">
          <span>Ocupadas</span>
          <strong>{resumen.ocupadas}</strong>
          <small>Actualmente en servicio</small>
        </article>
      </section>

      <section className="content-card">
        <div className="section-toolbar">
          <div>
            <p className="eyebrow">
              ORGANIZACIÓN DEL RESTAURANTE
            </p>

            <h2>Mesas registradas</h2>

            <p>
              Consulta la capacidad, ubicación,
              disponibilidad y estado de cada mesa.
            </p>
          </div>

          <div className="section-toolbar-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={cargarMesas}
            >
              Actualizar
            </button>

            <button
              type="button"
              className="button button-primary"
              onClick={abrirCreacion}
            >
              + Nueva mesa
            </button>
          </div>
        </div>

        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}

        <div className="table-filters">
          <label className="search-control">
            <span className="sr-only">
              Buscar mesa
            </span>

            <input
              type="search"
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              placeholder="Buscar por número o ubicación..."
            />
          </label>

          <label className="filter-control">
            <span className="sr-only">
              Filtrar por estado
            </span>

            <select
              value={filtroEstado}
              onChange={(evento) =>
                setFiltroEstado(evento.target.value)
              }
            >
              {filtrosEstado.map((filtro) => (
                <option
                  key={filtro.valor}
                  value={filtro.valor}
                >
                  {filtro.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span className="sr-only">
              Filtrar por actividad
            </span>

            <select
              value={filtroActividad}
              onChange={(evento) =>
                setFiltroActividad(evento.target.value)
              }
            >
              <option value="TODAS">
                Todas
              </option>

              <option value="ACTIVAS">
                Habilitadas
              </option>

              <option value="INACTIVAS">
                Deshabilitadas
              </option>
            </select>
          </label>
        </div>

        {mesasFiltradas.length > 0 ? (
          <div className="tables-grid">
            {mesasFiltradas.map((mesa) => {
              const actualizando =
                actualizandoId === mesa.id

              return (
                <article
                  className={`table-card ${
                    !mesa.activo
                      ? 'table-card-inactive'
                      : ''
                  }`}
                  key={mesa.id}
                >
                  <div className="table-card-header">
                    <div className="table-number">
                      {mesa.numero}
                    </div>

                    <span
                      className={`table-status table-status-${mesa.estado.toLowerCase()}`}
                    >
                      {nombresEstados[mesa.estado] ||
                        mesa.estado}
                    </span>
                  </div>

                  <div className="table-card-body">
                    <h3>Mesa {mesa.numero}</h3>

                    <dl className="table-details">
                      <div>
                        <dt>Capacidad</dt>
                        <dd>
                          {mesa.capacidad}{' '}
                          {Number(mesa.capacidad) === 1
                            ? 'persona'
                            : 'personas'}
                        </dd>
                      </div>

                      <div>
                        <dt>Ubicación</dt>
                        <dd>
                          {mesa.ubicacion ||
                            'Sin ubicación definida'}
                        </dd>
                      </div>

                      <div>
                        <dt>Disponibilidad</dt>
                        <dd>
                          {mesa.activo
                            ? 'Habilitada'
                            : 'Deshabilitada'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="table-card-actions">
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={actualizando}
                      onClick={() => abrirEdicion(mesa)}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className={
                        mesa.activo
                          ? 'button button-danger-outline'
                          : 'button button-primary'
                      }
                      disabled={actualizando}
                      onClick={() =>
                        cambiarActividad(mesa)
                      }
                    >
                      {actualizando
                        ? 'Actualizando...'
                        : mesa.activo
                          ? 'Desactivar'
                          : 'Reactivar'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No se encontraron mesas</strong>

            <p>
              Ajusta los filtros o registra una nueva
              mesa.
            </p>
          </div>
        )}
      </section>

      {mostrarFormulario && (
        <MesaDialog
          mesa={mesaSeleccionada}
          cerrar={cerrarFormulario}
          guardarMesa={guardarMesa}
          guardando={guardando}
        />
      )}
    </>
  )
}

export default MesasPage