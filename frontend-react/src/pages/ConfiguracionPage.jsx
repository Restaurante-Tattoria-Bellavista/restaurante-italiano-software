import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import { api } from '../services/api'

const FORMULARIO_INICIAL = {
  nombre: 'Trattoria Bellavista',
  nit: '',
  telefono: '',
  correo: '',
  direccion: '',
  ciudad: '',
  moneda: 'COP',
  zona_horaria: 'America/Bogota',
  porcentaje_servicio: 10,
}

function normalizarConfiguracion(datos = {}) {
  return {
    nombre:
      datos.nombre ||
      FORMULARIO_INICIAL.nombre,
    nit:
      datos.nit ||
      FORMULARIO_INICIAL.nit,
    telefono:
      datos.telefono ||
      FORMULARIO_INICIAL.telefono,
    correo:
      datos.correo ||
      FORMULARIO_INICIAL.correo,
    direccion:
      datos.direccion ||
      FORMULARIO_INICIAL.direccion,
    ciudad:
      datos.ciudad ||
      FORMULARIO_INICIAL.ciudad,
    moneda:
      datos.moneda ||
      FORMULARIO_INICIAL.moneda,
    zona_horaria:
      datos.zona_horaria ||
      FORMULARIO_INICIAL.zona_horaria,
    porcentaje_servicio: Number(
      datos.porcentaje_servicio ??
        FORMULARIO_INICIAL.porcentaje_servicio,
    ),
  }
}

