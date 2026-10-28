import { useEffect, useState } from 'react'
import type { Holiday } from '../../../shared/types'
import { Icon } from '../icons'
import { Spinner } from '../ui/controls'
import { confirmDialog } from '../ui/feedback'
import { DAY_MS, fromDateKey, startOfDay, uid } from '../util'
import type { WidgetProps } from './types'

export const COUNTRIES: [string, string][] = [
  ['ES', 'España'],
  ['MX', 'México'],
  ['AR', 'Argentina'],
  ['CO', 'Colombia'],
  ['CL', 'Chile'],
  ['PE', 'Perú'],
  ['UY', 'Uruguay'],
  ['EC', 'Ecuador'],
  ['VE', 'Venezuela'],
  ['US', 'Estados Unidos'],
  ['GB', 'Reino Unido'],
  ['FR', 'Francia'],
  ['DE', 'Alemania'],
  ['IT', 'Italia'],
  ['PT', 'Portugal'],
  ['BR', 'Brasil'],
  ['CA', 'Canadá']
]

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

const daysUntil = (date: string): number => Math.round((fromDateKey(date).getTime() - startOfDay(new Date()).getTime()) / DAY_MS)

function inDays(n: number): string {
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n < 0) return `Hace ${-n} d`
  return `En ${n} d`
}

export function HolidaysWidget({ widget, update }: WidgetProps<'holidays'>): JSX.Element {
  const { country, countdowns } = widget.data
  const [holidays, setHolidays] = useState<Holiday[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const year = new Date().getFullYear()
    setHolidays(null)
    // Este año y el siguiente, para que en diciembre se vean los de enero.
    Promise.all([window.nido.info.holidays(country, year), window.nido.info.holidays(country, year + 1)]).then(([a, b]) => {
      if (!a.ok) {
        setError(a.error)
        setHolidays([])
        return
      }
      setError(null)
      const all = [...a.data, ...(b.ok ? b.data : [])]
      setHolidays(all.filter((h) => daysUntil(h.date) >= 0))
    })
  }, [country])

  const mine = [...countdowns].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="holidays">
      <div className="row">
        <select className="chip-select" aria-label="País" value={country} onChange={(e) => update({ country: e.target.value })}>
          {COUNTRIES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <span className="grow" />
        <button className="btn tiny" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Icon name="plus" size={12} /> Cuenta atrás
        </button>
      </div>
      {adding && (
        <form
          className="link-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim() || !date) return
            update({ countdowns: [...countdowns, { id: uid(), title: title.trim(), date }] })
            setTitle('')
            setDate('')
            setAdding(false)
          }}
        >
          <input className="input tiny" autoFocus placeholder="Vacaciones, cumpleaños…" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input tiny" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="row">
            <button type="button" className="btn tiny" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn tiny primary" disabled={!title.trim() || !date}>
              Añadir
            </button>
          </div>
        </form>
      )}
      <ul className="list scroll">
        {mine.map((c) => {
          const n = daysUntil(c.date)
          return (
            <li key={c.id} className="countdown-row mine">
              <span className={`days-badge ${n < 0 ? 'past' : n <= 7 ? 'soon' : ''}`}>{n < 0 ? '✓' : n}</span>
              <span className="grow">
                <span className="cd-title">{c.title}</span>
                <span className="cd-date">
                  {longDate.format(fromDateKey(c.date))} · {inDays(n)}
                </span>
              </span>
              <button
                className="icon-btn small hover-only"
                title="Quitar"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Quitar cuenta atrás', message: `¿Quitar «${c.title}»?`, confirmLabel: 'Quitar' }))
                    update({ countdowns: countdowns.filter((x) => x.id !== c.id) })
                }}
              >
                <Icon name="close" size={11} />
              </button>
            </li>
          )
        })}
        {holidays === null && (
          <li className="empty">
            <Spinner />
          </li>
        )}
        {holidays?.slice(0, 6).map((h) => {
          const n = daysUntil(h.date)
          return (
            <li key={h.date + h.name} className="countdown-row">
              <span className={`days-badge holiday ${n <= 7 ? 'soon' : ''}`}>{n}</span>
              <span className="grow">
                <span className="cd-title">{h.localName}</span>
                <span className="cd-date">
                  {longDate.format(fromDateKey(h.date))} · {inDays(n)}
                  {!h.global && ' · regional'}
                </span>
              </span>
            </li>
          )
        })}
        {error && <li className="field-error">{error}</li>}
      </ul>
      <p className="source-line muted">Festivos: Nager.Date</p>
    </div>
  )
}
