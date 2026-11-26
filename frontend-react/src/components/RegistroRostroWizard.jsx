import { useEffect, useRef, useState } from 'react'
import CamaraFacial from './CamaraFacial'
import {
  TAMANO_MAX,
  TAMANO_MIN,
  evaluarCalidad,
  promediarDescriptores,
} from '../services/faceApi'
import '../styles/facial.css'

// Posiciones que se capturan, en orden. Se exige una mínima para guardar (ver MINIMO_GUARDAR).
const POSICIONES = [
  { id: 'FRENTE', flecha: '●', titulo: 'De frente', texto: 'Mira de frente a la cámara, relajado.' },
  { id: 'IZQUIERDA', flecha: '←', titulo: 'A tu izquierda', texto: 'Gira la cabeza despacio hacia tu izquierda.' },
  { id: 'DERECHA', flecha: '→', titulo: 'A tu derecha', texto: 'Gira la cabeza despacio hacia tu derecha.' },
  { id: 'ARRIBA', flecha: '↑', titulo: 'Hacia arriba', texto: 'Levanta un poco la barbilla, mirando hacia arriba.' },
  { id: 'ABAJO', flecha: '↓', titulo: 'Hacia abajo', texto: 'Baja un poco la cabeza, mirando hacia abajo.' },
]

const MINIMO_GUARDAR = 3
// Cuadros seguidos con la pose correcta antes de capturar (evita capturas en movimiento).
const CUADROS_ESTABLES = 4

function describirDistancia(tamano) {
  if (tamano === undefined) {
    return ''
  }
  if (tamano < TAMANO_MIN) {
    return 'Distancia: muy lejos'
  }
  if (tamano > TAMANO_MAX) {
    return 'Distancia: muy cerca'
  }
  return 'Distancia: correcta'
}

// Ventana emergente para registrar el rostro de un usuario: cámara con detección a la vista,
// instrucciones de cada posición y progreso, sin necesidad de desplazarse por la página.
function RegistroRostroWizard({ nombre, onGuardar, onCancelar }) {
  const [paso, setPaso] = useState(0)
  const [medida, setMedida] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [capturas, setCapturas] = useState({})
  const [guardando, setGuardando] = useState(false)

  const pasoRef = useRef(0)
  const capturasRef = useRef({})
  const establesRef = useRef(0)
  const muestrasRef = useRef([])
  const guardandoRef = useRef(false)

  // Esc cierra la ventana (salvo mientras se guarda).
  useEffect(() => {
    function alTeclear(evento) {
      if (evento.key === 'Escape' && !guardandoRef.current) {
        onCancelar()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCancelar])

  function alRostro(rostro) {
    setMedida(rostro)
    const indice = pasoRef.current
    if (indice >= POSICIONES.length) {
      return
    }

    const esperada = POSICIONES[indice].id
    if (rostro.pose !== esperada) {
      establesRef.current = 0
      muestrasRef.current = []
      setMensaje(`Esperando la posición: ${POSICIONES[indice].titulo.toLowerCase()}`)
      return
    }

    // Todas las poses se capturan a la misma distancia buena: así coincide con la del ingreso.
    const consejo = evaluarCalidad(rostro)
    if (consejo) {
      establesRef.current = 0
      muestrasRef.current = []
      setMensaje(consejo)
      return
    }

    establesRef.current += 1
    muestrasRef.current.push(rostro.descriptor)
    if (establesRef.current < CUADROS_ESTABLES) {
      return
    }

    // La plantilla es el promedio de varios cuadros, no un solo cuadro con ruido.
    const descriptor = promediarDescriptores(muestrasRef.current)
    establesRef.current = 0
    muestrasRef.current = []
    capturasRef.current = { ...capturasRef.current, [esperada]: descriptor }
    setCapturas(capturasRef.current)
    pasoRef.current = indice + 1
    setPaso(indice + 1)
    setMensaje(`Posición "${POSICIONES[indice].titulo.toLowerCase()}" capturada.`)
  }

  async function guardar() {
    const plantillas = Object.entries(capturasRef.current).map(([pose, descriptor]) => ({
      pose,
      descriptor,
    }))
    guardandoRef.current = true
    setGuardando(true)
    try {
      await onGuardar(plantillas)
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const completas = Object.keys(capturas).length
  const terminado = paso >= POSICIONES.length
  const posicion = terminado ? null : POSICIONES[paso]

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog-card registro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registro-rostro-titulo"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">REGISTRO FACIAL</p>
            <h2 id="registro-rostro-titulo">Registrar rostro de {nombre}</h2>
          </div>
          <button
            type="button"
            className="dialog-close"
            aria-label="Cerrar"
            disabled={guardando}
            onClick={onCancelar}
          >
            ×
          </button>
        </div>

        <div className="registro-modal-cuerpo">
          <div>
            {terminado ? (
              <p className="page-subtitle" role="status">
                Todas las posiciones están capturadas. Ya puedes guardar.
              </p>
            ) : (
              <CamaraFacial activa poseEsperada={null} onRostro={alRostro} />
            )}
            {mensaje && !terminado && <p className="registro-medida">{mensaje}</p>}
          </div>

          <aside className="registro-lateral">
            <div className={`registro-actual ${terminado ? 'completo' : ''}`}>
              <span className="registro-flecha" aria-hidden="true">
                {terminado ? '✓' : posicion.flecha}
              </span>
              <div>
                <strong>
                  {terminado
                    ? 'Registro completo'
                    : `Paso ${paso + 1} de ${POSICIONES.length}: ${posicion.titulo}`}
                </strong>
                <p>{terminado ? 'Guarda para terminar.' : posicion.texto}</p>
              </div>
            </div>

            <ol className="registro-pasos">
              {POSICIONES.map((pos, indice) => (
                <li
                  key={pos.id}
                  className={
                    capturas[pos.id] ? 'hecho' : indice === paso ? 'actual' : ''
                  }
                >
                  <span aria-hidden="true">{capturas[pos.id] ? '✓' : pos.flecha}</span>
                  {pos.id.toLowerCase()}
                </li>
              ))}
            </ol>

            <ul className="registro-consejos">
              <li>Busca buena luz de frente, sin contraluz.</li>
              <li>Quítate gorra y gafas oscuras. Solo una persona en cámara.</li>
              <li>El recuadro verde indica que te estoy detectando bien.</li>
              <li>Con {MINIMO_GUARDAR} posiciones ya puedes guardar; con 5 funciona mejor.</li>
            </ul>

            {medida && !terminado && (
              <p className="registro-medida">
                {describirDistancia(medida.tamano)} · pose detectada: {medida.pose.toLowerCase()}
              </p>
            )}
          </aside>
        </div>

        <div className="registro-modal-pie">
          <button
            type="button"
            className="button button-outline"
            disabled={guardando}
            onClick={onCancelar}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={completas < MINIMO_GUARDAR || guardando}
            onClick={guardar}
          >
            {guardando ? 'Guardando...' : `Guardar rostro (${completas}/${POSICIONES.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RegistroRostroWizard
