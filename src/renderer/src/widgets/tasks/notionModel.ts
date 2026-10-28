import type {
  DueFilter,
  NotionPage,
  NotionProperty,
  NotionSchema,
  NotionTaskConfig,
  NotionTaskMapping,
  NotionValue,
  TaskFilters
} from '../../../../shared/types'
import { addDays, fromDateKey, startOfDay } from '../../util'

export type Role = keyof NotionTaskMapping

/** Tipos de propiedad de Notion que sirven para cada papel. */
export const COMPATIBLE: Record<Role, string[]> = {
  title: ['title'],
  status: ['status', 'select', 'checkbox'],
  date: ['date'],
  priority: ['select', 'status'],
  tags: ['multi_select']
}

export const ROLE_LABEL: Record<Role, string> = {
  title: 'Título',
  status: 'Estado',
  date: 'Fecha',
  priority: 'Prioridad',
  tags: 'Etiquetas'
}

const NAME_HINTS: Partial<Record<Role, RegExp>> = {
  status: /estado|status|hecho|done|complet/i,
  date: /fecha|vence|venc|due|date|plazo|deadline|entrega/i,
  priority: /prioridad|priority|urgencia/i,
  tags: /etiqueta|tag|categor|tipo|label/i
}

const DONE_HINT = /complet|done|hecho|terminad|finaliz|cerrad|listo/i

export const propByName = (schema: NotionSchema, name?: string): NotionProperty | undefined =>
  name ? schema.properties.find((p) => p.name === name) : undefined

/** Propone una asociación de propiedades a partir de tipos y nombres. */
export function guessMapping(schema: NotionSchema): NotionTaskMapping {
  const title = schema.properties.find((p) => p.type === 'title')?.name ?? ''
  const pick = (role: Exclude<Role, 'title'>, used: Set<string>): string | undefined => {
    const candidates = schema.properties.filter((p) => COMPATIBLE[role].includes(p.type) && !used.has(p.name))
    const hinted = candidates.find((p) => NAME_HINTS[role]?.test(p.name))
    // Estado: si no hay nombre que encaje, cualquier propiedad de tipo estado vale.
    const byType = role === 'status' ? candidates.find((p) => p.type === 'status') : undefined
    return (hinted ?? byType)?.name
  }
  const used = new Set<string>([title])
  const map: NotionTaskMapping = { title }
  for (const role of ['status', 'date', 'priority', 'tags'] as const) {
    const name = pick(role, used)
    if (name) {
      map[role] = name
      used.add(name)
    }
  }
  return map
}

/** Opción que significa «completada» para una propiedad de estado o selección. */
export function guessDone(prop?: NotionProperty): string | undefined {
  if (!prop || prop.type === 'checkbox') return undefined
  if (prop.type === 'status') {
    const group = prop.groups?.find((g) => DONE_HINT.test(g.name)) ?? prop.groups?.[prop.groups.length - 1]
    return group?.options[0]
  }
  return prop.options?.find((o) => DONE_HINT.test(o.name))?.name
}

/** Valor al desmarcar: primera opción del grupo «Por hacer» (estado) o vacío. */
export function undoneValue(prop?: NotionProperty): string | null {
  if (prop?.type === 'status') return prop.groups?.[0]?.options[0] ?? null
  return null
}

export interface NotionTask {
  id: string
  url: string
  title: string
  status: string | null
  done: boolean
  date: { start: string; end?: string | null } | null
  priority: string | null
  tags: string[]
  /** Valores tal como vinieron de Notion (para detectar cambios ajenos al guardar) */
  raw: Record<string, NotionValue>
}

export function toTask(page: NotionPage, config: NotionTaskConfig, schema: NotionSchema): NotionTask {
  const value = (name?: string): NotionValue | undefined => (name ? page.properties[name] : undefined)
  const title = value(config.map.title)
  const status = value(config.map.status)
  const date = value(config.map.date)
  const priority = value(config.map.priority)
  const tags = value(config.map.tags)

  let done = false
  let statusName: string | null = null
  if (status?.type === 'checkbox') done = status.value
  else if (status?.type === 'status' || status?.type === 'select') {
    statusName = status.value
    const prop = propByName(schema, config.map.status)
    const doneGroup = prop?.groups?.find((g) => g.options.includes(config.doneValue ?? ''))
    done = !!statusName && (statusName === config.doneValue || !!doneGroup?.options.includes(statusName))
  }

  return {
    id: page.id,
    url: page.url,
    raw: page.properties,
    title: title?.type === 'title' ? title.value : '',
    status: statusName,
    done,
    date: date?.type === 'date' ? date.value : null,
    priority: priority?.type === 'select' || priority?.type === 'status' ? priority.value : null,
    tags: tags?.type === 'multi_select' ? tags.value : []
  }
}

/** Valor de Notion para marcar/desmarcar como completada; null si no hay propiedad de estado. */
export function doneValueFor(config: NotionTaskConfig, schema: NotionSchema, done: boolean): NotionValue | null {
  const prop = propByName(schema, config.map.status)
  if (!prop) return null
  if (prop.type === 'checkbox') return { type: 'checkbox', value: done }
  const type = prop.type as 'status' | 'select'
  return { type, value: done ? (config.doneValue ?? null) : undoneValue(prop) }
}

export function dueBucket(date: NotionTask['date'], done: boolean): 'overdue' | 'today' | 'week' | 'later' | 'none' {
  if (!date?.start) return 'none'
  const day = fromDateKey(date.start.slice(0, 10))
  const today = startOfDay(new Date())
  if (day < today) return done ? 'later' : 'overdue'
  if (day.getTime() === today.getTime()) return 'today'
  if (day < addDays(today, 7)) return 'week'
  return 'later'
}

export function matchesFilters(task: NotionTask, filters: TaskFilters): boolean {
  if (filters.status === 'open' && task.done) return false
  if (filters.status === 'done' && !task.done) return false
  if (filters.status.startsWith('opt:') && task.status !== filters.status.slice(4)) return false
  if (filters.priority !== 'all' && task.priority !== filters.priority) return false
  const due: DueFilter = filters.due
  if (due !== 'all') {
    const bucket = dueBucket(task.date, task.done)
    if (due === 'overdue' && bucket !== 'overdue') return false
    if (due === 'today' && bucket !== 'today' && bucket !== 'overdue') return false
    if (due === 'week' && bucket !== 'week' && bucket !== 'today' && bucket !== 'overdue') return false
    if (due === 'none' && bucket !== 'none') return false
  }
  return true
}

/** Orden: pendientes primero, luego por fecha (sin fecha al final) y prioridad. */
export function sortTasks(tasks: NotionTask[], priorityOrder: string[]): NotionTask[] {
  const rank = (p: string | null): number => (p ? priorityOrder.indexOf(p) : 999)
  return [...tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.date?.start ?? '9999').localeCompare(b.date?.start ?? '9999') ||
      rank(a.priority) - rank(b.priority) ||
      a.title.localeCompare(b.title)
  )
}

export const DEFAULT_FILTERS: TaskFilters = { status: 'open', priority: 'all', due: 'all' }
