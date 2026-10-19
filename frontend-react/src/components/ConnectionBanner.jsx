function ConnectionBanner({
  conectado,
  verificando,
  reintentar,
}) {
  if (conectado || verificando) {
    return null
  }

  return (
    <section
      className="connection-banner"
      role="alert"
      aria-live="polite"
    >
      <div>
        <strong>
          No fue posible conectar con el backend
        </strong>

        <span>
          Algunas funciones permanecerán limitadas hasta
          restablecer la conexión.
        </span>
      </div>

      <button
        type="button"
        className="button button-light"
        onClick={reintentar}
      >
        Intentar nuevamente
      </button>
    </section>
  )
}

export default ConnectionBanner