import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// notion.ts vive en el proceso principal: se simulan Electron y los secretos, y fetch hace de Notion.
vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: { handle: vi.fn() }, shell: { openExternal: vi.fn() } }))
vi.mock('../src/main/secrets', () => ({
  getSecret: vi.fn(async (name: string) => (name === 'notion.token' ? 'ntn_prueba' : null)),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  encryptionAvailable: vi.fn(async () => true),
  getConfig: vi.fn(() => ({ notion: { method: 'internal', bot: 'alejaan nido' } })),
  updateConfig: vi.fn()
}))
vi.mock('../src/main/oauthApps', () => ({ oauthApps: () => ({}) }))

const { parseNotionId, pageTodos, setTodo, same, simplify, toNotion } = await import('../src/main/notion')

// ---------- Notion simulado ----------
const rt = (text: string) => [{ type: 'text', plain_text: text, text: { content: text } }]
const blk = (id: string, type: string, extra: Record<string, unknown> = {}, hasChildren = false) => ({
  object: 'block',
  id,
  type,
  has_children: hasChildren,
  in_trash: false,
  [type]: extra
})
const todo = (id: string, text: string, checked = false, hasChildren = false) => blk(id, 'to_do', { rich_text: rt(text), checked, color: 'default' }, hasChildren)

let blocks: Record<string, any[]>
let requests: { method: string; path: string; body?: any }[]

function notionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { pathname, searchParams } = new URL(url)
  const path = pathname.replace(/^\/v1/, '')
  const method = init.method ?? 'GET'
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  requests.push({ method, path, body })
  const json = (status: number, data: unknown): Promise<Response> => Promise.resolve(new Response(JSON.stringify(data), { status }))
  const notFound = () => json(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find object' })

  if (path === '/pages/pagina') return json(200, { object: 'page', id: 'pagina', url: 'https://notion.so/pagina', properties: { title: { type: 'title', title: rt('Mis tareas') } } })
  const children = /^\/blocks\/([^/]+)\/children$/.exec(path)
  if (children) {
    const list = blocks[children[1]]
    if (!list) return notFound()
    // Paginación de 2 en 2 para comprobar que se sigue el cursor.
    const start = Number(searchParams.get('start_cursor') ?? 0)
    const more = start + 2 < list.length
    return json(200, { object: 'list', results: list.slice(start, start + 2), has_more: more, next_cursor: more ? String(start + 2) : null })
  }
  const block = /^\/blocks\/([^/]+)$/.exec(path)
  if (block) {
    const found = Object.values(blocks).flat().find((b) => b.id === block[1])
    if (!found) return notFound()
    if (method === 'PATCH') Object.assign(found[found.type], body[found.type])
    return json(200, found)
  }
  return notFound()
}

beforeEach(() => {
  requests = []
  blocks = {
    pagina: [
      blk('h1', 'heading_2', { rich_text: rt('Casa') }),
      todo('t1', 'Comprar leche'),
      todo('t2', 'Llamar al fontanero', true, true),
      blk('p', 'paragraph', { rich_text: rt('Texto que no es tarea') }),
      blk('tg', 'toggle', { rich_text: rt('Más') }, true),
      blk('h2', 'heading_2', { rich_text: rt('Trabajo') }),
      blk('db', 'child_database', { title: 'Proyectos' }),
      blk('sub', 'child_page', { title: 'Subpágina' }, true),
      blk('sy', 'synced_block', { synced_from: { type: 'block_id', block_id: 'original-oculto' } }, true),
      todo('t4', 'Enviar factura')
    ],
    t2: [todo('t2a', 'Pedir presupuesto')],
    tg: [todo('t3', 'Regar las plantas')],
    sub: [todo('nunca', 'Dentro de una subpágina')]
  }
  vi.stubGlobal('fetch', vi.fn(notionFetch))
})
afterEach(() => vi.unstubAllGlobals())

