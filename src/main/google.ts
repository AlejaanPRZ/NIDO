import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  IPC,
  type CalEvent,
  type EventInput,
  type GoogleCalendar,
  type GoogleEventsQuery,
  type GoogleEventsResult,
  type GoogleStatus
} from '../shared/types'
import { handleResult, NidoError, readJson, serviceUrl } from './errors'
import { deleteSecret, encryptionAvailable, getConfig, getSecret, setSecret, updateConfig } from './secrets'

// Google Calendar con OAuth 2.0 para apps de escritorio: redirección a
// http://127.0.0.1:<puerto aleatorio> + PKCE (S256), como indica
// developers.google.com/identity/protocols/oauth2/native-app.
// Permisos mínimos: ver la lista de calendarios y gestionar eventos.

const AUTH_URL = serviceUrl('NIDO_GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth')
const TOKEN_URL = serviceUrl('NIDO_GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token')
const REVOKE_URL = serviceUrl('NIDO_GOOGLE_REVOKE_URL', 'https://oauth2.googleapis.com/revoke')
const API = serviceUrl('NIDO_GOOGLE_API', 'https://www.googleapis.com/calendar/v3')
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events'
]
const AUTH_TIMEOUT_MS = 5 * 60_000

let accessToken: { value: string; expiresAt: number } | null = null
let pendingConnect: Promise<GoogleStatus> | null = null
const calendarColors = new Map<string, string>()

const base64url = (buf: Buffer): string => buf.toString('base64url')

async function status(): Promise<GoogleStatus> {
  const config = getConfig().google ?? {}
  return {
    clientId: config.clientId ?? '',
    hasClientSecret: !!(await getSecret('google.clientSecret')),
    connected: !!(await getSecret('google.refreshToken')),
    account: config.account,
    encryption: await encryptionAvailable()
  }
}

async function credentials(): Promise<{ clientId: string; clientSecret: string | null }> {
  const clientId = getConfig().google?.clientId
  if (!clientId) throw new NidoError('config', 'Falta el ID de cliente de Google. Configúralo en Ajustes → Conexiones.')
  return { clientId, clientSecret: await getSecret('google.clientSecret') }
}

async function setCredentials(clientId: string, clientSecret: string): Promise<GoogleStatus> {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new NidoError('invalid', 'El ID de cliente debe terminar en .apps.googleusercontent.com')
  }
  const previous = getConfig().google?.clientId
  // Los tokens pertenecen a un cliente concreto: si cambia, hay que reconectar.
  if (previous && previous !== id) forgetAccount()
  if (secret) await setSecret('google.clientSecret', secret)
  updateConfig((c) => {
    c.google = { ...c.google, clientId: id }
  })
  return status()
}

function forgetAccount(): void {
  accessToken = null
  calendarColors.clear()
  deleteSecret('google.refreshToken')
  updateConfig((c) => {
    if (c.google) delete c.google.account
  })
}

const PAGE = (title: string, body: string): string => `<!doctype html><html lang="es"><meta charset="utf-8">
<title>${title}</title><body style="font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5f7;color:#1d1d1f">
<div style="text-align:center;max-width:420px;padding:32px;border-radius:24px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.08)">
<h1 style="font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#6e6e73;margin:0">${body}</p></div></body></html>`

/** Abre Google en el navegador del sistema y espera el código en un servidor local de un solo uso. */
async function authorize(clientId: string): Promise<{ code: string; redirectUri: string; verifier: string }> {
  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const server = http.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const codePromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new NidoError('auth', 'Se agotó el tiempo para autorizar en Google. Vuelve a intentarlo.')),
      AUTH_TIMEOUT_MS
    )
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const ok = !error && !!code && url.searchParams.get('state') === state
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        ok
          ? PAGE('Nido está conectado', 'Ya puedes cerrar esta pestaña y volver a Nido.')
          : PAGE('No se pudo conectar', 'Vuelve a Nido para intentarlo de nuevo.')
      )
      clearTimeout(timer)
      if (url.searchParams.get('state') !== state) reject(new NidoError('auth', 'Respuesta de Google no válida (state).'))
      else if (error === 'access_denied') reject(new NidoError('auth', 'Has cancelado el permiso en Google.'))
      else if (error || !code) reject(new NidoError('auth', `Google devolvió un error: ${error ?? 'sin código'}`))
      else resolve(code)
    })
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent'
  })
  const authUrl = `${AUTH_URL}?${params}`
  try {
    if (process.env.NIDO_DEV_AUTH_FETCH && AUTH_URL !== 'https://accounts.google.com/o/oauth2/v2/auth') {
      // Solo pruebas con servidor simulado: sigue la redirección sin abrir el navegador.
      void fetch(authUrl).catch(() => undefined)
    } else {
      await shell.openExternal(authUrl)
    }
    return { code: await codePromise, redirectUri, verifier }
  } finally {
    server.close()
  }
}

