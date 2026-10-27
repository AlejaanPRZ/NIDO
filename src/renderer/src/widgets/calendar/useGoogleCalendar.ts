import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CalEvent, ErrorCode, GoogleCalendar, GoogleStatus } from '../../../../shared/types'
import { eventKey } from './events'

const REFRESH_MS = 5 * 60_000

/** Evento global para que los widgets recarguen tras conectar/desconectar en Ajustes. */
export const INTEGRATIONS_EVENT = 'nido:integrations'
export const notifyIntegrationsChanged = (): void => void window.dispatchEvent(new Event(INTEGRATIONS_EVENT))

export interface Range {
  from: Date
  to: Date
}

export interface GoogleCalendarState {
  status: GoogleStatus | null
  calendars: GoogleCalendar[] | null
  activeIds: string[]
  events: CalEvent[]
  loading: boolean
  error: { message: string; code: ErrorCode } | null
  warnings: string[]
  lastSync: Date | null
  refresh(): void
}

export function useGoogleCalendar(enabled: boolean, selected: string[] | undefined, ranges: Range[]): GoogleCalendarState {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [calendars, setCalendars] = useState<GoogleCalendar[] | null>(null)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<GoogleCalendarState['error']>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)

  const loadStatus = useCallback(() => {
    window.nido.google.status().then((r) => r.ok && setStatus(r.data))
  }, [])

  useEffect(() => {
    if (!enabled) return
    loadStatus()
    window.addEventListener(INTEGRATIONS_EVENT, loadStatus)
    return () => window.removeEventListener(INTEGRATIONS_EVENT, loadStatus)
  }, [enabled, loadStatus])

  const connected = enabled && !!status?.connected

  useEffect(() => {
    if (!connected) {
      setCalendars(null)
      setEvents([])
      return
    }
    window.nido.google.calendars().then((r) => {
      if (r.ok) setCalendars(r.data)
      else {
        setError({ message: r.error, code: r.code })
        if (r.code === 'auth') loadStatus()
      }
    })
  }, [connected, tick, loadStatus])

  const activeIds = useMemo(() => {
    if (!calendars) return []
    const available = new Set(calendars.map((c) => c.id))
    const chosen = selected?.filter((id) => available.has(id))
    return chosen ?? calendars.filter((c) => c.selected || c.primary).map((c) => c.id)
  }, [calendars, selected])

  const rangesKey = ranges.map((r) => `${r.from.getTime()}-${r.to.getTime()}`).join('|')
  const idsKey = activeIds.join(',')

  useEffect(() => {
    if (!connected || !calendars) return
    if (activeIds.length === 0) {
      setEvents([])
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(
      ranges.map((r) =>
        window.nido.google.events({ calendarIds: activeIds, timeMin: r.from.toISOString(), timeMax: r.to.toISOString() })
      )
    ).then((results) => {
      if (cancelled) return
      setLoading(false)
      const failure = results.find((r) => !r.ok)
      if (failure && !failure.ok) {
        setError({ message: failure.error, code: failure.code })
        if (failure.code === 'auth') loadStatus()
        return
      }
      const merged = new Map<string, CalEvent>()
      const failed = new Set<string>()
      for (const r of results) {
        if (!r.ok) continue
        for (const e of r.data.events) merged.set(eventKey(e), e)
        for (const f of r.data.failed) failed.add(f.calendarId)
      }
      setEvents([...merged.values()])
      setWarnings(
        [...failed].map((id) => `No se pudo leer «${calendars.find((c) => c.id === id)?.name ?? id}».`)
      )
      setError(null)
      setLastSync(new Date())
    })
    return () => {
      cancelled = true
    }
    // Cada refresco recarga `calendars` (nuevo array), y eso basta para volver a pedir los eventos.
  }, [connected, calendars, idsKey, rangesKey])

  useEffect(() => {
    if (!connected) return
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    return () => clearInterval(timer)
  }, [connected])

  return {
    status,
    calendars,
    activeIds,
    events,
    loading,
    error,
    warnings,
    lastSync,
    refresh: () => {
      loadStatus()
      setTick((t) => t + 1)
    }
  }
}
