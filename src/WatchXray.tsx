import { useMemo, useState } from 'react'
import './watch-xray.css'

type WatchXrayProps = {
  maker?: string
  model?: string
  movementMaker?: string
  calibre?: string
  movementType?: string
  escapement?: string
}

type LayerKey = 'case' | 'dial' | 'motion' | 'movement' | 'power' | 'escapement' | 'back'

type Layer = {
  key: LayerKey
  label: string
  detail: string
  slot: number
}

function Gear({ x, y, r, teeth = 12 }: { x: number; y: number; r: number; teeth?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r={r} className="watch-xray-gear" />
    <circle r={Math.max(3, r * .16)} className="watch-xray-pivot" />
    {Array.from({ length: teeth }, (_, index) => <line key={index} x1="0" y1={-r + 2} x2="0" y2={-r - 4} transform={`rotate(${index * 360 / teeth})`} className="watch-xray-tooth" />)}
  </g>
}

export default function WatchXray({ maker, model, movementMaker, calibre, movementType, escapement }: WatchXrayProps) {
  const [separation, setSeparation] = useState(46)
  const [selected, setSelected] = useState<LayerKey>('movement')

  const layers = useMemo<Layer[]>(() => {
    const movementIdentity = calibre
      ? `${movementMaker ? `${movementMaker} ` : ''}Cal. ${calibre}${movementType ? ` · ${movementType}` : ''}`
      : movementType || 'Movement identity not yet documented'
    const escapementIdentity = escapement || 'Escapement type not yet documented'
    return [
      { key: 'case', label: 'Crystal & case', slot: -3, detail: 'The protective crystal, bezel and front case structure.' },
      { key: 'dial', label: 'Dial & hands', slot: -2, detail: 'The visible time display: dial, hour hand, minute hand and seconds indication where fitted.' },
      { key: 'motion', label: 'Motion works', slot: -1, detail: 'The gearing that carries motion from the movement to the hands and allows hand-setting.' },
      { key: 'movement', label: 'Movement', slot: 0, detail: movementIdentity },
      { key: 'power', label: 'Power train', slot: 1, detail: 'A schematic view of the mainspring barrel and wheel train that stores and transmits power.' },
      { key: 'escapement', label: 'Escapement & balance', slot: 2, detail: escapementIdentity },
      { key: 'back', label: 'Caseback', slot: 3, detail: 'The rear case closure protecting the movement.' },
    ]
  }, [calibre, escapement, movementMaker, movementType])

  const factor = separation / 100
  const x = (slot: number) => 380 + slot * 58 * factor
  const selectedLayer = layers.find((layer) => layer.key === selected) ?? layers[3]
  const watchName = [maker, model].filter(Boolean).join(' ') || 'this watch'

  return <section className="watch-xray" aria-labelledby="watch-xray-title">
    <div className="watch-xray-heading">
      <div>
        <p className="eyebrow">INTERACTIVE X-RAY</p>
        <h2 id="watch-xray-title">Pull the watch apart</h2>
        <p>Drag the control to separate the layers of {watchName}. Tap a component to inspect what it represents.</p>
      </div>
      <div className="watch-xray-actions">
        <button type="button" onClick={() => setSeparation(100)}>Explode</button>
        <button type="button" onClick={() => setSeparation(0)}>Reassemble</button>
      </div>
    </div>

    <div className="watch-xray-stage">
      <svg viewBox="0 0 760 390" role="img" aria-label={`Exploded schematic of ${watchName}`} focusable="false">
        <defs>
          <radialGradient id="watchXrayGlass" cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".5" />
            <stop offset="75%" stopColor="#9eb7ba" stopOpacity=".12" />
            <stop offset="100%" stopColor="#405659" stopOpacity=".2" />
          </radialGradient>
          <linearGradient id="watchXrayMetal" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e7e1d5" />
            <stop offset="55%" stopColor="#a9aaa2" />
            <stop offset="100%" stopColor="#6d7471" />
          </linearGradient>
        </defs>

        <line x1={x(-3)} y1="195" x2={x(3)} y2="195" className="watch-xray-axis" />

        <g transform={`translate(${x(-3)} 195)`} className={`watch-xray-layer ${selected === 'case' ? 'selected' : ''}`}>
          <path d="M-72 -54 L-91 -74 L-108 -74 L-108 -57 L-86 -45 M72 -54 L91 -74 L108 -74 L108 -57 L86 -45 M-72 54 L-91 74 L-108 74 L-108 57 L-86 45 M72 54 L91 74 L108 74 L108 57 L86 45" className="watch-xray-metal-line" />
          <circle r="84" className="watch-xray-metal" />
          <circle r="70" fill="url(#watchXrayGlass)" className="watch-xray-glass" />
          <rect x="82" y="-10" width="23" height="20" rx="5" className="watch-xray-metal" />
          <circle cx="109" cy="0" r="8" className="watch-xray-metal" />
        </g>

        <g transform={`translate(${x(-2)} 195)`} className={`watch-xray-layer ${selected === 'dial' ? 'selected' : ''}`}>
          <circle r="68" className="watch-xray-dial" />
          {Array.from({ length: 12 }, (_, index) => <line key={index} x1="0" y1="-52" x2="0" y2="-60" transform={`rotate(${index * 30})`} className="watch-xray-marker" />)}
          <circle r="4" className="watch-xray-pivot" />
          <line x1="0" y1="2" x2="-22" y2="-31" className="watch-xray-hand hour" />
          <line x1="0" y1="2" x2="31" y2="-43" className="watch-xray-hand minute" />
          <line x1="0" y1="8" x2="0" y2="47" className="watch-xray-hand seconds" />
        </g>

        <g transform={`translate(${x(-1)} 195)`} className={`watch-xray-layer ${selected === 'motion' ? 'selected' : ''}`}>
          <circle r="62" className="watch-xray-plate faint" />
          <Gear x={-22} y={-8} r={27} teeth={14} />
          <Gear x={24} y={20} r={21} teeth={12} />
          <Gear x={23} y={-28} r={13} teeth={10} />
        </g>

        <g transform={`translate(${x(0)} 195)`} className={`watch-xray-layer ${selected === 'movement' ? 'selected' : ''}`}>
          <circle r="73" className="watch-xray-plate" />
          <path d="M-54 -31 C-22 -59 24 -60 54 -34 L44 -4 C14 -14 -17 -12 -44 4 Z" className="watch-xray-bridge" />
          <path d="M-46 22 C-12 7 20 12 51 36 L34 55 C6 37 -18 36 -42 47 Z" className="watch-xray-bridge" />
          <Gear x={-28} y={16} r={18} teeth={12} />
          <Gear x={20} y={13} r={24} teeth={14} />
          <circle cx="48" cy="-35" r="5" className="watch-xray-jewel" />
          <circle cx="-43" cy="-28" r="5" className="watch-xray-jewel" />
          <circle cx="3" cy="46" r="4" className="watch-xray-jewel" />
        </g>

        <g transform={`translate(${x(1)} 195)`} className={`watch-xray-layer ${selected === 'power' ? 'selected' : ''}`}>
          <circle r="61" className="watch-xray-plate faint" />
          <circle cx="-18" cy="1" r="37" className="watch-xray-barrel" />
          <path d="M-18 1 c0 -24 31 -24 31 0 c0 19 -25 19 -25 0 c0 -13 17 -13 17 0 c0 8 -11 8 -11 0" className="watch-xray-spring" />
          <Gear x={35} y={-23} r={18} teeth={12} />
          <Gear x={37} y={28} r={14} teeth={10} />
        </g>

        <g transform={`translate(${x(2)} 195)`} className={`watch-xray-layer ${selected === 'escapement' ? 'selected' : ''}`}>
          <circle r="61" className="watch-xray-plate faint" />
          <circle cx="8" cy="6" r="42" className="watch-xray-balance" />
          <circle cx="8" cy="6" r="29" className="watch-xray-hairspring" />
          <circle cx="8" cy="6" r="4" className="watch-xray-jewel" />
          <path d="M-48 -25 L-19 -3 L-35 25 M-19 -3 L-8 20" className="watch-xray-fork" />
          <Gear x={-38} y={-35} r={14} teeth={15} />
        </g>

        <g transform={`translate(${x(3)} 195)`} className={`watch-xray-layer ${selected === 'back' ? 'selected' : ''}`}>
          <circle r="82" className="watch-xray-metal" />
          <circle r="68" className="watch-xray-back-inner" />
          <circle r="45" className="watch-xray-back-ring" />
          <path d="M-34 0 H34 M0 -34 V34" className="watch-xray-back-mark" />
        </g>
      </svg>
      <div className="watch-xray-scale" aria-hidden="true"><span>ASSEMBLED</span><span>EXPLODED</span></div>
    </div>

    <div className="watch-xray-control">
      <label htmlFor="watch-xray-separation">Pull apart <strong>{separation}%</strong></label>
      <input id="watch-xray-separation" type="range" min="0" max="100" step="1" value={separation} onChange={(event) => setSeparation(Number(event.target.value))} aria-valuetext={`${separation}% separated`} />
    </div>

    <div className="watch-xray-layers" aria-label="Watch layers">
      {layers.map((layer) => <button key={layer.key} type="button" className={selected === layer.key ? 'selected' : ''} onClick={() => setSelected(layer.key)}>{layer.label}</button>)}
    </div>

    <div className="watch-xray-detail" aria-live="polite">
      <span>{selectedLayer.label}</span>
      <strong>{selectedLayer.detail}</strong>
    </div>
    <p className="watch-xray-note">Exploded schematic for interpretation only. It shows the component stack and documented movement identity, not an exact technical drawing of this calibre unless specifically stated in the watch record.</p>
  </section>
}
