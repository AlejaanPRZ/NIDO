import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
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
import { waitForRedirect } from './loopback'
import { oauthApps } from './oauthApps'
import { deleteSecret, encryptionAvailable, getConfig, getSecret, setSecret, updateConfig } from './secrets'

// Google Calendar con OAuth 2.0 para apps de escritorio: redirección a
// http://127.0.0.1:<puerto aleatorio> + PKCE (S256), como indica
// developers.google.com/identity/protocols/oauth2/native-app.
// Permisos mínimos: ver la lista de calendarios y gestionar eventos.
// El cliente OAuth es, por orden: el propio del usuario (opciones avanzadas) o el que trae esta
// copia de Nido (nido.oauth.json, ver oauthApps.ts). El usuario normal solo pulsa «Conectar».

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
let cancelPending: (() => void) | null = null
const calendarColors = new Map<string, string>()

const base64url = (buf: Buffer): string => buf.toString('base64url')

async function status(): Promise<GoogleStatus> {
  const config = getConfig().google ?? {}
  return {
    builtIn: !!oauthApps().google,
    clientId: config.clientId ?? '',
    hasClientSecret: !!(await getSecret('google.clientSecret')),
    connected: !!(await getSecret('google.refreshToken')),
    expired: !!config.expired,
    account: config.account,
    encryption: await encryptionAvailable()
  }
}

async function credentials(): Promise<{ clientId: string; clientSecret: string | null }> {
  const own = getConfig().google?.clientId
  if (own) return { clientId: own, clientSecret: await getSecret('google.clientSecret') }
  const builtIn = oauthApps().google
  if (builtIn) return { clientId: builtIn.clientId, clientSecret: builtIn.clientSecret ?? null }
  throw new NidoError('config', 'Esta copia de Nido no trae un cliente de Google. Usa uno propio en Opciones avanzadas.')
}

/** Vuelve al cliente integrado: los tokens del cliente propio dejan de valer. */
async function clearCredentials(): Promise<GoogleStatus> {
  if (getConfig().google?.clientId) forgetAccount()
  deleteSecret('google.clientSecret')
  updateConfig((c) => {
    if (c.google) delete c.google.clientId
  })
  return status()
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

/** expired: Google revocó o caducó el acceso (no es una desconexión voluntaria). */
function forgetAccount(expired = false): void {
  accessToken = null
  calendarColors.clear()
  invalidate()
  deleteSecret('google.refreshToken')
  updateConfig((c) => {
    if (!c.google) return
    delete c.google.account
    c.google.expired = expired
  })
}

// ---------- Caché compartida entre widgets ----------
// Varios calendarios en pantalla piden lo mismo: se responde desde caché y
// nunca hay dos peticiones iguales en curso. Las escrituras la invalidan.

const CALENDARS_TTL = 5 * 60_000
const EVENTS_TTL = 60_000
let calendarsCache: { at: number; value: Promise<GoogleCalendar[]> } | null = null
const eventsCache = new Map<string, { at: number; value: Promise<GoogleEventsResult> }>()

function invalidate(): void {
  calendarsCache = null
  eventsCache.clear()
}

function cached<T>(entry: { at: number; value: Promise<T> } | null | undefined, ttl: number): Promise<T> | null {
  return entry && Date.now() - entry.at < ttl ? entry.value : null
}

/** Abre Google en el navegador del sistema y espera el código en un servidor local de un solo uso. */
async function authorize(clientId: string): Promise<{ code: string; redirectUri: string; verifier: string }> {
  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))
  const redirect = await waitForRedirect({ path: '/', state, service: 'Google', timeoutMs: AUTH_TIMEOUT_MS })
  cancelPending = redirect.cancel
  const redirectUri = `http://127.0.0.1:${redirect.port}`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    // select_account: Google siempre deja elegir la cuenta (también para «Cambiar cuenta»);
    // consent: garantiza un refresh token nuevo aunque ya se hubiera autorizado antes.
    prompt: 'select_account consent'
  })
  const authUrl = `${AUTH_URL}?${params}`
  try {
    if (process.env.NIDO_DEV_AUTH_FETCH && AUTH_URL !== 'https://accounts.google.com/o/oauth2/v2/auth') {
      // Solo pruebas con servidor simulado: sigue la redirección sin abrir el navegador.
      void fetch(authUrl).catch(() => undefined)
    } else {
      await shell.openExternal(authUrl)
    }
    const result = await redirect.result
    return { code: result.get('code')!, redirectUri, verifier }
  } catch (err) {
    redirect.cancel()
    throw err
  } finally {
    cancelPending = null
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
      forgetAccount(true)
      throw new NidoError('auth', 'Google ha revocado o caducado el acceso. Vuelve a conectar la cuenta.')
    }
    // La guía oficial marca el secreto como opcional con PKCE, pero Google lo
    // exige para muchos clientes «de escritorio». Si falta, se pide con una acción clara.
    if (/client_secret/i.test(String(json?.error_description ?? ''))) {
      throw new NidoError('config', 'Google pide el secreto de cliente para este cliente. Añádelo en Opciones avanzadas y vuelve a conectar.')
    }
    if (json?.error === 'invalid_client' || json?.error === 'unauthorized_client') {
      throw new NidoError('config', 'Google rechaza las credenciales del cliente. Revisa el ID y el secreto en Ajustes.')
    }
    throw new NidoError('auth', `Google rechazó la autorización: ${json?.error_description ?? json?.error ?? res.status}`)
  }
  return json
}

