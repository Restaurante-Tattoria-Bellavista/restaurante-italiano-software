// Elementos decorativos del plano (plantas, barra, cocina...). Son solo visuales: no reciben clics.

function Planta({ style, grande = false }) {
  return (
    <svg
      className={`deco deco-planta ${grande ? 'deco-planta-grande' : ''}`}
      style={style}
      viewBox="0 0 60 60"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="31" cy="34" r="22" fill="rgb(0 0 0 / 22%)" />
      <circle cx="30" cy="30" r="22" fill="#b9825a" stroke="#7d5232" strokeWidth="2" />
      <circle cx="30" cy="30" r="17" fill="#4b3326" />
      <g fill="#3f8a43" stroke="#2c6a31" strokeWidth="0.8">
        <ellipse cx="30" cy="16" rx="6" ry="11" />
        <ellipse cx="44" cy="30" rx="11" ry="6" />
        <ellipse cx="30" cy="44" rx="6" ry="11" />
        <ellipse cx="16" cy="30" rx="11" ry="6" />
      </g>
      <g fill="#58a95c">
        <ellipse cx="38" cy="22" rx="5" ry="9" transform="rotate(45 38 22)" />
        <ellipse cx="38" cy="38" rx="5" ry="9" transform="rotate(135 38 38)" />
        <ellipse cx="22" cy="38" rx="5" ry="9" transform="rotate(225 22 38)" />
        <ellipse cx="22" cy="22" rx="5" ry="9" transform="rotate(315 22 22)" />
      </g>
      <circle cx="30" cy="30" r="3" fill="#2f6b34" />
    </svg>
  )
}

function Banco({ style }) {
  return <i className="deco deco-banco" style={style} aria-hidden="true" />
}

// Cada zona del plano lleva su propia decoración (posiciones en % de la zona).
function DecoracionZona({ zona }) {
  switch (zona) {
    case 'terraza':
      return (
        <>
          <Planta style={{ left: '1%', top: '38%' }} />
          <Planta style={{ right: '1%', top: '38%' }} />
          <Planta style={{ left: '46%', bottom: '2%' }} />
        </>
      )
    case 'salon':
      return (
        <>
          <Planta style={{ left: '1%', top: '9%' }} grande />
          <Planta style={{ right: '1%', top: '1%' }} grande />
          <Planta style={{ left: '1%', bottom: '1%' }} grande />
          <i className="deco deco-alfombra" aria-hidden="true" />
        </>
      )
    case 'barra':
      return (
        <>
          <i className="deco deco-estante" aria-hidden="true">
            <b /><b /><b /><b /><b /><b />
          </i>
          <i className="deco deco-mostrador" aria-hidden="true" />
          {[12, 30, 48, 66, 84].map((izq) => (
            <Banco key={izq} style={{ left: `${izq}%`, bottom: '3%' }} />
          ))}
        </>
      )
    case 'vip':
      return (
        <>
          <i className="deco deco-alfombra-vip" aria-hidden="true" />
          <Planta style={{ right: '2%', top: '12%' }} />
          <Planta style={{ left: '2%', bottom: '2%' }} />
        </>
      )
    case 'recepcion':
      return (
        <>
          <i className="deco deco-recepcion" aria-hidden="true" />
          <Planta style={{ right: '3%', top: '12%' }} />
        </>
      )
    case 'cocina':
      return (
        <>
          <i className="deco deco-meson" aria-hidden="true" />
          <i className="deco deco-estufa" aria-hidden="true">
            <b /><b /><b /><b />
          </i>
          <i className="deco deco-paso" aria-hidden="true" />
        </>
      )
    default:
      return null
  }
}

export default DecoracionZona
