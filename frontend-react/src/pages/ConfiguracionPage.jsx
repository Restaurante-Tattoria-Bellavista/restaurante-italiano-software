import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import { api } from '../services/api'

const configuracionInicial = {
  nombre: '',
  especialidad: '',
  nit: '',
  telefono: '',
  correo: '',
  direccion: '',
  ciudad: '',
  moneda: 'COP',
  zona_horaria: 'America/Bogota',
  porcentaje_servicio: '10',
}

function normalizarConfiguracion(datos = {}) {
  return {
    nombre: datos.nombre || '',
    especialidad:
      datos.especialidad || 'Cucina Italiana',
    nit: datos.nit || '',
    telefono: datos.telefono || '',
    correo: datos.correo || '',
    direccion: datos.direccion || '',
    ciudad: datos.ciudad || '',
    moneda: datos.moneda || 'COP',
    zona_horaria:
      datos.zona_horaria || 'America/Bogota',
    porcentaje_servicio: String(
      datos.porcentaje_servicio ?? 10,
    ),
  }
}

function ConfiguracionPage() {
  const [formulario, setFormulario] = useState(
    configuracionInicial,
  )

  const [configuracionOriginal, setConfiguracionOriginal] =
    useState(configuracionInicial)

  const [errores, setErrores] = useState({})
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [sinConfiguracion, setSinConfiguracion] =
    useState(false)

  const cargarConfiguracion = useCallback(async () => {
    try {
      setCargando(true)
      setError('')
      setMensaje('')
      setSinConfiguracion(false)

      const datos =
        await api.getConfiguracionRestaurante()

      if (!datos) {
        setSinConfiguracion(true)
        setFormulario(configuracionInicial)
        setConfiguracionOriginal(
          configuracionInicial,
        )

        return
      }

      const configuracion =
        normalizarConfiguracion(datos)

      setFormulario(configuracion)
      setConfiguracionOriginal(configuracion)
    } catch (err) {
      setError(
        err.message ||
          'No fue posible consultar la configuración.',
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      cargarConfiguracion()
    }, 0)

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [cargarConfiguracion])

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

    if (!formulario.especialidad.trim()) {
      nuevosErrores.especialidad =
        'La especialidad es obligatoria.'
    }

    if (
      formulario.correo.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        formulario.correo.trim(),
      )
    ) {
      nuevosErrores.correo =
        'Ingresa un correo electrónico válido.'
    }

    if (
      formulario.telefono.trim() &&
      formulario.telefono.trim().length < 7
    ) {
      nuevosErrores.telefono =
        'El teléfono debe tener mínimo 7 caracteres.'
    }

    if (!formulario.moneda) {
      nuevosErrores.moneda =
        'Selecciona una moneda.'
    }

    if (!formulario.zona_horaria) {
      nuevosErrores.zona_horaria =
        'Selecciona una zona horaria.'
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

    const confirmado = window.confirm(
      '¿Confirmas que deseas guardar los cambios de configuración del restaurante?',
    )

    if (!confirmado) {
      return
    }

    const datosParaGuardar = {
      nombre: formulario.nombre.trim(),
      especialidad:
        formulario.especialidad.trim(),
      moneda: formulario.moneda,
      nit: formulario.nit.trim() || null,
      telefono:
        formulario.telefono.trim() || null,
      correo: formulario.correo.trim() || null,
      direccion:
        formulario.direccion.trim() || null,
      ciudad: formulario.ciudad.trim() || null,
      zona_horaria: formulario.zona_horaria,
      porcentaje_servicio: Number(
        formulario.porcentaje_servicio,
      ),
    }

    try {
      setGuardando(true)
      setError('')
      setMensaje('')

      const respuesta =
        await api.updateConfiguracionRestaurante(
          datosParaGuardar,
        )

      const configuracionActualizada =
        normalizarConfiguracion({
          ...datosParaGuardar,
          ...(respuesta || {}),
        })

      setFormulario(configuracionActualizada)
      setConfiguracionOriginal(
        configuracionActualizada,
      )
      setSinConfiguracion(false)

      setMensaje(
        'La configuración se guardó correctamente.',
      )
    } catch (err) {
      setError(
        err.message ||
          'No fue posible guardar la configuración.',
      )
    } finally {
      setGuardando(false)
    }
  }

  function restaurarCambios() {
    setFormulario(configuracionOriginal)
    setErrores({})
    setError('')
    setMensaje('')
  }

  const existenCambios =
    JSON.stringify(formulario) !==
    JSON.stringify(configuracionOriginal)

  if (cargando) {
    return (
      <section
        className="empty-state"
        aria-live="polite"
      >
        <span className="loading-indicator" />

        <h2>Cargando configuración</h2>

        <p>
          Estamos consultando la información general
          del restaurante.
        </p>
      </section>
    )
  }

  if (error && !formulario.nombre) {
    return (
      <section
        className="empty-state"
        role="alert"
      >
        <h2>
          No fue posible cargar la configuración
        </h2>

        <p>{error}</p>

        <button
          type="button"
          className="button button-primary"
          onClick={cargarConfiguracion}
        >
          Intentar nuevamente
        </button>
      </section>
    )
  }

  if (sinConfiguracion) {
    return (
      <section className="empty-state">
        <h2>No existe una configuración registrada</h2>

        <p>
          Puedes cargar los datos iniciales para
          personalizar el restaurante.
        </p>

        <button
          type="button"
          className="button button-primary"
          onClick={() =>
            setSinConfiguracion(false)
          }
        >
          Crear configuración
        </button>
      </section>
    )
  }

  return (
    <div className="config-page">
      <div className="message-action warning">
        La persistencia de los campos de contacto
        depende de la ampliación del contrato realizada
        por el backend de HU-16.
      </div>

      {mensaje && (
        <div
          className="message-action success"
          role="status"
        >
          {mensaje}
        </div>
      )}

      {error && (
        <div
          className="message-action error"
          role="alert"
        >
          {error}
        </div>
      )}

      <form
        className="config-form"
        onSubmit={guardarConfiguracion}
        noValidate
      >
        <section className="config-section">
          <div className="config-section-heading">
            <span className="config-section-number">
              01
            </span>

            <div>
              <h2>Identidad del restaurante</h2>

              <p>
                Información que identifica al
                establecimiento.
              </p>
            </div>
          </div>

          <div className="config-grid">
            <div className="form-field">
              <label htmlFor="config-nombre">
                Nombre del restaurante *
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
              <label htmlFor="config-especialidad">
                Especialidad *
              </label>

              <input
                id="config-especialidad"
                name="especialidad"
                type="text"
                value={formulario.especialidad}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="100"
                aria-invalid={Boolean(
                  errores.especialidad,
                )}
              />

              {errores.especialidad && (
                <small className="field-error">
                  {errores.especialidad}
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
              />
            </div>
          </div>
        </section>

        <section className="config-section">
          <div className="config-section-heading">
            <span className="config-section-number">
              02
            </span>

            <div>
              <h2>Información de contacto</h2>

              <p>
                Datos para la atención y ubicación del
                restaurante.
              </p>
            </div>
          </div>

          <div className="config-grid">
            <div className="form-field">
              <label htmlFor="config-telefono">
                Teléfono
              </label>

              <input
                id="config-telefono"
                name="telefono"
                type="tel"
                value={formulario.telefono}
                onChange={actualizarCampo}
                disabled={guardando}
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

            <div className="form-field">
              <label htmlFor="config-correo">
                Correo electrónico
              </label>

              <input
                id="config-correo"
                name="correo"
                type="email"
                value={formulario.correo}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="150"
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
              </label>

              <input
                id="config-direccion"
                name="direccion"
                type="text"
                value={formulario.direccion}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="200"
              />
            </div>

            <div className="form-field">
              <label htmlFor="config-ciudad">
                Ciudad
              </label>

              <input
                id="config-ciudad"
                name="ciudad"
                type="text"
                value={formulario.ciudad}
                onChange={actualizarCampo}
                disabled={guardando}
                maxLength="100"
              />
            </div>
          </div>
        </section>

        <section className="config-section">
          <div className="config-section-heading">
            <span className="config-section-number">
              03
            </span>

            <div>
              <h2>Parámetros generales</h2>

              <p>
                Valores utilizados durante la operación
                del restaurante.
              </p>
            </div>
          </div>

          <div className="config-grid">
            <div className="form-field">
              <label htmlFor="config-moneda">
                Moneda *
              </label>

              <select
                id="config-moneda"
                name="moneda"
                value={formulario.moneda}
                onChange={actualizarCampo}
                disabled={guardando}
              >
                <option value="COP">
                  COP — Peso colombiano
                </option>

                <option value="USD">
                  USD — Dólar estadounidense
                </option>

                <option value="EUR">
                  EUR — Euro
                </option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="config-zona">
                Zona horaria *
              </label>

              <select
                id="config-zona"
                name="zona_horaria"
                value={formulario.zona_horaria}
                onChange={actualizarCampo}
                disabled={guardando}
              >
                <option value="America/Bogota">
                  America/Bogota
                </option>

                <option value="America/Lima">
                  America/Lima
                </option>

                <option value="America/Mexico_City">
                  America/Mexico_City
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
                  value={
                    formulario.porcentaje_servicio
                  }
                  onChange={actualizarCampo}
                  disabled={guardando}
                  min="0"
                  max="100"
                  step="0.01"
                  aria-invalid={Boolean(
                    errores.porcentaje_servicio,
                  )}
                />

                <span>%</span>
              </div>

              {errores.porcentaje_servicio && (
                <small className="field-error">
                  {errores.porcentaje_servicio}
                </small>
              )}
            </div>
          </div>
        </section>

        <div className="config-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={
              guardando || !existenCambios
            }
            onClick={restaurarCambios}
          >
            Descartar cambios
          </button>

          <button
            type="submit"
            className="button button-primary"
            disabled={
              guardando || !existenCambios
            }
          >
            {guardando
              ? 'Guardando...'
              : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ConfiguracionPage