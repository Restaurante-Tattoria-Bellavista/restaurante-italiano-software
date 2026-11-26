// Mesa vista desde arriba: mantel, sillas alrededor, platos y vela. El color del mantel indica el estado.
const MANTEL = {
  LIBRE: { tela: '#2f9e7e', borde: '#1f7a60', brillo: '#6fd0b3' },
  RESERVADA: { tela: '#e3a92c', borde: '#b27e12', brillo: '#f6cf74' },
  OCUPADA: { tela: '#d6534b', borde: '#a63a33', brillo: '#ee948d' },
  FUERA_DE_SERVICIO: { tela: '#8d8882', borde: '#66615c', brillo: '#b9b4ae' },
}

function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo)
}

// Silla de madera: asiento y respaldo (el respaldo queda hacia afuera de la mesa, en y negativo).
function Silla({ x, y, giro = 0, fuera }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro})`} opacity={fuera ? 0.55 : 1}>
      <rect x="-8.5" y="-6" width="17" height="12.5" rx="4.5" fill="#7a5238" stroke="#4a2f1f" strokeWidth="1" />
      <rect x="-8.5" y="-8.5" width="17" height="4" rx="2" fill="#5a3a26" stroke="#3b2417" strokeWidth="0.8" />
      <rect x="-5.5" y="-3.5" width="11" height="7" rx="3" fill="#9a6c4a" opacity="0.55" />
    </g>
  )
}

// Cubierto: plato blanco; con comensales (mesa ocupada) tiene comida.
function Plato({ x, y, comida }) {
  return (
    <g>
      <circle cx={x} cy={y} r="4.6" fill="#fbfaf7" stroke="#cfc8bd" strokeWidth="0.8" />
      <circle cx={x} cy={y} r="2.7" fill="none" stroke="#e6e0d6" strokeWidth="0.6" />
      {comida && <circle cx={x - 0.4} cy={y} r="1.9" fill="#e0883a" />}
      {comida && <circle cx={x + 1.2} cy={y + 0.6} r="0.9" fill="#6b9a3f" />}
    </g>
  )
}

function Vela({ cx, cy, encendida }) {
  return (
    <g>
      {encendida && <circle cx={cx} cy={cy} r="5.5" fill="#ffd77a" opacity="0.35" />}
      <circle cx={cx} cy={cy} r="2.2" fill="#f4efe4" stroke="#bdb5a6" strokeWidth="0.6" />
      <circle cx={cx} cy={cy} r="0.9" fill={encendida ? '#ff9d2e' : '#9b9488'} />
    </g>
  )
}

// Número de la mesa en una "etiqueta" blanca para que se lea sobre cualquier mantel.
function Numero({ cx, cy, numero, ancho }) {
  const texto = String(numero)
  const w = Math.max(ancho, texto.length * 8 + 8)
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - 8.5}
        width={w}
        height="17"
        rx="8.5"
        fill="#fffdf9"
        stroke="rgb(0 0 0 / 22%)"
        strokeWidth="0.8"
      />
      <text
        x={cx}
        y={cy + 0.8}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12.5"
        fontWeight="800"
        fill="#21302a"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {texto}
      </text>
    </g>
  )
}

function MesaVisual({ forma, estado, capacidad, numero }) {
  const color = MANTEL[estado] || MANTEL.LIBRE
  const fuera = estado === 'FUERA_DE_SERVICIO'
  const ocupada = estado === 'OCUPADA'
  const sillas = limitar(Number(capacidad) || 2, 1, forma === 'RECT' ? 10 : 8)

  if (forma === 'RECT') {
    const arriba = Math.ceil(sillas / 2)
    const abajo = Math.floor(sillas / 2)
    const x0 = 22
    const ancho = 96
    const posiciones = (n) =>
      Array.from({ length: n }, (_, i) => x0 + (ancho / n) * (i + 0.5))
    return (
      <svg className="mesa-svg" viewBox="0 0 140 100" aria-hidden="true" focusable="false">
        <rect x="23" y="31" width="96" height="46" rx="10" fill="rgb(0 0 0 / 28%)" />
        {posiciones(arriba).map((x) => (
          <Silla key={`a${x}`} x={x} y={19} giro={0} fuera={fuera} />
        ))}
        {posiciones(abajo).map((x) => (
          <Silla key={`b${x}`} x={x} y={81} giro={180} fuera={fuera} />
        ))}
        <rect x="21" y="27" width="96" height="46" rx="10" fill={color.tela} stroke={color.borde} strokeWidth="2" />
        <rect x="26" y="32" width="86" height="36" rx="7" fill="none" stroke={color.brillo} strokeWidth="1" opacity="0.7" />
        {!fuera &&
          posiciones(arriba).map((x) => <Plato key={`pa${x}`} x={x} y={37} comida={ocupada} />)}
        {!fuera &&
          posiciones(abajo).map((x) => <Plato key={`pb${x}`} x={x} y={63} comida={ocupada} />)}
        {!fuera && <Vela cx={36} cy={50} encendida={ocupada} />}
        {!fuera && <Vela cx={102} cy={50} encendida={ocupada} />}
        <Numero cx={69} cy={50} numero={numero} ancho={26} />
      </svg>
    )
  }

  if (forma === 'SMALL') {
    const laterales = sillas > 2
    return (
      <svg className="mesa-svg" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <rect x="23" y="25" width="36" height="36" rx="9" fill="rgb(0 0 0 / 28%)" />
        <Silla x={40} y={11} giro={0} fuera={fuera} />
        <Silla x={40} y={69} giro={180} fuera={fuera} />
        {laterales && <Silla x={11} y={40} giro={-90} fuera={fuera} />}
        {laterales && <Silla x={69} y={40} giro={90} fuera={fuera} />}
        <rect x="22" y="22" width="36" height="36" rx="9" fill={color.tela} stroke={color.borde} strokeWidth="2" />
        <rect x="27" y="27" width="26" height="26" rx="6" fill="none" stroke={color.brillo} strokeWidth="1" opacity="0.7" />
        {!fuera && <Plato x={40} y={30} comida={ocupada} />}
        {!fuera && <Plato x={40} y={50} comida={ocupada} />}
        <Numero cx={40} cy={40} numero={numero} ancho={20} />
      </svg>
    )
  }

  // ROUND
  const centro = 50
  const radioSillas = 40
  const radioPlatos = 17
  const angulos = Array.from({ length: sillas }, (_, i) => (360 / sillas) * i - 90)
  const punto = (grados, radio) => [
    centro + radio * Math.cos((grados * Math.PI) / 180),
    centro + radio * Math.sin((grados * Math.PI) / 180),
  ]

  return (
    <svg className="mesa-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="51" cy="54" r="30" fill="rgb(0 0 0 / 28%)" />
      {angulos.map((grados) => {
        const [x, y] = punto(grados, radioSillas)
        return <Silla key={`s${grados}`} x={x} y={y} giro={grados + 90} fuera={fuera} />
      })}
      <circle cx={centro} cy={centro} r="29" fill={color.tela} stroke={color.borde} strokeWidth="2" />
      <circle cx={centro} cy={centro} r="24" fill="none" stroke={color.brillo} strokeWidth="1" opacity="0.7" />
      {!fuera &&
        angulos.map((grados) => {
          const [x, y] = punto(grados, radioPlatos)
          return <Plato key={`p${grados}`} x={x} y={y} comida={ocupada} />
        })}
      <Numero cx={centro} cy={centro} numero={numero} ancho={20} />
    </svg>
  )
}

export default MesaVisual
