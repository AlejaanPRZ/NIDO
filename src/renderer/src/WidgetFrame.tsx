import { useEffect, useState, type ReactNode } from 'react'
import type { Widget } from '../../shared/types'
import { WIDGETS } from './registry'

interface Props {
  widget: Widget
  locked: boolean
  onRename(title: string): void
  onRemove(): void
  children: ReactNode
}

export function WidgetFrame({ widget, locked, onRename, onRemove, children }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(widget.title)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  const commit = (): void => {
    const title = draft.trim()
    onRename(title || WIDGETS[widget.type].label)
    setEditing(false)
  }

  return (
    <section className={`widget widget-${widget.type}`}>
      <header className={`widget-header ${locked ? '' : 'widget-drag'}`}>
        <span className="widget-icon">{WIDGETS[widget.type].icon}</span>
        {editing ? (
          <input
            className="widget-title-input no-drag"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="widget-title"
            title="Doble clic para renombrar"
            onDoubleClick={() => {
              setDraft(widget.title)
              setEditing(true)
            }}
          >
            {widget.title}
          </span>
        )}
        {!locked && (
          <button
            className={`icon-btn no-drag ${confirming ? 'danger' : ''}`}
            title={confirming ? 'Pulsa otra vez para eliminar' : 'Eliminar widget'}
            onClick={() => (confirming ? onRemove() : setConfirming(true))}
          >
            {confirming ? '¿Eliminar?' : '×'}
          </button>
        )}
      </header>
      <div className="widget-body no-drag">{children}</div>
    </section>
  )
}
