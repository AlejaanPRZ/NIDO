import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo } from '../../BrandLogo'
import type { ErrorCode, NotionPage, NotionSchema, NotionStatus, NotionTaskConfig, NotionValue, Result, TaskFilters } from '../../../../shared/types'
import { publishSearchItems, useActive, useApp, useInterval } from '../../context'
import { Icon } from '../../icons'
import { EmptyState, Spinner } from '../../ui/controls'
import { toast } from '../../ui/feedback'
import { MenuButton, type MenuItem } from '../../ui/Menu'
import { Modal } from '../../ui/Modal'
import { fromDateKey } from '../../util'
import { INTEGRATIONS_EVENT } from '../calendar/useGoogleCalendar'
import type { WidgetProps } from '../types'
import {
  DEFAULT_FILTERS,
  doneValueFor,
  dueBucket,
  matchesFilters,
  propByName,
  sortTasks,
  toTask,
  type NotionTask
} from './notionModel'
import { NotionChecklist } from './NotionChecklist'
import { NotionSetup } from './NotionSetup'

const REFRESH_MS = 60_000
const dateLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

interface FailedOp {
  label: string
  error: string
  retry?(): Promise<void>
}

export function NotionTasks({ widget, update }: WidgetProps<'tasks'>): JSX.Element {
  const { openSettings } = useApp()
  const config = widget.data.notion
  const filters = widget.data.filters ?? DEFAULT_FILTERS
  const [status, setStatus] = useState<NotionStatus | null>(null)
  const [editingConfig, setEditingConfig] = useState(false)

  const loadStatus = useCallback(() => {
    window.nido.notion.status().then((r) => r.ok && setStatus(r.data))
  }, [])
  useEffect(() => {
    loadStatus()
    window.addEventListener(INTEGRATIONS_EVENT, loadStatus)
    return () => window.removeEventListener(INTEGRATIONS_EVENT, loadStatus)
  }, [loadStatus])

  if (!status) return <EmptyState icon={<Spinner />} title="Comprobando Notion…" />

  if (!status.connected) {
    return (
      <EmptyState
        icon={<BrandLogo brand="notion" name="Notion" size={30} decorative />}
        title="Notion sin conectar"
        action={
          <button className="btn primary small" onClick={() => openSettings('conexiones')}>
            Conectar Notion
          </button>
        }
      >
        Conecta tu cuenta de Notion para usar una base de datos, o las casillas de una página, como lista de tareas.
      </EmptyState>
    )
  }

  const pageConfig = widget.data.notionPage
  if ((!config && !pageConfig) || editingConfig) {
    return (
      <NotionSetup
        current={config}
        onSave={(c) => {
          update({ notion: c, notionPage: undefined })
          setEditingConfig(false)
        }}
        onSavePage={(c) => {
          update({ notionPage: c })
          setEditingConfig(false)
        }}
        onCancel={config || pageConfig ? () => setEditingConfig(false) : undefined}
      />
    )
  }

  if (pageConfig) {
    return (
      <NotionChecklist
        key={pageConfig.pageId}
        widgetId={widget.id}
        config={pageConfig}
        filters={filters}
        onFilters={(f) => update({ filters: f })}
        onConfigure={() => setEditingConfig(true)}
        onAuthError={loadStatus}
      />
    )
  }
  if (!config) return <EmptyState icon={<Spinner />} title="Comprobando Notion…" />

  return (
    <NotionList
      key={config.dataSourceId}
      widgetId={widget.id}
      config={config}
      filters={filters}
      onFilters={(f) => update({ filters: f })}
      onConfigure={() => setEditingConfig(true)}
      onAuthError={loadStatus}
    />
  )
}