/** Revoca un token en Google (sin red, la desconexión en Nido vale igual). */
const revoke = (token: string): Promise<unknown> => fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined)

async function connect(): Promise<GoogleStatus> {
  pendingConnect ??= (async () => {
    const { clientId, clientSecret } = await credentials()
    if (!(await encryptionAvailable())) throw new NidoError('config', 'El cifrado de Windows no está disponible; Nido no guardará credenciales sin cifrar.')
    const previous = await getSecret('google.refreshToken')
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
    // Consentimiento granular: en la pantalla de Google se pueden desmarcar permisos. Sin los dos,
    // Nido no puede funcionar, así que no se guarda una conexión a medias.
    const granted = new Set(String(tokens.scope ?? SCOPES.join(' ')).split(/\s+/))
    const missing = SCOPES.filter((s) => !granted.has(s))
    if (missing.length) {
      void revoke(tokens.refresh_token)
      throw new NidoError(
        'forbidden',
        `No se concedieron todos los permisos (${missing.map((s) => (s.endsWith('readonly') ? 'ver tu lista de calendarios' : 'ver y editar eventos')).join(' y ')}). Vuelve a conectar y deja marcadas las casillas de Google Calendar.`
      )
    }
    await setSecret('google.refreshToken', tokens.refresh_token)
    invalidate()
    calendarColors.clear()
    accessToken = { value: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000 }
    const calendars = await listCalendars()
    const primary = calendars.find((c) => c.primary)
    updateConfig((c) => {
      c.google = { ...c.google, account: primary?.id, expired: false }
    })
    // Cambio de cuenta: el acceso de la anterior se retira también en Google.
    if (previous && previous !== tokens.refresh_token) void revoke(previous)
    return status()
  })().finally(() => {
    pendingConnect = null
  })
  return pendingConnect
}

async function disconnect(): Promise<GoogleStatus> {
  const refresh = await getSecret('google.refreshToken')
  forgetAccount()
  // Revocar en Google es lo correcto, pero si no hay red la cuenta queda desconectada en Nido igualmente.
  if (refresh) await revoke(refresh)
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
  handleResult(IPC.google.clearCredentials, () => clearCredentials())
  handleResult(IPC.google.connect, () => connect())
  handleResult(IPC.google.cancel, () => {
    cancelPending?.()
    return null
  })
  handleResult(IPC.google.disconnect, () => disconnect())
  handleResult(IPC.google.calendars, (force?: boolean) => {
    // «Actualizar» en Ajustes: lista y eventos nuevos, sin caché.
    if (force) invalidate()
    const hit = cached(calendarsCache, CALENDARS_TTL)
    if (hit) return hit
    const value = listCalendars()
    calendarsCache = { at: Date.now(), value }
    value.catch(() => (calendarsCache = null))
    return value
  })
  handleResult(IPC.google.events, (query: GoogleEventsQuery) => {
    const key = JSON.stringify([query.calendarIds, query.timeMin, query.timeMax])
    const hit = cached(eventsCache.get(key), EVENTS_TTL)
    if (hit) return hit
    const value = listEvents(query)
    eventsCache.set(key, { at: Date.now(), value })
    value.catch(() => eventsCache.delete(key))
    while (eventsCache.size > 50) eventsCache.delete(eventsCache.keys().next().value!)
    return value
  })
  // Escrituras: se invalida la caché al terminar (también si fallan).
  const writing = <T>(op: () => Promise<T>): Promise<T> => op().finally(invalidate)
  handleResult(IPC.google.createEvent, (calendarId: string, input: EventInput) =>
    writing(async () =>
      toCalEvent(await api<any>(eventPath(calendarId), { method: 'POST', body: JSON.stringify(eventBody(input, false)) }), calendarId)
    )
  )
  handleResult(IPC.google.updateEvent, (calendarId: string, eventId: string, input: EventInput) =>
    writing(async () =>
      toCalEvent(
        await api<any>(eventPath(calendarId, eventId), { method: 'PATCH', body: JSON.stringify(eventBody(input, true)) }),
        calendarId
      )
    )
  )
  handleResult(IPC.google.deleteEvent, (calendarId: string, eventId: string) =>
    writing(async () => {
      await api(eventPath(calendarId, eventId), { method: 'DELETE' })
      return null
    })
  )
}
