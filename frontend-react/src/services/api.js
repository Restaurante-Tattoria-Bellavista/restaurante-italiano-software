import { borrarToken, obtenerToken } from './session'

const API_BASE_URL =
  import.meta.env.VITE_API_URL || ''

export const EVENTO_SESION_EXPIRADA = 'sesion-expirada'

async function request(path, options = {}) {
  const controller = new AbortController()

  const timeout = window.setTimeout(() => {
    controller.abort()
  }, 5000)

  const token = obtenerToken()

  try {
    const response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {}),
          ...options.headers,
        },
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      let mensajeServidor = ''
      let detalles = []

      try {
        const errorData = await response.json()

        mensajeServidor =
          errorData?.detail ||
          errorData?.error?.message ||
          errorData?.message ||
          ''
        detalles = errorData?.error?.details || []
      } catch {
        mensajeServidor = ''
      }

      // Un 401 con token guardado significa que la sesión venció o fue revocada.
      if (
        response.status === 401 &&
        token &&
        !path.startsWith('/api/auth/')
      ) {
        borrarToken()
        window.dispatchEvent(
          new Event(EVENTO_SESION_EXPIRADA),
        )
      }

      const error = new Error(
        mensajeServidor ||
          `El servidor respondió con estado ${response.status}.`,
      )
      error.status = response.status
      error.detalles = detalles
      throw error
    }

    if (response.status === 204) {
      return null
    }

    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'El backend tardó demasiado en responder.',
      )
    }

    if (error instanceof TypeError) {
      throw new Error(
        'No fue posible establecer conexión con el backend.',
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export const api = {
  async health() {
    const data = await request('/health')

    if (data?.status !== 'ok') {
      throw new Error(
        'La respuesta del backend no es válida.',
      )
    }

    return data
  },

  getClientes() {
    return request('/api/v1/clientes')
  },

  createCliente(datos) {
    return request('/api/v1/clientes', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
  },

  updateCliente(clienteId, datos) {
    return request(
      `/api/v1/clientes/${clienteId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(datos),
      },
    )
  },

  getProductos() {
    return request('/api/v1/productos')
  },

  createProducto(datos) {
    return request('/api/v1/productos', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
  },

  updateProducto(productoId, datos) {
    return request(
      `/api/v1/productos/${productoId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(datos),
      },
    )
  },

  getMesas() {
    return request('/api/v1/mesas')
  },

  createMesa(datos) {
    return request('/api/v1/mesas', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
  },

  updateMesa(mesaId, datos) {
    return request(
      `/api/v1/mesas/${mesaId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(datos),
      },
    )
  },

  getMesaLayout(mesaId) {
    return request(
      `/api/v1/mesas/${mesaId}/layout`,
    )
  },

  saveMesaLayout(mesaId, datos) {
    return request(
      `/api/v1/mesas/${mesaId}/layout`,
      {
        method: 'PUT',
        body: JSON.stringify(datos),
      },
    )
  },

  getReportDashboard() {
    return request(
      '/api/v1/reportes/dashboard',
    )
  },

  getReportProductos() {
    return request(
      '/api/v1/reportes/productos',
    )
  },

  getConfiguracionRestaurante() {
    return request('/api/v1/configuracion')
  },

  updateConfiguracionRestaurante(datos) {
    return request('/api/v1/configuracion', {
      method: 'PATCH',
      body: JSON.stringify(datos),
    })
  },

  login(username, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  faceLogin(descriptor) {
    return request('/api/auth/face-login', {
      method: 'POST',
      body: JSON.stringify({ descriptor }),
    })
  },

  me() {
    return request('/api/auth/me')
  },

  getUsuarios() {
    return request('/api/usuarios')
  },

  createUsuario(datos) {
    return request('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
  },

  setRostroUsuario(usuarioId, plantillas) {
    return request(
      `/api/usuarios/${usuarioId}/rostro`,
      {
        method: 'PUT',
        body: JSON.stringify({ plantillas }),
      },
    )
  },

  getUbicaciones() {
    return request('/api/ubicaciones')
  },

  setEtiquetaUsuario(usuarioId, etiqueta) {
    return request(`/api/usuarios/${usuarioId}/etiqueta`, {
      method: 'PUT',
      body: JSON.stringify({ etiqueta }),
    })
  },

  deleteRostroUsuario(usuarioId) {
    return request(
      `/api/usuarios/${usuarioId}/rostro`,
      { method: 'DELETE' },
    )
  },

  getCocina() {
    return request('/api/v1/cocina')
  },

  cambiarEstadoPedido(pedidoId, estado) {
    return request(
      `/api/v1/pedidos/${pedidoId}/estado`,
      {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      },
    )
  },

  // Audio WAV crudo (el procesamiento con Gemini puede tardar): sin el limite de 5 s.
  async enviarAudioVoz(wav, sesion = 'web') {
    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => controller.abort(),
      60000,
    )
    const token = obtenerToken()

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/voz/audio-web?sesion=${encodeURIComponent(sesion)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'audio/wav',
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {}),
          },
          body: wav,
          signal: controller.signal,
        },
      )
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
            data?.detail ||
            `El servidor respondió con estado ${response.status}.`,
        )
      }

      return data
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('El procesamiento del audio tardó demasiado.')
      }
      throw error
    } finally {
      window.clearTimeout(timeout)
    }
  },

  confirmarPedidoVoz(borrador) {
    return request('/api/voz/confirmar', {
      method: 'POST',
      body: JSON.stringify(borrador),
    })
  },

  reiniciarSesionVoz(sesion = 'web') {
    return request(
      `/api/voz/sesion/${encodeURIComponent(sesion)}`,
      { method: 'DELETE' },
    )
  },
}