function NotionList({
  widgetId,
  config,
  filters,
  onFilters,
  onConfigure,
  onAuthError
}: {
  widgetId: string
  config: NotionTaskConfig
  filters: TaskFilters
  onFilters(f: TaskFilters): void
  onConfigure(): void
  onAuthError(): void
}): JSX.Element {
  const { openSettings } = useApp()
  const [schema, setSchema] = useState<NotionSchema | null>(null)
  const [tasks, setTasks] = useState<NotionTask[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [loadError, setLoadError] = useState<{ message: string; code: ErrorCode } | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [failed, setFailed] = useState<FailedOp | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<NotionTask | null>(null)
  const busy = useRef(false)
  const again = useRef(false)
  // Tareas recién creadas desde Nido: Notion puede tardar unos segundos en incluirlas en las
  // consultas; mientras, se conservan (con lo que devolvió Notion al crearlas) para que no «desaparezcan».
  const created = useRef(new Map<string, { at: number; task: NotionTask }>())

  const load = useCallback(async () => {
    // Si ya hay una carga en curso, se repite al terminar (así un cambio recién guardado nunca se pierde).
    if (busy.current) {
      again.current = true
      return
    }
    busy.current = true
    setSyncing(true)
    do {
      again.current = false
      const [s, q] = await Promise.all([window.nido.notion.schema(config.dataSourceId), window.nido.notion.query(config.dataSourceId)])
      if (!s.ok || !q.ok) {
        const failure = (!s.ok ? s : q) as { error: string; code: ErrorCode }
        setLoadError({ message: failure.error, code: failure.code })
        if (failure.code === 'auth') onAuthError()
        continue
      }
      const fresh = q.data.map((p) => toTask(p, config, s.data))
      const ids = new Set(fresh.map((t) => t.id))
      for (const [id, entry] of created.current) {
        if (ids.has(id) || Date.now() - entry.at > 20_000) created.current.delete(id)
        else fresh.unshift(entry.task)
      }
      setSchema(s.data)
      setTasks(fresh)
      setLoadError(null)
      setLastSync(new Date())
    } while (again.current)
    busy.current = false
    setSyncing(false)
  }, [config, onAuthError])

  // Al abrirse y cada minuto mientras el widget se ve (Notion admite ~3 peticiones por segundo).
  useInterval(() => void load(), REFRESH_MS, useActive())

  useEffect(() => {
    publishSearchItems(
      widgetId,
      (tasks ?? []).filter((t) => !t.done).map((t) => ({ label: t.title, detail: `Notion · ${config.name}` }))
    )
    return () => publishSearchItems(widgetId, null)
  }, [tasks, widgetId, config.name])

  /** Ejecuta un cambio en Notion. Si sale bien, aplica lo que devolvió Notion y recarga; si no, queda «Reintentar». */
  const run = async (label: string, op: () => Promise<Result<NotionPage>>, onSaved?: (page: NotionPage) => void): Promise<boolean> => {
    setSyncing(true)
    const result = await op()
    setSyncing(false)
    if (result.ok) {
      setFailed(null)
      onSaved?.(result.data)
      void load()
      return true
    }
    if (result.code === 'auth') onAuthError()
    setFailed({
      label,
      error: result.error,
      // Un conflicto no se reintenta igual: hay que ver primero lo que cambió en Notion.
      retry: result.code === 'conflict' ? undefined : async () => void (await run(label, op, onSaved))
    })
    void load() // vuelve al estado real de Notion
    return false
  }

  const replace = (page: NotionPage): void => {
    if (!schema) return
    const task = toTask(page, config, schema)
    setTasks((list) => list?.map((t) => (t.id === task.id ? task : t)) ?? null)
  }

  const checkAccess = async (): Promise<void> => {
    const r = await window.nido.notion.check(config.dataSourceId)
    if (!r.ok) {
      toast(`Notion: ${r.error}`, 'error')
      if (r.code === 'auth') onAuthError()
      return
    }
    const { sources, readable, rows: pages, problem } = r.data
    if (readable === false) toast(`No se puede leer «${config.name}». ${problem ?? ''}`, 'error')
    else toast(`Acceso correcto a «${config.name}»: ${pages ?? 0} tarea${pages === 1 ? '' : 's'}. ${sources} base${sources === 1 ? '' : 's'} de datos visibles.`, 'success')
  }

  const missing = (['status', 'date', 'priority', 'tags'] as const).filter(
    (role) => config.map[role] && schema && !propByName(schema, config.map[role])
  )
  const statusProp = schema ? propByName(schema, config.map.status) : undefined
  const priorityProp = schema ? propByName(schema, config.map.priority) : undefined
  const canComplete = !!statusProp && (statusProp.type === 'checkbox' || !!config.doneValue)

  const visible = useMemo(
    () =>
      sortTasks(
        (tasks ?? []).filter((t) => matchesFilters(t, filters)),
        priorityProp?.options?.map((o) => o.name) ?? []
      ),
    [tasks, filters, priorityProp]
  )

  const toggleDone = (task: NotionTask): void => {
    if (!schema || !config.map.status) return
    const value = doneValueFor(config, schema, !task.done)
    if (!value) return
    setTasks((list) => list?.map((t) => (t.id === task.id ? { ...t, done: !task.done } : t)) ?? null)
    const before = task.raw[config.map.status] ? { [config.map.status]: task.raw[config.map.status] } : undefined
    void run(`${task.done ? 'reabrir' : 'completar'} «${task.title}»`, () => window.nido.notion.update(task.id, { [config.map.status!]: value }, before), replace)
  }

  const create = async (): Promise<void> => {
    const title = draft.trim()
    if (!title || !schema) return
    const values: Record<string, NotionValue> = { [config.map.title]: { type: 'title', value: title } }
    const undone = doneValueFor(config, schema, false)
    if (undone && config.map.status && !(undone.type !== 'checkbox' && undone.value === null)) {
      values[config.map.status] = undone
    }
    setDraft('')
    const ok = await run(`crear «${title}»`, () => window.nido.notion.create(config.dataSourceId, values), (page) => {
      const task = toTask(page, config, schema)
      created.current.set(task.id, { at: Date.now(), task })
      setTasks((list) => (list ? [task, ...list.filter((t) => t.id !== task.id)] : [task]))
    })
    if (!ok) setDraft(title) // no se pierde lo escrito
  }

  const menu = (): MenuItem[] => [
    { label: 'Actualizar', icon: 'reload', disabled: syncing, onSelect: () => void load() },
    { label: 'Comprobar acceso', icon: 'check', onSelect: () => void checkAccess() },
    { label: 'Cambiar base de datos o propiedades', icon: 'database', onSelect: onConfigure },
    { separator: true },
    { label: 'Reconectar Notion', icon: 'link', onSelect: () => openSettings('conexiones') }
  ]

  if (!tasks && !loadError) return <EmptyState icon={<Spinner />} title="Cargando tareas de Notion…" />

  // La consulta falló y no hay datos anteriores: se dice el error, nunca «Sin tareas».
  if (!tasks && loadError) {
    return (
      <EmptyState
        icon={<BrandLogo brand="notion" name="Notion" size={28} decorative />}
        title={loadError.code === 'network' ? 'Sin conexión con Notion' : loadError.code === 'notfound' ? 'Nido no ve esta base de datos' : loadError.code === 'forbidden' ? 'Sin permiso en Notion' : loadError.code === 'auth' ? 'Notion rechazó el acceso' : 'No se pudieron cargar las tareas'}
        action={
          <div className="row center wrap">
            <button className="btn small primary" onClick={() => void load()}>
              Reintentar
            </button>
            {loadError.code === 'auth' ? (
              <button className="btn small" onClick={() => openSettings('conexiones')}>
                Reconectar
              </button>
            ) : (
              <button className="btn small" onClick={loadError.code === 'notfound' ? onConfigure : () => void checkAccess()}>
                {loadError.code === 'notfound' ? 'Elegir otra' : 'Comprobar acceso'}
              </button>
            )}
          </div>
        }
      >
        {loadError.message}
      </EmptyState>
    )
  }

  return (
    <div className="tasks-notion">
      <div className="filters">
        <select className="chip-select" aria-label="Filtrar por estado" value={filters.status} onChange={(e) => onFilters({ ...filters, status: e.target.value })}>
          <option value="open">Pendientes</option>
          <option value="done">Completadas</option>
          <option value="all">Todas</option>
          {statusProp && statusProp.type !== 'checkbox' && (
            <optgroup label="Estado">
              {(statusProp.options ?? []).map((o) => (
                <option key={o.name} value={`opt:${o.name}`}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {priorityProp && (
          <select className="chip-select" aria-label="Filtrar por prioridad" value={filters.priority} onChange={(e) => onFilters({ ...filters, priority: e.target.value })}>
            <option value="all">Cualquier prioridad</option>
            {(priorityProp.options ?? []).map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {config.map.date && (
          <select className="chip-select" aria-label="Filtrar por vencimiento" value={filters.due} onChange={(e) => onFilters({ ...filters, due: e.target.value as TaskFilters['due'] })}>
            <option value="all">Cualquier fecha</option>
            <option value="overdue">Vencidas</option>
            <option value="today">Para hoy</option>
            <option value="week">Esta semana</option>
            <option value="none">Sin fecha</option>
          </select>
        )}
      </div>

      <form
        className="row add-row"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <input className="input grow" value={draft} aria-label="Nueva tarea" placeholder={`Nueva tarea en ${config.name}`} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary small" type="submit" disabled={!draft.trim() || !schema} title="Crear en Notion" aria-label="Crear en Notion">
          <Icon name="plus" size={13} />
        </button>
      </form>

      {missing.length > 0 && (
        <p className="warn-line">
          <Icon name="alert" size={13} />
          Ya no existe: {missing.map((r) => `«${config.map[r]}»`).join(', ')}.{' '}
          <button className="link-btn" onClick={onConfigure}>
            Revisar
          </button>
        </p>
      )}

      <ul className="list scroll">
        {visible.length === 0 && <li className="empty muted">{tasks?.length ? 'Ninguna tarea con estos filtros.' : `«${config.name}» no tiene tareas todavía.`}</li>}
        {visible.map((t) => {
          const bucket = dueBucket(t.date, t.done)
          return (
            <li key={t.id} className={`task ${t.done ? 'done' : ''}`}>
              {canComplete ? (
                <input type="checkbox" checked={t.done} aria-label={`Completada: ${t.title}`} onChange={() => toggleDone(t)} />
              ) : (
                <span className="task-bullet" />
              )}
              <button className="task-main" onClick={() => setEditing(t)} title="Editar">
                <span className="task-title">{t.title || 'Sin título'}</span>
                <span className="task-meta">
                  {t.status && !t.done && statusProp?.type !== 'checkbox' && <span className="tag">{t.status}</span>}
                  {t.priority && <span className="tag strong">{t.priority}</span>}
                  {t.date?.start && <span className={`tag date ${bucket}`}>{dateLabel.format(fromDateKey(t.date.start.slice(0, 10)))}</span>}
                  {t.tags.map((tag) => (
                    <span key={tag} className="tag soft">
                      {tag}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {failed && (
        <div className="sync-error" role="alert">
          <Icon name="alert" size={13} />
          <span className="grow">
            No se pudo {failed.label}: {failed.error}
          </span>
          {failed.retry && (
            <button className="link-btn" onClick={() => void failed.retry?.()}>
              Reintentar
            </button>
          )}
          <button className="icon-btn small" title="Descartar" aria-label="Descartar" onClick={() => setFailed(null)}>
            <Icon name="close" size={11} />
          </button>
        </div>
      )}

      <div className="sync-line" aria-live="polite">
        {loadError ? (
          <>
            <Icon name="alert" size={13} />
            <span className="grow error-text" title={loadError.message}>
              {loadError.code === 'network' ? 'Sin conexión: mostrando lo último cargado' : loadError.message}
            </span>
            <button className="link-btn" onClick={() => void load()}>
              Reintentar
            </button>
          </>
        ) : (
          <>
            {syncing ? <Spinner size={11} /> : <BrandLogo brand="notion" name="" size={14} decorative className="bare" />}
            <span className="grow ellipsis">{syncing ? 'Actualizando…' : lastSync ? `Actualizado a las ${clock.format(lastSync)}` : 'Notion'}</span>
          </>
        )}
        <button className="icon-btn small" title="Actualizar" aria-label="Actualizar" disabled={syncing} onClick={() => void load()}>
          <Icon name="reload" size={12} />
        </button>
        <MenuButton items={menu} title="Opciones de Notion" className="icon-btn small">
          <Icon name="more" size={13} />
        </MenuButton>
      </div>

      {editing && schema && (
        <NotionTaskEditor
          task={editing}
          config={config}
          schema={schema}
          onClose={() => setEditing(null)}
          onSave={(values) => {
            // Lo que había al abrir el editor, para no pisar cambios hechos en Notion entretanto.
            const before = Object.fromEntries(Object.keys(values).map((name) => [name, editing.raw[name]]).filter(([, v]) => v !== undefined))
            return run(`guardar «${editing.title}»`, () => window.nido.notion.update(editing.id, values, before), replace)
          }}
        />
      )}
    </div>
  )
}

function NotionTaskEditor({
  task,
  config,
  schema,
  onClose,
  onSave
}: {
  task: NotionTask
  config: NotionTaskConfig
  schema: NotionSchema
  onClose(): void
  onSave(values: Record<string, NotionValue>): Promise<boolean>
}): JSX.Element {
  const statusProp = propByName(schema, config.map.status)
  const priorityProp = propByName(schema, config.map.priority)
  const tagsProp = propByName(schema, config.map.tags)
  const [title, setTitle] = useState(task.title)
  const [status, setStatus] = useState(task.status ?? '')
  const [done, setDone] = useState(task.done)
  const [date, setDate] = useState(task.date?.start.slice(0, 10) ?? '')
  const [priority, setPriority] = useState(task.priority ?? '')
  const [tags, setTags] = useState<string[]>(task.tags)
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    // Solo se envía lo que ha cambiado (así no se pierde, por ejemplo, la hora de una fecha).
    const values: Record<string, NotionValue> = {}
    if (title.trim() !== task.title) values[config.map.title] = { type: 'title', value: title.trim() }
    if (statusProp?.type === 'checkbox' && done !== task.done) values[statusProp.name] = { type: 'checkbox', value: done }
    if (statusProp && statusProp.type !== 'checkbox' && status !== (task.status ?? '')) {
      values[statusProp.name] = { type: statusProp.type as 'status' | 'select', value: status || null }
    }
    if (config.map.date && date !== (task.date?.start.slice(0, 10) ?? '')) {
      values[config.map.date] = { type: 'date', value: date ? { start: date } : null }
    }
    if (priorityProp && priority !== (task.priority ?? '')) {
      values[priorityProp.name] = { type: priorityProp.type as 'select' | 'status', value: priority || null }
    }
    if (tagsProp && tags.join('\u0000') !== task.tags.join('\u0000')) values[tagsProp.name] = { type: 'multi_select', value: tags }
    if (Object.keys(values).length === 0) {
      onClose()
      return
    }
    setSaving(true)
    const ok = await onSave(values)
    setSaving(false)
    if (ok) onClose()
  }

  const tagOptions = [...new Set([...(tagsProp?.options?.map((o) => o.name) ?? []), ...tags])]

  return (
    <Modal
      title="Editar tarea"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => window.nido.openExternal(task.url)}>
            <Icon name="arrowUpRight" size={14} />
            Abrir en Notion
          </button>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={saving || !title.trim()} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span>Título</span>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {statusProp?.type === 'checkbox' && (
          <label className="check-row">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            Completada
          </label>
        )}
        {statusProp && statusProp.type !== 'checkbox' && (
          <label className="field">
            <span>{statusProp.name}</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusProp.type === 'select' && <option value="">— Sin valor —</option>}
              {(statusProp.options ?? []).map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field-grid">
          {config.map.date && (
            <label className="field">
              <span>{config.map.date}</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
          {priorityProp && (
            <label className="field">
              <span>{priorityProp.name}</span>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">— Sin prioridad —</option>
                {(priorityProp.options ?? []).map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {tagsProp && (
          <div className="field">
            <span>{tagsProp.name}</span>
            <div className="tag-picker">
              {tagOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chip ${tags.includes(name) ? 'active' : ''}`}
                  onClick={() => setTags(tags.includes(name) ? tags.filter((t) => t !== name) : [...tags, name])}
                >
                  {name}
                </button>
              ))}
              <input
                className="input tiny"
                placeholder="Nueva…"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    e.preventDefault()
                    if (!tags.includes(newTag.trim())) setTags([...tags, newTag.trim()])
                    setNewTag('')
                  }
                }}
              />
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
