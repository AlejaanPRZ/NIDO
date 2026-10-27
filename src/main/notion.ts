import {
  IPC,
  type NotionPage,
  type NotionProperty,
  type NotionSchema,
  type NotionSource,
  type NotionStatus,
  type NotionValue
} from '../shared/types'
import { handleResult, NidoError, readJson, serviceUrl } from './errors'
import { deleteSecret, encryptionAvailable, getConfig, getSecret, setSecret, updateConfig } from './secrets'

// Notion con un token de integración interna (el usuario la crea y comparte
// con ella la base de datos). API 2026-03-11: las bases de datos se consultan
// a través de sus "data sources" (/v1/data_sources/{id}/query).

const API = serviceUrl('NIDO_NOTION_API', 'https://api.notion.com/v1')
const VERSION = '2026-03-11'
const MAX_PAGES = 1000

async function status(): Promise<NotionStatus> {
  const config = getConfig().notion ?? {}
  return {
    connected: !!(await getSecret('notion.token')),
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

async function call<T>(path: string, init: RequestInit = {}, explicitToken?: string, attempt = 0): Promise<T> {
  const token = explicitToken ?? (await getSecret('notion.token'))
  if (!token) throw new NidoError('auth', 'No hay ninguna cuenta de Notion conectada.')
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json'
      }
    })
  } catch {
    throw new NidoError('network', 'No hay conexión con Notion.')
  }
  // Límite de ritmo o conflicto puntual: un reintento respetando Retry-After.
  if ((res.status === 429 || res.status === 409) && attempt < 1) {
    const retryAfter = Number(res.headers.get('retry-after')) || 1
    await wait(Math.min(retryAfter, 10) * 1000)
    return call(path, init, token, attempt + 1)
  }
  const json = await readJson(res)
  if (!res.ok) throw apiError(res.status, json)
  return json as T
}

async function setToken(raw: string): Promise<NotionStatus> {
  const token = raw.trim()
  if (!/^(ntn_|secret_)[\w-]{20,}$/.test(token)) {
    throw new NidoError('invalid', 'El token de una integración interna empieza por «ntn_» (o «secret_» en las antiguas).')
  }
  // Se valida contra Notion antes de guardarlo.
  const me = await call<any>('/users/me', {}, token)
  await setSecret('notion.token', token)
  updateConfig((c) => {
    c.notion = { bot: me?.name ?? undefined, workspace: me?.bot?.workspace_name ?? undefined }
  })
  return status()
}

function disconnect(): Promise<NotionStatus> {
  deleteSecret('notion.token')
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
  handleResult(IPC.notion.setToken, (token: string) => setToken(String(token ?? '')))
  handleResult(IPC.notion.disconnect, () => disconnect())
  handleResult(IPC.notion.search, (q: string) => search(String(q ?? '')))
  handleResult(IPC.notion.schema, (id: string) => schema(String(id)))
  handleResult(IPC.notion.query, (id: string) => query(String(id)))
  handleResult(IPC.notion.create, async (dataSourceId: string, values: Record<string, NotionValue>) =>
    toPage(
      await call<any>('/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties: toNotion(values) })
      })
    )
  )
  handleResult(IPC.notion.update, async (pageId: string, values: Record<string, NotionValue>) =>
    toPage(
      await call<any>(`/pages/${encodeURIComponent(pageId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: toNotion(values) })
      })
    )
  )
}
