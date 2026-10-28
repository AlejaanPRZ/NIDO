import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import type { AppState, LayoutItem, Widget, WidgetDataMap, WidgetType, Workspace } from '../../shared/types'
import { CatalogDialog } from './CatalogDialog'
import { CommandPalette } from './CommandPalette'
import { AppContext, useBrowsers, WorkspaceActiveContext, type AppContextValue, type SettingsSection } from './context'
import { Icon } from './icons'
import { COLLAPSED_H, WIDGETS } from './registry'
import { SettingsDialog } from './Settings'
import { arrange, findWidget, GRID_COLS, useNidoStore, type Action } from './store'
import { Topbar } from './Topbar'
import { FeedbackLayer, toast } from './ui/feedback'
import { hasOpenLayer, useEscape } from './ui/Modal'
import { hostOf } from './util'
import { Welcome } from './Welcome'
import { WidgetFrame } from './WidgetFrame'
import { CalculatorWidget } from './widgets/CalculatorWidget'
import { CalendarWidget } from './widgets/calendar/CalendarWidget'
import { ConverterWidget } from './widgets/ConverterWidget'
import { HabitsWidget } from './widgets/HabitsWidget'
import { HolidaysWidget } from './widgets/HolidaysWidget'
import { ImagesWidget } from './widgets/ImagesWidget'
import { LauncherWidget } from './widgets/LauncherWidget'
import { LinksWidget } from './widgets/LinksWidget'
import { MusicWidget } from './widgets/music/MusicWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { PomodoroWidget } from './widgets/PomodoroWidget'
import { RadioWidget } from './widgets/RadioWidget'
import { RecentWidget } from './widgets/RecentWidget'
import { RssWidget } from './widgets/RssWidget'
import { SearchWidget } from './widgets/SearchWidget'
import { SystemWidget } from './widgets/SystemWidget'
import { TasksWidget } from './widgets/tasks/TasksWidget'
import { TimerWidget } from './widgets/TimerWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { WebWidget } from './widgets/WebWidget'
import { WorldClockWidget } from './widgets/WorldClockWidget'
import { WorkspaceDialog } from './WorkspaceDialog'

const Grid = WidthProvider(GridLayout)
const ROW_HEIGHT = 32
const MARGIN = 16
/** Por debajo de este ancho de panel (px) los widgets se apilan en vez de usar 12 columnas. */
const STACK_BELOW = 860
/**
 * Ancho de columna de referencia (panel de ~1340 px). Los mínimos de cada widget se definen en
 * columnas a este ancho; con ventanas más estrechas o el escalado de Windows al 125–200 %, las
 * columnas encogen y un widget de 2 columnas quedaría en ~130 px. Por eso se conservan en píxeles.
 */
const REF_COL = 97

/** Ancho mínimo en píxeles de un widget de minW columnas (el que tiene en el panel de referencia). */
const minPx = (minW: number): number => minW * REF_COL + (minW - 1) * MARGIN

/**
 * Distribución adaptada a columnas estrechas: cada widget se ensancha hasta su mínimo en píxeles
 * (sin pasar del ancho del panel) y, si se sale por la derecha, se desplaza. Las colisiones las
 * resuelve la cuadrícula empujando hacia abajo. Solo sirve para pintar: no se guarda.
 */
function adaptLayout(layout: Layout[], colWidth: number): Layout[] {
  return layout.map((l) => {
    const need = Math.min(GRID_COLS, Math.ceil((minPx(l.minW ?? 1) + MARGIN) / (colWidth + MARGIN)))
    const w = Math.max(l.w, need)
    return { ...l, w, minW: need, x: Math.min(l.x, GRID_COLS - w) }
  })
}

/**
 * Distribución del modo apilado: una sola columna, en orden de lectura (fila y luego columna)
 * y con la misma altura que en la cuadrícula. Solo sirve para pintar: no se guarda.
 */
function stackLayout(layout: Layout[]): Layout[] {
  let y = 0
  return [...layout]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l) => {
      const item: Layout = { ...l, x: 0, y, w: 1, minW: 1, isDraggable: false, isResizable: false }
      y += l.h
      return item
    })
}

