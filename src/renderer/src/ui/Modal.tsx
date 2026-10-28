import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../icons'

// Pila de capas abiertas: Escape cierra solo la de arriba (p. ej. una
// confirmación encima del editor de un evento).
const escapeStack: (() => void)[] = []

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || escapeStack.length === 0) return
  e.preventDefault()
  e.stopPropagation()
  escapeStack[escapeStack.length - 1]()
})

export function useEscape(handler: () => void, active = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    const fn = (): void => ref.current()
    escapeStack.push(fn)
    return () => {
      const i = escapeStack.lastIndexOf(fn)
      if (i >= 0) escapeStack.splice(i, 1)
    }
  }, [active])
}

/** ¿Hay alguna ventana emergente abierta? (para no disparar atajos debajo) */
export const hasOpenLayer = (): boolean => escapeStack.length > 0

interface ModalProps {
  title?: string
  onClose(): void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
  children: ReactNode
  className?: string
}

export function Modal({ title, onClose, size = 'md', footer, children, className = '' }: ModalProps): JSX.Element {
  useEscape(onClose)
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal glass-strong modal-${size} ${className}`} role="dialog" aria-modal aria-label={title}>
        {title && (
          <header className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" title="Cerrar (Esc)" onClick={onClose}>
              <Icon name="close" size={15} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}
