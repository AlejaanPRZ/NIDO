import {
  IPC,
  type NotionAccess,
  type NotionLinkCheck,
  type NotionPageTodos,
  type NotionTodo,
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

// Sin nido.oauth.json no hay inicio de sesión oficial; la interfaz no lo ofrece, pero si llega aquí se explica.
const NO_OAUTH = 'Esta copia de Nido no tiene preparado el inicio de sesión oficial de Notion (falta la integración pública del desarrollador). Conecta con un token de integración interna.'

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

/** Cómo se llama la conexión en Notion, para que las instrucciones digan qué buscar. */
function connectionName(): string {
  const config = getConfig().notion
  return config?.method === 'internal' && config.bot ? `la integración «${config.bot}»` : 'Nido'
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Pasos para compartir una base de datos con la conexión (dependen de cómo se conectó). */
export function shareHint(what: 'base de datos' | 'página' = 'base de datos'): string {
  const config = getConfig().notion
  const name = config?.method === 'internal' ? (config.bot ? `«${config.bot}»` : 'tu integración') : 'Nido'
  return `En Notion, abre la ${what} → ••• → Conexiones → Añadir conexiones y elige ${name}.`
}

function apiError(status: number, json: any): NidoError {
  const message = json?.message as string | undefined
  const internal = getConfig().notion?.method === 'internal'
  if (status === 401) {
    return new NidoError(
      'auth',
      internal ? 'Notion no acepta el token: se borró la integración o se regeneró su token. Pega el token actual.' : 'Notion ya no acepta la autorización de Nido. Vuelve a conectar.'
    )
  }
  if (status === 403) {
    // restricted_resource: la integración existe pero no tiene esa capacidad (leer, insertar, actualizar).
    return new NidoError(
      'forbidden',
      internal
        ? `${capitalize(connectionName())} no tiene permiso para esto. En Notion → Integraciones → ${getConfig().notion?.bot ?? 'tu integración'} → Capacidades, activa leer, actualizar e insertar contenido.`
        : 'Nido no tiene permiso para esto en Notion. Vuelve a conectar y autoriza el acceso.'
    )
  }
  if (status === 404) {
    return new NidoError('notfound', `Notion no encuentra ese contenido o ${connectionName()} no tiene acceso. ${shareHint()}`)
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
  if (!app) throw new NidoError('config', NO_OAUTH)
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
    if (!app) throw new NidoError('config', NO_OAUTH)
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

/** Bases de datos (fuentes de datos) compartidas con la conexión. Pagina hasta 200. */
async function search(query: string): Promise<NotionSource[]> {
  const out: NotionSource[] = []
  let cursor: string | undefined
  do {
    const json = await call<any>('/search', {
      method: 'POST',
      body: JSON.stringify({
        query: query.trim() || undefined,
        filter: { property: 'object', value: 'data_source' },
        sort: { timestamp: 'last_edited_time', direction: 'descending' },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {})
      })
    })
    for (const r of json.results ?? []) {
      if (r.object === 'data_source' && !r.in_trash) out.push({ id: r.id, title: plainText(r.title) || 'Sin título' })
    }
    cursor = json.has_more ? json.next_cursor : undefined
  } while (cursor && out.length < 200)
  return out
}

/** «Comprobar acceso»: token válido, bases visibles y lectura real de la elegida (sin caché). */
async function check(dataSourceId?: string): Promise<NotionAccess> {
  const me = await call<any>('/users/me')
  const [sources, pages] = await Promise.all([search(''), searchPages('')])
  const config = getConfig().notion
  const access: NotionAccess = {
    workspace: me?.bot?.workspace_name ?? config?.workspace,
    bot: me?.name ?? config?.bot,
    method: config?.method,
    sources: sources.length,
    list: sources.slice(0, 50),
    pages: pages.slice(0, 50)
  }
  if (dataSourceId) {
    try {
      await schema(dataSourceId)
      access.readable = true
      access.rows = (await query(dataSourceId)).length
      queryCache.delete(dataSourceId)
    } catch (err) {
      if (err instanceof NidoError && (err.code === 'notfound' || err.code === 'forbidden')) {
        access.readable = false
        access.problem = err.message
      } else throw err
    }
  }
  return access
}

/**
 * Saca el ID de un enlace de Notion o lo acepta tal cual. En los enlaces de bases de datos el ID
 * va al final de la ruta (…/Tareas-<32 hex>); el ?v= es el de la vista y no sirve.
 */
export function parseNotionId(link: string): string | null {
  const raw = link.trim()
  const asId = (hex: string): string => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  const plain = raw.replace(/-/g, '')
  if (/^[0-9a-f]{32}$/i.test(plain)) return asId(plain.toLowerCase())
  let path = raw
  try {
    const url = new URL(raw)
    if (!/(^|\.)notion\.(so|site|com)$/.test(url.hostname)) return null
    path = url.pathname
    const peek = url.searchParams.get('p')?.replace(/-/g, '')
    if (peek && /^[0-9a-f]{32}$/i.test(peek)) return asId(peek.toLowerCase())
  } catch {
    return null
  }
  const matches = path.replace(/-/g, '').match(/[0-9a-f]{32}/gi)
  return matches ? asId(matches[matches.length - 1].toLowerCase()) : null
}

/** «Comprobar enlace»: acepta el de una base de datos (o el ID de una fuente de datos) y comprueba que se lee. */
export async function resolve(link: string): Promise<NotionLinkCheck> {
  const id = parseNotionId(link)
  if (!id) throw new NidoError('invalid', 'Eso no parece un enlace de Notion. En Notion, abre la base de datos como página completa → ••• → Copiar enlace.')
  // Errores que significan «no es de este tipo o no hay acceso»: se prueba el siguiente tipo.
  const tryGet = async (path: string): Promise<any | null> => {
    try {
      return await call<any>(path)
    } catch (err) {
      if (err instanceof NidoError && (err.code === 'notfound' || err.code === 'invalid')) return null
      throw err
    }
  }
  const count = async (source: NotionSource): Promise<NotionSource & { pages: number }> => {
    const pages = await query(source.id)
    queryCache.delete(source.id)
    return { ...source, pages: pages.length }
  }
  const ds = await tryGet(`/data_sources/${id}`)
  if (ds?.object === 'data_source') {
    const source = { id: ds.id, title: plainText(ds.title) || 'Sin título' }
    return { kind: 'database', title: source.title, sources: [await count(source)] }
  }
  const db = await tryGet(`/databases/${id}`)
  if (db?.object === 'database') {
    const list: NotionSource[] = (db.data_sources ?? []).map((s: any) => ({ id: s.id, title: s.name || plainText(db.title) || 'Sin título' }))
    if (!list.length) throw new NidoError('notfound', `Esa base de datos no tiene fuentes de datos que ${connectionName()} pueda leer.`)
    return { kind: 'database', title: plainText(db.title) || list[0].title, sources: await Promise.all(list.map(count)) }
  }
  const page = await tryGet(`/pages/${id}`)
  if (page?.object === 'page') {
    // Una página normal: sus casillas (y las bases de datos que tenga dentro).
    const todos = await pageTodos(page.id, page)
    return { kind: 'page', title: todos.title, sources: [], page: todos }
  }
  throw new NidoError('notfound', `${capitalize(connectionName())} no tiene acceso a ese enlace, o no existe. ${shareHint('página')}`)
}

// ---------- Casillas de páginas normales (bloques to_do) ----------

/** Título de una página: la propiedad de tipo title (su nombre cambia: «title», «Nombre»…). */
function pageTitle(page: any): string {
  const prop = Object.values<any>(page?.properties ?? {}).find((p) => p?.type === 'title')
  return plainText(prop?.title) || 'Sin título'
}

/** Páginas normales compartidas con la conexión. Las filas de una base de datos también son páginas: se excluyen. */
async function searchPages(text: string): Promise<NotionSource[]> {
  const out: NotionSource[] = []
  let cursor: string | undefined
  do {
    const json = await call<any>('/search', {
      method: 'POST',
      body: JSON.stringify({
        query: text.trim() || undefined,
        filter: { property: 'object', value: 'page' },
        sort: { timestamp: 'last_edited_time', direction: 'descending' },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {})
      })
    })
    for (const r of json.results ?? []) {
      const parent = r.parent?.type
      if (r.object !== 'page' || r.in_trash || parent === 'database_id' || parent === 'data_source_id') continue
      out.push({ id: r.id, title: pageTitle(r) })
    }
    cursor = json.has_more ? json.next_cursor : undefined
  } while (cursor && out.length < 200)
  return out
}

const MAX_BLOCKS = 3000
const MAX_DEPTH = 8
const HEADINGS = new Set(['heading_1', 'heading_2', 'heading_3'])

/** Hijos directos de un bloque (o página), paginando de 100 en 100. */
async function blockChildren(blockId: string): Promise<any[]> {
  const out: any[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) })
    const json = await call<any>(`/blocks/${encodeURIComponent(blockId)}/children?${params}`)
    out.push(...(json.results ?? []))
    cursor = json.has_more ? json.next_cursor : undefined
  } while (cursor)
  return out
}

