const API_BASE_URL =
  import.meta.env.VITE_API_URL || ''

async function request(path, options = {}) {
  const controller = new AbortController()

  const timeout = window.setTimeout(() => {
    controller.abort()
  }, 5000)

  try {
    const response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      let mensajeServidor = ''

      try {
        const errorData = await response.json()

        mensajeServidor =
          errorData?.detail ||
          errorData?.message ||
          ''
      } catch {
        mensajeServidor = ''
      }

      throw new Error(
        mensajeServidor ||
          `El servidor respondió con estado ${response.status}.`,
      )
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

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/voz/audio-web?sesion=${encodeURIComponent(sesion)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
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
