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
      throw new Error(
        `El servidor respondió con estado ${response.status}.`,
      )
    }

    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'El backend tardó demasiado en responder.',
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
}