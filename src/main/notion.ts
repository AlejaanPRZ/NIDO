import {
  IPC,
  type NotionPage,
  type NotionProperty,
  type NotionSchema,
  type NotionSource,
  type NotionStatus,
  type NotionValue
} from '../shared/types'
import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { handleResult, NidoError, readJson, serviceUrl } from './errors'
import { waitForRedirect } from './loopback'
import { oauthApps } from './oauthApps'
import { deleteSecret, encryptionAvailable, getConfig, getSecret, setSecret, updateConfig } from './secrets'

// Notion de dos maneras:
// - Autorización oficial (integración pública): el navegador abre Notion, el usuario inicia sesión
//   como lo haga siempre (también con Google, dentro de Notion), elige el espacio y las páginas.
//   Notion exige un secreto confidencial para canjear el código, así que el canje lo hace un
//   intercambiador externo (server/notion-oauth) y la app solo recibe los tokens.
// - Token de integración interna (opciones avanzadas), para quien no tenga intercambiador.
// API 2026-03-11: las bases de datos se consultan a través de sus "data sources".

const API = serviceUrl('NIDO_NOTION_API', 'https://api.notion.com/v1')
const VERSION = '2026-03-11'
const MAX_PAGES = 1000
const AUTH_URL = serviceUrl('NIDO_NOTION_AUTH_URL', 'https://api.notion.com/v1/oauth/authorize')
const AUTH_TIMEOUT_MS = 5 * 60_000

let pendingConnect: Promise<NotionStatus> | null = null
let cancelPending: (() => void) | null = null
let refreshing: Promise<string | null> | null = null

async function status(): Promise<NotionStatus> {
  const config = getConfig().notion ?? {}
  const connected = !!(await getSecret('notion.token'))
  return {
    oauth: !!oauthApps().notion,
    connected,
    method: connected ? (config.method ?? 'internal') : undefined,
    expired: !!config.expired,
    workspace: config.workspace,
    bot: config.bot,
    encryption: await encryptionAvailable()
  }
}

function apiError(status: number, json: any): NidoError {
  const message = json?.message as string | undefined
  if (status === 401) return new NidoError('auth', 'Notion no acepta el token. Revísalo o crea uno nuevo en tu integración.')
  if (status === 403) return new NidoError('forbidden', 'La integración no tiene permiso para esto en Notion.')
  if (status === 404) {
    return new NidoError('notfound', 'Notion no encuentra la base de datos. ¿Está compartida con la integración (Conexiones)?')
  }
  if (status === 429) return new NidoError('rate', 'Notion limita las peticiones ahora mismo. Reintenta en unos segundos.')
  if (status >= 500) return new NidoError('network', 'Notion no responde. Reintenta en unos minutos.')
  return new NidoError('invalid', message ?? `Error ${status} de Notion.`)
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const MAX_ATTEMPTS = 3

async function call<T>(path: string, init: RequestInit = {}, explicitToken?: string, attempt = 0, refreshed = false): Promise<T> {
  const token = explicitToken ?? (await getSecret('notion.token'))
  if (!token) throw new NidoError('auth', 'No hay ninguna cuenta de Notion conectada.')
  // Se puede repetir sin efectos duplicados: lecturas, consultas y PATCH.
  const idempotent = (init.method ?? 'GET') !== 'POST' || path.endsWith('/query') || path === '/search'
  const backoff = async (seconds?: number): Promise<T> => {
    await wait(seconds ? Math.min(seconds, 10) * 1000 : 700 * 2 ** attempt)
    return call(path, init, explicitToken, attempt + 1, refreshed)
  }
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(20_000),
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json'
      }
    })
  } catch {
    if (idempotent && attempt < MAX_ATTEMPTS - 1) return backoff()
    throw new NidoError('network', 'No hay conexión con Notion.')
  }
  // Límite de ritmo o conflicto puntual: reintento con espera progresiva (respetando Retry-After).
  const retry = res.status === 429 || res.status === 409 || (res.status >= 500 && idempotent)
  if (retry && attempt < MAX_ATTEMPTS - 1) return backoff(Number(res.headers.get('retry-after')) || undefined)
  const json = await readJson(res)
  if (res.status === 401 && !explicitToken && !refreshed && getConfig().notion?.method === 'oauth') {
    // Autorización oficial: el token de acceso puede haber caducado; se renueva una vez y se reintenta.
    if (await refreshToken()) return call(path, init, explicitToken, attempt, true)
  }
  if (res.status === 401 && !explicitToken) {
    // El token guardado ya no vale (revocado o integración borrada).
    deleteSecret('notion.token')
    deleteSecret('notion.refreshToken')
    updateConfig((c) => {
      c.notion = { ...c.notion, expired: true }
    })
  }
  if (!res.ok) throw apiError(res.status, json)
  return json as T
}

