import { useState } from 'react'

function ProductDialog({
  producto,
  cerrar,
  guardarProducto,
  guardando,
}) {
  const [formulario, setFormulario] = useState(() => ({
    nombre: producto?.nombre || '',
    descripcion: producto?.descripcion || '',
    precio:
      producto?.precio !== undefined
        ? String(producto.precio)
        : '',
  }))

  const [errores, setErrores] = useState({})

  function actualizarCampo(evento) {
    const { name, value } = evento.target

    setFormulario((datosActuales) => ({
      ...datosActuales,
      [name]: value,
    }))

    setErrores((erroresActuales) => ({
      ...erroresActuales,
      [name]: '',
    }))
  }

  function validarFormulario() {
    const nuevosErrores = {}
    const precio = Number(formulario.precio)

    if (!formulario.nombre.trim()) {
      nuevosErrores.nombre =
        'El nombre del producto es obligatorio.'
    }

    if (!formulario.descripcion.trim()) {
      nuevosErrores.descripcion =
        'La descripción es obligatoria.'
    }

    if (!formulario.precio.trim()) {
      nuevosErrores.precio =
        'El precio es obligatorio.'
    } else if (
      !Number.isFinite(precio) ||
      precio <= 0
    ) {
      nuevosErrores.precio =
        'El precio debe ser mayor que cero.'
    }

    setErrores(nuevosErrores)

    return Object.keys(nuevosErrores).length === 0
  }

  function enviarFormulario(evento) {
    evento.preventDefault()

    if (!validarFormulario()) {
      return
    }

    guardarProducto({
      nombre: formulario.nombre.trim(),
      descripcion: formulario.descripcion.trim(),
      precio: Number(formulario.precio),
    })
  }

  function manejarFondo(evento) {
    if (
      evento.target === evento.currentTarget &&
      !guardando
    ) {
      cerrar()
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={manejarFondo}
    >
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-dialog-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">MENÚ</p>

            <h2 id="product-dialog-title">
              {producto
                ? 'Editar producto'
                : 'Registrar producto'}
            </h2>

            <p>
              Completa la información del producto.
            </p>
          </div>

          <button
            type="button"
            className="dialog-close"
            aria-label="Cerrar formulario"
            disabled={guardando}
            onClick={cerrar}
          >
            ×
          </button>
        </div>

        <form
          className="dialog-form"
          onSubmit={enviarFormulario}
          noValidate
        >
          <div className="form-field form-field-full">
            <label htmlFor="producto-nombre">
              Nombre
              <span aria-hidden="true"> *</span>
            </label>

            <input
              id="producto-nombre"
              name="nombre"
              type="text"
              value={formulario.nombre}
              onChange={actualizarCampo}
              disabled={guardando}
              maxLength="120"
              autoFocus
              aria-invalid={Boolean(errores.nombre)}
            />

            {errores.nombre && (
              <small className="field-error">
                {errores.nombre}
              </small>
            )}
          </div>

          <div className="form-field form-field-full">
            <label htmlFor="producto-descripcion">
              Descripción
              <span aria-hidden="true"> *</span>
            </label>

            <textarea
              id="producto-descripcion"
              name="descripcion"
              value={formulario.descripcion}
              onChange={actualizarCampo}
              disabled={guardando}
              rows="4"
              maxLength="500"
              aria-invalid={Boolean(
                errores.descripcion,
              )}
            />

            <div className="field-footer">
              {errores.descripcion ? (
                <small className="field-error">
                  {errores.descripcion}
                </small>
              ) : (
                <small>
                  Describe brevemente el producto.
                </small>
              )}

              <small>
                {formulario.descripcion.length}/500
              </small>
            </div>
          </div>

          <div className="form-field form-field-full">
            <label htmlFor="producto-precio">
              Precio
              <span aria-hidden="true"> *</span>
            </label>

            <div className="money-input">
              <span>$</span>

              <input
                id="producto-precio"
                name="precio"
                type="number"
                value={formulario.precio}
                onChange={actualizarCampo}
                disabled={guardando}
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="0"
                aria-invalid={Boolean(errores.precio)}
              />

              <span>COP</span>
            </div>

            {errores.precio && (
              <small className="field-error">
                {errores.precio}
              </small>
            )}
          </div>

          <p className="required-note">
            Los campos marcados con * son obligatorios.
          </p>

          <div className="dialog-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={guardando}
              onClick={cerrar}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="button button-primary"
              disabled={guardando}
            >
              {guardando
                ? 'Guardando...'
                : producto
                  ? 'Guardar cambios'
                  : 'Registrar producto'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ProductDialog