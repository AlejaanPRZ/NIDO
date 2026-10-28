import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BrandLogo } from '../../BrandLogo'
import type { CalEvent, CalendarEvent, CalendarView } from '../../../../shared/types'
import { publishSearchItems, useApp } from '../../context'
import { Icon } from '../../icons'
import { EmptyState, Segmented, Spinner, Toggle } from '../../ui/controls'
import { toast } from '../../ui/feedback'
import { Modal } from '../../ui/Modal'
import { addDays, dateKey, relativeTime, startOfDay, startOfWeek, uid } from '../../util'
import type { WidgetProps } from '../types'
import { EventEditor, type EventDraft } from './EventEditor'
import { endOf, eventKey, fromLocal, rangeLabel, startOf } from './events'
import { useGoogleCalendar, type Range } from './useGoogleCalendar'
import { AgendaView, DayView, MonthView, WeekView } from './views'

const VIEWS: { value: CalendarView; label: string; short: string }[] = [
  { value: 'agenda', label: 'Agenda', short: 'A' },
  { value: 'day', label: 'Día', short: 'D' },
  { value: 'week', label: 'Semana', short: 'S' },
  { value: 'month', label: 'Mes', short: 'M' }
]

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const dayTitle = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function viewRange(view: CalendarView, cursor: Date): Range {
  switch (view) {
    case 'month': {
      const from = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
      return { from, to: addDays(from, 42) }
    }
    case 'week': {
      const from = startOfWeek(cursor)
      return { from, to: addDays(from, 7) }
    }
    case 'day':
      return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) }
    case 'agenda':
      return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 30) }
  }
}

function shift(view: CalendarView, cursor: Date, dir: number): Date {
  if (view === 'month') return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1)
  return addDays(cursor, dir * (view === 'day' ? 1 : 7))
}

function title(view: CalendarView, cursor: Date): string {
  if (view === 'month') return monthTitle.format(cursor)
  if (view === 'day') return dayTitle.format(cursor)
  if (view === 'week') {
    const from = startOfWeek(cursor)
    return `${shortDate.format(from)} – ${shortDate.format(addDays(from, 6))}`
  }
  return `Desde el ${shortDate.format(cursor)}`
}

// Avisos ya mostrados en esta sesión (evita repetirlos al recargar eventos).
const notified = new Set<string>()

function useReminders(events: CalEvent[], enabled: boolean, minutes: number, widgetTitle: string): void {
  useEffect(() => {
    if (!enabled) return
    const check = (): void => {
      const now = Date.now()
      for (const e of events) {
        if (e.allDay) continue
        const lead = typeof e.reminder === 'number' ? e.reminder : e.reminder === null ? null : minutes
        if (lead === null) continue
        const start = startOf(e).getTime()
        const key = `${eventKey(e)}|${e.start}`
        if (notified.has(key) || now < start - lead * 60_000 || now >= start) continue
        notified.add(key)
        const body = `${relativeTime(new Date(start))} · ${clock.format(new Date(start))}`
        try {
          new Notification(e.title, { body, tag: key })
        } catch {
          // Si Windows no deja mostrar la notificación, queda el aviso dentro de Nido.
        }
        toast(`${widgetTitle}: «${e.title}» ${body}`, 'info')
      }
    }
    check()
    const timer = setInterval(check, 30_000)
    return () => clearInterval(timer)
  }, [events, enabled, minutes, widgetTitle])
}

