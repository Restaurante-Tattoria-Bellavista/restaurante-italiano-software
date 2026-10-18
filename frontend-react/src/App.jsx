import { useEffect, useState } from 'react'
import ConnectionBanner from './components/ConnectionBanner'
import Sidebar from './components/Sidebar'
import ClientesPage from './pages/ClientesPage'
import ModulePage from './pages/ModulePage'
import { api } from './services/api'

const modulos = {
  mesas: {
    etiqueta: 'OPERACIÓN',
    titulo: 'Gestión de mesas',
    descripcion:
      'Administra la capacidad, ubicación y disponibilidad de las mesas.',
    icono: '◦',
  },
  pedidos: {
    etiqueta: 'SERVICIO',
    titulo: 'Gestión de pedidos',
    descripcion:
      'Consulta y administra los pedidos realizados en el restaurante.',
    icono: '◫',
  },
  reservas: {
    etiqueta: 'AGENDA',
    titulo: 'Gestión de reservas',
    descripcion:
      'Organiza las reservas y la disponibilidad de las mesas.',
    icono: '◇',
  },
  productos: {
    etiqueta: 'MENÚ',
    titulo: 'Productos del restaurante',
    descripcion:
      'Mantén actualizada la oferta de productos disponibles.',
    icono: '◈',
  },
  clientes: {
    etiqueta: 'CLIENTES',
    titulo: 'Gestión de clientes',
    descripcion:
      'Consulta y administra la información de los clientes.',
    icono: '♙',
  },
  cocina: {
    etiqueta: 'COCINA',
    titulo: 'Operación de cocina',
    descripcion:
      'Supervisa la preparación y entrega de los pedidos.',
    icono: '♨',
  },
  reportes: {
    etiqueta: 'ANÁLISIS',
    titulo: 'Reportes del restaurante',
    descripcion:
      'Consulta los principales indicadores de la operación.',
    icono: '▥',
  },
  configuracion: {
    etiqueta: 'SISTEMA',
    titulo: 'Configuración',
    descripcion:
      'Administra la información general del restaurante.',
    icono: '⚙',
  },
}

function formatearFecha(fecha) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(fecha)
}

function formatearHora(fecha) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha)
}

function App() {
  const [vistaActual, setVistaActual] =
    useState('mesas')
  const [menuAbierto, setMenuAbierto] =
    useState(false)
  const [conectado, setConectado] =
    useState(false)
  const [verificando, setVerificando] =
    useState(true)
  const [fechaActual, setFechaActual] =
    useState(() => new Date())

  async function verificarConexion() {
    try {
      setVerificando(true)
      await api.health()
      setConectado(true)
    } catch {
      setConectado(false)
    } finally {
      setVerificando(false)
    }
  }

  useEffect(() => {
    let componenteActivo = true

    async function comprobarConexionInicial() {
      try {
        await api.health()

        if (componenteActivo) {
          setConectado(true)
        }
      } catch {
        if (componenteActivo) {
          setConectado(false)
        }
      } finally {
        if (componenteActivo) {
          setVerificando(false)
        }
      }
    }

    comprobarConexionInicial()

    return () => {
      componenteActivo = false
    }
  }, [])

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setFechaActual(new Date())
    }, 30000)

    return () => {
      window.clearInterval(intervalo)
    }
  }, [])

  const modulo =
    modulos[vistaActual] || modulos.mesas

  function mostrarContenido() {
    if (vistaActual === 'clientes') {
      return <ClientesPage />
    }

    return <ModulePage {...modulo} />
  }

  return (
    <div className="app-shell">
      <Sidebar
        vistaActual={vistaActual}
        cambiarVista={setVistaActual}
        abierto={menuAbierto}
        cerrar={() => setMenuAbierto(false)}
        conectado={conectado}
      />

      <main className="main-content">
        <header className="page-header">
          <div className="header-title">
            <button
              type="button"
              className="menu-button"
              aria-label="Abrir menú"
              onClick={() => setMenuAbierto(true)}
            >
              ☰
            </button>

            <div>
              <p className="eyebrow">
                OPERACIÓN DEL RESTAURANTE
              </p>

              <h1>{modulo.titulo}</h1>

              <p className="page-subtitle">
                {modulo.descripcion}
              </p>
            </div>
          </div>

          <div className="header-actions">
            <div className="clock-block">
              <span>
                {formatearFecha(fechaActual)}
              </span>

              <strong>
                {formatearHora(fechaActual)}
              </strong>
            </div>

            <div className="session-card">
              <div className="session-avatar">
                G
              </div>

              <div>
                <span>Sesión</span>
                <strong>Gerente</strong>
              </div>
            </div>

            <button
              type="button"
              className="button button-outline"
              disabled={verificando}
              onClick={verificarConexion}
            >
              {verificando
                ? 'Verificando...'
                : '↻ Actualizar'}
            </button>
          </div>
        </header>

        <ConnectionBanner
          conectado={conectado}
          verificando={verificando}
          reintentar={verificarConexion}
        />

        {mostrarContenido()}
      </main>
    </div>
  )
}

export default App