function ConfiguracionPage() {
  const [formulario, setFormulario] = useState(
    FORMULARIO_INICIAL,
  )
  const [errores, setErrores] = useState({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] =
    useState(false)
  const [errorConsulta, setErrorConsulta] =
    useState('')
  const [mensaje, setMensaje] = useState('')

  const cargarConfiguracion =
    useCallback(async () => {
      try {
        setCargando(true)
        setErrorConsulta('')
        setMensaje('')

        const datos =
          await api.getConfiguracionRestaurante()

        setFormulario(
          normalizarConfiguracion(datos),
        )
      } catch (err) {
        setErrorConsulta(
          err.message ||
            'No fue posible consultar la configuración.',
        )
      } finally {
        setCargando(false)
      }
    }, [])

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => {
        cargarConfiguracion()
      },
      0,
    )

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [cargarConfiguracion])

  function actualizarCampo(evento) {
    const { name, value } = evento.target

    setFormulario((datosActuales) => ({
      ...datosActuales,
      [name]:
        name === 'porcentaje_servicio'
          ? value
          : value,
    }))

    setErrores((erroresActuales) => ({
      ...erroresActuales,
      [name]: '',
    }))

    setMensaje('')
  }

  function validarFormulario() {
    const nuevosErrores = {}
    const porcentaje = Number(
      formulario.porcentaje_servicio,
    )

    if (!formulario.nombre.trim()) {
      nuevosErrores.nombre =
        'El nombre del restaurante es obligatorio.'
    }

    if (!formulario.telefono.trim()) {
      nuevosErrores.telefono =
        'El teléfono es obligatorio.'
    }

    if (!formulario.correo.trim()) {
      nuevosErrores.correo =
        'El correo electrónico es obligatorio.'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        formulario.correo,
      )
    ) {
      nuevosErrores.correo =
        'Ingresa un correo electrónico válido.'
    }

    if (!formulario.direccion.trim()) {
      nuevosErrores.direccion =
        'La dirección es obligatoria.'
    }

    if (!formulario.ciudad.trim()) {
      nuevosErrores.ciudad =
        'La ciudad es obligatoria.'
    }

    if (
      !Number.isFinite(porcentaje) ||
      porcentaje < 0 ||
      porcentaje > 100
    ) {
      nuevosErrores.porcentaje_servicio =
        'El porcentaje debe estar entre 0 y 100.'
    }

    setErrores(nuevosErrores)

    return Object.keys(nuevosErrores).length === 0
  }

  async function guardarConfiguracion(evento) {
    evento.preventDefault()

    if (!validarFormulario()) {
      return
    }

    try {
      setGuardando(true)
      setErrorConsulta('')
      setMensaje('')

      const datos = {
        nombre: formulario.nombre.trim(),
        nit: formulario.nit.trim() || null,
        telefono: formulario.telefono.trim(),
        correo: formulario.correo
          .trim()
          .toLowerCase(),
        direccion: formulario.direccion.trim(),
        ciudad: formulario.ciudad.trim(),
        moneda: formulario.moneda,
        zona_horaria:
          formulario.zona_horaria,
        porcentaje_servicio: Number(
          formulario.porcentaje_servicio,
        ),
      }

      const actualizada =
        await api.updateConfiguracionRestaurante(
          datos,
        )

      setFormulario(
        normalizarConfiguracion(
          actualizada || datos,
        ),
      )

      setMensaje(
        'La configuración fue guardada correctamente.',
      )
    } catch (err) {
      setErrorConsulta(
        err.message ||
          'No fue posible guardar la configuración.',
      )
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="empty-state">
        Cargando configuración...
      </div>
    )
  }

  return (
    <section className="content-card config-page">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">
            INFORMACIÓN GENERAL
          </p>

          <h2>Configuración del restaurante</h2>

          <p>
            Personaliza la información de contacto y
            los parámetros generales del sistema.
          </p>
        </div>

        <button
          type="button"
          className="button button-outline"
          disabled={guardando}
          onClick={cargarConfiguracion}
        >
          ↻ Recargar
        </button>
      </div>

      {errorConsulta && (
        <div
          className="form-message error"
          role="alert"
        >
          <span>{errorConsulta}</span>

          <button
            type="button"
            className="message-action"
            disabled={guardando}
            onClick={cargarConfiguracion}
          >
            Intentar nuevamente
          </button>
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

      <form
        className="config-form"
        onSubmit={guardarConfiguracion}
        noValidate
      >
        <div className="config-section">
          <div className="config-section-heading">
            <span className="config-section-number">
              01
            </span>

            <div>
              <h3>Identidad del restaurante</h3>
              <p>
                Información con la que se identifica
                el establecimiento.
              </p>
            </div>
          </div>

          <div className="config-grid">
            <div className="form-field">
              <label htmlFor="config-nombre">
                Nombre del restaurante
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="config-nombre"
                name="nombre"
                type="text"
                value={formulario.nombre}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="150"
                aria-invalid={Boolean(
                  errores.nombre,
                )}
              />

              {errores.nombre && (
                <small className="field-error">
                  {errores.nombre}
                </small>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="config-nit">
                NIT
              </label>

              <input
                id="config-nit"
                name="nit"
                type="text"
                value={formulario.nit}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="30"
                placeholder="Ej. 900123456-7"
              />
            </div>
          </div>
        </div>

        <div className="config-section">
          <div className="config-section-heading">
            <span className="config-section-number">
              02
            </span>

            <div>
              <h3>Información de contacto</h3>
              <p>
                Datos utilizados para la comunicación
                con clientes y proveedores.
              </p>
            </div>
          </div>

          <div className="config-grid">
            <div className="form-field">
              <label htmlFor="config-telefono">
                Teléfono
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="config-telefono"
                name="telefono"
                type="tel"
                value={formulario.telefono}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="30"
                placeholder="Ej. +57 300 000 0000"
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

            <div className="form-field">
              <label htmlFor="config-correo">
                Correo electrónico
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="config-correo"
                name="correo"
                type="email"
                value={formulario.correo}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="150"
                placeholder="contacto@restaurante.com"
                aria-invalid={Boolean(
                  errores.correo,
                )}
              />

              {errores.correo && (
                <small className="field-error">
                  {errores.correo}
                </small>
              )}
            </div>

            <div className="form-field form-field-full">
              <label htmlFor="config-direccion">
                Dirección
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="config-direccion"
                name="direccion"
                type="text"
                value={formulario.direccion}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="200"
                placeholder="Dirección del establecimiento"
                aria-invalid={Boolean(
                  errores.direccion,
                )}
              />

              {errores.direccion && (
                <small className="field-error">
                  {errores.direccion}
                </small>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="config-ciudad">
                Ciudad
                <span aria-hidden="true"> *</span>
              </label>

              <input
                id="config-ciudad"
                name="ciudad"
                type="text"
                value={formulario.ciudad}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="100"
                placeholder="Ej. Bogotá"
                aria-invalid={Boolean(
                  errores.ciudad,
                )}
              />

              {errores.ciudad && (
                <small className="field-error">
                  {errores.ciudad}
                </small>
              )}
            </div>
          </div>
        </div>

        <div className="config-section">
          <div className="config-section-heading">
            <span className="config-section-number">
              03
            </span>

            <div>
              <h3>Parámetros generales</h3>
              <p>
                Valores utilizados en la operación
                diaria del restaurante.
              </p>
            </div>
          </div>

          <div className="config-grid">
            <div className="form-field">
              <label htmlFor="config-moneda">
                Moneda
              </label>

              <select
                id="config-moneda"
                name="moneda"
                value={formulario.moneda}
                onChange={actualizarCampo}
                disabled={guardando}
              >
                <option value="COP">
                  Peso colombiano (COP)
                </option>
                <option value="USD">
                  Dólar estadounidense (USD)
                </option>
                <option value="EUR">
                  Euro (EUR)
                </option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="config-zona">
                Zona horaria
              </label>

              <select
                id="config-zona"
                name="zona_horaria"
                value={formulario.zona_horaria}
                onChange={actualizarCampo}
                disabled={guardando}
              >
                <option value="America/Bogota">
                  Bogotá (UTC-5)
                </option>
                <option value="America/Mexico_City">
                  Ciudad de México
                </option>
                <option value="America/Lima">
                  Lima (UTC-5)
                </option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="config-servicio">
                Porcentaje de servicio
              </label>

              <div className="percentage-input">
                <input
                  id="config-servicio"
                  name="porcentaje_servicio"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={
                    formulario.porcentaje_servicio
                  }
                  onChange={actualizarCampo}
                  disabled={guardando}
                  aria-invalid={Boolean(
                    errores.porcentaje_servicio,
                  )}
                />

                <span>%</span>
              </div>

              {errores.porcentaje_servicio && (
                <small className="field-error">
                  {
                    errores.porcentaje_servicio
                  }
                </small>
              )}
            </div>
          </div>
        </div>

        <div className="config-actions">
          <p>
            Los campos marcados con * son
            obligatorios.
          </p>

          <button
            type="submit"
            className="button button-primary"
            disabled={guardando}
          >
            {guardando
              ? 'Guardando...'
              : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default ConfiguracionPage