async function tokenRequest(body: Record<string, string>): Promise<any> {
  let res: Response
  try {
    res = await fetch(TOKEN_URL, { method: 'POST', body: new URLSearchParams(body) })
  } catch {
    throw new NidoError('network', 'No hay conexión con Google.')
  }
  const json = await readJson(res)
  if (!res.ok) {
    if (json?.error === 'invalid_grant') {
      forgetAccount()
      throw new NidoError('auth', 'Google ha revocado o caducado el acceso. Vuelve a conectar la cuenta.')
    }
    if (json?.error === 'invalid_client' || json?.error === 'unauthorized_client') {
      throw new NidoError('config', 'Google rechaza las credenciales del cliente. Revisa el ID y el secreto en Ajustes.')
    }
    throw new NidoError('auth', `Google rechazó la autorización: ${json?.error_description ?? json?.error ?? res.status}`)
  }
  return json
}

async function connect(): Promise<GoogleStatus> {
  pendingConnect ??= (async () => {
    const { clientId, clientSecret } = await credentials()
    const { code, redirectUri, verifier } = await authorize(clientId)
    const tokens = await tokenRequest({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
    if (!tokens.refresh_token) throw new NidoError('auth', 'Google no devolvió un token de actualización.')
    await setSecret('google.refreshToken', tokens.refresh_token)
    accessToken = { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000 }
    const calendars = await listCalendars()
    const primary = calendars.find((c) => c.primary)
    updateConfig((c) => {
      c.google = { ...c.google, account: primary?.id }
    })
    return status()
  })().finally(() => {
    pendingConnect = null
  })
  return pendingConnect
}

async function disconnect(): Promise<GoogleStatus> {
  const refresh = await getSecret('google.refreshToken')
  forgetAccount()
  if (refresh) {
    // Revocar en Google es lo correcto, pero si no hay red la cuenta queda desconectada en Nido igualmente.
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => undefined)
  }
  return status()
}

async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value
  const refresh = await getSecret('google.refreshToken')
  if (!refresh) throw new NidoError('auth', 'No hay ninguna cuenta de Google conectada.')
  const { clientId, clientSecret } = await credentials()
  const json = await tokenRequest({
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    grant_type: 'refresh_token',
    refresh_token: refresh
  })
  accessToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return accessToken.value
}

function apiError(status: number, json: any): NidoError {
  const reason = json?.error?.errors?.[0]?.reason as string | undefined
  const message = json?.error?.message as string | undefined
  if (status === 401) return new NidoError('auth', 'La sesión de Google ha caducado. Vuelve a conectar la cuenta.')
  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return new NidoError('rate', 'Google limita las peticiones ahora mismo. Espera un momento y reintenta.')
  }
  if (status === 403) return new NidoError('forbidden', `Sin permiso para esta acción en Google${message ? `: ${message}` : '.'}`)
  if (status === 404 || status === 410) return new NidoError('notfound', 'El calendario o el evento ya no existe.')
  if (status >= 500) return new NidoError('network', 'Google Calendar no responde. Reintenta en unos minutos.')
  return new NidoError('invalid', message ?? `Error ${status} de Google Calendar.`)
}

async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken()
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
  } catch {
    throw new NidoError('network', 'No hay conexión con Google.')
  }
  if (res.status === 401 && retry) {
    accessToken = null
    return api(path, init, false)
  }
  if (res.status === 204) return null as T
  const json = await readJson(res)
  if (!res.ok) throw apiError(res.status, json)
  return json as T
}

async function listCalendars(): Promise<GoogleCalendar[]> {
  const calendars: GoogleCalendar[] = []
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({ maxResults: '250', ...(pageToken ? { pageToken } : {}) })
    const json = await api<any>(`/users/me/calendarList?${query}`)
    for (const c of json.items ?? []) {
      calendars.push({
        id: c.id,
        name: c.summaryOverride ?? c.summary ?? c.id,
        color: c.backgroundColor ?? '#4285f4',
        primary: !!c.primary,
        canWrite: c.accessRole === 'owner' || c.accessRole === 'writer',
        selected: !!c.selected
      })
      calendarColors.set(c.id, c.backgroundColor ?? '#4285f4')
    }
    pageToken = json.nextPageToken
  } while (pageToken)
  return calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name))
}

