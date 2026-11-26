import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { conectarTiempoReal } from '../services/tiempoReal'
import '../styles/cocina.css'

const REFRESCO_MS = 5000
const AVISO_NUEVO_MS = 15000
const MINUTOS_ATENCION = 10
const MINUTOS_RETRASO = 20

const COLUMNAS = [
  { estado: 'ABIERTO', titulo: 'Pendientes', clase: 'pending', vacio: 'Sin pedidos pendientes' },
  { estado: 'EN_PREPARACION', titulo: 'En preparación', clase: 'preparing', vacio: 'Nada en preparación' },
  { estado: 'LISTO', titulo: 'Listos para entregar', clase: 'ready', vacio: 'Nada listo todavía' },
]

const ACCIONES = {
  ABIERTO: { estado: 'EN_PREPARACION', texto: 'Iniciar preparación' },
  EN_PREPARACION: { estado: 'LISTO', texto: 'Marcar como listo' },
  LISTO: { estado: 'ENTREGADO', texto: 'Entregado a la mesa' },
}

const ORDEN_CATEGORIAS = ['ENTRADA', 'PLATO_FUERTE', 'POSTRE', 'BEBIDA', 'OTRO']
const NOMBRE_CATEGORIA = {
  ENTRADA: 'Entrada',
  PLATO_FUERTE: 'Plato fuerte',
  POSTRE: 'Postre',
  BEBIDA: 'Bebida',
  OTRO: 'Otro',
}

function minutosDesde(valor, ahora) {
  const t = new Date(valor).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((ahora - t) / 60000))
}

function textoEspera(minutos) {
  if (minutos < 1) return 'Recién llegó'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function urgencia(minutos, estado) {
  if (estado === 'LISTO') return 'listo'
  if (minutos >= MINUTOS_RETRASO) return 'retraso'
  if (minutos >= MINUTOS_ATENCION) return 'atencion'
  return 'normal'
}

function hora(valor) {
  const f = new Date(valor)
  if (Number.isNaN(f.getTime())) return '—'
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(f)
}

function sonarAviso(contexto) {
  if (!contexto) return
  const ahora = contexto.currentTime
  ;[880, 1175].forEach((frecuencia, i) => {
    const osc = contexto.createOscillator()
    const ganancia = contexto.createGain()
    osc.type = 'sine'
    osc.frequency.value = frecuencia
    ganancia.gain.setValueAtTime(0.0001, ahora + i * 0.18)
    ganancia.gain.exponentialRampToValueAtTime(0.3, ahora + i * 0.18 + 0.02)
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + i * 0.18 + 0.16)
    osc.connect(ganancia).connect(contexto.destination)
    osc.start(ahora + i * 0.18)
    osc.stop(ahora + i * 0.18 + 0.17)
  })
}

function agruparItems(items) {
  const grupos = new Map()
  for (const item of items) {
    const clave = ORDEN_CATEGORIAS.includes(item.categoria) ? item.categoria : 'OTRO'
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(item)
  }
  return ORDEN_CATEGORIAS.filter((c) => grupos.has(c)).map((c) => ({ categoria: c, items: grupos.get(c) }))
}

