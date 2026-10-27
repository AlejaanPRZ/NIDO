import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NotionSchema, NotionStatus, NotionTaskConfig, NotionValue, TaskFilters } from '../../../../shared/types'
import { publishSearchItems, useApp } from '../../context'
import { Icon } from '../../icons'
import { EmptyState, Spinner } from '../../ui/controls'
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
import { NotionSetup } from './NotionSetup'

const REFRESH_MS = 2 * 60_000
const dateLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

interface FailedOp {
  label: string
  error: string
  retry(): Promise<void>
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
        icon={<Icon name="database" size={18} />}
        title="Notion sin conectar"
        action={
          <button className="btn primary small" onClick={() => openSettings('conexiones')}>
            Conectar Notion
          </button>
        }
      >
        Conecta una integración de Notion para usar una base de datos como lista de tareas.
      </EmptyState>
    )
  }

  if (!config || editingConfig) {
    return (
      <NotionSetup
        current={config}
        onSave={(c) => {
          update({ notion: c })
          setEditingConfig(false)
        }}
        onCancel={config ? () => setEditingConfig(false) : undefined}
      />
    )
  }

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
  const [schema, setSchema] = useState<NotionSchema | null>(null)
  const [tasks, setTasks] = useState<NotionTask[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [failed, setFailed] = useState<FailedOp | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<NotionTask | null>(null)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setSyncing(true)
    const [s, q] = await Promise.all([
      window.nido.notion.schema(config.dataSourceId),
      window.nido.notion.query(config.dataSourceId)
    ])
    busy.current = false
    setSyncing(false)
    if (!s.ok || !q.ok) {
      const failure = !s.ok ? s : !q.ok ? q : null
      setLoadError(failure?.error ?? 'Error desconocido')
      if (failure?.code === 'auth') onAuthError()
      return
    }
    setSchema(s.data)
    setTasks(q.data.map((p) => toTask(p, config, s.data)))
    setLoadError(null)
    setLastSync(new Date())
  }, [config, onAuthError])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    publishSearchItems(
      widgetId,
      (tasks ?? []).filter((t) => !t.done).map((t) => ({ label: t.title, detail: `Notion · ${config.name}` }))
    )
    return () => publishSearchItems(widgetId, null)
  }, [tasks, widgetId, config.name])

  /** Ejecuta un cambio en Notion; si falla, queda pendiente con «Reintentar». */
  const run = async (label: string, op: () => Promise<{ ok: boolean; error?: string; code?: string }>): Promise<boolean> => {
    setSyncing(true)
    const result = await op()
    setSyncing(false)
    if (result.ok) {
      setFailed(null)
      return true
    }
    if (result.code === 'auth') onAuthError()
    setFailed({
      label,
      error: result.error ?? 'Error desconocido',
      retry: async () => {
        if (await run(label, op)) void load()
      }
    })
    void load() // vuelve al estado real de Notion
    return false
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
    if (!schema) return
    const value = doneValueFor(config, schema, !task.done)
    if (!value || !config.map.status) return
    setTasks((list) => list?.map((t) => (t.id === task.id ? { ...t, done: !task.done } : t)) ?? null)
    void run(`${task.done ? 'reabrir' : 'completar'} «${task.title}»`, () =>
      window.nido.notion.update(task.id, { [config.map.status!]: value })
    )
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
    if (await run(`crear «${title}»`, () => window.nido.notion.create(config.dataSourceId, values))) void load()
  }

  if (!tasks && !loadError) return <EmptyState icon={<Spinner />} title="Cargando tareas de Notion…" />

  return (
    <div className="tasks-notion">
      <div className="filters">
        <select
          className="chip-select"
          aria-label="Filtrar por estado"
          value={filters.status}
          onChange={(e) => onFilters({ ...filters, status: e.target.value })}
        >
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
          <select
            className="chip-select"
            aria-label="Filtrar por prioridad"
            value={filters.priority}
            onChange={(e) => onFilters({ ...filters, priority: e.target.value })}
          >
            <option value="all">Cualquier prioridad</option>
            {(priorityProp.options ?? []).map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {config.map.date && (
          <select
            className="chip-select"
            aria-label="Filtrar por vencimiento"
            value={filters.due}
            onChange={(e) => onFilters({ ...filters, due: e.target.value as TaskFilters['due'] })}
          >
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
        <input className="input grow" value={draft} placeholder={`Nueva tarea en ${config.name}`} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary small" type="submit" disabled={!draft.trim() || !schema}>
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
        {visible.length === 0 && <li className="empty muted">{tasks?.length ? 'Ninguna tarea con estos filtros.' : 'Sin tareas.'}</li>}
        {visible.map((t) => {
          const bucket = dueBucket(t.date, t.done)
          return (
            <li key={t.id} className={`task ${t.done ? 'done' : ''}`}>
              {canComplete ? (
                <input type="checkbox" checked={t.done} aria-label="Completada" onChange={() => toggleDone(t)} />
              ) : (
                <span className="task-bullet" />
              )}
              <button className="task-main" onClick={() => setEditing(t)} title="Editar">
                <span className="task-title">{t.title || 'Sin título'}</span>
                <span className="task-meta">
                  {t.status && !t.done && statusProp?.type !== 'checkbox' && <span className="tag">{t.status}</span>}
                  {t.priority && <span className="tag strong">{t.priority}</span>}
                  {t.date?.start && (
                    <span className={`tag date ${bucket}`}>{dateLabel.format(fromDateKey(t.date.start.slice(0, 10)))}</span>
                  )}
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
        <div className="sync-error">
          <Icon name="alert" size={13} />
          <span className="grow">
            No se pudo {failed.label}: {failed.error}
          </span>
          <button className="link-btn" onClick={() => void failed.retry()}>
            Reintentar
          </button>
          <button className="icon-btn small" title="Descartar" onClick={() => setFailed(null)}>
            <Icon name="close" size={11} />
          </button>
        </div>
      )}

      <div className="sync-line">
        {loadError ? (
          <>
            <Icon name="alert" size={13} />
            <span className="grow error-text" title={loadError}>
              {loadError}
            </span>
            <button className="link-btn" onClick={() => void load()}>
              Reintentar
            </button>
          </>
        ) : (
          <>
            {syncing ? <Spinner size={11} /> : <Icon name="cloud" size={13} />}
            <span className="grow">
              {syncing ? 'Sincronizando…' : lastSync ? `Notion · ${clock.format(lastSync)}` : 'Notion'}
            </span>
          </>
        )}
        <button className="icon-btn small" title="Actualizar" disabled={syncing} onClick={() => void load()}>
          <Icon name="reload" size={12} />
        </button>
        <button className="icon-btn small" title="Base de datos y propiedades" onClick={onConfigure}>
          <Icon name="settings" size={12} />
        </button>
      </div>

      {editing && schema && (
        <NotionTaskEditor
          task={editing}
          config={config}
          schema={schema}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const ok = await run(`guardar «${editing.title}»`, () => window.nido.notion.update(editing.id, values))
            if (ok) void load()
            return ok
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
