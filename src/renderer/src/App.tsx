import { useCallback, useEffect, useMemo, useState } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import type { AppState, Widget, WidgetDataMap, WidgetType, Workspace } from '../../shared/types'
import { CommandPalette } from './CommandPalette'
import { AppContext, useBrowsers, type AppContextValue, type SettingsSection } from './context'
import { Icon } from './icons'
import { COLLAPSED_H, WIDGETS } from './registry'
import { SettingsDialog } from './Settings'
import { GRID_COLS, useNidoStore, WORKSPACES, type Action } from './store'
import { Topbar } from './Topbar'
import { EmptyState } from './ui/controls'
import { FeedbackLayer } from './ui/feedback'
import { hasOpenLayer, useEscape } from './ui/Modal'
import { hostOf } from './util'
import { Welcome } from './Welcome'
import { WidgetFrame } from './WidgetFrame'
import { CalendarWidget } from './widgets/calendar/CalendarWidget'
import { LinksWidget } from './widgets/LinksWidget'
import { MusicWidget } from './widgets/music/MusicWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { TasksWidget } from './widgets/tasks/TasksWidget'
import { WebWidget } from './widgets/WebWidget'

const Grid = WidthProvider(GridLayout)

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
    case 'links':
      return <LinksWidget widget={widget} update={update} />
  }
}

/** Una línea que resume el widget cuando está plegado. */
function summaryOf(widget: Widget): string {
  switch (widget.type) {
    case 'notes':
      return widget.data.text.trim().split('\n')[0]?.slice(0, 60) || 'Vacía'
    case 'tasks': {
      if (widget.data.source === 'notion') return `Notion · ${widget.data.notion?.name ?? 'sin base de datos'}`
      const open = widget.data.tasks.filter((t) => !t.done).length
      return `${open} pendiente${open === 1 ? '' : 's'}`
    }
    case 'calendar':
      return widget.data.source === 'google' ? 'Google Calendar' : `${widget.data.events.length} eventos locales`
    case 'music':
      return widget.data.source === 'local'
        ? (widget.data.tracks[widget.data.current]?.name ?? 'Sin canciones')
        : 'Ahora suena'
    case 'web':
      return hostOf(widget.data.url)
    case 'links': {
      const n = widget.data.groups.reduce((s, g) => s + g.links.length, 0)
      return `${n} enlace${n === 1 ? '' : 's'}`
    }
  }
}

function WorkspaceGrid({
  workspace,
  active,
  locked,
  expanded,
  highlighted,
  dispatch,
  onExpand,
  onInteract
}: {
  workspace: Workspace
  active: boolean
  locked: boolean
  expanded: string | null
  highlighted: string | null
  dispatch(a: Action): void
  onExpand(id: string | null): void
  onInteract(on: boolean): void
}): JSX.Element {
  const layout: Layout[] = workspace.layout.map((l) => {
    const widget = workspace.widgets.find((w) => w.id === l.i)
    const size = widget ? WIDGETS[widget.type].size : undefined
    const collapsed = !!widget?.collapsed
    return {
      ...l,
      minW: size?.minW,
      minH: collapsed ? COLLAPSED_H : size?.minH,
      maxH: collapsed ? COLLAPSED_H : undefined,
      isResizable: !collapsed
    }
  })

  return (
    // Los espacios inactivos siguen montados (ocultos) para que la música o las webs no se corten.
    <div className={`workspace ${active ? 'active' : 'inactive'}`} aria-hidden={!active}>
      {workspace.widgets.length === 0 && active && (
        <EmptyState icon={<Icon name="plus" size={20} />} title={`${workspace.name} está vacío`}>
          Añade un widget con el botón + de arriba o con Ctrl+K.
        </EmptyState>
      )}
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
        // Sin transform CSS: así un widget ampliado (position: fixed) se coloca respecto a la ventana.
        useCSSTransforms={false}
        onLayoutChange={(next) => dispatch({ type: 'layout', workspace: workspace.id, layout: next })}
        onDragStart={() => onInteract(true)}
        onDragStop={() => onInteract(false)}
        onResizeStart={() => onInteract(true)}
        onResizeStop={() => onInteract(false)}
      >
        {workspace.widgets.map((widget) => (
          <div key={widget.id} className={expanded === widget.id ? 'has-expanded' : ''}>
            <WidgetFrame
              widget={widget}
              workspaceId={workspace.id}
              locked={locked}
              expanded={expanded === widget.id}
              highlighted={highlighted === widget.id}
              summary={summaryOf(widget)}
              onExpand={(on) => onExpand(on ? widget.id : null)}
            >
              {renderWidget(widget, (patch) => dispatch({ type: 'patch', id: widget.id, patch }))}
            </WidgetFrame>
          </div>
        ))}
      </Grid>
    </div>
  )
}

