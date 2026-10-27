import { useState } from 'react'
import { Icon } from '../../icons'
import { Segmented } from '../../ui/controls'
import { uid } from '../../util'
import type { WidgetProps } from '../types'
import { DEFAULT_FILTERS } from './notionModel'
import { NotionTasks } from './NotionTasks'

export function TasksWidget(props: WidgetProps<'tasks'>): JSX.Element {
  const source = props.widget.data.source ?? 'local'
  return (
    <div className="tasks">
      <Segmented
        label="Origen de las tareas"
        className="full"
        value={source}
        options={[
          { value: 'local', label: 'Locales', title: 'Lista guardada en este equipo' },
          { value: 'notion', label: 'Notion', title: 'Una base de datos de Notion' }
        ]}
        onChange={(v) => props.update({ source: v })}
      />
      {source === 'notion' ? <NotionTasks {...props} /> : <LocalTasks {...props} />}
    </div>
  )
}

function LocalTasks({ widget, update }: WidgetProps<'tasks'>): JSX.Element {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const { tasks } = widget.data
  const filters = widget.data.filters ?? { ...DEFAULT_FILTERS, status: 'all' }
  const pending = tasks.filter((t) => !t.done).length
  const visible = tasks.filter((t) => (filters.status === 'open' ? !t.done : filters.status === 'done' ? t.done : true))

  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    update({ tasks: [...tasks, { id: uid(), text, done: false, createdAt: Date.now() }] })
    setDraft('')
  }

  const commitEdit = (): void => {
    const text = editText.trim()
    if (editingId && text) update({ tasks: tasks.map((t) => (t.id === editingId ? { ...t, text } : t)) })
    setEditingId(null)
  }

  return (
    <div className="tasks-local">
      <div className="filters">
        <select
          className="chip-select"
          aria-label="Filtrar por estado"
          value={['all', 'open', 'done'].includes(filters.status) ? filters.status : 'all'}
          onChange={(e) => update({ filters: { ...filters, status: e.target.value } })}
        >
          <option value="all">Todas</option>
          <option value="open">Pendientes</option>
          <option value="done">Completadas</option>
        </select>
      </div>

      <form
        className="row add-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="input grow" value={draft} placeholder="Nueva tarea" onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary small" type="submit" disabled={!draft.trim()} title="Añadir">
          <Icon name="plus" size={13} />
        </button>
      </form>

      <ul className="list scroll">
        {visible.length === 0 && (
          <li className="empty muted">{tasks.length ? 'Ninguna tarea con este filtro.' : 'Sin tareas. Escribe una arriba.'}</li>
        )}
        {visible.map((task) => (
          <li key={task.id} className={`task ${task.done ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={task.done}
              aria-label="Completada"
              onChange={() => update({ tasks: tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) })}
            />
            {editingId === task.id ? (
              <input
                className="input tiny grow"
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <span
                className="task-title grow"
                title="Doble clic para editar"
                onDoubleClick={() => {
                  setEditingId(task.id)
                  setEditText(task.text)
                }}
              >
                {task.text}
              </span>
            )}
            <button
              className="icon-btn small hover-only"
              title="Eliminar tarea"
              onClick={() => update({ tasks: tasks.filter((t) => t.id !== task.id) })}
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>

      <div className="widget-footer row muted">
        <span className="grow">
          {pending} pendiente{pending === 1 ? '' : 's'} de {tasks.length}
        </span>
        {tasks.some((t) => t.done) && (
          <button className="link-btn" onClick={() => update({ tasks: tasks.filter((t) => !t.done) })}>
            Limpiar completadas
          </button>
        )}
      </div>
    </div>
  )
}
