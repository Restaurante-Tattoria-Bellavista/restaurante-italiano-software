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
    return request('/api/clientes')
  },

  createCliente(datos) {
    return request('/api/clientes', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
  },

  updateCliente(clienteId, datos) {
    return request(`/api/clientes/${clienteId}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    })
  },
}