export function CalendarWidget({ widget, update }: WidgetProps<'calendar'>): JSX.Element {
  const { openSettings } = useApp()
  const data = widget.data
  const source = data.source ?? 'local'
  const view = data.view ?? 'month'
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState(() => startOfDay(new Date()))
  const [editor, setEditor] = useState<{ event: CalEvent | null; day: Date; hour?: number } | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)

  // Rango de la vista + próximos 7 días (para «Próximo» y los avisos), sin duplicar.
  const todayKey = dateKey(new Date())
  const ranges = useMemo(() => {
    const main = viewRange(view, cursor)
    const today = startOfDay(new Date())
    const upcoming = { from: today, to: addDays(today, 8) }
    const covers = main.from <= upcoming.from && main.to >= upcoming.to
    return covers ? [main] : [main, upcoming]
    // todayKey hace que el rango «próximo» avance al cambiar de día.
  }, [view, cursor.getTime(), todayKey])

  const google = useGoogleCalendar(source === 'google', data.calendars, ranges)
  const localEvents = useMemo(() => data.events.map(fromLocal), [data.events])
  const events = source === 'google' ? google.events : localEvents

  useReminders(events, !!data.notify, data.notifyMinutes ?? 10, widget.title)

  // Próximos eventos para el buscador.
  useEffect(() => {
    const now = Date.now()
    publishSearchItems(
      widget.id,
      events
        .filter((e) => endOf(e).getTime() > now)
        .slice(0, 50)
        .map((e) => ({ label: e.title, detail: `${shortDate.format(startOf(e))} · ${rangeLabel(e)}` }))
    )
    return () => publishSearchItems(widget.id, null)
  }, [events, widget.id])

  const now = new Date()
  const upcoming = events
    .filter((e) => (e.allDay ? endOf(e) > now && startOf(e) <= addDays(startOfDay(now), 1) : endOf(e) > now))
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime())[0]

  const openCreate = (day: Date, hour?: number): void => setEditor({ event: null, day, hour })
  const openEvent = (e: CalEvent): void => setEditor({ event: e, day: startOf(e) })

  // ---------- Guardar / eliminar ----------

  const saveLocal = (draft: EventDraft, existing: CalEvent | null): null => {
    const { input } = draft
    const event: CalendarEvent = {
      id: existing?.id ?? uid(),
      date: input.start.slice(0, 10),
      time: input.allDay ? undefined : input.start.slice(11, 16),
      endTime: input.allDay ? undefined : input.end.slice(11, 16),
      title: input.title.trim(),
      notes: input.description || undefined,
      reminder: input.reminder === 'default' ? undefined : input.reminder
    }
    update({ events: existing ? data.events.map((e) => (e.id === existing.id ? event : e)) : [...data.events, event] })
    return null
  }

  const saveGoogle = async (draft: EventDraft, existing: CalEvent | null): Promise<string | null> => {
    const result = existing
      ? await window.nido.google.updateEvent(existing.calendarId, existing.id, draft.input)
      : await window.nido.google.createEvent(draft.calendarId, draft.input)
    if (!result.ok) return result.error
    toast(existing ? 'Evento actualizado en Google Calendar' : 'Evento creado en Google Calendar', 'success')
    google.refresh()
    return null
  }

  const deleteEvent = async (e: CalEvent): Promise<string | null> => {
    if (e.source === 'local') {
      update({ events: data.events.filter((x) => x.id !== e.id) })
      return null
    }
    const result = await window.nido.google.deleteEvent(e.calendarId, e.id)
    if (!result.ok) return result.error
    toast('Evento eliminado', 'success')
    google.refresh()
    return null
  }

  // ---------- Estados de Google ----------

  let body: JSX.Element
  if (source === 'google' && !google.status) {
    body = <EmptyState icon={<Spinner />} title="Comprobando Google Calendar…" />
  } else if (source === 'google' && !google.status!.builtIn && !google.status!.clientId) {
    body = (
      <EmptyState
        icon={<BrandLogo brand="google-calendar" name="Google Calendar" size={30} decorative />}
        title="Google Calendar sin configurar"
        action={
          <button className="btn primary small" onClick={() => openSettings('conexiones')}>
            Configurar conexión
          </button>
        }
      >
        Esta copia de Nido no trae la conexión con Google preparada. Ajustes → Conexiones explica cómo usar un cliente propio.
      </EmptyState>
    )
  } else if (source === 'google' && !google.status!.connected) {
    body = (
      <EmptyState
        icon={<BrandLogo brand="google-calendar" name="Google Calendar" size={30} decorative />}
        title="Cuenta de Google desconectada"
        action={
          <button className="btn primary small" onClick={() => openSettings('conexiones')}>
            Conectar cuenta
          </button>
        }
      >
        {google.error?.code === 'auth' ? google.error.message : 'Conecta tu cuenta para ver y editar tus eventos.'}
      </EmptyState>
    )
  } else {
    const props = { cursor, events, onOpen: openEvent, onCreate: openCreate }
    body = (
      <div className="cal-body">
        {view === 'month' && (
          <MonthView
            {...props}
            selected={selected}
            onSelect={(d) => {
              setSelected(d)
              if (d.getMonth() !== cursor.getMonth()) setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
            }}
          />
        )}
        {view === 'week' && <WeekView {...props} />}
        {view === 'day' && <DayView {...props} />}
        {view === 'agenda' && <AgendaView {...props} />}
        {source === 'google' && google.loading && events.length === 0 && (
          <div className="cal-loading">
            <Spinner />
          </div>
        )}
      </div>
    )
  }

  const connectedGoogle = source === 'google' && !!google.status?.connected

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <button className="icon-btn" title="Anterior" onClick={() => setCursor(shift(view, cursor, -1))}>
          <Icon name="chevronLeft" size={15} />
        </button>
        <span className="cal-title cap" title={title(view, cursor)}>
          {title(view, cursor)}
        </span>
        <button className="icon-btn" title="Siguiente" onClick={() => setCursor(shift(view, cursor, 1))}>
          <Icon name="chevronRight" size={15} />
        </button>
        <button
          className="btn tiny"
          onClick={() => {
            const today = startOfDay(new Date())
            setCursor(view === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : today)
            setSelected(today)
          }}
        >
          Hoy
        </button>
        <span className="grow" />
        <Segmented
          label="Vista"
          className="compact views"
          value={view}
          options={VIEWS.map((v) => ({
            value: v.value,
            title: v.label,
            label: (
              <>
                <span className="long">{v.label}</span>
                <span className="short">{v.short}</span>
              </>
            )
          }))}
          onChange={(v) => update({ view: v })}
        />
        <button
          className="icon-btn"
          title="Nuevo evento"
          disabled={source === 'google' && !connectedGoogle}
          onClick={() => openCreate(view === 'month' ? selected : cursor)}
        >
          <Icon name="plus" size={15} />
        </button>
        <button className="icon-btn" title="Opciones del calendario" onClick={() => setOptionsOpen(true)}>
          <Icon name="settings" size={15} />
        </button>
      </div>

      {upcoming && (
        <div className="cal-next" style={{ '--ev': upcoming.color ?? 'var(--accent)' } as CSSProperties}>
          <span className="cal-next-dot" />
          <span className="cal-next-label">{startOf(upcoming) <= now ? 'Ahora' : 'Próximo'}</span>
          <button className="cal-next-title" onClick={() => openEvent(upcoming)} title={upcoming.title}>
            {upcoming.title}
          </button>
          <span className="muted cal-next-when">
            {upcoming.allDay ? 'hoy' : startOf(upcoming) <= now ? `hasta las ${clock.format(endOf(upcoming))}` : relativeTime(startOf(upcoming))}
          </span>
        </div>
      )}

      {body}

      {source === 'google' && google.status?.connected && (
        <div className="sync-line">
          {google.error ? (
            <>
              <Icon name="alert" size={13} />
              <span className="grow error-text" title={google.error.message}>
                {google.error.message}
              </span>
              <button className="link-btn" onClick={google.refresh}>
                Reintentar
              </button>
            </>
          ) : (
            <>
              {google.loading ? <Spinner size={11} /> : <Icon name="cloud" size={13} />}
              <span className="grow">
                {google.loading
                  ? 'Sincronizando…'
                  : google.lastSync
                    ? `Google · ${clock.format(google.lastSync)}`
                    : 'Google Calendar'}
                {google.warnings.length > 0 && ` · ${google.warnings.join(' ')}`}
              </span>
              <button className="icon-btn small" title="Actualizar" onClick={google.refresh} disabled={google.loading}>
                <Icon name="reload" size={12} />
              </button>
            </>
          )}
        </div>
      )}

      {editor && (
        <EventEditor
          source={editor.event?.source ?? source}
          event={editor.event}
          day={editor.day}
          hour={editor.hour}
          calendars={google.calendars ?? []}
          defaultCalendarId={google.calendars?.find((c) => c.primary && c.canWrite)?.id}
          onSave={(draft) =>
            (editor.event?.source ?? source) === 'google'
              ? saveGoogle(draft, editor.event)
              : Promise.resolve(saveLocal(draft, editor.event))
          }
          onDelete={editor.event ? () => deleteEvent(editor.event!) : undefined}
          onClose={() => setEditor(null)}
        />
      )}

      {optionsOpen && (
        <Modal title="Opciones del calendario" size="sm" onClose={() => setOptionsOpen(false)}>
          <div className="form">
            <div className="field">
              <span>Origen de los eventos</span>
              <Segmented
                label="Origen"
                className="full"
                value={source}
                options={[
                  { value: 'local', label: 'Nido (local)' },
                  { value: 'google', label: 'Google Calendar' }
                ]}
                onChange={(v) => update({ source: v })}
              />
              {source === 'local' && data.events.length > 0 && (
                <small className="muted">Tus {data.events.length} eventos locales se conservan aunque cambies de origen.</small>
              )}
            </div>

            {source === 'google' && (
              <div className="field">
                <span>Calendarios visibles</span>
                {!google.status?.connected ? (
                  <button className="btn small" onClick={() => openSettings('conexiones')}>
                    Conectar Google Calendar
                  </button>
                ) : !google.calendars ? (
                  <Spinner />
                ) : (
                  <div className="check-list">
                    {google.calendars.map((c) => {
                      const checked = google.activeIds.includes(c.id)
                      return (
                        <label key={c.id} className="check-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              update({
                                calendars: checked
                                  ? google.activeIds.filter((id) => id !== c.id)
                                  : [...google.activeIds, c.id]
                              })
                            }
                          />
                          <span className="cal-swatch" style={{ background: c.color }} />
                          <span className="grow">{c.name}</span>
                          {!c.canWrite && <small className="muted">solo lectura</small>}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <Toggle
              label="Recordatorios de escritorio"
              description="Nido avisa antes de cada evento con hora mientras está abierto."
              checked={!!data.notify}
              onChange={(v) => update({ notify: v })}
            />
            {data.notify && (
              <label className="field">
                <span>Avisar con antelación</span>
                <select
                  className="input"
                  value={data.notifyMinutes ?? 10}
                  onChange={(e) => update({ notifyMinutes: Number(e.target.value) })}
                >
                  {[5, 10, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} minutos` : '1 hora'}
                    </option>
                  ))}
                </select>
                <small className="muted">Si un evento tiene su propio recordatorio, se usa el suyo.</small>
              </label>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
