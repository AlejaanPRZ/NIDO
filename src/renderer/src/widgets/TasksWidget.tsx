import { useState } from 'react'
import { uid } from '../util'
import type { WidgetProps } from './types'

export function TasksWidget({ widget, update }: WidgetProps<'tasks'>): JSX.Element {
  const [draft, setDraft] = useState('')
  const { tasks } = widget.data
  const pending = tasks.filter((t) => !t.done).length

  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    update({ tasks: [...tasks, { id: uid(), text, done: false, createdAt: Date.now() }] })
    setDraft('')
  }

  return (
    <div className="tasks">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="input grow" value={draft} placeholder="Nueva tarea" onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!draft.trim()}>
          Añadir
        </button>
      </form>

      <ul className="list scroll">
        {tasks.length === 0 && <li className="empty muted">Sin tareas. Escribe una arriba.</li>}
        {tasks.map((task) => (
          <li key={task.id} className={`task ${task.done ? 'done' : ''}`}>
            <label className="task-label">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => update({ tasks: tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) })}
              />
              <span>{task.text}</span>
            </label>
            <button
              className="icon-btn"
              title="Eliminar tarea"
              onClick={() => update({ tasks: tasks.filter((t) => t.id !== task.id) })}
            >
              ×
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