function toCalEvent(e: any, calendarId: string): CalEvent {
  const popup = e.reminders?.overrides?.find((o: any) => o.method === 'popup')
  return {
    id: e.id,
    calendarId,
    title: e.summary || '(Sin título)',
    start: e.start?.date ?? e.start?.dateTime,
    end: e.end?.date ?? e.end?.dateTime,
    allDay: !!e.start?.date,
    location: e.location,
    description: e.description,
    color: calendarColors.get(calendarId),
    htmlLink: e.htmlLink,
    recurring: !!e.recurringEventId,
    reminder: e.reminders?.useDefault ? 'default' : (popup?.minutes ?? null),
    source: 'google'
  }
}

async function listEvents(query: GoogleEventsQuery): Promise<GoogleEventsResult> {
  if (calendarColors.size === 0) await listCalendars()
  const failed: GoogleEventsResult['failed'] = []
  const lists = await Promise.all(
    query.calendarIds.map(async (calendarId) => {
      const events: CalEvent[] = []
      try {
        let pageToken: string | undefined
        let pages = 0
        do {
          const params = new URLSearchParams({
            timeMin: query.timeMin,
            timeMax: query.timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '250',
            ...(pageToken ? { pageToken } : {})
          })
          const json = await api<any>(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
          for (const e of json.items ?? []) if (e.status !== 'cancelled') events.push(toCalEvent(e, calendarId))
          pageToken = json.nextPageToken
        } while (pageToken && ++pages < 5)
      } catch (err) {
        if (err instanceof NidoError && (err.code === 'auth' || err.code === 'config')) throw err
        failed.push({ calendarId, error: err instanceof Error ? err.message : String(err) })
      }
      return events
    })
  )
  if (failed.length === query.calendarIds.length && failed.length > 0) throw new NidoError('network', failed[0].error)
  return { events: lists.flat(), failed }
}

function eventBody(input: EventInput, forPatch: boolean): Record<string, unknown> {
  const title = input.title.trim()
  if (!title) throw new NidoError('invalid', 'El evento necesita un título.')
  const body: Record<string, unknown> = {
    summary: title,
    location: input.location ?? (forPatch ? '' : undefined),
    description: input.description ?? (forPatch ? '' : undefined),
    start: input.allDay ? { date: input.start } : { dateTime: input.start, timeZone: input.timeZone },
    end: input.allDay ? { date: input.end } : { dateTime: input.end, timeZone: input.timeZone }
  }
  if (input.reminder === 'default') body.reminders = { useDefault: true }
  else if (input.reminder === null) body.reminders = { useDefault: false, overrides: [] }
  else if (typeof input.reminder === 'number') {
    body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: input.reminder }] }
  }
  return body
}

const eventPath = (calendarId: string, eventId?: string): string =>
  `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`

export function registerGoogle(): void {
  handleResult(IPC.google.status, () => status())
  handleResult(IPC.google.setCredentials, (clientId: string, clientSecret: string) =>
    setCredentials(String(clientId ?? ''), String(clientSecret ?? ''))
  )
  handleResult(IPC.google.connect, () => connect())
  handleResult(IPC.google.disconnect, () => disconnect())
  handleResult(IPC.google.calendars, () => listCalendars())
  handleResult(IPC.google.events, (query: GoogleEventsQuery) => listEvents(query))
  handleResult(IPC.google.createEvent, async (calendarId: string, input: EventInput) =>
    toCalEvent(await api<any>(eventPath(calendarId), { method: 'POST', body: JSON.stringify(eventBody(input, false)) }), calendarId)
  )
  handleResult(IPC.google.updateEvent, async (calendarId: string, eventId: string, input: EventInput) =>
    toCalEvent(
      await api<any>(eventPath(calendarId, eventId), { method: 'PATCH', body: JSON.stringify(eventBody(input, true)) }),
      calendarId
    )
  )
  handleResult(IPC.google.deleteEvent, async (calendarId: string, eventId: string) => {
    await api(eventPath(calendarId, eventId), { method: 'DELETE' })
    return null
  })
}
