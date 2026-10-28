import type { ReactNode } from 'react'

/** Control segmentado al estilo de Apple. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = ''
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange(value: T): void
  label: string
  className?: string
}): JSX.Element {
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          // Sin type="button", dentro de un <form> enviaría el formulario al pulsarlo.
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean
  onChange(checked: boolean): void
  label: string
  description?: string
}): JSX.Element {
  return (
    <label className="toggle-row">
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Spinner({ size = 14 }: { size?: number }): JSX.Element {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Cargando" />
}

/** Mensaje de estado dentro de un widget (vacío, sin conexión, error…). */
export function EmptyState({
  icon,
  title,
  children,
  action
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="empty-state">
      {icon && <span className="empty-icon">{icon}</span>}
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  )
}
