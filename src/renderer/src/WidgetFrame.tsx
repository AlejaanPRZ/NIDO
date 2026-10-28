import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Widget, Workspace } from '../../shared/types'
import { BrandLogo, hasBrand } from './BrandLogo'
import { catalogById } from './catalog'
import { useApp } from './context'
import { Icon, type IconName } from './icons'
import { SIZE_LABEL, WIDGETS, type SizeName } from './registry'
import { WidgetErrorBoundary } from './ui/ErrorBoundary'
import { confirmDialog, toast } from './ui/feedback'
import { MenuButton, type MenuItem } from './ui/Menu'

interface Props {
  widget: Widget
  workspaceId: string
  workspaces: Pick<Workspace, 'id' | 'name' | 'icon'>[]
  locked: boolean
  expanded: boolean
  highlighted: boolean
  summary: string
  onExpand(expanded: boolean): void
  children: ReactNode
}

/**
 * Hueco en la cabecera para controles del propio widget (p. ej. la navegación de un panel web
 * con la barra plegada). El widget los pinta ahí con createPortal; quedan fuera de la zona de arrastre.
 */
const HeaderSlotContext = createContext<HTMLElement | null>(null)
export const useHeaderSlot = (): HTMLElement | null => useContext(HeaderSlotContext)

const HEADER_PX = 46
const ROW_PX = 32
const MARGIN_PX = 16

/** Altura del contenido real de un área con scroll (aunque ahora sea más baja o más alta). */
function contentHeight(el: HTMLElement): number {
  if (el.scrollHeight > el.clientHeight + 1) return el.scrollHeight
  if (!el.firstElementChild) return 0
  const range = document.createRange()
  range.selectNodeContents(el)
  const style = getComputedStyle(el)
  return range.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
}

/** Filas necesarias para que el cuerpo muestre todo sin scroll ni hueco. */
function rowsToFit(body: HTMLElement): number {
  let needed = body.clientHeight
  for (const el of body.querySelectorAll<HTMLElement>('.scroll')) needed += contentHeight(el) - el.clientHeight
  needed = Math.max(needed, body.scrollHeight > body.clientHeight ? body.scrollHeight : 0)
  const px = HEADER_PX + needed
  return Math.ceil((px + MARGIN_PX) / (ROW_PX + MARGIN_PX))
}

