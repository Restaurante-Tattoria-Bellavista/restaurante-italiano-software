import { useEffect, useState } from 'react'
import { api } from '../services/api'

const REFRESCO_MS = 10000

function hace(segundos) {
  if (segundos == null) return 'nunca'
  if (segundos < 60) return `hace ${segundos} s`
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`
  return `hace ${Math.floor(segundos / 3600)} h`
}

function calidadWifi(rssi) {
  if (rssi == null) return '—'
  const texto = rssi >= -60 ? 'buena' : rssi >= -75 ? 'regular' : 'débil'
  return `${texto} (${rssi} dBm)`
}

/**
 * Tarjeta "Terminal ESP32": la misma placa es micrófono (pedidos por voz) y localizador BLE.
 * Combina dos fuentes: el latido de la terminal (en línea, WiFi, audios) y la ubicación que el gateway
 * BLE reporta para la etiqueta de la placa (a quién se la asignaron, zona y distancia aproximada).
 */
function TerminalesEsp32() {
  const [terminales, setTerminales] = useState([])
  const [personal, setPersonal] = useState([])
  const [error, setError] = useState('')
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    let activo = true
    async function cargar() {
      try {
        const [t, p] = await Promise.all([api.getTerminalesVoz(), api.getUbicaciones().catch(() => [])])
        if (!activo) return
        setTerminales(t)
        setPersonal(p)
        setError('')
      } catch (err) {
        if (activo) setError(err.message)
      } finally {
        if (activo) setCargado(true)
      }
    }
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [])

  function quienLaLleva(etiqueta) {
    if (!etiqueta) return null
    return personal.find((p) => p.etiqueta_id === etiqueta) || null
  }

  return (
    <div className="terminales-esp32">
      <p className="eyebrow">TERMINAL ESP32 · MICRÓFONO Y LOCALIZADOR</p>

      {error && <p className="voz-error">No se pudo consultar las terminales: {error}</p>}

      {cargado && !error && terminales.length === 0 && (
        <small>
          Ninguna terminal ha reportado todavía. Enciende el ESP32 con WiFi y la clave de dispositivo
          configuradas (ver <code>docs/HANDOFF_IOT.md</code>).
        </small>
      )}

      {terminales.map((t) => {
        const persona = quienLaLleva(t.etiqueta)
        return (
          <article key={t.sesion} className="terminal-card">
            <header>
              <strong>{t.sesion}</strong>
              <span className={`terminal-estado ${t.en_linea ? 'en-linea' : 'fuera'}`}>
                {t.en_linea ? '● En línea' : '○ Sin señal'}
              </span>
            </header>

            <dl>
              <div>
                <dt>🎤 Micrófono</dt>
                <dd>
                  {t.audios} {t.audios === 1 ? 'pedido dictado' : 'pedidos dictados'} · último {hace(t.segundos_desde_audio)}
                </dd>
              </div>
              <div>
                <dt>📶 WiFi</dt>
                <dd>
                  {calidadWifi(t.wifi_rssi)}
                  {t.ip ? ` · ${t.ip}` : ''}
                </dd>
              </div>
              <div>
                <dt>📍 Localizador</dt>
                <dd>
                  {!t.etiqueta && 'BLE desactivado en el firmware.'}
                  {t.etiqueta && !persona && (
                    <>
                      Etiqueta <code>{t.etiqueta}</code> sin asignar. Asígnala a un mesero en “Personal en tiempo real”.
                    </>
                  )}
                  {persona && (
                    <>
                      <code>{t.etiqueta}</code> · lo lleva <strong>{persona.nombre}</strong>
                      {persona.zona
                        ? ` · ${persona.zona}, ~${persona.distancia_m} m (${persona.banda}) · hace ${persona.segundos_desde} s`
                        : ' · el gateway aún no lo detecta'}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>⏱ Latido</dt>
                <dd>{hace(t.segundos_desde_latido)}</dd>
              </div>
            </dl>
          </article>
        )
      })}
    </div>
  )
}

export default TerminalesEsp32