const toTodo = (block: any, depth: number, section?: string): NotionTodo => ({
  id: block.id,
  text: plainText(block.to_do?.rich_text),
  checked: !!block.to_do?.checked,
  depth,
  ...(section ? { section } : {})
})

/**
 * Casillas de una página, en orden. La API solo da un nivel de hijos por petición: se recorren los
 * bloques con hijos (casillas con subtareas, desplegables, columnas, callouts, bloques sincronizados…).
 * No se entra en subpáginas ni en bases de datos, que son contenido aparte.
 */
export async function pageTodos(pageId: string, known?: any): Promise<NotionPageTodos> {
  let page = known
  if (!page) {
    try {
      page = await call<any>(`/pages/${encodeURIComponent(pageId)}`)
    } catch (err) {
      if (err instanceof NidoError && err.code === 'notfound') {
        throw new NidoError('notfound', `${capitalize(connectionName())} no tiene acceso a esta página, o se ha borrado. ${shareHint('página')}`)
      }
      throw err
    }
  }
  const todos: NotionTodo[] = []
  const databases: NotionSource[] = []
  let seen = 0
  let truncated = false
  let section: string | undefined
  const walk = async (blockId: string, depth: number, level: number): Promise<void> => {
    for (const block of await blockChildren(blockId)) {
      if (++seen > MAX_BLOCKS) {
        truncated = true
        return
      }
      if (!block.type || block.in_trash) continue // objeto parcial o en la papelera
      if (HEADINGS.has(block.type)) section = plainText(block[block.type]?.rich_text) || undefined
      if (block.type === 'to_do') todos.push(toTodo(block, depth, section))
      if (block.type === 'child_database') databases.push({ id: block.id, title: block.child_database?.title || 'Base de datos sin título' })
      if (block.type === 'child_page' || block.type === 'child_database') continue
      // Copia de un bloque sincronizado: el contenido vive en el original, que puede estar en una
      // página no compartida; entonces se omite sin que falle el resto.
      const synced = block.type === 'synced_block' ? block.synced_block?.synced_from?.block_id : undefined
      if (synced) {
        if (level >= MAX_DEPTH) truncated = true
        else
          await walk(synced, depth, level + 1).catch((err) => {
            if (!(err instanceof NidoError && (err.code === 'notfound' || err.code === 'forbidden'))) throw err
          })
      } else if (block.has_children) {
        if (level >= MAX_DEPTH) truncated = true
        else await walk(block.id, depth + (block.type === 'to_do' ? 1 : 0), level + 1)
      }
    }
  }
  await walk(page.id, 0, 0)
  return { id: page.id, title: pageTitle(page), url: page.url, todos, databases, truncated }
}

