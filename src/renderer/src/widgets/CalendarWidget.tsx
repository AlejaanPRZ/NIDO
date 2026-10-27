import { useMemo, useState } from 'react'
import { dateKey, uid } from '../util'
import { Icon } from '../icons'
import type { WidgetProps } from './types'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

/** 42 celdas (6 semanas) empezando en lunes. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i))
}

export function CalendarWidget({ widget, update }: WidgetProps<'calendar'>): JSX.Element {
  const today = dateKey(new Date())
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState(today)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')

  const { events } = widget.data
  const daysWithEvents = useMemo(() => new Set(events.map((e) => e.date)), [events])
  const dayEvents = events
    .filter((e) => e.date === selected)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const cells = monthGrid(cursor.year, cursor.month)
  const [sy, sm, sd] = selected.split('-').map(Number)

  const shiftMonth = (delta: number): void => {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }

  const goToday = (): void => {
    const d = new Date()
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setSelected(today)
  }

  const addEvent = (): void => {
    const text = title.trim()
    if (!text) return
    update({ events: [...events, { id: uid(), date: selected, time: time || undefined, title: text }] })
    setTitle('')
    setTime('')
  }

  return (
    <div className="calendar">
      <div className="row cal-head">
        <button className="icon-btn" title="Mes anterior" onClick={() => shiftMonth(-1)}>
          <Icon name="chevronLeft" />
        </button>
        <span className="cal-month grow">{monthFormat.format(new Date(cursor.year, cursor.month, 1))}</span>
        <button className="pill small" onClick={goToday}>
          Hoy
        </button>
        <button className="icon-btn" title="Mes siguiente" onClick={() => shiftMonth(1)}>
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className="cal-weekday muted">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const key = dateKey(d)
          const classes = [
            'cal-day',
            d.getMonth() !== cursor.month && 'outside',
            key === today && 'today',
            key === selected && 'selected',
            daysWithEvents.has(key) && 'has-events'
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={key} className={classes} onClick={() => setSelected(key)}>
              {d.getDate()}
            </button>
          )
        })}
      </div>

      <div className="cal-agenda">
        <div className="cal-agenda-title">{dayFormat.format(new Date(sy, sm - 1, sd))}</div>
        <ul className="list scroll">
          {dayEvents.length === 0 && <li className="empty muted">Sin eventos este día.</li>}
          {dayEvents.map((ev) => (
            <li key={ev.id} className="event">
              <span className="event-time">{ev.time ?? '—'}</span>
              <span className="grow">{ev.title}</span>
              <button
                className="icon-btn"
                title="Eliminar evento"
                onClick={() => update({ events: events.filter((e) => e.id !== ev.id) })}
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            addEvent()
          }}
        >
          <input className="input time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <input className="input grow" value={title} placeholder="Nuevo evento" onChange={(e) => setTitle(e.target.value)} />
          <button className="pill dark round" type="submit" title="Añadir evento" disabled={!title.trim()}>
            <Icon name="plus" size={14} />
          </button>
        </form>
      </div>
    </div>
  )
}
