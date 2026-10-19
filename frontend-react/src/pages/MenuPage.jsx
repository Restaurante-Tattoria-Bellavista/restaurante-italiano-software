import { useEffect, useMemo, useState } from 'react'
import ProductDialog from '../components/ProductDialog'
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

function estaDisponible(producto) {
  if (typeof producto.activo === 'boolean') {
    return producto.activo
  }

  if (typeof producto.disponible === 'boolean') {
    return producto.disponible
  }

  return true
}

function formatearDinero(valor) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor || 0))
}

function MenuPage() {
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] =
    useState('TODOS')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)
  const [productoSeleccionado, setProductoSeleccionado] =
    useState(null)
  const [guardando, setGuardando] = useState(false)
  const [procesandoId, setProcesandoId] =
    useState(null)

  async function cargarProductos({
    mostrarCarga = true,
  } = {}) {
    try {
      if (mostrarCarga) {
        setCargando(true)
      }

      setError('')

      const respuesta = await api.getProductos()
      setProductos(normalizarLista(respuesta))
    } catch (err) {
      setError(
        err.message ||
          'No fue posible consultar los productos.',
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
        const respuesta = await api.getProductos()

        if (componenteActivo) {
          setProductos(normalizarLista(respuesta))
          setError('')
        }
      } catch (err) {
        if (componenteActivo) {
          setError(
            err.message ||
              'No fue posible consultar los productos.',
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

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    return productos.filter((producto) => {
      const disponible = estaDisponible(producto)

      const coincideBusqueda =
        !texto ||
        String(producto.nombre || '')
          .toLowerCase()
          .includes(texto) ||
        String(producto.descripcion || '')
          .toLowerCase()
          .includes(texto)

      const coincideEstado =
        filtroEstado === 'TODOS' ||
        (filtroEstado === 'DISPONIBLES' &&
          disponible) ||
        (filtroEstado === 'NO_DISPONIBLES' &&
          !disponible)

      return coincideBusqueda && coincideEstado
    })
  }, [busqueda, filtroEstado, productos])

  const productosDisponibles = productos.filter(
    estaDisponible,
  ).length

  const productosNoDisponibles =
    productos.length - productosDisponibles

  function abrirNuevoProducto() {
    setProductoSeleccionado(null)
    setMostrarFormulario(true)
  }

  function abrirEdicion(producto) {
    setProductoSeleccionado(producto)
    setMostrarFormulario(true)
  }

  function cerrarFormulario() {
    if (guardando) {
      return
    }

    setMostrarFormulario(false)
    setProductoSeleccionado(null)
  }

  async function guardarProducto(datos) {
    try {
      setGuardando(true)

      if (productoSeleccionado) {
        await api.updateProducto(
          productoSeleccionado.id,
          datos,
        )
      } else {
        await api.createProducto(datos)
      }

      setMostrarFormulario(false)
      setProductoSeleccionado(null)

      await cargarProductos({
        mostrarCarga: false,
      })
    } catch (err) {
      window.alert(
        `No fue posible guardar el producto: ${
          err.message || 'Error desconocido'
        }`,
      )
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarDisponibilidad(producto) {
    const disponible = estaDisponible(producto)
    const nuevoEstado = !disponible

    const accion = nuevoEstado
      ? 'activar'
      : 'desactivar'

    const confirmado = window.confirm(
      `¿Deseas ${accion} ${producto.nombre}?`,
    )

    if (!confirmado) {
      return
    }

    try {
      setProcesandoId(producto.id)

        await api.updateProducto(producto.id, {
        disponible: nuevoEstado,
        })

      await cargarProductos({
        mostrarCarga: false,
      })
    } catch (err) {
      window.alert(
        `No fue posible ${accion} el producto: ${
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
          Cargando productos...
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="product-stats">
        <article className="product-stat-card">
          <span>Total de productos</span>
          <strong>{productos.length}</strong>
          <small>Productos registrados</small>
        </article>

        <article className="product-stat-card available">
          <span>Disponibles</span>
          <strong>{productosDisponibles}</strong>
          <small>Visibles para los pedidos</small>
        </article>

        <article className="product-stat-card unavailable">
          <span>No disponibles</span>
          <strong>{productosNoDisponibles}</strong>
          <small>Retirados temporalmente</small>
        </article>
      </section>

      <section className="content-card products-card">
        <div className="section-toolbar">
          <div>
            <p className="eyebrow">MENÚ</p>
            <h2>Productos del restaurante</h2>

            <p>
              Administra la oferta disponible para los
              clientes.
            </p>
          </div>

          <button
            type="button"
            className="button button-primary"
            onClick={abrirNuevoProducto}
          >
            + Nuevo producto
          </button>
        </div>

        <div className="products-toolbar">
          <label className="search-control">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              placeholder="Buscar por nombre o descripción"
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
            />
          </label>

          <select
            className="filter-select"
            value={filtroEstado}
            aria-label="Filtrar por disponibilidad"
            onChange={(evento) =>
              setFiltroEstado(evento.target.value)
            }
          >
            <option value="TODOS">
              Todos los productos
            </option>

            <option value="DISPONIBLES">
              Disponibles
            </option>

            <option value="NO_DISPONIBLES">
              No disponibles
            </option>
          </select>

          <button
            type="button"
            className="button button-outline"
            onClick={() => cargarProductos()}
          >
            ↻ Actualizar
          </button>
        </div>

        {error ? (
          <div className="error-panel">
            <div>
              <strong>
                No fue posible cargar los productos
              </strong>

              <p>{error}</p>
            </div>

            <button
              type="button"
              className="button button-outline"
              onClick={() => cargarProductos()}
            >
              Intentar nuevamente
            </button>
          </div>
        ) : (
          <>
            <div className="products-result">
              <span>
                {productosFiltrados.length}{' '}
                {productosFiltrados.length === 1
                  ? 'producto'
                  : 'productos'}
              </span>
            </div>

            <div className="products-grid">
              {productosFiltrados.map((producto) => {
                const disponible =
                  estaDisponible(producto)

                const procesando =
                  procesandoId === producto.id

                return (
                  <article
                    className={[
                      'product-card',
                      !disponible
                        ? 'product-disabled'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={producto.id}
                  >
                    <div className="product-card-top">
                      <span
                        className={
                          disponible
                            ? 'status-badge active'
                            : 'status-badge inactive'
                        }
                      >
                        {disponible
                          ? 'Disponible'
                          : 'No disponible'}
                      </span>

                      <span className="product-number">
                        #{producto.id}
                      </span>
                    </div>

                    <div className="product-icon">
                      {producto.nombre
                        ?.trim()
                        .charAt(0)
                        .toUpperCase() || 'P'}
                    </div>

                    <div className="product-information">
                      <h3>{producto.nombre}</h3>

                      <p>
                        {producto.descripcion ||
                          'Sin descripción registrada.'}
                      </p>

                      <strong className="product-price">
                        {formatearDinero(
                          producto.precio,
                        )}
                      </strong>
                    </div>

                    <div className="product-actions">
                      <button
                        type="button"
                        className="action-button"
                        disabled={procesando}
                        onClick={() =>
                          abrirEdicion(producto)
                        }
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={
                          disponible
                            ? 'action-button danger'
                            : 'action-button success'
                        }
                        disabled={procesando}
                        onClick={() =>
                          cambiarDisponibilidad(producto)
                        }
                      >
                        {procesando
                          ? 'Procesando...'
                          : disponible
                            ? 'Desactivar'
                            : 'Activar'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            {productosFiltrados.length === 0 && (
              <div className="empty-state product-empty">
                {busqueda ||
                filtroEstado !== 'TODOS'
                  ? 'No se encontraron productos con los filtros seleccionados.'
                  : 'Todavía no existen productos registrados.'}
              </div>
            )}
          </>
        )}
      </section>

      {mostrarFormulario && (
        <ProductDialog
          producto={productoSeleccionado}
          cerrar={cerrarFormulario}
          guardarProducto={guardarProducto}
          guardando={guardando}
        />
      )}
    </>
  )
}

export default MenuPage