import { useEffect, useState } from 'react'
import type { AppState } from '../../shared/types'
import { useApp } from './context'
import { Icon } from './icons'
import { WIDGETS, WIDGET_TYPES } from './registry'
import { WORKSPACES } from './store'
import { MenuButton } from './ui/Menu'

/** Reloj con la zona horaria y el idioma del equipo. */
export function Clock({ hour12, showSeconds }: { hour12: boolean; showSeconds: boolean }): JSX.Element {
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
    second: showSeconds ? '2-digit' : undefined,
    hour12
  }).format(now)
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="clock" title={`Zona horaria: ${zone}`} aria-live="off">
      <time className="clock-time" dateTime={now.toISOString()}>
        {time}
      </time>
      <span className="clock-date">{date}</span>
    </div>
  )
}

export function Topbar({ state, onSearch }: { state: AppState; onSearch(): void }): JSX.Element {
  const { dispatch, openSettings } = useApp()
  const { locked, clock } = state.settings

  return (
    <header className="topbar glass">
      <div className="tb-left">
        <span className="brand" aria-label="Nido">
          <span className="brand-mark" aria-hidden />
          Nido
        </span>
        <div className="segmented workspaces" role="tablist" aria-label="Espacios">
          {WORKSPACES.map((w, i) => {
            const count = state.workspaces.find((x) => x.id === w.id)?.widgets.length ?? 0
            return (
              <button
                key={w.id}
                role="tab"
                aria-selected={state.activeWorkspace === w.id}
                className={state.activeWorkspace === w.id ? 'active' : ''}
                title={`${w.name} · ${count} widget${count === 1 ? '' : 's'} (Ctrl+${i + 1})`}
                onClick={() => dispatch({ type: 'workspace', id: w.id })}
              >
                <Icon name={w.icon} size={13} />
                <span className="ws-name">{w.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Clock hour12={clock.hour12} showSeconds={clock.showSeconds} />

      <div className="tb-right">
        <button className="search-btn" onClick={onSearch} title="Buscar widgets, tareas y accesos (Ctrl+K)">
          <Icon name="search" size={14} />
          <span className="search-label">Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>
        <MenuButton
          title="Añadir widget"
          className="icon-btn tb-btn"
          disabled={locked}
          items={WIDGET_TYPES.map((type) => ({
            label: WIDGETS[type].label,
            icon: WIDGETS[type].icon,
            hint: WIDGETS[type].description,
            onSelect: () => dispatch({ type: 'add', widgetType: type })
          }))}
        >
          <Icon name="plus" size={16} />
        </MenuButton>
        <button
          className={`icon-btn tb-btn ${locked ? 'on' : ''}`}
          aria-pressed={locked}
          title={locked ? 'Distribución bloqueada (Ctrl+L)' : 'Bloquear distribución (Ctrl+L)'}
          onClick={() => dispatch({ type: 'settings', patch: { locked: !locked } })}
        >
          <Icon name={locked ? 'lock' : 'unlock'} size={15} />
        </button>
        <button className="icon-btn tb-btn" title="Ajustes (Ctrl+,)" onClick={() => openSettings()}>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </header>
  )
}