type Update = (patch: Partial<WidgetDataMap[WidgetType]>) => void

function renderWidget(widget: Widget, update: Update): JSX.Element {
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
    case 'pomodoro':
      return <PomodoroWidget widget={widget} update={update} />
    case 'timer':
      return <TimerWidget widget={widget} update={update} />
    case 'worldclock':
      return <WorldClockWidget widget={widget} update={update} />
    case 'calculator':
      return <CalculatorWidget widget={widget} update={update} />
    case 'habits':
      return <HabitsWidget widget={widget} update={update} />
    case 'launcher':
      return <LauncherWidget widget={widget} update={update} />
    case 'images':
      return <ImagesWidget widget={widget} update={update} />
    case 'recent':
      return <RecentWidget widget={widget} update={update} />
    case 'system':
      return <SystemWidget widget={widget} update={update} />
    case 'weather':
      return <WeatherWidget widget={widget} update={update} />
    case 'rss':
      return <RssWidget widget={widget} update={update} />
    case 'holidays':
      return <HolidaysWidget widget={widget} update={update} />
    case 'converter':
      return <ConverterWidget widget={widget} update={update} />
    case 'search':
      return <SearchWidget widget={widget} update={update} />
    case 'radio':
      return <RadioWidget widget={widget} update={update} />
  }
}