export function WidgetFrame({ widget, workspaceId, workspaces, locked, expanded, highlighted, summary, onExpand, children }: Props): JSX.Element {
  const { dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(widget.title)
  const ref = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const def = WIDGETS[widget.type]
  const entry = catalogById(widget.catalogId)

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  const commit = (): void => {
    dispatch({ type: 'rename', id: widget.id, title: draft.trim() || def.label })
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

  const fit = (): void => {
    const body = bodyRef.current
    if (!body) return
    const h = Math.max(def.size.minH, rowsToFit(body))
    dispatch({ type: 'resize', id: widget.id, w: widthOf(), h })
    toast(`«${widget.title}» ajustado a su contenido`, 'success')
  }

  /** Ancho actual en columnas (para no cambiarlo al ajustar la altura). */
  const widthOf = (): number => {
    const item = ref.current?.closest<HTMLElement>('.react-grid-item')
    const grid = item?.parentElement
    if (!item || !grid) return def.size.w
    const colStep = (grid.clientWidth + MARGIN_PX) / 12
    return Math.max(1, Math.round((item.offsetWidth + MARGIN_PX) / colStep))
  }

  const collapsed = !!widget.collapsed && !expanded
  const blocked = locked || !!widget.pinned
  const menu = (): MenuItem[] => [
    { label: expanded ? 'Volver al panel' : 'Ampliar', icon: expanded ? 'shrink' : 'expand', hint: expanded ? 'Esc' : undefined, onSelect: () => onExpand(!expanded) },
    {
      label: widget.collapsed ? 'Desplegar' : 'Plegar',
      icon: widget.collapsed ? 'chevronDown' : 'chevronUp',
      disabled: blocked || expanded,
      onSelect: () => dispatch({ type: 'collapse', id: widget.id, collapsed: !widget.collapsed })
    },
    { separator: true },
    { header: 'Tamaño' },
    ...(['s', 'm', 'l'] as SizeName[]).map((s) => ({
      label: `${SIZE_LABEL[s]} · ${def.sizes[s].w}×${def.sizes[s].h}`,
      icon: 'grid' as IconName,
      disabled: blocked,
      onSelect: () => dispatch({ type: 'resize', id: widget.id, ...def.sizes[s] })
    })),
    { label: 'Ajustar al contenido', icon: 'fit', disabled: blocked || collapsed, onSelect: fit },
    { separator: true },
    {
      label: widget.pinned ? 'Soltar' : 'Fijar en su sitio',
      icon: 'pin',
      checked: widget.pinned,
      disabled: locked,
      onSelect: () => dispatch({ type: 'pin', id: widget.id, pinned: !widget.pinned })
    },
    { label: 'Renombrar', icon: 'edit', onSelect: startRename },
    { label: 'Duplicar', icon: 'copy', disabled: locked, onSelect: () => dispatch({ type: 'duplicate', id: widget.id }) },
    ...(workspaces.length > 1
      ? [
          { separator: true } as MenuItem,
          { header: 'Mover a' } as MenuItem,
          ...workspaces
            .filter((w) => w.id !== workspaceId)
            .map((w) => ({ label: w.name, icon: w.icon as IconName, disabled: locked, onSelect: () => dispatch({ type: 'move', id: widget.id, workspace: w.id }) }))
        ]
      : []),
    { separator: true },
    { label: 'Eliminar', icon: 'trash', danger: true, disabled: locked, onSelect: () => void remove() }
  ]

  return (
    <section
      ref={ref}
      className={`widget glass widget-${widget.type} ${collapsed ? 'is-collapsed' : ''} ${expanded ? 'is-expanded' : ''} ${highlighted ? 'flash' : ''} ${widget.pinned ? 'is-pinned' : ''}`}
      aria-label={widget.title}
    >
      <header
        className={`widget-header ${blocked || expanded ? '' : 'widget-drag'}`}
        title={blocked || expanded ? undefined : 'Arrastra la cabecera para mover el widget'}
        onDoubleClick={(e) => e.target === e.currentTarget && onExpand(!expanded)}
      >
        {/* Asa de mover: la cabecera entera arrastra; el asa lo hace visible. */}
        {!blocked && !expanded && (
          <span className="widget-grip" aria-hidden>
            <Icon name="grip" size={14} />
          </span>
        )}
        {hasBrand(entry?.brand) ? (
          <BrandLogo brand={entry.brand} name={entry.title} size={26} className="widget-brand" />
        ) : (
          <span className="widget-badge" style={entry ? { ['--tint' as string]: entry.tint } : undefined}>
            <Icon name={entry?.icon ?? def.icon} size={14} />
          </span>
        )}
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
          <span className="widget-title" title={`${widget.title} · doble clic para renombrar`} onDoubleClick={startRename}>
            {widget.title}
          </span>
        )}
        {widget.pinned && (
          <span className="pin-badge" title="Fijado: no se mueve al organizar">
            <Icon name="pin" size={11} />
          </span>
        )}
        {collapsed && <span className="widget-summary">{summary}</span>}
        <div className="widget-slot no-drag" ref={setSlot} />
        <div className="widget-actions no-drag">
          {!expanded && !blocked && (
            <button
              className="icon-btn small"
              title={widget.collapsed ? 'Desplegar (mostrar el contenido)' : 'Plegar (dejar solo la cabecera)'}
              aria-label={widget.collapsed ? 'Desplegar' : 'Plegar'}
              onClick={() => dispatch({ type: 'collapse', id: widget.id, collapsed: !widget.collapsed })}
            >
              <Icon name={widget.collapsed ? 'chevronDown' : 'chevronUp'} size={14} />
            </button>
          )}
          <button className="icon-btn small" title={expanded ? 'Volver al panel (Esc)' : 'Ampliar temporalmente (Esc para volver)'} aria-label={expanded ? 'Volver al panel' : 'Ampliar'} onClick={() => onExpand(!expanded)}>
            <Icon name={expanded ? 'shrink' : 'expand'} size={13} />
          </button>
          <MenuButton items={menu} title="Más opciones: tamaño, fijar, duplicar, mover, eliminar…" className="icon-btn small">
            <Icon name="more" size={15} />
          </MenuButton>
        </div>
      </header>
      {/* Plegado se oculta sin desmontar: la música sigue sonando y el panel web no se recarga. */}
      <div ref={bodyRef} className="widget-body no-drag" hidden={collapsed}>
        <HeaderSlotContext.Provider value={slot}>
          <WidgetErrorBoundary name={widget.title}>{children}</WidgetErrorBoundary>
        </HeaderSlotContext.Provider>
      </div>
    </section>
  )
}
