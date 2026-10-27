import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Widget } from '../../shared/types'
import { useApp } from './context'
import { Icon } from './icons'
import { WIDGETS } from './registry'
import { WORKSPACES } from './store'
import { confirmDialog } from './ui/feedback'
import { MenuButton, type MenuItem } from './ui/Menu'

interface Props {
  widget: Widget
  workspaceId: string
  locked: boolean
  expanded: boolean
  highlighted: boolean
  summary: string
  onExpand(expanded: boolean): void
  children: ReactNode
}

export function WidgetFrame({ widget, workspaceId, locked, expanded, highlighted, summary, onExpand, children }: Props): JSX.Element {
  const { dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(widget.title)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  const commit = (): void => {
    dispatch({ type: 'rename', id: widget.id, title: draft.trim() || WIDGETS[widget.type].label })
    setEditing(false)
  }

  const startRename = (): void => {
    setDraft(widget.title)
    setEditing(true)
  }

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Eliminar widget',
      message: `¿Eliminar «${widget.title}»? Se perderá su contenido local.`,
      confirmLabel: 'Eliminar',
      danger: true
    })
    if (ok) dispatch({ type: 'remove', id: widget.id })
  }

  const collapsed = !!widget.collapsed && !expanded
  const menu = (): MenuItem[] => [
    { label: expanded ? 'Volver al panel' : 'Ampliar', icon: expanded ? 'shrink' : 'expand', hint: expanded ? 'Esc' : undefined, onSelect: () => onExpand(!expanded) },
    {
      label: widget.collapsed ? 'Desplegar' : 'Plegar',
      icon: widget.collapsed ? 'chevronDown' : 'chevronUp',
      disabled: locked || expanded,
      onSelect: () => dispatch({ type: 'collapse', id: widget.id, collapsed: !widget.collapsed })
    },
    { label: 'Renombrar', icon: 'edit', onSelect: startRename },
    { label: 'Duplicar', icon: 'copy', disabled: locked, onSelect: () => dispatch({ type: 'duplicate', id: widget.id }) },
    { separator: true },
    { header: 'Mover a' },
    ...WORKSPACES.filter((w) => w.id !== workspaceId).map((w) => ({
      label: w.name,
      icon: w.icon,
      disabled: locked,
      onSelect: () => dispatch({ type: 'move', id: widget.id, workspace: w.id })
    })),
    { separator: true },
    { label: 'Eliminar', icon: 'trash', danger: true, disabled: locked, onSelect: () => void remove() }
  ]

  return (
    <section
      ref={ref}
      className={`widget glass widget-${widget.type} ${collapsed ? 'is-collapsed' : ''} ${expanded ? 'is-expanded' : ''} ${highlighted ? 'flash' : ''}`}
      aria-label={widget.title}
    >
      <header className={`widget-header ${locked || expanded ? '' : 'widget-drag'}`} onDoubleClick={(e) => e.target === e.currentTarget && onExpand(!expanded)}>
        <span className="widget-badge">
          <Icon name={WIDGETS[widget.type].icon} size={14} />
        </span>
        {editing ? (
          <input
            className="widget-title-input no-drag"
            autoFocus
            value={draft}
            aria-label="Nombre del widget"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="widget-title" title="Doble clic para renombrar" onDoubleClick={startRename}>
            {widget.title}
          </span>
        )}
        {collapsed && <span className="widget-summary">{summary}</span>}
        <div className="widget-actions no-drag">
          {!expanded && !locked && (
            <button
              className="icon-btn small"
              title={widget.collapsed ? 'Desplegar' : 'Plegar'}
              onClick={() => dispatch({ type: 'collapse', id: widget.id, collapsed: !widget.collapsed })}
            >
              <Icon name={widget.collapsed ? 'chevronDown' : 'chevronUp'} size={14} />
            </button>
          )}
          <button className="icon-btn small" title={expanded ? 'Volver al panel (Esc)' : 'Ampliar'} onClick={() => onExpand(!expanded)}>
            <Icon name={expanded ? 'shrink' : 'expand'} size={13} />
          </button>
          <MenuButton items={menu} title="Más opciones" className="icon-btn small">
            <Icon name="more" size={15} />
          </MenuButton>
        </div>
      </header>
      {/* Plegado se oculta sin desmontar: la música sigue sonando y el panel web no se recarga. */}
      <div className="widget-body no-drag" hidden={collapsed}>
        {children}
      </div>
    </section>
  )
}