// Varios widgets pueden mostrar la misma base de datos: una consulta compartida.
const QUERY_TTL = 30_000
const queryCache = new Map<string, { at: number; value: Promise<NotionPage[]> }>()

async function setToken(raw: string): Promise<NotionStatus> {
  const token = raw.trim()
  if (!/^(ntn_|secret_)[\w-]{20,}$/.test(token)) {
    throw new NidoError('invalid', 'El token de una integración interna empieza por «ntn_» (o «secret_» en las antiguas).')
  }
  // Se valida contra Notion antes de guardarlo.
  const me = await call<any>('/users/me', {}, token)
  await setSecret('notion.token', token)
  updateConfig((c) => {
    c.notion = { method: 'internal', bot: me?.name ?? undefined, workspace: me?.bot?.workspace_name ?? undefined, expired: false }
  })
  queryCache.clear()
  return status()
}

// ---------- Autorización oficial (OAuth público con intercambiador) ----------

const base64url = (buf: Buffer): string => buf.toString('base64url')

async function broker<T>(path: string, body: Record<string, string>): Promise<T> {
  const app = oauthApps().notion
  if (!app) throw new NidoError('config', 'Esta copia de Nido no tiene configurada la autorización de Notion.')
  let res: Response
  try {
    res = await fetch(`${app.brokerUrl}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    throw new NidoError('network', 'No hay conexión con el servicio de autorización de Nido.')
  }
  const json = await readJson(res)
  if (!res.ok) {
    const error = String(json?.error ?? res.status)
    if (error === 'invalid_grant') throw new NidoError('auth', 'Notion ya no acepta esta autorización. Vuelve a conectar.')
    throw new NidoError(res.status >= 500 ? 'network' : 'auth', `Notion rechazó la autorización: ${json?.error_description ?? error}`)
  }
  return json as T
}

interface NotionTokens {
  access_token: string
  refresh_token?: string
  bot_id?: string
  workspace_name?: string
}

async function saveTokens(tokens: NotionTokens): Promise<void> {
  if (!tokens?.access_token) throw new NidoError('auth', 'Notion no devolvió un token de acceso.')
  await setSecret('notion.token', tokens.access_token)
  if (tokens.refresh_token) await setSecret('notion.refreshToken', tokens.refresh_token)
}

async function connect(): Promise<NotionStatus> {
  pendingConnect ??= (async () => {
    const app = oauthApps().notion
    if (!app) throw new NidoError('config', 'Esta copia de Nido no tiene configurada la autorización de Notion. Usa un token de integración interna en Opciones avanzadas.')
    if (!(await encryptionAvailable())) throw new NidoError('config', 'El cifrado del sistema no está disponible; Nido no guardará credenciales sin cifrar.')
    // El intercambiador devuelve el navegador a este puerto local. Solo canjea el código si se le
    // presenta el verificador cuyo hash va en el state (como PKCE): quien intercepte el código no basta.
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const nonce = base64url(randomBytes(16))
    const redirect = await waitForRedirect({
      path: '/notion',
      // El state lleva el puerto local (para que el intercambiador sepa adónde volver), un valor
      // aleatorio y el hash del verificador. No contiene nada secreto.
      state: (port) => base64url(Buffer.from(JSON.stringify({ p: port, n: nonce, c: challenge }))),
      service: 'Notion',
      timeoutMs: AUTH_TIMEOUT_MS
    })
    cancelPending = redirect.cancel
    const params = new URLSearchParams({
      client_id: app.clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: `${app.brokerUrl}/callback`,
      state: redirect.state
    })
    const authUrl = `${AUTH_URL}?${params}`
    try {
      if (process.env.NIDO_DEV_AUTH_FETCH && AUTH_URL !== 'https://api.notion.com/v1/oauth/authorize') {
        // Solo pruebas con servidor simulado: sigue las redirecciones sin abrir el navegador.
        void fetch(authUrl).catch(() => undefined)
      } else {
        await shell.openExternal(authUrl)
      }
      const result = await redirect.result
      const tokens = await broker<NotionTokens>('/token', { code: result.get('code')!, state: redirect.state, verifier })
      // Se comprueba que el token funciona antes de darlo por conectado.
      const me = await call<any>('/users/me', {}, tokens.access_token)
      await saveTokens(tokens)
      updateConfig((c) => {
        c.notion = {
          method: 'oauth',
          bot: me?.name ?? undefined,
          workspace: tokens.workspace_name ?? me?.bot?.workspace_name ?? undefined,
          expired: false
        }
      })
      queryCache.clear()
      return status()
    } catch (err) {
      redirect.cancel()
      throw err
    } finally {
      cancelPending = null
    }
  })().finally(() => {
    pendingConnect = null
  })
  return pendingConnect
}

async function refreshToken(): Promise<string | null> {
  refreshing ??= (async () => {
    const refresh = await getSecret('notion.refreshToken')
    if (!refresh || !oauthApps().notion) return null
    try {
      const tokens = await broker<NotionTokens>('/refresh', { refresh_token: refresh })
      await saveTokens(tokens)
      return tokens.access_token
    } catch {
      return null
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

function disconnect(): Promise<NotionStatus> {
  deleteSecret('notion.token')
  deleteSecret('notion.refreshToken')
  updateConfig((c) => {
    delete c.notion
  })
  return status()
}

const plainText = (rich: any[] | undefined): string => (rich ?? []).map((t) => t.plain_text ?? '').join('')

async function search(query: string): Promise<NotionSource[]> {
  const json = await call<any>('/search', {
    method: 'POST',
    body: JSON.stringify({
      query: query.trim() || undefined,
      filter: { property: 'object', value: 'data_source' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 50
    })
  })
  return (json.results ?? [])
    .filter((r: any) => r.object === 'data_source')
    .map((r: any) => ({ id: r.id, title: plainText(r.title) || 'Sin título' }))
}

async function schema(dataSourceId: string): Promise<NotionSchema> {
  const ds = await call<any>(`/data_sources/${encodeURIComponent(dataSourceId)}`)
  const properties: NotionProperty[] = Object.values<any>(ds.properties ?? {}).map((p) => {
    const config = p[p.type] ?? {}
    const options = Array.isArray(config.options)
      ? config.options.map((o: any) => ({ name: o.name, color: o.color ?? 'default' }))
      : undefined
    const byId = new Map<string, string>((config.options ?? []).map((o: any) => [o.id, o.name]))
    const groups =
      p.type === 'status' && Array.isArray(config.groups)
        ? config.groups.map((g: any) => ({
            name: g.name,
            options: (g.option_ids ?? []).map((id: string) => byId.get(id)).filter(Boolean)
          }))
        : undefined
    return { id: p.id, name: p.name, type: p.type, options, groups }
  })
  return { id: ds.id, title: plainText(ds.title) || 'Sin título', properties }
}

function simplify(prop: any): NotionValue | undefined {
  switch (prop?.type) {
    case 'title':
      return { type: 'title', value: plainText(prop.title) }
    case 'status':
      return { type: 'status', value: prop.status?.name ?? null }
    case 'select':
      return { type: 'select', value: prop.select?.name ?? null }
    case 'multi_select':
      return { type: 'multi_select', value: (prop.multi_select ?? []).map((o: any) => o.name) }
    case 'date':
      return { type: 'date', value: prop.date ? { start: prop.date.start, end: prop.date.end } : null }
    case 'checkbox':
      return { type: 'checkbox', value: !!prop.checkbox }
    default:
      return undefined
  }
}

function toPage(page: any): NotionPage {
  const properties: Record<string, NotionValue> = {}
  for (const [name, prop] of Object.entries<any>(page.properties ?? {})) {
    const value = simplify(prop)
    if (value) properties[name] = value
  }
  return { id: page.id, url: page.url, properties }
}

function toNotion(values: Record<string, NotionValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, v] of Object.entries(values)) {
    switch (v.type) {
      case 'title':
        out[name] = { title: [{ type: 'text', text: { content: String(v.value).slice(0, 2000) } }] }
        break
      case 'status':
      case 'select':
        out[name] = { [v.type]: v.value ? { name: v.value } : null }
        break
      case 'multi_select':
        out[name] = { multi_select: v.value.map((n) => ({ name: n })) }
        break
      case 'date':
        out[name] = { date: v.value ? { start: v.value.start, end: v.value.end ?? null } : null }
        break
      case 'checkbox':
        out[name] = { checkbox: !!v.value }
        break
      default:
        throw new NidoError('invalid', 'Tipo de propiedad no admitido.')
    }
  }
  return out
}

async function query(dataSourceId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | undefined
  do {
    const json = await call<any>(`/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, result_type: 'page', ...(cursor ? { start_cursor: cursor } : {}) })
    })
    for (const r of json.results ?? []) if (r.object === 'page' && !r.in_trash) pages.push(toPage(r))
    cursor = json.has_more ? json.next_cursor : undefined
  } while (cursor && pages.length < MAX_PAGES)
  return pages
}

