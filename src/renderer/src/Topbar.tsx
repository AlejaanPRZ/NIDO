import { useEffect, useState, type CSSProperties } from 'react'
import type { AppState, Settings } from '../../shared/types'
import { useApp } from './context'
import { Icon, type IconName } from './icons'
import { MenuButton } from './ui/Menu'

/** Reloj con la zona horaria y el idioma del equipo. */
export function Clock({ clock }: { clock: Settings['clock'] }): JSX.Element {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Se alinea con el cambio de segundo para que no vaya a saltos irregulares.
    let timer: ReturnType<typeof setTimeout>
    const tick = (): void => {
      setNow(new Date())
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    }
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    return () => clearTimeout(timer)
  }, [])

  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: clock.showSeconds ? '2-digit' : undefined,
    hour12: clock.hour12
  }).format(now)
  const date =
    clock.date === 'hidden'
      ? null
      : new Intl.DateTimeFormat(undefined, clock.date === 'short' ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="clock" title={`${new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now)} · ${zone}`} aria-live="off">
      <time className="clock-time" dateTime={now.toISOString()}>
        {time}
      </time>
      {date && <span className="clock-date">{date}</span>}
    </div>
  )
}

interface TopbarProps {
  state: AppState
  onSearch(): void
  onCatalog(): void
  onEditWorkspace(id: string): void
  onArrange(): void
  /** Vuelve a mostrar el recorrido de bienvenida */
  onTour(): void
}

export function Topbar({ state, onSearch, onCatalog, onEditWorkspace, onArrange, onTour }: TopbarProps): JSX.Element {
  const { dispatch, openSettings } = useApp()
  const { locked } = state.settings

  return (
    <header className="topbar glass-bar">
      <div className="tb-left">
        <span className="brand" aria-label="Nido">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Nido</span>
        </span>
        <nav className="ws-tabs" role="tablist" aria-label="Espacios">
          {state.workspaces.map((w, i) => {
            const active = state.activeWorkspace === w.id
            return (
              <button
                key={w.id}
                role="tab"
                aria-selected={active}
                aria-label={w.name}
                // Si no caben todas, la activa se desplaza a la vista.
                ref={active ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                className={`ws-tab ${active ? 'active' : ''}`}
                style={{ '--ws': w.color } as CSSProperties}
                title={`${w.name} · ${w.widgets.length} widget${w.widgets.length === 1 ? '' : 's'}${i < 9 ? ` (Ctrl+${i + 1})` : ''}\nDoble clic o clic derecho para editar`}
                onClick={() => dispatch({ type: 'workspace', id: w.id })}
                onDoubleClick={() => onEditWorkspace(w.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onEditWorkspace(w.id)
                }}
              >
                <span className="ws-icon">
                  <Icon name={w.icon as IconName} size={13} />
                </span>
                <span className="ws-name">{w.name}</span>
              </button>
            )
          })}
          <button className="icon-btn small ws-add" title="Nuevo espacio" aria-label="Nuevo espacio" onClick={() => dispatch({ type: 'addWorkspace' })}>
            <Icon name="plus" size={13} />
          </button>
        </nav>
      </div>

      <Clock clock={state.settings.clock} />

      <div className="tb-right">
        <button className="search-btn" onClick={onSearch} title="Buscar y comandos (Ctrl+K)" aria-label="Buscar y comandos">
          <Icon name="search" size={14} />
          <span className="search-label">Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>
        <MenuButton
          title={locked ? 'Distribución bloqueada: no se puede mover nada' : 'Modo edición: puedes mover y redimensionar'}
          className={`mode-pill ${locked ? 'locked' : 'editing'}`}
          items={() => [
            { label: locked ? 'Desbloquear distribución' : 'Bloquear distribución', icon: locked ? 'unlock' : 'lock', hint: 'Ctrl+L', onSelect: () => dispatch({ type: 'settings', patch: { locked: !locked } }) },
            { label: 'Organizar automáticamente', icon: 'layout', disabled: locked, onSelect: onArrange },
            { separator: true },
            { label: 'Editar este espacio…', icon: 'edit', onSelect: () => onEditWorkspace(state.activeWorkspace) },
            { label: 'Nuevo espacio', icon: 'plus', onSelect: () => dispatch({ type: 'addWorkspace' }) }
          ]}
        >
          <Icon name={locked ? 'lock' : 'edit'} size={13} />
          <span className="mode-label">{locked ? 'Bloqueado' : 'Editando'}</span>
          <Icon name="chevronDown" size={11} />
        </MenuButton>
        <button className="btn primary small add-widget" onClick={onCatalog} disabled={locked} title={locked ? 'Desbloquea la distribución para añadir widgets' : 'Abrir el catálogo de widgets'}>
          <Icon name="plus" size={14} />
          <span className="add-label">Añadir widget</span>
        </button>
        <button className="icon-btn tb-btn" title="Ver el recorrido de bienvenida (F1)" aria-label="Ver el recorrido de bienvenida" onClick={onTour}>
          <Icon name="help" size={16} />
        </button>
        <button className="icon-btn tb-btn" title="Ajustes (Ctrl+,)" aria-label="Ajustes" onClick={() => openSettings()}>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </header>
  )
}
