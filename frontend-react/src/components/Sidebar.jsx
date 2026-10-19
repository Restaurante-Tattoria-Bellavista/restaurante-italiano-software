const opcionesNavegacion = [
  {
    id: 'mesas',
    nombre: 'Mesas',
    icono: '▦',
  },
  {
    id: 'pedidos',
    nombre: 'Pedidos',
    icono: '◫',
  },
  {
    id: 'reservas',
    nombre: 'Reservas',
    icono: '◷',
  },
  {
    id: 'productos',
    nombre: 'Productos',
    icono: '◇',
  },
  {
    id: 'clientes',
    nombre: 'Clientes',
    icono: '♙',
  },
  {
    id: 'cocina',
    nombre: 'Cocina',
    icono: '♨',
  },
  {
    id: 'reportes',
    nombre: 'Reportes',
    icono: '▥',
  },
  {
    id: 'configuracion',
    nombre: 'Configuración',
    icono: '⚙',
  },
]

function Sidebar({
  vistaActual,
  cambiarVista,
  abierto,
  cerrar,
  conectado,
}) {
  function seleccionarVista(vista) {
    cambiarVista(vista)
    cerrar()
  }

  return (
    <>
      <button
        type="button"
        className={`sidebar-overlay ${
          abierto ? 'visible' : ''
        }`}
        aria-label="Cerrar menú"
        onClick={cerrar}
      />

      <aside
        className={`sidebar ${
          abierto ? 'sidebar-open' : ''
        }`}
      >
        <div className="brand">
          <div className="brand-mark">TB</div>

          <div>
            <strong>Trattoria</strong>
            <span>Bellavista</span>
          </div>
        </div>

        <nav
          className="main-navigation"
          aria-label="Navegación principal"
        >
          {opcionesNavegacion.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              className={`nav-item ${
                vistaActual === opcion.id
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                seleccionarVista(opcion.id)
              }
            >
              <span
                className="nav-icon"
                aria-hidden="true"
              >
                {opcion.icono}
              </span>

              <span>{opcion.nombre}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span
            className={`connection-dot ${
              conectado ? 'online' : 'offline'
            }`}
          />

          <div>
            <strong>
              {conectado
                ? 'Sistema conectado'
                : 'Sin conexión'}
            </strong>

            <span>
              {conectado
                ? 'Backend disponible'
                : 'Revisa el servidor'}
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar