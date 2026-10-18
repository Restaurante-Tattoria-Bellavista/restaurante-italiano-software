import { useState } from 'react'

const formularioInicial = {
  nombre: '',
  documento: '',
  telefono: '',
  email: '',
}

function ClientDialog({
  cliente,
  cerrar,
  guardarCliente,
  guardando,
}) {
const [formulario, setFormulario] = useState(() => ({
  ...formularioInicial,
  nombre: cliente?.nombre || '',
  documento: cliente?.documento || '',
  telefono: cliente?.telefono || '',
  email: cliente?.email || '',
}))


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

    if (!formulario.nombre.trim()) {
      nuevosErrores.nombre =
        'El nombre del cliente es obligatorio.'
    }

    if (!formulario.documento.trim()) {
      nuevosErrores.documento =
        'El documento es obligatorio.'
    }

    if (!formulario.telefono.trim()) {
      nuevosErrores.telefono =
        'El teléfono es obligatorio.'
    }

    if (
      formulario.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        formulario.email.trim(),
      )
    ) {
      nuevosErrores.email =
        'Ingresa un correo electrónico válido.'
    }

    setErrores(nuevosErrores)

    return Object.keys(nuevosErrores).length === 0
  }

  function enviarFormulario(evento) {
    evento.preventDefault()

    if (!validarFormulario()) {
      return
    }

    guardarCliente({
      nombre: formulario.nombre.trim(),
      documento: formulario.documento.trim(),
      telefono: formulario.telefono.trim(),
      email: formulario.email.trim() || null,
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
        aria-labelledby="client-dialog-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">CLIENTES</p>

            <h2 id="client-dialog-title">
              {cliente
                ? 'Editar cliente'
                : 'Registrar cliente'}
            </h2>

            <p>
              Completa la información solicitada.
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
            <label htmlFor="cliente-nombre">
              Nombre completo
              <span aria-hidden="true"> *</span>
            </label>

            <input
              id="cliente-nombre"
              name="nombre"
              type="text"
              value={formulario.nombre}
              onChange={actualizarCampo}
              disabled={guardando}
              autoComplete="name"
              maxLength="120"
              aria-invalid={Boolean(errores.nombre)}
            />

            {errores.nombre && (
              <small className="field-error">
                {errores.nombre}
              </small>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="cliente-documento">
              Documento
              <span aria-hidden="true"> *</span>
            </label>

            <input
              id="cliente-documento"
              name="documento"
              type="text"
              value={formulario.documento}
              onChange={actualizarCampo}
              disabled={guardando}
              inputMode="numeric"
              maxLength="30"
              aria-invalid={Boolean(
                errores.documento,
              )}
            />

            {errores.documento && (
              <small className="field-error">
                {errores.documento}
              </small>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="cliente-telefono">
              Teléfono
              <span aria-hidden="true"> *</span>
            </label>

            <input
              id="cliente-telefono"
              name="telefono"
              type="tel"
              value={formulario.telefono}
              onChange={actualizarCampo}
              disabled={guardando}
              autoComplete="tel"
              maxLength="30"
              aria-invalid={Boolean(
                errores.telefono,
              )}
            />

            {errores.telefono && (
              <small className="field-error">
                {errores.telefono}
              </small>
            )}
          </div>

          <div className="form-field form-field-full">
            <label htmlFor="cliente-email">
              Correo electrónico
            </label>

            <input
              id="cliente-email"
              name="email"
              type="email"
              value={formulario.email}
              onChange={actualizarCampo}
              disabled={guardando}
              autoComplete="email"
              maxLength="150"
              aria-invalid={Boolean(errores.email)}
            />

            {errores.email && (
              <small className="field-error">
                {errores.email}
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
                : cliente
                  ? 'Guardar cambios'
                  : 'Registrar cliente'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ClientDialog