/** Marca o desmarca una casilla. Solo se envía `checked`: Notion conserva el texto, el color y los hijos. */
export async function setTodo(blockId: string, checked: boolean, before?: boolean): Promise<NotionTodo> {
  const path = `/blocks/${encodeURIComponent(blockId)}`
  let current: any
  try {
    current = await call<any>(path)
  } catch (err) {
    if (err instanceof NidoError && err.code === 'notfound') throw new NidoError('notfound', 'Esa casilla ya no existe en Notion (se borró o se movió a otra página).')
    throw err
  }
  if (current.type !== 'to_do') throw new NidoError('invalid', 'Ese bloque ya no es una casilla en Notion.')
  if (before !== undefined && !!current.to_do?.checked !== before) {
    throw new NidoError('conflict', 'Esta casilla ha cambiado en Notion mientras tanto. Se ha recargado: revisa y vuelve a marcarla.')
  }
  const updated = await call<any>(path, { method: 'PATCH', body: JSON.stringify({ to_do: { checked } }) })
  return toTodo(updated, 0)
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

export function simplify(prop: any): NotionValue | undefined {
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
  return { id: page.id, url: page.url, lastEdited: page.last_edited_time, properties }
}

/** Compara dos valores simplificados (las fechas, por su día y hora tal como los da Notion). */
export function same(a: NotionValue | undefined, b: NotionValue | undefined): boolean {
  const norm = (v: NotionValue | undefined): unknown => {
    if (!v) return null
    if (v.type === 'multi_select') return [...v.value].sort()
    if (v.type === 'date') return v.value ? { start: v.value.start, end: v.value.end ?? null } : null
    if (v.type === 'title') return String(v.value).trim()
    return v.value
  }
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

export function toNotion(values: Record<string, NotionValue>): Record<string, unknown> {
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
  handleResult(IPC.notion.update, (pageId: string, values: Record<string, NotionValue>, before?: Record<string, NotionValue>) =>
    writing(async () => {
      const path = `/pages/${encodeURIComponent(pageId)}`
      if (before && Object.keys(before).length) {
        // Sin sobrescrituras silenciosas: si alguien cambió en Notion lo que vamos a cambiar, se avisa.
        const current = toPage(await call<any>(path))
        const changed = Object.keys(before).filter((name) => same(current.properties[name], before[name]) === false)
        if (changed.length) {
          throw new NidoError('conflict', `Esta tarea ha cambiado en Notion mientras la editabas (${changed.join(', ')}). Se ha recargado: revisa y vuelve a guardar.`)
        }
      }
      return toPage(await call<any>(path, { method: 'PATCH', body: JSON.stringify({ properties: toNotion(values) }) }))
    })
  )
  handleResult(IPC.notion.check, (id?: string) => check(id ? String(id) : undefined))
  handleResult(IPC.notion.resolve, (link: string) => resolve(String(link ?? '')))
  handleResult(IPC.notion.searchPages, (q: string) => searchPages(String(q ?? '')))
  handleResult(IPC.notion.todos, (pageId: string) => pageTodos(String(pageId)))
  handleResult(IPC.notion.setTodo, (blockId: string, checked: boolean, before?: boolean) =>
    setTodo(String(blockId), !!checked, typeof before === 'boolean' ? before : undefined)
  )
}
