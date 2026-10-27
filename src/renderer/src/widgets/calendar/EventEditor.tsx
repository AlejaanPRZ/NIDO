import { useState } from 'react'
import type { CalEvent, EventInput, GoogleCalendar } from '../../../../shared/types'
import { Icon } from '../../icons'
import { confirmDialog } from '../../ui/feedback'
import { Modal } from '../../ui/Modal'
import { addDays, dateKey, fromDateKey, timeZone, toLocalIso } from '../../util'
import { endOf, startOf } from './events'

export interface EventDraft {
  calendarId: string
  input: EventInput
}

interface Props {
  source: 'local' | 'google'
  event: CalEvent | null
  /** Día (y hora) por defecto al crear */
  day: Date
  hour?: number
  calendars: GoogleCalendar[]
  defaultCalendarId?: string
  onSave(draft: EventDraft): Promise<string | null>
  onDelete?(): Promise<string | null>
  onClose(): void
}

const REMINDERS: { value: string; label: string }[] = [
  { value: 'default', label: 'Predeterminado' },
  { value: 'none', label: 'Sin aviso' },
  { value: '5', label: '5 minutos antes' },
  { value: '10', label: '10 minutos antes' },
  { value: '15', label: '15 minutos antes' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 día antes' }
]

const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function EventEditor({ source, event, day, hour, calendars, defaultCalendarId, onSave, onDelete, onClose }: Props): JSX.Element {
  const writable = calendars.filter((c) => c.canWrite)
  // Nuevo evento: a la hora elegida, o la siguiente hora en punto si es hoy, o a las 9:00.
  const now = new Date()
  const isToday = day.toDateString() === now.toDateString()
  const defaultHour = hour ?? (isToday ? Math.min(23, now.getHours() + 1) : 9)
  const initialStart = event ? startOf(event) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), defaultHour)
  // Google guarda el fin de un evento de todo el día como el día siguiente (exclusivo).
  const initialEnd = event
    ? event.allDay
      ? addDays(endOf(event), -1)
      : endOf(event)
    : new Date(initialStart.getTime() + 3_600_000)

  const [title, setTitle] = useState(event?.title ?? '')
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? defaultCalendarId ?? writable[0]?.id ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startDate, setStartDate] = useState(dateKey(initialStart))
  const [startTime, setStartTime] = useState(hhmm(initialStart))
  const [endDate, setEndDate] = useState(dateKey(initialEnd))
  const [endTime, setEndTime] = useState(hhmm(initialEnd))
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [reminder, setReminder] = useState(
    event?.reminder === null ? 'none' : typeof event?.reminder === 'number' ? String(event.reminder) : 'default'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isGoogle = source === 'google'
  const readOnly = isGoogle && !!event && !writable.some((c) => c.id === event.calendarId)

  const buildInput = (): EventInput | string => {
    if (!title.trim()) return 'Escribe un título.'
    const reminderValue = reminder === 'default' ? 'default' : reminder === 'none' ? null : Number(reminder)
    const lastDate = isGoogle ? endDate : startDate // los eventos locales son de un solo día
    if (allDay) {
      if (lastDate < startDate) return 'La fecha de fin es anterior a la de inicio.'
      return {
        title,
        allDay: true,
        start: startDate,
        end: dateKey(addDays(fromDateKey(lastDate), 1)),
        location,
        description,
        reminder: reminderValue,
        timeZone: timeZone()
      }
    }
    const start = new Date(`${startDate}T${startTime}`)
    const end = new Date(`${lastDate}T${endTime}`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Revisa la fecha y la hora.'
    if (end <= start) return 'La hora de fin debe ser posterior a la de inicio.'
    return {
      title,
      allDay: false,
      start: toLocalIso(start),
      end: toLocalIso(end),
      location,
      description,
      reminder: reminderValue,
      timeZone: timeZone()
    }
  }

  const save = async (): Promise<void> => {
    const input = buildInput()
    if (typeof input === 'string') {
      setError(input)
      return
    }
    if (isGoogle && !calendarId) {
      setError('No tienes ningún calendario de Google en el que se pueda escribir.')
      return
    }
    setSaving(true)
    const failure = await onSave({ calendarId, input })
    setSaving(false)
    if (failure) setError(failure)
    else onClose()
  }

  const remove = async (): Promise<void> => {
    if (!onDelete || !event) return
    const ok = await confirmDialog({
      title: 'Eliminar evento',
      message: `¿Eliminar «${event.title}»?${event.recurring ? ' Solo se eliminará esta repetición.' : ''} No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true
    })
    if (!ok) return
    setSaving(true)
    const failure = await onDelete()
    setSaving(false)
    if (failure) setError(failure)
    else onClose()
  }

  return (
    <Modal
      title={event ? (readOnly ? 'Evento' : 'Editar evento') : 'Nuevo evento'}
      onClose={onClose}
      footer={
        <>
          {event && onDelete && !readOnly && (
            <button className="btn danger-ghost" disabled={saving} onClick={remove}>
              <Icon name="trash" size={14} />
              Eliminar
            </button>
          )}
          {event?.htmlLink && (
            <button className="btn ghost" onClick={() => window.nido.openExternal(event.htmlLink!)}>
              <Icon name="arrowUpRight" size={14} />
              Abrir en Google
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button className="btn primary" disabled={saving} onClick={save}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!readOnly) void save()
        }}
      >
        <fieldset disabled={readOnly || saving}>
          <label className="field">
            <span>Título</span>
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunión, cita…" />
          </label>

          {isGoogle && (
            <label className="field">
              <span>Calendario</span>
              <select className="input" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} disabled={!!event}>
                {(event ? calendars : writable).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="check-row">
            <input type="checkbox" className="switch" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Todo el día
          </label>

          <div className="field-grid">
            <label className="field">
              <span>{isGoogle ? 'Empieza' : 'Fecha'}</span>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            {!allDay && (
              <label className="field">
                <span>Hora</span>
                <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
            )}
            {isGoogle && (
              <label className="field">
                <span>Termina</span>
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            )}
            {!allDay && (
              <label className="field">
                <span>Hora de fin</span>
                <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            )}
          </div>

          {isGoogle && (
            <label className="field">
              <span>Ubicación</span>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opcional" />
            </label>
          )}

          <label className="field">
            <span>Notas</span>
            <textarea className="input area" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <label className="field">
            <span>Recordatorio</span>
            <select className="input" value={reminder} onChange={(e) => setReminder(e.target.value)}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.value === 'default' && !isGoogle ? 'El del widget' : r.label}
                </option>
              ))}
            </select>
            <small className="muted">
              {isGoogle
                ? 'Se guarda en Google (aviso emergente). Nido también avisa si activas los recordatorios del widget.'
                : 'Nido muestra un aviso de escritorio si activas los recordatorios del widget.'}
            </small>
          </label>
        </fieldset>
        {readOnly && <p className="muted">Este calendario es de solo lectura.</p>}
        {error && <p className="field-error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
