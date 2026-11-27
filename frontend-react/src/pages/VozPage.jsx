import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api'
import { convertirAWav, MAX_SEGUNDOS } from '../services/audio'

const SESION = 'web'

function VozPage({ irACocina }) {
  const [audio, setAudio] = useState(null)
  const [grabando, setGrabando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const urlAudio = useMemo(
    () => (audio ? URL.createObjectURL(audio.blob) : ''),
    [audio],
  )
  const grabadora = useRef(null)
  const trozos = useRef([])
  const flujo = useRef(null)

  useEffect(
    () => () => flujo.current?.getTracks().forEach((t) => t.stop()),
    [],
  )

  function elegirArchivo(evento) {
    const archivo = evento.target.files?.[0]
    if (archivo) {
      setAudio({ blob: archivo, nombre: archivo.name })
      setResultado(null)
      setError('')
    }
  }

  async function iniciarGrabacion() {
    setError('')
    try {
      flujo.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      trozos.current = []
      const rec = new MediaRecorder(flujo.current)
      rec.ondataavailable = (e) => trozos.current.push(e.data)
      rec.onstop = () => {
        flujo.current?.getTracks().forEach((t) => t.stop())
        const blob = new Blob(trozos.current, { type: rec.mimeType })
        setAudio({ blob, nombre: 'Grabación del micrófono' })
        setResultado(null)
      }
      rec.start()
      grabadora.current = rec
      setGrabando(true)
    } catch {
      setError(
        'No se pudo usar el micrófono. Permite el acceso o sube un archivo de audio.',
      )
    }
  }

  function detenerGrabacion() {
    grabadora.current?.stop()
    setGrabando(false)
  }

  async function procesar() {
    if (!audio) return
    setProcesando(true)
    setError('')
    setAviso('')
    try {
      const { wav, recortado } = await convertirAWav(audio.blob)
      if (recortado) {
        setAviso(
          `El audio se recortó a ${MAX_SEGUNDOS} segundos.`,
        )
      }
      setResultado(await api.enviarAudioVoz(wav, SESION))
    } catch (e) {
      setError(e.message)
    } finally {
      setProcesando(false)
    }
  }

  async function confirmar() {
    setProcesando(true)
    setError('')
    try {
      const pedido = await api.confirmarPedidoVoz(
        resultado.borrador,
      )
      await api.reiniciarSesionVoz(SESION)
      setResultado({ ...resultado, pedido, confirmar: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setProcesando(false)
    }
  }

  async function cancelar() {
    await api.reiniciarSesionVoz(SESION).catch(() => {})
    setResultado(null)
    setAudio(null)
    setError('')
    setAviso('')
  }

  const borrador = resultado?.borrador
  const completo =
    borrador?.mesa_numero != null &&
    borrador?.items?.length > 0 &&
    !borrador?.pendiente
  const creado = Boolean(resultado?.pedido)

  return (
    <section className="voz-page">
      <article className="voz-tarjeta">
        <h2>1. Carga o graba el pedido</h2>
        <p>
          Di, por ejemplo: «mesa 3, dos lasagna y una
          bruschetta». Para cerrar el pedido, repite el
          proceso diciendo «eso es todo».
        </p>

        <div className="voz-acciones">
          <label className="button button-outline">
            Subir audio
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={elegirArchivo}
            />
          </label>

          {grabando ? (
            <button
              type="button"
              className="button button-danger-outline"
              onClick={detenerGrabacion}
            >
              ■ Detener grabación
            </button>
          ) : (
            <button
              type="button"
              className="button button-outline"
              onClick={iniciarGrabacion}
            >
              ● Grabar con micrófono
            </button>
          )}
        </div>

        {audio && (
          <div className="voz-archivo">
            <span>🎧 {audio.nombre}</span>
            <audio
              controls
              src={urlAudio}
            />
            <button
              type="button"
              className="button button-primary"
              disabled={procesando || grabando}
              onClick={procesar}
            >
              {procesando ? 'Procesando...' : 'Procesar audio'}
            </button>
          </div>
        )}

        {aviso && <p className="voz-aviso">{aviso}</p>}
        {error && (
          <p className="cocina-error" role="alert">
            {error}
          </p>
        )}
      </article>

      {resultado && (
        <article className="voz-tarjeta">
          <h2>2. Lo que entendió el sistema</h2>

          <p className="voz-mensaje">{resultado.mensaje}</p>

          {resultado.transcripcion && (
            <p>
              <small>Transcripción:</small> «
              {resultado.transcripcion}»
            </p>
          )}

          {borrador && (
            <div className="voz-borrador">
              <strong>
                Mesa {borrador.mesa_numero ?? '— sin definir'}
              </strong>
              <ul>
                {borrador.items.map((it, i) => (
                  <li key={i}>
                    <b>{it.cantidad}×</b> {it.nombre}
                    {it.observacion && (
                      <small> — {it.observacion}</small>
                    )}
                  </li>
                ))}
                {borrador.items.length === 0 && (
                  <li>
                    <small>Sin productos todavía</small>
                  </li>
                )}
              </ul>
            </div>
          )}

          {creado ? (
            <div className="voz-ok">
              ✔ Pedido #{resultado.pedido.pedido_id} enviado a la
              cocina (mesa {resultado.pedido.mesa_numero}).
              <button
                type="button"
                className="button button-primary"
                onClick={irACocina}
              >
                Ver en el tablero de cocina
              </button>
            </div>
          ) : (
            <div className="voz-acciones">
              <button
                type="button"
                className="button button-primary"
                disabled={!completo || procesando}
                onClick={confirmar}
              >
                Confirmar y enviar a cocina
              </button>
              <button
                type="button"
                className="button button-danger-outline"
                disabled={procesando}
                onClick={cancelar}
              >
                Cancelar
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  )
}

export default VozPage
