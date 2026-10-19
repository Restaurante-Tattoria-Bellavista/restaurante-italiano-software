import { useState } from 'react'

const estadosMesa = [
  {
    valor: 'LIBRE',
    etiqueta: 'Libre',
  },
  {
    valor: 'RESERVADA',
    etiqueta: 'Reservada',
  },
  {
    valor: 'OCUPADA',
    etiqueta: 'Ocupada',
  },
  {
    valor: 'FUERA_DE_SERVICIO',
    etiqueta: 'Fuera de servicio',
  },
]

function MesaDialog({
  mesa,
  cerrar,
  guardarMesa,
  guardando,
}) {
  const [formulario, setFormulario] = useState(() => ({
    numero:
      mesa?.numero !== undefined
        ? String(mesa.numero)
        : '',
    capacidad:
      mesa?.capacidad !== undefined
        ? String(mesa.capacidad)
        : '',
    ubicacion: mesa?.ubicacion || '',
    estado: mesa?.estado || 'LIBRE',
    activo: mesa?.activo ?? true,
  }))

  const [errores, setErrores] = useState({})

  function actualizarCampo(evento) {
    const {
      name,
      value,
      type,
      checked,
    } = evento.target

    setFormulario((datosActuales) => ({
      ...datosActuales,
      [name]: type === 'checkbox' ? checked : value,
    }))

    setErrores((erroresActuales) => ({
      ...erroresActuales,
      [name]: '',
    }))
  }

  function validarFormulario() {
    const nuevosErrores = {}
    const numero = Number(formulario.numero)
    const capacidad = Number(formulario.capacidad)

    if (!formulario.numero.trim()) {
      nuevosErrores.numero =
        'El número de la mesa es obligatorio.'
    } else if (
      !Number.isInteger(numero) ||
      numero < 1
    ) {
      nuevosErrores.numero =
        'El número debe ser un entero mayor que cero.'
    }

    if (!formulario.capacidad.trim()) {
      nuevosErrores.capacidad =
        'La capacidad es obligatoria.'
    } else if (
      !Number.isInteger(capacidad) ||
      capacidad < 1
    ) {
      nuevosErrores.capacidad =
        'La capacidad debe ser un entero mayor que cero.'
    }

    if (formulario.ubicacion.trim().length > 100) {
      nuevosErrores.ubicacion =
        'La ubicación no puede superar 100 caracteres.'
    }

    if (
      !estadosMesa.some(
        (estado) => estado.valor === formulario.estado,
      )
    ) {
      nuevosErrores.estado =
        'Selecciona un estado válido.'
    }

    setErrores(nuevosErrores)

    return Object.keys(nuevosErrores).length === 0
  }

  function enviarFormulario(evento) {
    evento.preventDefault()

    if (!validarFormulario()) {
      return
    }

    guardarMesa({
      numero: Number(formulario.numero),
      capacidad: Number(formulario.capacidad),
      ubicacion:
        formulario.ubicacion.trim() || null,
      estado: formulario.estado,
      activo: formulario.activo,
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
        aria-labelledby="mesa-dialog-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">
              ADMINISTRACIÓN DE MESAS
            </p>

            <h2 id="mesa-dialog-title">
              {mesa
                ? 'Editar mesa'
                : 'Registrar mesa'}
            </h2>

            <p>
              Completa la información de la mesa.
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
          <div className="form-field">
            <label htmlFor="mesa-numero">
              Número
              <span aria-hidden="true"> *</span>
            </label>

            <input
              id="mesa-numero"
              name="numero"
              type="number"
              value={formulario.numero}
              onChange={actualizarCampo}
              disabled={guardando}
              min="1"
              step="1"
              inputMode="numeric"
              autoFocus
              aria-invalid={Boolean(errores.numero)}
            />

            {errores.numero && (
              <small className="field-error">
                {errores.numero}
              </small>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="mesa-capacidad">
              Capacidad
              <span aria-hidden="true"> *</span>
            </label>

            <input
              id="mesa-capacidad"
              name="capacidad"
              type="number"
              value={formulario.capacidad}
              onChange={actualizarCampo}
              disabled={guardando}
              min="1"
              step="1"
              inputMode="numeric"
              aria-invalid={Boolean(
                errores.capacidad,
              )}
            />

            {errores.capacidad && (
              <small className="field-error">
                {errores.capacidad}
              </small>
            )}
          </div>

          <div className="form-field form-field-full">
            <label htmlFor="mesa-ubicacion">
              Ubicación
            </label>

            <input
              id="mesa-ubicacion"
              name="ubicacion"
              type="text"
              value={formulario.ubicacion}
              onChange={actualizarCampo}
              disabled={guardando}
              maxLength="100"
              placeholder="Ejemplo: Terraza, salón principal"
              aria-invalid={Boolean(
                errores.ubicacion,
              )}
            />

            <div className="field-footer">
              {errores.ubicacion ? (
                <small className="field-error">
                  {errores.ubicacion}
                </small>
              ) : (
                <small>
                  Este campo es opcional.
                </small>
              )}

              <small>
                {formulario.ubicacion.length}/100
              </small>
            </div>
          </div>

          <div className="form-field form-field-full">
            <label htmlFor="mesa-estado">
              Estado
              <span aria-hidden="true"> *</span>
            </label>

            <select
              id="mesa-estado"
              name="estado"
              value={formulario.estado}
              onChange={actualizarCampo}
              disabled={guardando}
              aria-invalid={Boolean(errores.estado)}
            >
              {estadosMesa.map((estado) => (
                <option
                  key={estado.valor}
                  value={estado.valor}
                >
                  {estado.etiqueta}
                </option>
              ))}
            </select>

            {errores.estado && (
              <small className="field-error">
                {errores.estado}
              </small>
            )}
          </div>

          <label className="form-switch form-field-full">
            <input
              name="activo"
              type="checkbox"
              checked={formulario.activo}
              onChange={actualizarCampo}
              disabled={guardando}
            />

            <span>
              <strong>Mesa habilitada</strong>

              <small>
                Las mesas deshabilitadas no estarán
                disponibles para la operación.
              </small>
            </span>
          </label>

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
                : mesa
                  ? 'Guardar cambios'
                  : 'Registrar mesa'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default MesaDialog