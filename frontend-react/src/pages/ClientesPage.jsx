import { useEffect, useMemo, useState } from 'react'
import ClientDialog from '../components/ClientDialog'
import { api } from '../services/api'

function normalizarLista(respuesta) {
  if (Array.isArray(respuesta)) {
    return respuesta
  }

  if (Array.isArray(respuesta?.value)) {
    return respuesta.value
  }

  if (Array.isArray(respuesta?.items)) {
    return respuesta.items
  }

  return []
}

function obtenerIniciales(nombre) {
  return String(nombre || 'Cliente')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
}

function ClientesPage() {
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState(null)
  const [guardando, setGuardando] = useState(false)
  const [procesandoId, setProcesandoId] =
    useState(null)

  async function cargarClientes({
    mostrarCarga = true,
  } = {}) {
    try {
      if (mostrarCarga) {
        setCargando(true)
      }

      setError('')

      const respuesta = await api.getClientes()
      setClientes(normalizarLista(respuesta))
    } catch (err) {
      setError(
        err.message ||
          'No fue posible consultar los clientes.',
      )
    } finally {
      if (mostrarCarga) {
        setCargando(false)
      }
    }
  }

  useEffect(() => {
    let componenteActivo = true

    async function cargarDatosIniciales() {
      try {
        const respuesta = await api.getClientes()

        if (componenteActivo) {
          setClientes(normalizarLista(respuesta))
          setError('')
        }
      } catch (err) {
        if (componenteActivo) {
          setError(
            err.message ||
              'No fue posible consultar los clientes.',
          )
        }
      } finally {
        if (componenteActivo) {
          setCargando(false)
        }
      }
    }

    cargarDatosIniciales()

    return () => {
      componenteActivo = false
    }
  }, [])

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    if (!texto) {
      return clientes
    }

    return clientes.filter((cliente) =>
      [
        cliente.nombre,
        cliente.documento,
        cliente.telefono,
        cliente.email,
      ].some((valor) =>
        String(valor || '')
          .toLowerCase()
          .includes(texto),
      ),
    )
  }, [busqueda, clientes])

  const clientesActivos = clientes.filter(
    (cliente) => cliente.activo !== false,
  ).length

  const clientesInactivos =
    clientes.length - clientesActivos

  function abrirNuevoCliente() {
    setClienteSeleccionado(null)
    setMostrarFormulario(true)
  }

  function abrirEdicion(cliente) {
    setClienteSeleccionado(cliente)
    setMostrarFormulario(true)
  }

  function cerrarFormulario() {
    if (guardando) {
      return
    }

    setMostrarFormulario(false)
    setClienteSeleccionado(null)
  }

  async function guardarCliente(datos) {
    try {
      setGuardando(true)

      if (clienteSeleccionado) {
        await api.updateCliente(
          clienteSeleccionado.id,
          datos,
        )
      } else {
        await api.createCliente(datos)
      }

      setMostrarFormulario(false)
      setClienteSeleccionado(null)
      await cargarClientes({ mostrarCarga: false })
    } catch (err) {
      window.alert(
        `No fue posible guardar el cliente: ${
          err.message || 'Error desconocido'
        }`,
      )
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(cliente) {
    const nuevoEstado = cliente.activo === false

    const accion = nuevoEstado
      ? 'reactivar'
      : 'desactivar'

    const confirmado = window.confirm(
      `¿Deseas ${accion} a ${cliente.nombre}?`,
    )

    if (!confirmado) {
      return
    }

    try {
      setProcesandoId(cliente.id)

      await api.updateCliente(cliente.id, {
        activo: nuevoEstado,
      })

      await cargarClientes({ mostrarCarga: false })
    } catch (err) {
      window.alert(
        `No fue posible ${accion} el cliente: ${
          err.message || 'Error desconocido'
        }`,
      )
    } finally {
      setProcesandoId(null)
    }
  }

  if (cargando) {
    return (
      <section className="content-card">
        <div className="empty-state">
          Cargando clientes...
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="client-stats">
        <article className="client-stat-card">
          <span>Total de clientes</span>
          <strong>{clientes.length}</strong>
          <small>Registros disponibles</small>
        </article>

        <article className="client-stat-card active">
          <span>Clientes activos</span>
          <strong>{clientesActivos}</strong>
          <small>Disponibles para atención</small>
        </article>

        <article className="client-stat-card inactive">
          <span>Clientes inactivos</span>
          <strong>{clientesInactivos}</strong>
          <small>Registros desactivados</small>
        </article>
      </section>

      <section className="content-card clients-card">
        <div className="section-toolbar">
          <div>
            <p className="eyebrow">DIRECTORIO</p>
            <h2>Clientes registrados</h2>
            <p>
              Consulta, registra y administra la
              información de los clientes.
            </p>
          </div>

          <button
            type="button"
            className="button button-primary"
            onClick={abrirNuevoCliente}
          >
            + Nuevo cliente
          </button>
        </div>

        <div className="clients-toolbar">
          <label className="search-control">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              placeholder="Buscar por nombre, documento, teléfono o correo"
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
            />
          </label>

          <button
            type="button"
            className="button button-outline"
            onClick={() => cargarClientes()}
          >
            ↻ Actualizar
          </button>
        </div>

        {error ? (
          <div className="error-panel">
            <div>
              <strong>
                No fue posible cargar los clientes
              </strong>
              <p>{error}</p>
            </div>

            <button
              type="button"
              className="button button-outline"
              onClick={() => cargarClientes()}
            >
              Intentar nuevamente
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {clientesFiltrados.map((cliente) => {
                  const activo =
                    cliente.activo !== false

                  const procesando =
                    procesandoId === cliente.id

                  return (
                    <tr key={cliente.id}>
                      <td>
                        <div className="client-identity">
                          <span className="client-avatar">
                            {obtenerIniciales(
                              cliente.nombre,
                            )}
                          </span>

                          <div>
                            <strong>
                              {cliente.nombre}
                            </strong>
                            <small>
                              Cliente #{cliente.id}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        {cliente.documento || '—'}
                      </td>

                      <td>
                        <div className="client-contact">
                          <span>
                            {cliente.telefono || '—'}
                          </span>
                          <small>
                            {cliente.email ||
                              'Sin correo registrado'}
                          </small>
                        </div>
                      </td>

                      <td>
                        <span
                          className={
                            activo
                              ? 'status-badge active'
                              : 'status-badge inactive'
                          }
                        >
                          {activo
                            ? 'Activo'
                            : 'Inactivo'}
                        </span>
                      </td>

                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="action-button"
                            disabled={procesando}
                            onClick={() =>
                              abrirEdicion(cliente)
                            }
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className={
                              activo
                                ? 'action-button danger'
                                : 'action-button success'
                            }
                            disabled={procesando}
                            onClick={() =>
                              cambiarEstado(cliente)
                            }
                          >
                            {procesando
                              ? 'Procesando...'
                              : activo
                                ? 'Desactivar'
                                : 'Reactivar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {clientesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      <div className="empty-state">
                        {busqueda
                          ? 'No se encontraron clientes con esa búsqueda.'
                          : 'Todavía no existen clientes registrados.'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mostrarFormulario && (
        <ClientDialog
          cliente={clienteSeleccionado}
          cerrar={cerrarFormulario}
          guardarCliente={guardarCliente}
          guardando={guardando}
        />
      )}
    </>
  )
}

export default ClientesPage