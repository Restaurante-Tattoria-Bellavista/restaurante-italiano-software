import { useRef, useState } from 'react'

const nombresEstados = {
  LIBRE: 'Libre',
  RESERVADA: 'Reservada',
  OCUPADA: 'Ocupada',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
}

const nombresZonas = {
  SALON: 'Salón principal',
  TERRAZA: 'Terraza',
  BAR: 'Bar',
  VIP: 'Zona VIP',
  OTRA: 'Otra zona',
}

function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo)
}

function RestaurantMap({
  mesas,
  layouts,
  mesaSeleccionadaId,
  seleccionarMesa,
  modoEdicion,
  actualizarPosicion,
  guardandoId,
}) {
  const planoRef = useRef(null)
  const arrastreRef = useRef(null)
  const [arrastrandoId, setArrastrandoId] =
    useState(null)

  function calcularPosicion(evento) {
    const plano = planoRef.current

    if (!plano) {
      return null
    }

    const limites = plano.getBoundingClientRect()

    const posX = limitar(
      ((evento.clientX - limites.left) /
        limites.width) *
        100,
      4,
      96,
    )

    const posY = limitar(
      ((evento.clientY - limites.top) /
        limites.height) *
        100,
      7,
      93,
    )

    return {
      pos_x: Number(posX.toFixed(2)),
      pos_y: Number(posY.toFixed(2)),
    }
  }

  function iniciarArrastre(evento, mesa) {
    seleccionarMesa(mesa.id)

    if (!modoEdicion || guardandoId === mesa.id) {
      return
    }

    evento.preventDefault()

    evento.currentTarget.setPointerCapture(
      evento.pointerId,
    )

    arrastreRef.current = {
      mesaId: mesa.id,
      pointerId: evento.pointerId,
    }

    setArrastrandoId(mesa.id)

    const posicion = calcularPosicion(evento)

    if (posicion) {
      actualizarPosicion(
        mesa.id,
        posicion,
        false,
      )
    }
  }

  function moverArrastre(evento) {
    const arrastre = arrastreRef.current

    if (
      !arrastre ||
      arrastre.pointerId !== evento.pointerId
    ) {
      return
    }

    const posicion = calcularPosicion(evento)

    if (posicion) {
      actualizarPosicion(
        arrastre.mesaId,
        posicion,
        false,
      )
    }
  }

  function finalizarArrastre(evento) {
    const arrastre = arrastreRef.current

    if (
      !arrastre ||
      arrastre.pointerId !== evento.pointerId
    ) {
      return
    }

    const posicion = calcularPosicion(evento)

    if (posicion) {
      actualizarPosicion(
        arrastre.mesaId,
        posicion,
        true,
      )
    }

    arrastreRef.current = null
    setArrastrandoId(null)
  }

  return (
    <div className="restaurant-map-wrapper">
      <div className="map-legend">
        {Object.entries(nombresEstados).map(
          ([estado, nombre]) => (
            <span key={estado}>
              <i
                className={`legend-dot legend-${estado.toLowerCase()}`}
              />

              {nombre}
            </span>
          ),
        )}
      </div>

      <div
        ref={planoRef}
        className={`restaurant-map ${
          modoEdicion ? 'restaurant-map-editing' : ''
        }`}
        onPointerMove={moverArrastre}
        onPointerUp={finalizarArrastre}
        onPointerCancel={finalizarArrastre}
      >
        <section className="map-zone map-zone-terrace">
          <span>Terraza</span>
        </section>

        <section className="map-zone map-zone-main">
          <span>Salón principal</span>
        </section>

        <section className="map-zone map-zone-bar">
          <span>Bar</span>
        </section>

        <section className="map-zone map-zone-vip">
          <span>Zona VIP</span>
        </section>

        <section className="map-zone map-zone-reception">
          <span>Recepción</span>
        </section>

        <section className="map-zone map-zone-kitchen">
          <span>Cocina</span>
        </section>

        {mesas.map((mesa) => {
          const layout = layouts[mesa.id]

          if (!layout) {
            return null
          }

          const seleccionada =
            Number(mesaSeleccionadaId) ===
            Number(mesa.id)

          const arrastrando =
            arrastrandoId === mesa.id

          const guardando =
            guardandoId === mesa.id

          return (
            <button
              key={mesa.id}
              type="button"
              className={[
                'map-table',
                `map-table-${layout.forma.toLowerCase()}`,
                `map-table-${mesa.estado.toLowerCase()}`,
                seleccionada
                  ? 'map-table-selected'
                  : '',
                arrastrando
                  ? 'map-table-dragging'
                  : '',
                !mesa.activo
                  ? 'map-table-inactive'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: `${layout.pos_x}%`,
                top: `${layout.pos_y}%`,
              }}
              title={`Mesa ${mesa.numero} · ${
                nombresEstados[mesa.estado] ||
                mesa.estado
              } · ${
                nombresZonas[layout.zona] ||
                layout.zona
              }`}
              aria-label={`Mesa ${mesa.numero}, ${
                nombresEstados[mesa.estado] ||
                mesa.estado
              }`}
              onPointerDown={(evento) =>
                iniciarArrastre(evento, mesa)
              }
              onClick={() =>
                seleccionarMesa(mesa.id)
              }
            >
              <span>Mesa</span>

              <strong>{mesa.numero}</strong>

              <small>
                {guardando
                  ? 'Guardando...'
                  : `${mesa.capacidad} personas`}
              </small>
            </button>
          )
        })}

        {mesas.length === 0 && (
          <div className="map-empty">
            No hay mesas disponibles para mostrar.
          </div>
        )}
      </div>

      <div className="map-help">
        {modoEdicion
          ? 'Arrastra las mesas para cambiar su posición. La ubicación se guarda al soltarlas.'
          : 'Selecciona una mesa para consultar su información.'}
      </div>
    </div>
  )
}

export default RestaurantMap