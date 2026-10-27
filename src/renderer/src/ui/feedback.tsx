import { useEffect, useState } from 'react'
import { Icon } from '../icons'
import { Modal } from './Modal'

// Avisos (toasts) y confirmaciones accesibles desde cualquier parte sin
// pasar props: un pequeño almacén con suscriptores y una capa que los pinta.

type ToastKind = 'info' | 'success' | 'error'
interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: { label: string; run(): void }
}
interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  resolve(ok: boolean): void
}

let toasts: Toast[] = []
let confirmRequest: ConfirmRequest | null = null
let nextId = 1
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

export function toast(message: string, kind: ToastKind = 'info', action?: Toast['action']): void {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, kind, message, action }]
  emit()
  setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 4000)
}

function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Pide confirmación; resuelve true solo si se acepta. */
export function confirmDialog(options: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest?.resolve(false)
    confirmRequest = {
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Aceptar',
      danger: options.danger ?? false,
      resolve
    }
    emit()
  })
}

function settleConfirm(ok: boolean): void {
  confirmRequest?.resolve(ok)
  confirmRequest = null
  emit()
}

export function FeedbackLayer(): JSX.Element {
  const [, force] = useState(0)
  useEffect(() => {
    const l = (): void => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast glass-strong ${t.kind}`}>
            <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'bell'} size={15} />
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                className="btn small"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn small" title="Cerrar" onClick={() => dismissToast(t.id)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
      {confirmRequest && (
        <Modal
          title={confirmRequest.title}
          size="sm"
          onClose={() => settleConfirm(false)}
          footer={
            <>
              <button className="btn" onClick={() => settleConfirm(false)}>
                Cancelar
              </button>
              <button
                className={`btn ${confirmRequest.danger ? 'danger' : 'primary'}`}
                autoFocus
                onClick={() => settleConfirm(true)}
              >
                {confirmRequest.confirmLabel}
              </button>
            </>
          }
        >
          <p className="confirm-text">{confirmRequest.message}</p>
        </Modal>
      )}
    </>
  )
}
