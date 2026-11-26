import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import TerminalesEsp32 from '../components/TerminalesEsp32'
import '../styles/voz.css'

const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

const BORRADOR_VACIO = { mesa_numero: null, items: [], pendiente: null }

function hablar(texto) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const voz = new SpeechSynthesisUtterance(texto)
  voz.lang = 'es-CO'
  window.speechSynthesis.speak(voz)
}

function VozPage() {
  const [borrador, setBorrador] = useState(BORRADOR_VACIO)
  const [conversacion, setConversacion] = useState([])
  const [texto, setTexto] = useState('')
  const [escuchando, setEscuchando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [motor, setMotor] = useState('')
  const [motorError, setMotorError] = useState('')
  const [confirmado, setConfirmado] = useState(null)
  const reconocedor = useRef(null)
  const borradorRef = useRef(BORRADOR_VACIO)

  useEffect(() => {
    api.getVozEstado().then((e) => setMotor(e.motor)).catch(() => setMotor(''))
  }, [])

  function agregar(rol, mensaje) {
    setConversacion((c) => [...c, { rol, mensaje }])
  }

  async function enviar(dictado) {
    const limpio = dictado.trim()
    if (!limpio) return
    agregar('mesero', limpio)
    setProcesando(true)
    try {
      const r = await api.interpretarVoz(limpio, borradorRef.current)
      borradorRef.current = r.borrador
      setBorrador(r.borrador)
      setMotor(r.motor)
      setMotorError(r.motor_error || '')
      agregar('asistente', r.mensaje)
      hablar(r.mensaje)

      if (r.confirmar) {
        const creado = await api.confirmarVoz(r.borrador)
        setConfirmado(creado)
        borradorRef.current = BORRADOR_VACIO
        setBorrador(BORRADOR_VACIO)
      }
    } catch (err) {
      agregar('asistente', err.message)
      hablar(err.message)
    } finally {
      setProcesando(false)
    }
  }

  function alternarMicrofono() {
    if (!SpeechRecognition) return
    if (escuchando) {
      reconocedor.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'es-CO'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (evento) => enviar(evento.results[0][0].transcript)
    rec.onend = () => setEscuchando(false)
    rec.onerror = () => setEscuchando(false)
    reconocedor.current = rec
    setConfirmado(null)
    setEscuchando(true)
    rec.start()
  }

  function enviarTexto(evento) {
    evento.preventDefault()
    const dictado = texto
    setTexto('')
    setConfirmado(null)
    enviar(dictado)
  }

  function reiniciar() {
    borradorRef.current = BORRADOR_VACIO
    setBorrador(BORRADOR_VACIO)
    setConversacion([])
    setConfirmado(null)
    window.speechSynthesis?.cancel()
  }

  return (
    <section className="content-card voz-page">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">ASISTENTE DE PEDIDOS</p>
          <h2>Pedido por voz</h2>
          <small>
            Motor: <strong>{motor === 'gemini' ? 'Gemini (con respaldo local)' : 'reglas locales'}</strong>
          </small>
          {motorError && (
            <small style={{ display: 'block', color: '#9c383b' }}>
              Gemini no respondió, se usó el respaldo local: {motorError}
            </small>
          )}
        </div>
        <button type="button" className="button button-outline" onClick={reiniciar}>
          Nuevo pedido
        </button>
      </div>

      <TerminalesEsp32 />

      <div className="voz-acciones">
        <button
          type="button"
          className={`button ${escuchando ? 'button-danger-outline' : 'button-primary'}`}
          onClick={alternarMicrofono}
          disabled={!SpeechRecognition || procesando}
          title={SpeechRecognition ? '' : 'Tu navegador no soporta reconocimiento de voz. Usa Chrome.'}
        >
          {escuchando ? '■ Detener' : '🎤 Hablar'}
        </button>
        <form onSubmit={enviarTexto} className="voz-acciones" style={{ flex: 1, marginBottom: 0 }}>
          <input
            className="voz-control"
            style={{ flex: 1, minWidth: 220 }}
            placeholder='O escribe: "Mesa 5, dos pizzas margherita y una limonada"'
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength="600"
          />
          <button type="submit" className="button button-outline" disabled={procesando || !texto.trim()}>
            Enviar
          </button>
        </form>
      </div>
      {!SpeechRecognition && (
        <p className="voz-error">El micrófono requiere Chrome o Edge. Mientras tanto puedes escribir.</p>
      )}

      {confirmado && (
        <div className="empty-state" style={{ marginBottom: 12 }}>
          ✅ Pedido #{confirmado.pedido_id} enviado a Cocina para la mesa {confirmado.mesa_numero}.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div>
          <p className="eyebrow">CONVERSACIÓN</p>
          {conversacion.length === 0 && <small>Pulsa “Hablar” y dicta el pedido con el número de mesa.</small>}
          {conversacion.map((c, i) => (
            <p key={i} style={{ margin: '6px 0', textAlign: c.rol === 'mesero' ? 'right' : 'left' }}>
              <span className={`voz-rol ${c.rol === 'mesero' ? 'mesero' : 'asistente'}`}>
                {c.rol === 'mesero' ? 'Mesero' : 'Asistente'}
              </span>{' '}
              {c.mensaje}
            </p>
          ))}
        </div>

        <div>
          <p className="eyebrow">BORRADOR DEL PEDIDO</p>
          <p>
            <strong>Mesa:</strong> {borrador.mesa_numero ?? '—'}
          </p>
          {borrador.items.length === 0 ? (
            <small>Sin productos todavía.</small>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {borrador.items.map((it) => (
                <li key={`${it.producto_id}-${it.observacion || ''}`}>
                  {it.cantidad} × {it.nombre}
                  {it.observacion ? ` (${it.observacion})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export default VozPage