describe('parseNotionId', () => {
  it('acepta IDs con y sin guiones', () => {
    expect(parseNotionId('99999999888877776666555555555555')).toBe('99999999-8888-7777-6666-555555555555')
    expect(parseNotionId('99999999-8888-7777-6666-555555555555')).toBe('99999999-8888-7777-6666-555555555555')
  })
  it('saca el ID del final de la ruta e ignora el ?v= de la vista', () => {
    expect(parseNotionId('https://www.notion.so/espacio/Tareas-11111111222233334444555555555555?v=abcdefabcdefabcdefabcdefabcdefab')).toBe('11111111-2222-3333-4444-555555555555')
  })
  it('en la vista previa (?p=) usa la página abierta', () => {
    expect(parseNotionId('https://www.notion.so/espacio/Otra-11111111222233334444555555555555?p=99999999888877776666555555555555&pm=s')).toBe('99999999-8888-7777-6666-555555555555')
  })
  it('rechaza lo que no es de Notion', () => {
    expect(parseNotionId('https://example.com/11111111222233334444555555555555')).toBeNull()
    expect(parseNotionId('hola')).toBeNull()
  })
})

describe('conversión de valores', () => {
  it('simplify y toNotion son inversos para los tipos admitidos', () => {
    const values = {
      Nombre: { type: 'title', value: 'Tarea' },
      Estado: { type: 'status', value: 'Listo' },
      Etiquetas: { type: 'multi_select', value: ['a', 'b'] },
      Fecha: { type: 'date', value: { start: '2026-10-28', end: null } },
      Hecha: { type: 'checkbox', value: true }
    } as const
    const notion = toNotion(values as any) as Record<string, any>
    const back = Object.fromEntries(
      Object.entries(notion).map(([name, prop]) => {
        const type = Object.keys(prop)[0]
        const raw = type === 'title' ? { type, title: rt(prop.title[0].text.content) } : { type, ...prop }
        if (type === 'status' || type === 'multi_select') return [name, simplify(type === 'status' ? { type, status: prop.status } : { type, multi_select: prop.multi_select })]
        return [name, simplify(raw)]
      })
    )
    for (const [name, value] of Object.entries(values)) expect(same(back[name], value as any), name).toBe(true)
  })
  it('same ignora el orden de las etiquetas', () => {
    expect(same({ type: 'multi_select', value: ['b', 'a'] }, { type: 'multi_select', value: ['a', 'b'] })).toBe(true)
  })
})

describe('casillas de una página', () => {
  it('lee las casillas en orden, con anidadas y encabezados, siguiendo la paginación', async () => {
    const page = await pageTodos('pagina')
    expect(page.title).toBe('Mis tareas')
    expect(page.todos.map((t) => `${'-'.repeat(t.depth)}${t.checked ? 'x' : ' '} ${t.text} (${t.section})`)).toEqual([
      '  Comprar leche (Casa)',
      'x Llamar al fontanero (Casa)',
      '-  Pedir presupuesto (Casa)',
      '  Regar las plantas (Casa)',
      '  Enviar factura (Trabajo)'
    ])
    expect(page.databases).toEqual([{ id: 'db', title: 'Proyectos' }])
    // La página tiene 10 bloques: 5 peticiones de 2.
    expect(requests.filter((r) => r.path === '/blocks/pagina/children')).toHaveLength(5)
  })

  it('no entra en subpáginas y omite un bloque sincronizado cuyo original no está compartido', async () => {
    const page = await pageTodos('pagina')
    expect(page.todos.some((t) => t.id === 'nunca')).toBe(false)
    expect(requests.some((r) => r.path === '/blocks/sub/children')).toBe(false)
    expect(requests.some((r) => r.path === '/blocks/original-oculto/children')).toBe(true)
  })

  it('una página sin compartir da un error que dice a quién compartirla', async () => {
    await expect(pageTodos('privada')).rejects.toMatchObject({ code: 'notfound', message: expect.stringContaining('alejaan nido') })
  })

  it('marcar envía solo checked y no toca el texto', async () => {
    const result = await setTodo('t1', true, false)
    expect(result.checked).toBe(true)
    const patch = requests.find((r) => r.method === 'PATCH')!
    expect(patch.path).toBe('/blocks/t1')
    expect(patch.body).toEqual({ to_do: { checked: true } })
    expect(result.text).toBe('Comprar leche')
  })

  it('si la casilla cambió en Notion entretanto, avisa con conflict y no escribe', async () => {
    await expect(setTodo('t2', false, false)).rejects.toMatchObject({ code: 'conflict' })
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
  })

  it('un bloque que ya no es una casilla no se toca', async () => {
    await expect(setTodo('p', true, false)).rejects.toMatchObject({ code: 'invalid' })
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
  })
})
