import { useEffect, useState } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import type { Theme, Widget, WidgetDataMap, WidgetType } from '../../shared/types'
import { Icon, type IconName } from './icons'
import { WIDGETS, WIDGET_TYPES } from './registry'
import { GRID_COLS, useNidoStore } from './store'
import { WidgetFrame } from './WidgetFrame'
import { CalendarWidget } from './widgets/CalendarWidget'
import { MusicWidget } from './widgets/MusicWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { TasksWidget } from './widgets/TasksWidget'
import { WebWidget } from './widgets/WebWidget'

const Grid = WidthProvider(GridLayout)

const THEMES: Record<Theme, { label: string; icon: IconName; next: Theme }> = {
  system: { label: 'Sistema', icon: 'monitor', next: 'light' },
  light: { label: 'Claro', icon: 'sun', next: 'dark' },
  dark: { label: 'Oscuro', icon: 'moon', next: 'system' }
}

const dateFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

function greeting(hour: number): string {
  if (hour < 6) return 'Buenas noches.'
  if (hour < 13) return 'Buenos días.'
  if (hour < 21) return 'Buenas tardes.'
  return 'Buenas noches.'
}

/** Re-renderiza cada minuto para que el saludo y la fecha no se queden viejos. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function renderWidget(widget: Widget, update: (patch: Partial<WidgetDataMap[WidgetType]>) => void): JSX.Element {
  switch (widget.type) {
    case 'notes':
      return <NotesWidget widget={widget} update={update} />
    case 'tasks':
      return <TasksWidget widget={widget} update={update} />
    case 'calendar':
      return <CalendarWidget widget={widget} update={update} />
    case 'music':
      return <MusicWidget widget={widget} update={update} />
    case 'web':
      return <WebWidget widget={widget} update={update} />
  }
}

export default function App(): JSX.Element {
  const { state, dispatch, ready } = useNidoStore()
  const { theme, locked } = state.settings
  const now = useNow()
  // Mientras se arrastra o redimensiona, los <webview> no deben capturar el ratón.
  const [interacting, setInteracting] = useState(false)

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  const layout: Layout[] = state.layout.map((l) => {
    const widget = state.widgets.find((w) => w.id === l.i)
    const size = widget ? WIDGETS[widget.type].size : undefined
    return { ...l, minW: size?.minW, minH: size?.minH }
  })

  const pendingTasks = state.widgets.reduce(
    (n, w) => (w.type === 'tasks' ? n + w.data.tasks.filter((t) => !t.done).length : n),
    0
  )

  const start = (): void => setInteracting(true)
  const stop = (): void => setInteracting(false)

  return (
    <div className={`app ${interacting ? 'is-interacting' : ''}`}>
      <div className="shell">
        <header className="topbar">
          <div className="topbar-left">
            <span className="brand">nido</span>
            <span className="pill static">{dateFormat.format(now)}</span>
          </div>
          <nav className="topbar-right">
            <button
              className="text-link"
              title="Bloquea la distribución para no mover widgets sin querer"
              onClick={() => dispatch({ type: 'settings', patch: { locked: !locked } })}
            >
              <Icon name={locked ? 'lock' : 'unlock'} size={14} />
              {locked ? 'Bloqueado' : 'Editable'}
            </button>
            <span className="sep">/</span>
            <button
              className="text-link"
              title="Cambiar tema"
              onClick={() => dispatch({ type: 'settings', patch: { theme: THEMES[theme].next } })}
            >
              <Icon name={THEMES[theme].icon} size={14} />
              {THEMES[theme].label}
            </button>
          </nav>
        </header>

        <section className="hero">
          <h1 className="hero-title">
            {greeting(now.getHours())}{' '}
            <span className="soft">
              {pendingTasks > 0
                ? `Tienes ${pendingTasks} tarea${pendingTasks === 1 ? '' : 's'} pendiente${pendingTasks === 1 ? '' : 's'}.`
                : 'Todo lo tuyo, en un mismo nido.'}
            </span>
          </h1>
          <div className="hero-actions">
            <span className="tag">Añadir</span>
            {WIDGET_TYPES.map((type, i) => (
              <button
                key={type}
                className={`pill ${i === 0 ? 'dark' : ''}`}
                disabled={locked}
                title={`Añadir ${WIDGETS[type].label.toLowerCase()}`}
                onClick={() => dispatch({ type: 'add', widgetType: type })}
              >
                <Icon name={WIDGETS[type].icon} size={14} />
                {WIDGETS[type].label}
              </button>
            ))}
          </div>
        </section>

        <main className="board">
          {ready && state.widgets.length === 0 && (
            <div className="board-empty">
              <span className="empty-badge">
                <Icon name="plus" size={20} />
              </span>
              <p>Tu nido está vacío. Añade un widget para empezar.</p>
            </div>
          )}
          {ready && (
            <Grid
              className="grid"
              layout={layout}
              cols={GRID_COLS}
              rowHeight={32}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              draggableHandle=".widget-drag"
              draggableCancel=".no-drag"
              isDraggable={!locked}
              isResizable={!locked}
              compactType="vertical"
              onLayoutChange={(next) => dispatch({ type: 'layout', layout: next })}
              onDragStart={start}
              onDragStop={stop}
              onResizeStart={start}
              onResizeStop={stop}
            >
              {state.widgets.map((widget) => (
                <div key={widget.id}>
                  <WidgetFrame
                    widget={widget}
                    locked={locked}
                    onRename={(title) => dispatch({ type: 'rename', id: widget.id, title })}
                    onRemove={() => dispatch({ type: 'remove', id: widget.id })}
                  >
                    {renderWidget(widget, (patch) => dispatch({ type: 'patch', id: widget.id, patch }))}
                  </WidgetFrame>
                </div>
              ))}
            </Grid>
          )}
        </main>

        <footer className="footer">
          <span>Nido · tus datos se guardan solo en este equipo</span>
          <span>
            {state.widgets.length} widget{state.widgets.length === 1 ? '' : 's'}
          </span>
        </footer>
      </div>
    </div>
  )
}
