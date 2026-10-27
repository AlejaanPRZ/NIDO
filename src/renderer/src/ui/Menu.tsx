import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../icons'
import { useEscape } from './Modal'

export type MenuItem =
  | {
      label: string
      icon?: IconName
      hint?: string
      onSelect(): void
      disabled?: boolean
      danger?: boolean
      checked?: boolean
    }
  | { separator: true }
  | { header: string }

interface MenuButtonProps {
  items: MenuItem[] | (() => MenuItem[])
  title: string
  className?: string
  children: ReactNode
  align?: 'start' | 'end'
  disabled?: boolean
}

/** Botón que abre un menú flotante (se pinta en el body para no quedar recortado). */
export function MenuButton({ items, title, className = 'icon-btn', children, align = 'end', disabled }: MenuButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={anchor}
        className={`${className} no-drag ${open ? 'is-open' : ''}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open && anchor.current && (
        <MenuPopover
          anchor={anchor.current}
          items={typeof items === 'function' ? items() : items}
          align={align}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function MenuPopover({
  anchor,
  items,
  align,
  onClose
}: {
  anchor: HTMLElement
  items: MenuItem[]
  align: 'start' | 'end'
  onClose(): void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEscape(onClose)

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect()
    const menu = ref.current!.getBoundingClientRect()
    let left = align === 'end' ? a.right - menu.width : a.left
    left = Math.max(8, Math.min(left, window.innerWidth - menu.width - 8))
    let top = a.bottom + 6
    if (top + menu.height > window.innerHeight - 8) top = Math.max(8, a.top - menu.height - 6)
    setPos({ top, left })
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [anchor, align])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      className="menu glass-strong"
      role="menu"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        if ('separator' in item) return <div key={i} className="menu-sep" />
        if ('header' in item) return <div key={i} className="menu-header">{item.header}</div>
        return (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span className="menu-icon">{item.checked ? <Icon name="check" size={14} /> : item.icon && <Icon name={item.icon} size={14} />}</span>
            <span className="menu-label">{item.label}</span>
            {item.hint && <span className="menu-hint">{item.hint}</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
