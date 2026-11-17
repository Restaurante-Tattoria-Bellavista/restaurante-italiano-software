// Token de sesión por pestaña. Se guarda en sessionStorage y se limpia al cerrar la pestaña.
// Todo acceso va envuelto en try/catch: el almacenamiento puede estar bloqueado.
const CLAVE_TOKEN = 'bellavista_token'

export function obtenerToken() {
  try {
    return window.sessionStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token) {
  try {
    window.sessionStorage.setItem(CLAVE_TOKEN, token)
  } catch {
    // Sin almacenamiento: la sesión solo dura mientras la página esté abierta.
  }
}

export function borrarToken() {
  try {
    window.sessionStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // Nada que limpiar si el almacenamiento no está disponible.
  }
}