function CocinaPage() {
  const [comandas, setComandas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sinConexion, setSinConexion] = useState(false)
  const [errorInicial, setErrorInicial] = useState('')
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [nuevos, setNuevos] = useState(() => new Set())
  const [sonido, setSonido] = useState(false)
  const [ocupadoId, setOcupadoId] = useState(null)
  const [mensajeError, setMensajeError] = useState('')

  const conocidos = useRef(null) // ids ya vistos; null hasta la primera carga
  const contextoAudio = useRef(null)
  const sonidoRef = useRef(false)

  const cargar = useCallback(async () => {
    try {
      const datos = await api.getComandas()
      const lista = Array.isArray(datos) ? datos : []

      if (conocidos.current === null) {
        conocidos.current = new Set(lista.map((c) => c.id))
      } else {
        const llegados = lista.filter((c) => !conocidos.current.has(c.id)).map((c) => c.id)
        if (llegados.length > 0) {
          llegados.forEach((id) => conocidos.current.add(id))
          setNuevos((actual) => new Set([...actual, ...llegados]))
          if (sonidoRef.current) sonarAviso(contextoAudio.current)
          window.setTimeout(() => {
            setNuevos((actual) => {
              const resto = new Set(actual)
              llegados.forEach((id) => resto.delete(id))
              return resto
            })
          }, AVISO_NUEVO_MS)
        }
      }

      setComandas(lista)
      setSinConexion(false)
      setErrorInicial('')
      setUltimaActualizacion(new Date())
    } catch (err) {
      // Si ya hay datos se conservan en pantalla y se reintenta solo.
      if (conocidos.current === null) setErrorInicial(err.message || 'No fue posible consultar cocina.')
      else setSinConexion(true)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    // Refresco al instante cuando cambian pedidos (p. ej. llega uno por voz) ...
    const desconectar = conectarTiempoReal({
      onCambio: (tablas) => {
        if (tablas.some((t) => t === 'pedidos' || t === 'detalle_pedido')) cargar()
      },
    })
    // ... y refresco periodico por si el WebSocket se corta.
    const datos = window.setInterval(cargar, REFRESCO_MS)
    const reloj = window.setInterval(() => setAhora(Date.now()), 15000)
    return () => {
      desconectar()
      window.clearInterval(datos)
      window.clearInterval(reloj)
    }
  }, [cargar])

  function alternarSonido() {
    const activar = !sonido
    if (activar) {
      const Contexto = window.AudioContext || window.webkitAudioContext
      if (Contexto) {
        contextoAudio.current = contextoAudio.current || new Contexto()
        contextoAudio.current.resume?.()
        sonarAviso(contextoAudio.current) // confirma que suena
      }
    }
    sonidoRef.current = activar
    setSonido(activar)
  }

  function pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.()
  }

  async function avanzar(comanda) {
    const accion = ACCIONES[comanda.estado]
    if (!accion) return
    try {
      setOcupadoId(comanda.id)
      setMensajeError('')
      await api.changeOrderStatus(comanda.id, accion.estado)
      await cargar()
    } catch (err) {
      setMensajeError(`No se pudo actualizar la comanda #${comanda.id}: ${err.message}`)
    } finally {
      setOcupadoId(null)
    }
  }

  if (cargando) return <div className="empty-state">Cargando comandas...</div>

  if (errorInicial) {
    return (
      <div className="empty-state">
        <p>No fue posible consultar cocina: {errorInicial}</p>
        <button type="button" className="button button-primary" onClick={cargar}>
          Intentar nuevamente
        </button>
      </div>
    )
  }

  const porEstado = (estado) => comandas.filter((c) => c.estado === estado)
  const activas = comandas.filter((c) => c.estado !== 'LISTO')
  const masAntigua = activas.length ? Math.max(...activas.map((c) => minutosDesde(c.created_at, ahora))) : 0

  return (
    <section className="content-card kds">
      <div className="kds-header">
        <div>
          <p className="eyebrow">OPERACIÓN DE COCINA</p>
          <h2>Comandas</h2>
          <p className="kds-sub">
            {activas.length === 0
              ? 'Todo al día.'
              : `${activas.length} por preparar · la más antigua espera ${textoEspera(masAntigua)}`}
            {ultimaActualizacion && ` · actualizado ${hora(ultimaActualizacion)}`}
          </p>
        </div>

        <div className="kds-tools">
          <button
            type="button"
            className={`button ${sonido ? 'button-primary' : 'button-outline'}`}
            onClick={alternarSonido}
            aria-pressed={sonido}
            title="Suena un aviso cuando llega un pedido nuevo"
          >
            {sonido ? '🔔 Aviso activado' : '🔕 Activar aviso'}
          </button>
          <button type="button" className="button button-outline" onClick={pantallaCompleta}>
            ⛶ Pantalla completa
          </button>
          <button type="button" className="button button-outline" onClick={cargar}>
            ↻ Actualizar
          </button>
        </div>
      </div>

      {sinConexion && (
        <p className="kds-alert" role="alert">
          Sin conexión con el servidor. Se muestran los últimos datos y se reintenta automáticamente.
        </p>
      )}
      {mensajeError && (
        <p className="kds-alert" role="alert">
          {mensajeError}
        </p>
      )}

      <div className="kds-board">
        {COLUMNAS.map((columna) => {
          const lista = porEstado(columna.estado)
          return (
            <section className="kds-column" key={columna.estado}>
              <div className={`kds-column-title ${columna.clase}`}>
                <span>{columna.titulo}</span>
                <strong>{lista.length}</strong>
              </div>

              <div className="kds-list">
                {lista.length === 0 && <div className="kds-empty">{columna.vacio}</div>}

                {lista.map((comanda) => {
                  const minutos = minutosDesde(comanda.created_at, ahora)
                  const accion = ACCIONES[comanda.estado]
                  const ocupado = ocupadoId === comanda.id
                  return (
                    <article
                      key={comanda.id}
                      className={`kds-ticket ${urgencia(minutos, comanda.estado)} ${nuevos.has(comanda.id) ? 'nuevo' : ''}`}
                    >
                      <header className="kds-ticket-head">
                        <div className="kds-mesa">
                          <small>MESA</small>
                          <strong>{comanda.mesa_numero}</strong>
                        </div>
                        <div className="kds-meta">
                          {nuevos.has(comanda.id) && <span className="kds-badge">NUEVO</span>}
                          <span className="kds-espera">⏱ {textoEspera(minutos)}</span>
                          <small>
                            #{comanda.id} · {hora(comanda.created_at)}
                          </small>
                        </div>
                      </header>

                      <div className="kds-items">
                        {agruparItems(comanda.items).map((grupo) => (
                          <div key={grupo.categoria}>
                            <p className="kds-categoria">{NOMBRE_CATEGORIA[grupo.categoria]}</p>
                            {grupo.items.map((item) => (
                              <div className="kds-item" key={item.id}>
                                <span className="kds-cantidad">{item.cantidad}×</span>
                                <span className="kds-nombre">
                                  {item.nombre}
                                  {item.observacion && <em className="kds-nota">⚠ {item.observacion}</em>}
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      {accion && (
                        <button
                          type="button"
                          className={`button full kds-accion ${comanda.estado === 'EN_PREPARACION' ? 'button-primary' : 'button-outline'}`}
                          disabled={ocupado}
                          onClick={() => avanzar(comanda)}
                        >
                          {ocupado ? 'Actualizando...' : accion.texto}
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

export default CocinaPage
