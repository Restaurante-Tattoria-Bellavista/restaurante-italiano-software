import { useRef, useState } from 'react'
import CamaraFacial from './CamaraFacial'

// Posiciones que se capturan, en orden. Se exige una mínima para guardar (ver MINIMO_GUARDAR).
const POSICIONES = [
  { id: 'FRENTE', texto: 'Mira de frente a la cámara.' },
  { id: 'IZQUIERDA', texto: 'Gira la cabeza despacio hacia tu izquierda.' },
  { id: 'DERECHA', texto: 'Gira la cabeza despacio hacia tu derecha.' },
  { id: 'ARRIBA', texto: 'Levanta un poco la barbilla, mirando hacia arriba.' },
  { id: 'ABAJO', texto: 'Baja un poco la cabeza, mirando hacia abajo.' },
]

const MINIMO_GUARDAR = 3
// Cuadros seguidos con la pose correcta antes de capturar (evita capturas en movimiento).
const CUADROS_ESTABLES = 3

function RegistroRostroWizard({ nombre, onGuardar, onCancelar }) {
  const [paso, setPaso] = useState(0)
  const [medida, setMedida] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [capturas, setCapturas] = useState({})
  const [guardando, setGuardando] = useState(false)

  const pasoRef = useRef(0)
  const capturasRef = useRef({})
  const establesRef = useRef(0)

  function alRostro(rostro) {
    setMedida(rostro)
    const indice = pasoRef.current
    if (indice >= POSICIONES.length) {
      return
    }

    const esperada = POSICIONES[indice].id
    if (rostro.pose !== esperada) {
      establesRef.current = 0
      setMensaje(`Buscando la posición: ${POSICIONES[indice].texto}`)
      return
    }

    establesRef.current += 1
    if (establesRef.current < CUADROS_ESTABLES) {
      return
    }

    establesRef.current = 0
    capturasRef.current = { ...capturasRef.current, [esperada]: rostro.descriptor }
    setCapturas(capturasRef.current)
    pasoRef.current = indice + 1
    setPaso(indice + 1)
    setMensaje(`Posición ${esperada.toLowerCase()} capturada.`)
  }

  async function guardar() {
    const plantillas = Object.entries(capturasRef.current).map(([pose, descriptor]) => ({
      pose,
      descriptor,
    }))
    setGuardando(true)
    try {
      await onGuardar(plantillas)
    } finally {
      setGuardando(false)
    }
  }

  const completas = Object.keys(capturas).length
  const terminado = paso >= POSICIONES.length

  return (
    <div className="usuarios-registro-rostro">
      <h3>Registrar rostro de {nombre}</h3>
      <p className="page-subtitle">
        Se capturan varias posiciones para que el reconocimiento funcione con distintos ángulos y luces.
      </p>

      <ol className="registro-rostro-pasos">
        {POSICIONES.map((posicion, indice) => (
          <li
            key={posicion.id}
            className={
              capturas[posicion.id]
                ? 'hecho'
                : indice === paso
                  ? 'actual'
                  : ''
            }
          >
            {posicion.id.toLowerCase()}
          </li>
        ))}
      </ol>

      {!terminado && (
        <p role="status">
          <strong>Paso {paso + 1} de {POSICIONES.length}:</strong>{' '}
          {POSICIONES[paso].texto}
        </p>
      )}
      {terminado && (
        <p role="status">Todas las posiciones están capturadas. Puedes guardar.</p>
      )}

      {!terminado && (
        <CamaraFacial activa onRostro={alRostro} />
      )}

      {mensaje && <p className="page-subtitle">{mensaje}</p>}

      {medida && (
        <p className="page-subtitle registro-rostro-medida">
          Pose detectada: {medida.pose.toLowerCase()} · giro {medida.yaw} · razón nariz-mentón {medida.razon}
        </p>
      )}

      <div className="usuarios-acciones">
        <button
          type="button"
          className="button"
          disabled={completas < MINIMO_GUARDAR || guardando}
          onClick={guardar}
        >
          {guardando ? 'Guardando...' : `Guardar rostro (${completas}/${POSICIONES.length})`}
        </button>
        <button type="button" className="button button-outline" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default RegistroRostroWizard
