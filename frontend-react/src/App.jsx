import { useEffect, useState } from 'react'
import ConnectionBanner from './components/ConnectionBanner'
import Sidebar from './components/Sidebar'
import ClientesPage from './pages/ClientesPage'
import CocinaPage from './pages/CocinaPage'
import ConfiguracionPage from './pages/ConfiguracionPage'
import MenuPage from './pages/MenuPage'
import MesasPage from './pages/MesasPage'
import ModulePage from './pages/ModulePage'
import ReportesPage from './pages/ReportesPage'
import PersonalPage from './pages/PersonalPage'
import LoginPage from './pages/LoginPage'
import UsuariosPage from './pages/UsuariosPage'
import VozPage from './pages/VozPage'
import {
  api,
  EVENTO_SESION_EXPIRADA,
} from './services/api'
import { conectarTiempoReal } from './services/tiempoReal'
import {
  borrarToken,
  guardarToken,
  obtenerToken,
} from './services/session'

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
  voz: {
    etiqueta: 'SERVICIO',
    titulo: 'Pedido por voz',
    descripcion:
      'Dicta el pedido y el asistente lo envía a cocina.',
    icono: '☏',
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
  personal: {
    etiqueta: 'OPERACIÓN',
    titulo: 'Personal en tiempo real',
    descripcion:
      'Zona actual de cada mesero según las etiquetas BLE.',
    icono: '◎',
  },
  usuarios: {
    etiqueta: 'SISTEMA',
    titulo: 'Usuarios y acceso',
    descripcion:
      'Crea usuarios y registra su rostro para el ingreso facial.',
    icono: '◉',
  },
}

const ETIQUETA_ROL = {
  ADMIN: 'Administrador',
  PERSONAL: 'Personal',
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

  const [usuario, setUsuario] = useState(null)

  const [cargandoSesion, setCargandoSesion] =
    useState(() => obtenerToken() !== null)

  const esAdmin = usuario?.rol === 'ADMIN'

  const [solicitudesPendientes, setSolicitudesPendientes] =
    useState(0)

  // El administrador ve en el menú cuántas solicitudes de acceso esperan respuesta, y se actualiza en vivo.
  useEffect(() => {
    if (!esAdmin) {
      return undefined
    }

    let activo = true

    function contar() {
      api
        .getSolicitudes('PENDIENTE')
        .then((lista) => {
          if (activo) {
            setSolicitudesPendientes(lista.length)
          }
        })
        .catch(() => {})
    }

    contar()

    const desconectar = conectarTiempoReal({
      onCambio: (tablas) => {
        if (tablas.includes('solicitudes_acceso')) {
          contar()
        }
      },
    })

    return () => {
      activo = false
      desconectar()
    }
  }, [esAdmin])

  useEffect(() => {
    if (!obtenerToken()) {
      return undefined
    }

    let activo = true

    api
      .me()
      .then((datos) => {
        if (activo) {
          setUsuario(datos)
        }
      })
      .catch(() => {
        borrarToken()
      })
      .finally(() => {
        if (activo) {
          setCargandoSesion(false)
        }
      })

    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    function alExpirarSesion() {
      setUsuario(null)
      setVistaActual('mesas')
    }

    window.addEventListener(
      EVENTO_SESION_EXPIRADA,
      alExpirarSesion,
    )

    return () => {
      window.removeEventListener(
        EVENTO_SESION_EXPIRADA,
        alExpirarSesion,
      )
    }
  }, [])

  function iniciarSesion(sesion) {
    guardarToken(sesion.token)
    setUsuario(sesion.usuario)
    setVistaActual('mesas')
  }

  function cerrarSesion() {
    borrarToken()
    setUsuario(null)
    setMenuAbierto(false)
  }

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

  function cambiarVista(nuevaVista) {
    setVistaActual(nuevaVista)
    setMenuAbierto(false)
  }

  function mostrarContenido() {
    if (vistaActual === 'mesas') {
      return <MesasPage esAdmin={esAdmin} />
    }

    if (vistaActual === 'clientes') {
      return <ClientesPage />
    }

    if (vistaActual === 'productos') {
      return <MenuPage esAdmin={esAdmin} />
    }

    if (vistaActual === 'cocina') {
      return <CocinaPage />
    }

    if (vistaActual === 'voz') {
      return <VozPage />
    }

    if (vistaActual === 'reportes') {
      return <ReportesPage />
    }

    if (vistaActual === 'configuracion') {
      return <ConfiguracionPage esAdmin={esAdmin} />
    }

    if (vistaActual === 'personal') {
      return <PersonalPage esAdmin={esAdmin} />
    }

    if (vistaActual === 'usuarios' && esAdmin) {
      return <UsuariosPage />
    }

    return <ModulePage {...modulo} />
  }

  if (cargandoSesion) {
    return (
      <div className="login-shell">
        <p role="status">Verificando sesión...</p>
      </div>
    )
  }

  if (!usuario) {
    return <LoginPage onSesion={iniciarSesion} />
  }

  return (
    <div className="app-shell">
      <Sidebar
        vistaActual={vistaActual}
        cambiarVista={cambiarVista}
        abierto={menuAbierto}
        cerrar={() => setMenuAbierto(false)}
        conectado={conectado}
        esAdmin={esAdmin}
        solicitudesPendientes={solicitudesPendientes}
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
                {usuario.nombre.charAt(0).toUpperCase()}
              </div>

              <div>
                <span>
                  {ETIQUETA_ROL[usuario.rol] || 'Sesión'}
                </span>
                <strong>{usuario.nombre}</strong>
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

            <button
              type="button"
              className="button button-outline"
              onClick={cerrarSesion}
            >
              Cerrar sesión
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