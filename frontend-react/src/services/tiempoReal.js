// Cliente WebSocket para eventos del backend (cambios en la base de datos).
// Se autentica con el token de sesión, reconecta con espera creciente y se detiene al cerrar sesión.
import { obtenerToken } from './session'

const CODIGO_NO_AUTORIZADO = 4401
const INTERVALO_PING_MS = 25000
const ESPERA_MAXIMA_MS = 15000

export function conectarTiempoReal({ onCambio, onEstado }) {
  let socket = null
  let cerrado = false
  let intentos = 0
  let temporizadorReconexion = null

  function url() {
    const protocolo = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return protocolo + '://' + window.location.host + '/api/ws'
  }

  function conectar() {
    const token = obtenerToken()
    if (!token || cerrado) {
      return
    }

    socket = new WebSocket(url())

    socket.onopen = () => {
      socket.send(JSON.stringify({ token }))
    }

    socket.onmessage = (evento) => {
      let mensaje = null
      try {
        mensaje = JSON.parse(evento.data)
      } catch {
        return
      }
      if (mensaje.tipo === 'listo') {
        intentos = 0
        onEstado?.(true)
      } else if (mensaje.tipo === 'cambio') {
        onCambio?.(mensaje.tablas || [])
      }
    }

    socket.onclose = (evento) => {
      onEstado?.(false)
      if (cerrado || evento.code === CODIGO_NO_AUTORIZADO) {
        return
      }
      intentos += 1
      const espera = Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** intentos)
      temporizadorReconexion = window.setTimeout(conectar, espera)
    }
  }

  const temporizadorPing = window.setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send('ping')
    }
  }, INTERVALO_PING_MS)

  conectar()

  return () => {
    cerrado = true
    window.clearTimeout(temporizadorReconexion)
    window.clearInterval(temporizadorPing)
    if (socket) {
      socket.close()
    }
  }
}
