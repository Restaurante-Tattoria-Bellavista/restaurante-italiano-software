function ModulePage({
  etiqueta,
  titulo,
  descripcion,
  icono,
}) {
  return (
    <section className="module-page">
      <article className="welcome-card">
        <div className="welcome-content">
          <p className="eyebrow">{etiqueta}</p>

          <h2>{titulo}</h2>

          <p>{descripcion}</p>

          <span className="development-badge">
            Módulo preparado para su desarrollo
          </span>
        </div>

        <div
          className="welcome-icon"
          aria-hidden="true"
        >
          {icono}
        </div>
      </article>

      <section className="summary-grid">
        <article className="summary-card">
          <span>Estado</span>
          <strong>Disponible</strong>
          <small>
            Accesible desde el menú principal
          </small>
        </article>

        <article className="summary-card">
          <span>Estructura</span>
          <strong>Reutilizable</strong>
          <small>
            Preparada para integrar funcionalidades
          </small>
        </article>

        <article className="summary-card">
          <span>Interfaz</span>
          <strong>Adaptable</strong>
          <small>
            Compatible con diferentes pantallas
          </small>
        </article>
      </section>
    </section>
  )
}

export default ModulePage