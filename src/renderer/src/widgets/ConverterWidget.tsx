import { useEffect, useState } from 'react'
import type { CurrencyRates } from '../../../shared/types'
import { Icon } from '../icons'
import { Segmented, Spinner } from '../ui/controls'
import type { WidgetProps } from './types'

// Unidades: factores respecto a una unidad base de cada categoría (sin conexión).
// Temperatura va aparte porque no es proporcional.
const UNITS: Record<string, { label: string; units: Record<string, [string, number]> }> = {
  longitud: { label: 'Longitud', units: { mm: ['milímetros', 0.001], cm: ['centímetros', 0.01], m: ['metros', 1], km: ['kilómetros', 1000], in: ['pulgadas', 0.0254], ft: ['pies', 0.3048], yd: ['yardas', 0.9144], mi: ['millas', 1609.344] } },
  masa: { label: 'Masa', units: { mg: ['miligramos', 1e-6], g: ['gramos', 0.001], kg: ['kilos', 1], t: ['toneladas', 1000], oz: ['onzas', 0.028349523125], lb: ['libras', 0.45359237] } },
  volumen: { label: 'Volumen', units: { ml: ['mililitros', 0.001], l: ['litros', 1], m3: ['metros³', 1000], tsp: ['cucharaditas (US)', 0.00492892159], cup: ['tazas (US)', 0.2365882365], gal: ['galones (US)', 3.785411784] } },
  velocidad: { label: 'Velocidad', units: { kmh: ['km/h', 1 / 3.6], ms: ['m/s', 1], mph: ['mph', 0.44704], kn: ['nudos', 0.514444] } },
  superficie: { label: 'Superficie', units: { m2: ['m²', 1], km2: ['km²', 1e6], ha: ['hectáreas', 1e4], ft2: ['pies²', 0.09290304], ac: ['acres', 4046.8564224] } },
  datos: { label: 'Datos', units: { B: ['bytes', 1], KB: ['KB', 1e3], MB: ['MB', 1e6], GB: ['GB', 1e9], TB: ['TB', 1e12], KiB: ['KiB', 1024], MiB: ['MiB', 1024 ** 2], GiB: ['GiB', 1024 ** 3] } },
  temperatura: { label: 'Temperatura', units: { c: ['°C', 0], f: ['°F', 0], k: ['K', 0] } }
}

function convertTemp(v: number, from: string, to: string): number {
  const c = from === 'c' ? v : from === 'f' ? ((v - 32) * 5) / 9 : v - 273.15
  return to === 'c' ? c : to === 'f' ? (c * 9) / 5 + 32 : c + 273.15
}

const num = (s: string): number => Number(s.replace(',', '.'))
const out = (n: number): string => (Number.isFinite(n) ? new Intl.NumberFormat(undefined, { maximumSignificantDigits: 10 }).format(n) : '—')

const CURRENCY_NAMES = new Intl.DisplayNames(undefined, { type: 'currency' })

export function ConverterWidget({ widget, update }: WidgetProps<'converter'>): JSX.Element {
  const d = widget.data
  const [rates, setRates] = useState<CurrencyRates | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (d.mode !== 'currency') return
    setRates(null)
    window.nido.info.rates(d.currency.from).then((r) => {
      if (r.ok) {
        setRates(r.data)
        setError(null)
      } else setError(r.error)
    })
  }, [d.mode, d.currency.from])

  const cat = UNITS[d.units.category] ?? UNITS.longitud
  const unitKeys = Object.keys(cat.units)
  const from = unitKeys.includes(d.units.from) ? d.units.from : unitKeys[0]
  const to = unitKeys.includes(d.units.to) ? d.units.to : unitKeys[1]
  const value = num(d.units.value)
  const unitResult =
    d.units.category === 'temperatura' ? convertTemp(value, from, to) : (value * cat.units[from][1]) / cat.units[to][1]

  const amount = num(d.currency.amount)
  const rate = rates?.rates[d.currency.to]
  const currencies = rates ? Object.keys(rates.rates).sort() : [d.currency.from, d.currency.to]
  const dateLabel = rates ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${rates.date}T12:00:00`)) : ''

  return (
    <div className="converter">
      <Segmented
        label="Tipo de conversión"
        className="full compact"
        value={d.mode}
        options={[
          { value: 'units', label: 'Unidades' },
          { value: 'currency', label: 'Divisas' }
        ]}
        onChange={(mode) => update({ mode })}
      />
      {d.mode === 'units' ? (
        <>
          <select
            className="input tiny"
            aria-label="Magnitud"
            value={d.units.category}
            onChange={(e) => {
              const keys = Object.keys(UNITS[e.target.value].units)
              update({ units: { ...d.units, category: e.target.value, from: keys[0], to: keys[1] } })
            }}
          >
            {Object.entries(UNITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <div className="conv-row">
            <input className="input mono" inputMode="decimal" aria-label="Valor" value={d.units.value} onChange={(e) => update({ units: { ...d.units, value: e.target.value } })} />
            <select className="input" aria-label="De" value={from} onChange={(e) => update({ units: { ...d.units, from: e.target.value } })}>
              {unitKeys.map((k) => (
                <option key={k} value={k}>
                  {cat.units[k][0]}
                </option>
              ))}
            </select>
          </div>
          <button className="icon-btn swap-btn" title="Intercambiar" onClick={() => update({ units: { ...d.units, from: to, to: from } })}>
            <Icon name="swap" size={14} />
          </button>
          <div className="conv-row">
            <output className="conv-result mono">{out(unitResult)}</output>
            <select className="input" aria-label="A" value={to} onChange={(e) => update({ units: { ...d.units, to: e.target.value } })}>
              {unitKeys.map((k) => (
                <option key={k} value={k}>
                  {cat.units[k][0]}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <div className="conv-row">
            <input className="input mono" inputMode="decimal" aria-label="Cantidad" value={d.currency.amount} onChange={(e) => update({ currency: { ...d.currency, amount: e.target.value } })} />
            <select className="input" aria-label="De" value={d.currency.from} onChange={(e) => update({ currency: { ...d.currency, from: e.target.value } })}>
              {currencies.map((c) => (
                <option key={c} value={c} title={CURRENCY_NAMES.of(c)}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button className="icon-btn swap-btn" title="Intercambiar" onClick={() => update({ currency: { ...d.currency, from: d.currency.to, to: d.currency.from } })}>
            <Icon name="swap" size={14} />
          </button>
          <div className="conv-row">
            <output className="conv-result mono">{rate === undefined ? (error ? '—' : <Spinner size={12} />) : out(amount * rate)}</output>
            <select className="input" aria-label="A" value={d.currency.to} onChange={(e) => update({ currency: { ...d.currency, to: e.target.value } })}>
              {currencies.map((c) => (
                <option key={c} value={c} title={CURRENCY_NAMES.of(c)}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p className="field-error">{error}</p>
          ) : (
            rates && (
              <p className="source-line muted" title="Tipos de referencia del Banco Central Europeo servidos por Frankfurter">
                1 {d.currency.from} = {out(rate ?? NaN)} {d.currency.to} · BCE, {dateLabel}
              </p>
            )
          )}
        </>
      )}
    </div>
  )
}
