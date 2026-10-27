import { useEffect, useState } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import type { Theme, Widget, WidgetDataMap, WidgetType } from '../../shared/types'
import { WIDGETS, WIDGET_TYPES } from './registry'
import { GRID_COLS, useNidoStore } from './store'
import { WidgetFrame } from './WidgetFrame'
import { CalendarWidget } from './widgets/CalendarWidget'
import { MusicWidget } from './widgets/MusicWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { TasksWidget } from './widgets/TasksWidget'
import { WebWidget } from './widgets/WebWidget'

const Grid = WidthProvider(GridLayout)

const THEME_LABEL: Record<Theme, string> = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: oscuro' }
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

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

  const start = (): void => setInteracting(true)
  const stop = (): void => setInteracting(false)

  return (
    <div className={`app ${interacting ? 'is-interacting' : ''}`}>
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◖◗
          </span>
          Nido
        </div>
        <div className="toolbar-add">
          {WIDGET_TYPES.map((type) => (
            <button
              key={type}
              className="btn"
              disabled={locked}
              title={`Añadir ${WIDGETS[type].label.toLowerCase()}`}
              onClick={() => dispatch({ type: 'add', widgetType: type })}
            >
              <span className="btn-icon">{WIDGETS[type].icon}</span>
              {WIDGETS[type].label}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <button
            className={`btn ${locked ? 'active' : ''}`}
            title="Bloquea la distribución para no mover widgets sin querer"
            onClick={() => dispatch({ type: 'settings', patch: { locked: !locked } })}
          >
            {locked ? '🔒 Bloqueado' : '🔓 Editable'}
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'settings', patch: { theme: NEXT_THEME[theme] } })}>
            {THEME_LABEL[theme]}
          </button>
        </div>
      </header>

      <main className="board">
        {ready && state.widgets.length === 0 && (
          <div className="board-empty muted">Tu nido está vacío. Añade un widget desde la barra superior.</div>
        )}
        {ready && (
          <Grid
            className="grid"
            layout={layout}
            cols={GRID_COLS}
            rowHeight={32}
            margin={[12, 12]}
            containerPadding={[16, 16]}
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
    </div>
  )
}
