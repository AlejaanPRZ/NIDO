import type { CalEvent, CalendarEvent } from '../../../../shared/types'
import { addDays, dateKey, DAY_MS, eventDate, fromDateKey, startOfDay } from '../../util'

export const LOCAL_CALENDAR = 'nido-local'

/** Evento local de Nido → modelo común. Sin hora = todo el día; sin hora de fin = 1 h. */
export function fromLocal(e: CalendarEvent): CalEvent {
  if (!e.time) {
    return {
      id: e.id,
      calendarId: LOCAL_CALENDAR,
      title: e.title,
      start: e.date,
      end: dateKey(addDays(fromDateKey(e.date), 1)),
      allDay: true,
      description: e.notes,
      reminder: e.reminder,
      source: 'local'
    }
  }
  const start = new Date(`${e.date}T${e.time}`)
  let end = e.endTime ? new Date(`${e.date}T${e.endTime}`) : new Date(start.getTime() + 3_600_000)
  if (end <= start) end = new Date(start.getTime() + 3_600_000)
  return {
    id: e.id,
    calendarId: LOCAL_CALENDAR,
    title: e.title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    description: e.notes,
    reminder: e.reminder,
    source: 'local'
  }
}

export const startOf = (e: CalEvent): Date => eventDate(e.start, e.allDay)
export const endOf = (e: CalEvent): Date => eventDate(e.end, e.allDay)

/** Eventos que ocupan algún momento del día `day`, ordenados (todo el día primero). */
export function eventsOnDay(events: CalEvent[], day: Date): CalEvent[] {
  const from = startOfDay(day).getTime()
  const to = from + DAY_MS
  return events
    .filter((e) => startOf(e).getTime() < to && endOf(e).getTime() > from)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || startOf(a).getTime() - startOf(b).getTime())
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function timeLabel(e: CalEvent, day?: Date): string {
  if (e.allDay) return 'Todo el día'
  const start = startOf(e)
  // Un evento que empezó otro día se muestra como continuación.
  if (day && start < startOfDay(day)) return 'Continúa'
  return timeFormat.format(start)
}

export function rangeLabel(e: CalEvent): string {
  if (e.allDay) return 'Todo el día'
  return `${timeFormat.format(startOf(e))} – ${timeFormat.format(endOf(e))}`
}

export const eventKey = (e: CalEvent): string => `${e.calendarId}|${e.id}`
