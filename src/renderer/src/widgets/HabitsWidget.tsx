import { useState } from 'react'
import type { Habit } from '../../../shared/types'
import { Icon } from '../icons'
import { confirmDialog } from '../ui/feedback'
import { addDays, dateKey, startOfDay, uid } from '../util'
import type { WidgetProps } from './types'

const COLORS = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5af2', '#ff375f', '#40c8e0']
const dayLetter = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/** Días seguidos cumplidos hasta hoy (o hasta ayer, si hoy aún no). */
function streak(days: Set<string>): number {
  let d = startOfDay(new Date())
  if (!days.has(dateKey(d))) d = addDays(d, -1)
  let n = 0
  while (days.has(dateKey(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function HabitsWidget({ widget, update }: WidgetProps<'habits'>): JSX.Element {
  const [draft, setDraft] = useState('')
  const { habits } = widget.data
  const today = startOfDay(new Date())
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  const setHabit = (id: string, fn: (h: Habit) => Habit): void => update({ habits: habits.map((h) => (h.id === id ? fn(h) : h)) })

  const toggle = (h: Habit, day: Date): void => {
    const key = dateKey(day)
    setHabit(h.id, (x) => ({ ...x, days: x.days.includes(key) ? x.days.filter((d) => d !== key) : [...x.days, key].sort() }))
  }

  const add = (): void => {
    const name = draft.trim()
    if (!name) return
    update({ habits: [...habits, { id: uid(), name, color: COLORS[habits.length % COLORS.length], days: [] }] })
    setDraft('')
  }

  const remove = async (h: Habit): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Eliminar hábito',
      message: `¿Eliminar «${h.name}» y sus ${h.days.length} días registrados?`,
      confirmLabel: 'Eliminar',
      danger: true
    })
    if (ok) update({ habits: habits.filter((x) => x.id !== h.id) })
  }

  const doneToday = habits.filter((h) => h.days.includes(dateKey(today))).length

  return (
    <div className="habits">
      {habits.length > 0 && (
        <div className="habit-head">
          <span className="grow muted small-text">
            Hoy {doneToday}/{habits.length}
          </span>
          {week.map((d) => (
            <span key={d.getTime()} className={`habit-day-label ${d.getTime() === today.getTime() ? 'today' : ''}`}>
              {dayLetter.format(d)}
            </span>
          ))}
          <span className="habit-streak-label" />
        </div>
      )}
      <ul className="list scroll">
        {habits.map((h) => {
          const days = new Set(h.days)
          const s = streak(days)
          return (
            <li key={h.id} className="habit" style={{ ['--habit' as string]: h.color }}>
              <span className="habit-name grow" title={h.name}>
                {h.name}
              </span>
              {week.map((d) => {
                const key = dateKey(d)
                const done = days.has(key)
                return (
                  <button
                    key={key}
                    className={`habit-dot ${done ? 'done' : ''}`}
                    aria-pressed={done}
                    title={`${dayLong.format(d)}: ${done ? 'cumplido' : 'sin marcar'}`}
                    onClick={() => toggle(h, d)}
                  >
                    {done && <Icon name="check" size={11} />}
                  </button>
                )
              })}
              <span className="habit-streak" title={`Racha: ${s} días seguidos`}>
                {s > 0 && (
                  <>
                    <Icon name="flame" size={11} />
                    {s}
                  </>
                )}
              </span>
              <button className="icon-btn small hover-only" title={`Eliminar ${h.name}`} onClick={() => void remove(h)}>
                <Icon name="close" size={11} />
              </button>
            </li>
          )
        })}
        {habits.length === 0 && <li className="empty muted">Añade un hábito: leer, beber agua, caminar…</li>}
      </ul>
      <form
        className="row add-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="input tiny grow" placeholder="Nuevo hábito" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn tiny primary" type="submit" disabled={!draft.trim()} title="Añadir hábito">
          <Icon name="plus" size={12} />
        </button>
      </form>
    </div>
  )
}