export default function App(): JSX.Element {
  const { state, dispatch, ready } = useNidoStore()
  const { settings } = state
  const { browsers, refresh: refreshBrowsers } = useBrowsers()
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  // Mientras se arrastra o redimensiona, los <webview> no deben capturar el ratón.
  const [interacting, setInteracting] = useState(false)

  // La bienvenida aparece una sola vez: queda marcada en el estado guardado.
  useEffect(() => {
    if (ready && !state.settings.welcomeSeen) setWelcomeOpen(true)
    // Solo al terminar de cargar.
  }, [ready])

  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false)
    dispatch({ type: 'settings', patch: { welcomeSeen: true } })
  }, [dispatch])

  const showWelcome = useCallback(() => {
    setSettingsSection(null)
    setWelcomeOpen(true)
    document.querySelector('.app')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Tema, transparencia y movimiento se aplican como atributos en <html>.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.dataset.transparency = settings.reduceTransparency ? 'reduced' : 'full'
    root.dataset.motion = settings.reduceMotion ? 'reduced' : 'full'
  }, [settings.theme, settings.reduceTransparency, settings.reduceMotion])

  // Al cambiar de espacio se cierra el widget ampliado.
  useEffect(() => setExpanded(null), [state.activeWorkspace])

  const focusWidget = useCallback(
    (id: string) => {
      const ws = state.workspaces.find((w) => w.widgets.some((x) => x.id === id))
      if (ws) dispatch({ type: 'workspace', id: ws.id })
      setHighlighted(id)
      setTimeout(() => setHighlighted((h) => (h === id ? null : h)), 1800)
    },
    [state.workspaces, dispatch]
  )

  useEscape(() => setExpanded(null), expanded !== null)

  // Atajos de teclado globales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (hasOpenLayer() && !paletteOpen) return
      if (mod && e.key === ',') {
        e.preventDefault()
        setSettingsSection('general')
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        dispatch({ type: 'settings', patch: { locked: !state.settings.locked } })
      } else if (mod && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        dispatch({ type: 'workspace', id: WORKSPACES[Number(e.key) - 1].id })
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (!state.settings.locked) dispatch({ type: 'add', widgetType: 'notes' })
      } else if (e.key === 'F1') {
        e.preventDefault()
        showWelcome()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, state.settings.locked, paletteOpen, showWelcome])

  const context = useMemo<AppContextValue>(
    () => ({
      dispatch,
      settings,
      browsers,
      refreshBrowsers,
      openSettings: (section = 'general') => setSettingsSection(section)
    }),
    [dispatch, settings, browsers, refreshBrowsers]
  )

  return (
    <AppContext.Provider value={context}>
      <div className={`app ${interacting ? 'is-interacting' : ''} ${expanded ? 'has-expanded-widget' : ''}`}>
        <div className="wallpaper" aria-hidden />
        <Topbar state={state} onSearch={() => setPaletteOpen(true)} />
        <main className="board">
          {welcomeOpen && <Welcome onClose={closeWelcome} />}
          {ready &&
            state.workspaces.map((ws) => (
              <WorkspaceGrid
                key={ws.id}
                workspace={ws}
                active={ws.id === state.activeWorkspace}
                locked={settings.locked}
                expanded={expanded}
                highlighted={highlighted}
                dispatch={dispatch}
                onExpand={setExpanded}
                onInteract={setInteracting}
              />
            ))}
        </main>
        {expanded && <div className="expand-scrim" onClick={() => setExpanded(null)} aria-hidden />}
      </div>

      {paletteOpen && (
        <CommandPalette
          state={state}
          onClose={() => setPaletteOpen(false)}
          onFocusWidget={focusWidget}
          onShowWelcome={showWelcome}
        />
      )}
      {settingsSection && (
        <SettingsDialog
          state={state}
          section={settingsSection}
          onSection={setSettingsSection}
          onClose={() => setSettingsSection(null)}
          onShowWelcome={showWelcome}
          onImport={(next: AppState) => dispatch({ type: 'hydrate', state: next })}
        />
      )}
      <FeedbackLayer />
    </AppContext.Provider>
  )
}