export function registerNotion(): void {
  handleResult(IPC.notion.status, () => status())
  handleResult(IPC.notion.connect, () => connect())
  handleResult(IPC.notion.cancel, () => {
    cancelPending?.()
    return null
  })
  handleResult(IPC.notion.setToken, (token: string) => setToken(String(token ?? '')))
  handleResult(IPC.notion.disconnect, () => disconnect())
  handleResult(IPC.notion.search, (q: string) => search(String(q ?? '')))
  handleResult(IPC.notion.schema, (id: string) => schema(String(id)))
  handleResult(IPC.notion.query, (id: string) => {
    const key = String(id)
    const hit = queryCache.get(key)
    if (hit && Date.now() - hit.at < QUERY_TTL) return hit.value
    const value = query(key)
    queryCache.set(key, { at: Date.now(), value })
    value.catch(() => queryCache.delete(key))
    return value
  })
  // Las escrituras invalidan la caché de consultas al terminar.
  const writing = <T>(op: () => Promise<T>): Promise<T> => op().finally(() => queryCache.clear())
  handleResult(IPC.notion.create, (dataSourceId: string, values: Record<string, NotionValue>) =>
    writing(async () =>
      toPage(
        await call<any>('/pages', {
          method: 'POST',
          body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties: toNotion(values) })
        })
      )
    )
  )
  handleResult(IPC.notion.update, (pageId: string, values: Record<string, NotionValue>) =>
    writing(async () =>
      toPage(
        await call<any>(`/pages/${encodeURIComponent(pageId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: toNotion(values) })
        })
      )
    )
  )
}