/** Una línea que resume el widget cuando está plegado. */
function summaryOf(widget: Widget): string {
  switch (widget.type) {
    case 'notes':
      return widget.data.text.trim().split('\n')[0]?.replace(/^[#\-*\s[\]x]+/, '').slice(0, 60) || 'Vacía'
    case 'tasks': {
      if (widget.data.source === 'notion') return `Notion · ${widget.data.notion?.name ?? 'sin base de datos'}`
      const open = widget.data.tasks.filter((t) => !t.done).length
      return `${open} pendiente${open === 1 ? '' : 's'}`
    }
    case 'calendar':
      return widget.data.source === 'google' ? 'Google Calendar' : `${widget.data.events.length} eventos locales`
    case 'music':
      return widget.data.source === 'local' ? (widget.data.tracks[widget.data.current]?.name ?? 'Sin canciones') : 'Ahora suena'
    case 'web':
      return hostOf(widget.data.url)
    case 'links': {
      const n = widget.data.groups.reduce((s, g) => s + g.links.length, 0)
      return `${n} enlace${n === 1 ? '' : 's'}`
    }
    case 'pomodoro':
      return widget.data.clock.running ? 'En marcha' : `${widget.data.focus} min de foco`
    case 'timer':
      return widget.data.mode === 'timer' ? (widget.data.timer.running ? 'Temporizador en marcha' : 'Temporizador') : 'Cronómetro'
    case 'worldclock':
      return widget.data.zones.map((z) => z.label).join(', ') || 'Sin ciudades'
    case 'calculator':
      return widget.data.history[0] ? `${widget.data.history[0].expr} = ${widget.data.history[0].result}` : 'Calculadora'
    case 'habits':
      return `${widget.data.habits.length} hábitos`
    case 'launcher':
      return `${widget.data.items.length} accesos`
    case 'images':
      return `${widget.data.sources.length} orígenes`
    case 'recent':
      return 'Abierto desde Nido'
    case 'system':
      return 'CPU y memoria'
    case 'weather':
      return widget.data.place?.name ?? 'Sin ciudad'
    case 'rss':
      return `${widget.data.feeds.length} feeds`
    case 'holidays':
      return `Festivos (${widget.data.country})`
    case 'converter':
      return widget.data.mode === 'currency' ? `${widget.data.currency.from} → ${widget.data.currency.to}` : 'Unidades'
    case 'search':
      return 'Buscador'
    case 'radio':
      return widget.data.stations.find((s) => s.id === widget.data.current)?.name ?? `${widget.data.stations.length} emisoras`
  }
}

function WorkspaceGrid({
  workspace,
  workspaces,
  active,
  locked,
  expanded,
  highlighted,
  dispatch,
  onExpand,
  onInteract,
  onCatalog
}: {
  workspace: Workspace
  workspaces: Workspace[]
  active: boolean
  locked: boolean
  expanded: string | null
  highlighted: string | null
  dispatch(a: Action): void
  onExpand(id: string | null): void
  onInteract(on: boolean): void
  onCatalog(): void
}): JSX.Element {
  const wrapper = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const colWidth = (width - MARGIN * (GRID_COLS - 1)) / GRID_COLS
  // Ventana estrecha: 12 columnas dejarían los widgets inservibles, así que se apilan.
  const stacked = width > 0 && width < STACK_BELOW

  // Ancho del panel: decide el modo apilado y las medidas de las guías que se pintan al arrastrar.
  useLayoutEffect(() => {
    const el = wrapper.current
    if (!el) return
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const gridLayout: Layout[] = workspace.layout.map((l) => {
    const widget = workspace.widgets.find((w) => w.id === l.i)
    const size = widget ? WIDGETS[widget.type].size : undefined
    const collapsed = !!widget?.collapsed
    return {
      ...l,
      minW: size?.minW,
      minH: collapsed ? COLLAPSED_H : size?.minH,
      maxH: collapsed ? COLLAPSED_H : undefined,
      // El valor por elemento manda sobre el de la cuadrícula, así que aquí también cuenta el bloqueo.
      isResizable: !collapsed && !locked,
      // Fijado: no se mueve ni deja que otros lo desplacen.
      static: !!widget?.pinned
    }
  })
  // Apilado y cuadrícula usan el mismo componente y los mismos hijos (mismas key): al cruzar el umbral
  // solo cambia la distribución, así que ningún widget se desmonta (la música, los paneles web y los
  // temporizadores siguen como estaban).
  // Columnas más estrechas que las de referencia: los widgets conservan su ancho mínimo en píxeles.
  const adapted = !stacked && width > 0 && colWidth < REF_COL - 0.5
  const layout = stacked ? stackLayout(gridLayout) : adapted ? adaptLayout(gridLayout, colWidth) : gridLayout

  /** En modo adaptado solo se guarda el widget que el usuario ha movido o redimensionado. */
  const saveOne = (item: Layout): void => {
    dispatch({ type: 'layout', workspace: workspace.id, layout: workspace.layout.map((l) => (l.i === item.i ? { ...l, x: item.x, y: item.y, w: item.w, h: item.h } : l)) })
  }

  const guides = { '--colw': `${colWidth}px`, '--colstep': `${colWidth + MARGIN}px`, '--rowh': `${ROW_HEIGHT}px`, '--rowstep': `${ROW_HEIGHT + MARGIN}px` } as CSSProperties

  return (
    // Los espacios inactivos siguen montados (ocultos) para que la música o los temporizadores no se corten;
    // los widgets que consultan datos se pausan a través de WorkspaceActiveContext.
    <WorkspaceActiveContext.Provider value={active}>
      <div ref={wrapper} className={`workspace ${active ? 'active' : 'inactive'} ${stacked ? 'is-stacked' : ''}`} aria-hidden={!active} style={guides}>
        {workspace.widgets.length === 0 && active && (
          <div className="board-empty">
            <span className="empty-icon">
              <Icon name="grid" size={18} />
            </span>
            <p className="empty-title">«{workspace.name}» está vacío</p>
            <p className="empty-text">Añade notas, tareas, tu calendario, música o una web.</p>
            <button className="btn primary small" disabled={locked} onClick={onCatalog}>
              <Icon name="plus" size={13} /> Añadir widget
            </button>
          </div>
        )}
        <Grid
          className="grid"
          layout={layout}
          cols={stacked ? 1 : GRID_COLS}
          rowHeight={ROW_HEIGHT}
          margin={[MARGIN, MARGIN]}
          containerPadding={[0, 0]}
          draggableHandle=".widget-drag"
          draggableCancel=".no-drag"
          isDraggable={!locked && !stacked}
          isResizable={!locked && !stacked}
          // Colocación libre: el widget se queda donde se suelta (con huecos si hace falta) y solo
          // desplaza hacia abajo a los que pisa. Con compactación vertical subía solo y deshacía el gesto.
          compactType={null}
          preventCollision={false}
          // Sin transform CSS: así un widget ampliado (position: fixed) se coloca respecto a la ventana.
          useCSSTransforms={false}
          // La distribución apilada es solo de presentación: la guardada no cambia.
          onLayoutChange={(next) => {
            if (!stacked && !adapted) dispatch({ type: 'layout', workspace: workspace.id, layout: next })
          }}
          onDragStart={() => onInteract(true)}
          onDragStop={(_l, _old, item) => {
            onInteract(false)
            if (adapted) saveOne(item)
          }}
          onResizeStart={() => onInteract(true)}
          onResizeStop={(_l, _old, item) => {
            onInteract(false)
            if (adapted) saveOne(item)
          }}
        >
          {workspace.widgets.map((widget) => (
            <div key={widget.id} className={expanded === widget.id ? 'has-expanded' : ''}>
              <WidgetFrame
                widget={widget}
                workspaceId={workspace.id}
                workspaces={workspaces}
                // Apilado: el marco se comporta como bloqueado, para que nada cambie la distribución guardada.
                locked={locked || stacked}
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
    </WorkspaceActiveContext.Provider>
  )
}

export default function App(): JSX.Element {
  const { state, dispatch, ready } = useNidoStore()
  const { settings } = state
  const { browsers, refresh: refreshBrowsers } = useBrowsers()
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [undoLayout, setUndoLayout] = useState<{ workspace: string; layout: LayoutItem[] } | null>(null)
  // Mientras se arrastra o redimensiona, los <webview> no deben capturar el ratón.
  const [interacting, setInteracting] = useState(false)

  // El estado de React llega un fotograma tarde: si el ratón pasa por encima de un panel web justo al
  // empezar, el <webview> se queda con los eventos y el arrastre se corta. Por eso se marca <html> en el
  // mismo pointerdown (fase de captura) y, mientras dura, el panel se desplaza solo cerca de los bordes.
  useEffect(() => {
    const root = document.documentElement
    let pointerY = -1
    let frame = 0
    const scroll = (): void => {
      const board = document.querySelector<HTMLElement>('.board-scroll')
      if (board && pointerY >= 0) {
        const r = board.getBoundingClientRect()
        const edge = 56
        const speed = pointerY < r.top + edge ? -(r.top + edge - pointerY) : pointerY > r.bottom - edge ? pointerY - (r.bottom - edge) : 0
        if (speed) board.scrollTop += Math.max(-24, Math.min(24, speed / 2))
      }
      frame = requestAnimationFrame(scroll)
    }
    const down = (e: PointerEvent): void => {
      if (e.button !== 0) return
      const t = e.target as Element | null
      if (!t?.closest?.('.widget-drag, .react-resizable-handle') || t.closest('.no-drag')) return
      root.classList.add('is-pointer-drag')
      pointerY = e.clientY
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(scroll)
    }
    const move = (e: PointerEvent): void => {
      if (root.classList.contains('is-pointer-drag')) pointerY = e.clientY
    }
    const up = (): void => {
      root.classList.remove('is-pointer-drag')
      pointerY = -1
      cancelAnimationFrame(frame)
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('blur', up)
    return () => {
      up()
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('blur', up)
    }
  }, [])

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
    document.querySelector('.board-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Tema, transparencia y movimiento se aplican como atributos en <html>.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.dataset.transparency = settings.reduceTransparency ? 'reduced' : 'full'
    root.dataset.motion = settings.reduceMotion ? 'reduced' : 'full'
    root.style.setProperty('--glass-k', String(settings.glass / 100))
  }, [settings.theme, settings.reduceTransparency, settings.reduceMotion, settings.glass])

  // Al cambiar de espacio se cierra el widget ampliado.
  useEffect(() => setExpanded(null), [state.activeWorkspace])

  const focusWidget = useCallback(
    (id: string) => {
      const found = findWidget(state, id)
      if (found) dispatch({ type: 'workspace', id: found.workspace.id })
      setHighlighted(id)
      setTimeout(() => setHighlighted((h) => (h === id ? null : h)), 1800)
    },
    [state, dispatch]
  )

  /** Organiza el espacio visible y ofrece deshacerlo. */
  const arrangeActive = useCallback(() => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspace)
    if (!ws || settings.locked) return
    const previous = ws.layout
    dispatch({ type: 'layout', workspace: ws.id, layout: arrange(ws) })
    setUndoLayout({ workspace: ws.id, layout: previous })
    toast(`«${ws.name}» organizado`, 'success', {
      label: 'Deshacer',
      run: () => {
        dispatch({ type: 'layout', workspace: ws.id, layout: previous })
        setUndoLayout(null)
      }
    })
  }, [state, settings.locked, dispatch])

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
      } else if (mod && /^[1-9]$/.test(e.key)) {
        const ws = state.workspaces[Number(e.key) - 1]
        if (ws) {
          e.preventDefault()
          dispatch({ type: 'workspace', id: ws.id })
        }
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (!state.settings.locked) dispatch({ type: 'add', widgetType: 'notes' })
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        if (!state.settings.locked) setCatalogOpen(true)
      } else if (e.key === 'F1') {
        e.preventDefault()
        showWelcome()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, state.settings.locked, state.workspaces, paletteOpen, showWelcome])

  const context = useMemo<AppContextValue>(
    () => ({
      dispatch,
      settings,
      browsers,
      refreshBrowsers,
      openSettings: (section = 'general') => setSettingsSection(section),
      openCatalog: () => setCatalogOpen(true)
    }),
    [dispatch, settings, browsers, refreshBrowsers]
  )

  const editing = state.workspaces.findIndex((w) => w.id === editingWorkspace)
  const activeWs = state.workspaces.find((w) => w.id === state.activeWorkspace)

  return (
    <AppContext.Provider value={context}>
      <div
        className={`app ${interacting ? 'is-interacting' : ''} ${expanded ? 'has-expanded-widget' : ''} ${settings.locked ? 'is-locked' : 'is-editing'}`}
        style={{ '--ws-color': activeWs?.color } as CSSProperties}
      >
        <div className="wallpaper" aria-hidden />
        <Topbar
          state={state}
          onSearch={() => setPaletteOpen(true)}
          onCatalog={() => setCatalogOpen(true)}
          onEditWorkspace={setEditingWorkspace}
          onArrange={arrangeActive}
        />
        <main className="board-scroll">
          <div className="board">
            {welcomeOpen && <Welcome onClose={closeWelcome} />}
            {ready &&
              state.workspaces.map((ws) => (
                <WorkspaceGrid
                  key={ws.id}
                  workspace={ws}
                  workspaces={state.workspaces}
                  active={ws.id === state.activeWorkspace}
                  locked={settings.locked}
                  expanded={expanded}
                  highlighted={highlighted}
                  dispatch={dispatch}
                  onExpand={setExpanded}
                  onInteract={setInteracting}
                  onCatalog={() => setCatalogOpen(true)}
                />
              ))}
          </div>
        </main>
        {expanded && <div className="expand-scrim" onClick={() => setExpanded(null)} aria-hidden />}
      </div>

      {paletteOpen && (
        <CommandPalette
          state={state}
          onClose={() => setPaletteOpen(false)}
          onFocusWidget={focusWidget}
          onShowWelcome={showWelcome}
          onCatalog={() => setCatalogOpen(true)}
          onArrange={arrangeActive}
          onUndoArrange={
            undoLayout
              ? () => {
                  dispatch({ type: 'layout', workspace: undoLayout.workspace, layout: undoLayout.layout })
                  setUndoLayout(null)
                }
              : undefined
          }
        />
      )}
      {catalogOpen && (
        <CatalogDialog
          onClose={() => setCatalogOpen(false)}
          onAdded={() => {
            // El nuevo widget queda al final: se lleva la vista hasta él.
            requestAnimationFrame(() => {
              const items = document.querySelectorAll('.workspace.active .react-grid-item')
              items[items.length - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            })
          }}
        />
      )}
      {editing >= 0 && (
        <WorkspaceDialog
          workspace={state.workspaces[editing]}
          index={editing}
          total={state.workspaces.length}
          onClose={() => setEditingWorkspace(null)}
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
