import { useMemo, useState } from 'react'
import { useActive, useApp, useNow } from '../context'
import { Icon } from '../icons'
import { normalizeText, uid } from '../util'
import type { WidgetProps } from './types'

const ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Mexico_City', 'Asia/Tokyo']
  }
})()

const cityOf = (tz: string): string => tz.split('/').pop()!.replace(/_/g, ' ')

/** Minutos de diferencia de una zona respecto a UTC en un instante. */
function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(at)
    .reduce<Record<string, number>>((acc, p) => (p.type !== 'literal' ? { ...acc, [p.type]: Number(p.value) } : acc), {})
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return Math.round((asUtc - at.getTime()) / 60_000)
}

export function WorldClockWidget({ widget, update }: WidgetProps<'worldclock'>): JSX.Element {
  const { settings } = useApp()
  const now = useNow(1000, useActive())
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const local = -now.getTimezoneOffset()

  const matches = useMemo(() => {
    const q = normalizeText(query.trim())
    if (q.length < 2) return []
    return ZONES.filter((z) => normalizeText(z.replace(/_/g, ' ')).includes(q)).slice(0, 8)
  }, [query])

  return (
    <div className="worldclock">
      <ul className="clock-list scroll">
        {widget.data.zones.map((z) => {
          const diff = offsetMinutes(z.tz, now) - local
          const time = new Intl.DateTimeFormat(undefined, { timeZone: z.tz, hour: 'numeric', minute: '2-digit', hour12: settings.clock.hour12 }).format(now)
          const day = new Intl.DateTimeFormat(undefined, { timeZone: z.tz, weekday: 'short' }).format(now)
          const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: z.tz, hour: 'numeric', hourCycle: 'h23' }).format(now))
          const night = hour < 7 || hour >= 21
          const sign = diff === 0 ? 'Misma hora' : `${diff > 0 ? '+' : '−'}${Math.abs(diff) / 60} h`
          return (
            <li key={z.id} className="zone">
              <span className={`zone-dot ${night ? 'night' : 'day'}`} title={night ? 'Noche' : 'Día'} />
              <span className="zone-text">
                <span className="zone-name">{z.label}</span>
                <span className="zone-meta">
                  <span className="cap">{day.replace('.', '')}</span> · {sign}
                </span>
              </span>
              <span className="zone-time mono">{time}</span>
              <button
                className="icon-btn small hover-only"
                title={`Quitar ${z.label}`}
                onClick={() => update({ zones: widget.data.zones.filter((x) => x.id !== z.id) })}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          )
        })}
        {widget.data.zones.length === 0 && <li className="empty muted">Añade una ciudad.</li>}
      </ul>
      {adding ? (
        <div className="zone-search">
          <input
            className="input tiny"
            autoFocus
            placeholder="Ciudad o zona (p. ej. Bogotá)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAdding(false))}
          />
          {matches.length > 0 && (
            <div className="suggestions">
              {matches.map((tz) => (
                <button
                  key={tz}
                  className="list-btn"
                  onClick={() => {
                    update({ zones: [...widget.data.zones, { id: uid(), label: cityOf(tz), tz }] })
                    setQuery('')
                    setAdding(false)
                  }}
                >
                  <span className="grow">{cityOf(tz)}</span>
                  <span className="muted small-text">{tz.split('/')[0]}</span>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && matches.length === 0 && (
            <p className="muted small-text">Sin resultados. Prueba en inglés (p. ej. «Sao Paulo»).</p>
          )}
        </div>
      ) : (
        <button className="link-btn add-link" onClick={() => setAdding(true)}>
          <Icon name="plus" size={12} /> Añadir ciudad
        </button>
      )}
    </div>
  )
}
