import { useEffect, useRef, type CSSProperties } from 'react'
import type { CalEvent } from '../../../../shared/types'
import { addDays, dateKey, sameDay, startOfDay, startOfWeek } from '../../util'
import { endOf, eventKey, eventsOnDay, startOf, timeLabel } from './events'

interface ViewProps {
  cursor: Date
  events: CalEvent[]
  onOpen(e: CalEvent): void
  onCreate(day: Date, hour?: number): void
}

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

const colorStyle = (e: CalEvent): CSSProperties => ({ '--ev': e.color ?? 'var(--accent)' }) as CSSProperties

function EventChip({ e, day, onOpen }: { e: CalEvent; day?: Date; onOpen(e: CalEvent): void }): JSX.Element {
  return (
    <button className={`ev-chip ${e.allDay ? 'all-day' : ''}`} style={colorStyle(e)} title={e.title} onClick={() => onOpen(e)}>
      <span className="ev-time">{timeLabel(e, day)}</span>
      <span className="ev-title">{e.title}</span>
    </button>
  )
}

export function DayList({ day, events, onOpen, onCreate }: { day: Date } & Omit<ViewProps, 'cursor'>): JSX.Element {
  const list = eventsOnDay(events, day)
  return (
    <div className="day-list">
      <div className="day-list-head">
        <span className="cap">{weekdayLong.format(day)}</span>
        <button className="link-btn" onClick={() => onCreate(day)}>
          Añadir
        </button>
      </div>
      {list.length === 0 ? (
        <p className="muted small-text">Sin eventos.</p>
      ) : (
        list.map((e) => <EventChip key={eventKey(e)} e={e} day={day} onOpen={onOpen} />)
      )}
    </div>
  )
}

export function MonthView({
  cursor,
  events,
  selected,
  onSelect,
  onOpen,
  onCreate
}: ViewProps & { selected: Date; onSelect(d: Date): void }): JSX.Element {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = startOfWeek(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const today = new Date()
  const labels = Array.from({ length: 7 }, (_, i) => weekdayShort.format(addDays(start, i)).replace('.', ''))

  return (
    <div className="month">
      <div className="month-grid">
        {labels.map((l) => (
          <span key={l} className="month-weekday">
            {l.charAt(0).toUpperCase()}
          </span>
        ))}
        {cells.map((d) => {
          const dayEvents = eventsOnDay(events, d)
          const classes = [
            'month-day',
            d.getMonth() !== cursor.getMonth() && 'outside',
            sameDay(d, today) && 'today',
            sameDay(d, selected) && 'selected'
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={dateKey(d)}
              className={classes}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onCreate(d)}
              title={dayEvents.length ? `${dayEvents.length} evento(s)` : undefined}
            >
              <span className="num">{d.getDate()}</span>
              <span className="dots">
                {dayEvents.slice(0, 3).map((e) => (
                  <i key={eventKey(e)} style={colorStyle(e)} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <DayList day={selected} events={events} onOpen={onOpen} onCreate={onCreate} />
    </div>
  )
}

export function WeekView({ cursor, events, onOpen, onCreate }: ViewProps): JSX.Element {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const today = new Date()
  return (
    <div className="week">
      {days.map((d) => {
        const list = eventsOnDay(events, d)
        return (
          <div key={dateKey(d)} className={`week-day ${sameDay(d, today) ? 'today' : ''}`}>
            <button className="week-head" title="Añadir evento este día" onClick={() => onCreate(d)}>
              <span className="wd">{weekdayShort.format(d).replace('.', '')}</span>
              <span className="num">{d.getDate()}</span>
            </button>
            <div className="week-events">
              {list.map((e) => (
                <EventChip key={eventKey(e)} e={e} day={d} onOpen={onOpen} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const HOUR_PX = 44

export function DayView({ cursor, events, onOpen, onCreate }: ViewProps): JSX.Element {
  const day = startOfDay(cursor)
  const list = eventsOnDay(events, day)
  const allDay = list.filter((e) => e.allDay)
  const timed = list.filter((e) => !e.allDay)
  const scroller = useRef<HTMLDivElement>(null)
  const now = new Date()

  useEffect(() => {
    // Al abrir, se ve la hora actual (o las 8:00 si no es hoy).
    const hour = sameDay(day, now) ? Math.max(0, now.getHours() - 1) : 8
    scroller.current?.scrollTo({ top: hour * HOUR_PX })
    // Solo al cambiar de día, no en cada render (now cambia siempre).
  }, [day.getTime()])

  // Columnas sencillas para eventos que se solapan.
  const columns: CalEvent[][] = []
  const placed = timed.map((e) => {
    const s = startOf(e).getTime()
    let col = columns.findIndex((c) => endOf(c[c.length - 1]).getTime() <= s)
    if (col === -1) {
      columns.push([e])
      col = columns.length - 1
    } else columns[col].push(e)
    return { e, col }
  })

  return (
    <div className="dayview">
      {allDay.length > 0 && (
        <div className="dayview-allday">
          {allDay.map((e) => (
            <EventChip key={eventKey(e)} e={e} day={day} onOpen={onOpen} />
          ))}
        </div>
      )}
      <div className="dayview-scroll" ref={scroller}>
        <div className="dayview-grid" style={{ height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <button
              key={h}
              className="hour-row"
              style={{ top: h * HOUR_PX, height: HOUR_PX }}
              title="Añadir evento a esta hora"
              onClick={() => onCreate(day, h)}
            >
              <span className="hour-label">{hourFormat.format(new Date(2000, 0, 1, h))}</span>
            </button>
          ))}
          {sameDay(day, now) && (
            <div className="now-line" style={{ top: (now.getHours() + now.getMinutes() / 60) * HOUR_PX }} />
          )}
          {placed.map(({ e, col }) => {
            const from = Math.max(startOf(e).getTime(), day.getTime())
            const to = Math.min(endOf(e).getTime(), day.getTime() + 86_400_000)
            const top = ((from - day.getTime()) / 3_600_000) * HOUR_PX
            const height = Math.max(22, ((to - from) / 3_600_000) * HOUR_PX - 2)
            const width = 100 / columns.length
            return (
              <button
                key={eventKey(e)}
                className="dayview-event"
                style={{ ...colorStyle(e), top, height, left: `calc(52px + (100% - 56px) * ${(col * width) / 100})`, width: `calc((100% - 56px) * ${width / 100} - 2px)` }}
                title={e.title}
                onClick={() => onOpen(e)}
              >
                <span className="ev-title">{e.title}</span>
                <span className="ev-time">{timeLabel(e, day)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function AgendaView({ cursor, events, onOpen, onCreate }: ViewProps): JSX.Element {
  const start = startOfDay(cursor)
  const days = Array.from({ length: 30 }, (_, i) => addDays(start, i))
    .map((d) => ({ d, list: eventsOnDay(events, d) }))
    .filter(({ list }) => list.length > 0)
  const today = new Date()
  if (days.length === 0) {
    return (
      <div className="agenda-empty">
        <p className="muted">Sin eventos en los próximos 30 días.</p>
        <button className="btn small" onClick={() => onCreate(start)}>
          Añadir evento
        </button>
      </div>
    )
  }
  return (
    <div className="agenda">
      {days.map(({ d, list }) => (
        <section key={dateKey(d)} className="agenda-day">
          <h4 className={sameDay(d, today) ? 'today' : ''}>
            <span className="cap">{weekdayLong.format(d)}</span>
          </h4>
          {list.map((e) => (
            <EventChip key={eventKey(e)} e={e} day={d} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  )
}
