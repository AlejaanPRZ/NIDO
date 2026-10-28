import { useState } from 'react'
import type { Priority, Task, TaskFilters } from '../../../../shared/types'
import { Icon } from '../../icons'
import { Segmented } from '../../ui/controls'
import { confirmDialog } from '../../ui/feedback'
import { Modal } from '../../ui/Modal'
import { fromDateKey, uid } from '../../util'
import type { WidgetProps } from '../types'
import { dueBucket } from './notionModel'

const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }
const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const dateLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

const DEFAULT: TaskFilters = { status: 'all', priority: 'all', due: 'all' }

function matches(t: Task, f: TaskFilters): boolean {
  if (f.status === 'open' && t.done) return false
  if (f.status === 'done' && !t.done) return false
  if (f.priority !== 'all' && t.priority !== f.priority) return false
  if (f.due !== 'all') {
    const b = dueBucket(t.due ? { start: t.due } : null, t.done)
    if (f.due === 'overdue' && b !== 'overdue') return false
    if (f.due === 'today' && b !== 'today' && b !== 'overdue') return false
    if (f.due === 'week' && !['week', 'today', 'overdue'].includes(b)) return false
    if (f.due === 'none' && b !== 'none') return false
  }
  return true
}

/** Lista local: subtareas, prioridad, fecha y filtros. Las tareas antiguas siguen valiendo. */
export function LocalTasks({ widget, update }: WidgetProps<'tasks'>): JSX.Element {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const { tasks } = widget.data
  const filters = { ...DEFAULT, ...widget.data.filters, status: ['all', 'open', 'done'].includes(widget.data.filters?.status ?? '') ? widget.data.filters!.status : 'all' }
  const pending = tasks.filter((t) => !t.done).length
  const filtered = filters.status !== 'all' || filters.priority !== 'all' || filters.due !== 'all'

  const visible = tasks
    .filter((t) => matches(t, filters))
    .sort((a, b) => Number(a.done) - Number(b.done) || (PRIORITY_RANK[a.priority ?? ''] ?? 9) - (PRIORITY_RANK[b.priority ?? ''] ?? 9) || (a.due ?? '9').localeCompare(b.due ?? '9'))

  const setTasks = (next: Task[]): void => update({ tasks: next })
  const patchTask = (id: string, patch: Partial<Task>): void => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    setTasks([...tasks, { id: uid(), text, done: false, createdAt: Date.now() }])
    setDraft('')
  }

  const remove = async (task: Task): Promise<void> => {
    const subs = task.subtasks?.length ?? 0
    if (subs && !(await confirmDialog({ title: 'Eliminar tarea', message: `¿Eliminar «${task.text}» y sus ${subs} subtareas?`, confirmLabel: 'Eliminar', danger: true }))) return
    setTasks(tasks.filter((t) => t.id !== task.id))
  }

  const setFilter = (patch: Partial<TaskFilters>): void => update({ filters: { ...filters, ...patch } })

  return (
    <div className="tasks-local">
      <div className="filters">
        <select className="chip-select" aria-label="Estado" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="all">Todas</option>
          <option value="open">Pendientes</option>
          <option value="done">Completadas</option>
        </select>
        <select className="chip-select" aria-label="Prioridad" value={filters.priority} onChange={(e) => setFilter({ priority: e.target.value })}>
          <option value="all">Cualquier prioridad</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <select className="chip-select" aria-label="Vencimiento" value={filters.due} onChange={(e) => setFilter({ due: e.target.value as TaskFilters['due'] })}>
          <option value="all">Cualquier fecha</option>
          <option value="overdue">Vencidas</option>
          <option value="today">Para hoy</option>
          <option value="week">Esta semana</option>
          <option value="none">Sin fecha</option>
        </select>
      </div>

      <form
        className="row add-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="input grow" value={draft} placeholder="Nueva tarea" aria-label="Nueva tarea" onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary small" type="submit" disabled={!draft.trim()} title="Añadir">
          <Icon name="plus" size={13} />
        </button>
      </form>

      <ul className="list scroll">
        {visible.length === 0 && <li className="empty muted">{tasks.length ? 'Ninguna tarea con estos filtros.' : 'Sin tareas. Escribe una arriba.'}</li>}
        {visible.map((task) => {
          const subs = task.subtasks ?? []
          const subsDone = subs.filter((s) => s.done).length
          const bucket = dueBucket(task.due ? { start: task.due } : null, task.done)
          const expanded = open.has(task.id)
          return (
            <li key={task.id} className={`task-block ${task.done ? 'done' : ''}`}>
              <div className={`task ${task.done ? 'done' : ''}`}>
                <input type="checkbox" checked={task.done} aria-label={`Completar ${task.text}`} onChange={() => patchTask(task.id, { done: !task.done })} />
                <button className="task-main" title="Editar" onClick={() => setEditing(task)}>
                  <span className="task-title">{task.text}</span>
                  <span className="task-meta">
                    {task.priority && <span className={`tag prio-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>}
                    {task.due && <span className={`tag date ${bucket}`}>{dateLabel.format(fromDateKey(task.due))}</span>}
                    {subs.length > 0 && (
                      <span className="tag soft">
                        {subsDone}/{subs.length}
                      </span>
                    )}
                  </span>
                </button>
                {subs.length > 0 && (
                  <button
                    className="icon-btn small"
                    aria-expanded={expanded}
                    title={expanded ? 'Ocultar subtareas' : 'Ver subtareas'}
                    onClick={() => setOpen((s) => (s.has(task.id) ? new Set([...s].filter((x) => x !== task.id)) : new Set([...s, task.id])))}
                  >
                    <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
                  </button>
                )}
                <button className="icon-btn small hover-only" title="Eliminar tarea" onClick={() => void remove(task)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
              {expanded && (
                <ul className="subtasks">
                  {subs.map((s) => (
                    <li key={s.id} className={`subtask ${s.done ? 'done' : ''}`}>
                      <input
                        type="checkbox"
                        checked={s.done}
                        aria-label={s.text}
                        onChange={() => patchTask(task.id, { subtasks: subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}
                      />
                      <span>{s.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <div className="widget-footer row muted">
        <span className="grow">
          {pending} pendiente{pending === 1 ? '' : 's'} de {tasks.length}
          {filtered && ' · con filtros'}
        </span>
        {tasks.some((t) => t.done) && (
          <button
            className="link-btn"
            onClick={async () => {
              const n = tasks.filter((t) => t.done).length
              if (await confirmDialog({ title: 'Limpiar completadas', message: `¿Eliminar las ${n} tareas completadas?`, confirmLabel: 'Eliminar', danger: true }))
                setTasks(tasks.filter((t) => !t.done))
            }}
          >
            Limpiar completadas
          </button>
        )}
      </div>

      {editing && (
        <TaskEditor
          task={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            patchTask(t.id, t)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function TaskEditor({ task, onClose, onSave }: { task: Task; onClose(): void; onSave(t: Task): void }): JSX.Element {
  const [text, setText] = useState(task.text)
  const [priority, setPriority] = useState<Priority | ''>(task.priority ?? '')
  const [due, setDue] = useState(task.due ?? '')
  const [subtasks, setSubtasks] = useState(task.subtasks ?? [])
  const [newSub, setNewSub] = useState('')

  const dirty =
    text !== task.text || priority !== (task.priority ?? '') || due !== (task.due ?? '') || JSON.stringify(subtasks) !== JSON.stringify(task.subtasks ?? [])

  const close = async (): Promise<void> => {
    // Confirmación antes de descartar cambios.
    if (!dirty || (await confirmDialog({ title: 'Descartar cambios', message: 'Has cambiado esta tarea. ¿Salir sin guardar?', confirmLabel: 'Descartar', danger: true }))) onClose()
  }

  const save = (): void => {
    if (!text.trim()) return
    onSave({ ...task, text: text.trim(), priority: priority || undefined, due: due || undefined, subtasks })
  }

  return (
    <Modal
      title="Editar tarea"
      onClose={() => void close()}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={() => void close()}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!text.trim()} onClick={save}>
            Guardar
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field">
          <span>Tarea</span>
          <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="field-grid">
          <div className="field">
            <span>Prioridad</span>
            <Segmented
              label="Prioridad"
              className="full"
              value={priority || 'none'}
              options={[
                { value: 'none', label: '—' },
                { value: 'baja', label: 'Baja' },
                { value: 'media', label: 'Media' },
                { value: 'alta', label: 'Alta' }
              ]}
              onChange={(v) => setPriority(v === 'none' ? '' : (v as Priority))}
            />
          </div>
          <label className="field">
            <span>Fecha</span>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>Subtareas</span>
          <ul className="subtasks editing">
            {subtasks.map((s) => (
              <li key={s.id} className={`subtask ${s.done ? 'done' : ''}`}>
                <input type="checkbox" checked={s.done} aria-label={s.text} onChange={() => setSubtasks(subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} />
                <span className="grow">{s.text}</span>
                <button type="button" className="icon-btn small" title="Quitar subtarea" onClick={() => setSubtasks(subtasks.filter((x) => x.id !== s.id))}>
                  <Icon name="close" size={11} />
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <input
              className="input tiny grow"
              placeholder="Nueva subtarea"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSub.trim()) {
                  e.preventDefault()
                  setSubtasks([...subtasks, { id: uid(), text: newSub.trim(), done: false }])
                  setNewSub('')
                }
              }}
            />
            <button
              type="button"
              className="btn tiny"
              disabled={!newSub.trim()}
              onClick={() => {
                setSubtasks([...subtasks, { id: uid(), text: newSub.trim(), done: false }])
                setNewSub('')
              }}
            >
              Añadir
            </button>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
