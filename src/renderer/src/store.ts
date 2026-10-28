import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react'
import type { AppState, LayoutItem, Settings, Widget, WidgetDataMap, WidgetType, Workspace } from '../../shared/types'
import { resolveOverlaps, settle } from './layoutEngine'
import { COLLAPSED_H, WIDGETS, WIDGET_TYPES, type SizeName } from './registry'
import { uid } from './util'

export const GRID_COLS = 12
const SAVE_DELAY_MS = 400

/** Espacios iniciales; el usuario puede crear, renombrar, reordenar y borrar. */
const DEFAULT_WORKSPACES = [
  { id: 'trabajo', name: 'Trabajo', icon: 'briefcase', color: '#0a84ff' },
  { id: 'personal', name: 'Personal', icon: 'home', color: '#30d158' },
  { id: 'estudio', name: 'Estudio', icon: 'book', color: '#bf5af2' }
]

export const WORKSPACE_ICONS = ['briefcase', 'home', 'book', 'grid', 'sparkle', 'code', 'music', 'calendar', 'flame', 'star', 'globeClock', 'image'] as const
export const WORKSPACE_COLORS = ['#0a84ff', '#30d158', '#bf5af2', '#ff9f0a', '#ff375f', '#5e5ce6', '#40c8e0', '#8e8e93']

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'add'; widgetType: WidgetType; data?: Partial<WidgetDataMap[WidgetType]>; title?: string; size?: SizeName; catalogId?: string }
  | { type: 'remove'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'patch'; id: string; patch: Partial<WidgetDataMap[WidgetType]> }
  | { type: 'layout'; workspace: string; layout: LayoutItem[] }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'workspace'; id: string }
  | { type: 'duplicate'; id: string }
  | { type: 'collapse'; id: string; collapsed: boolean }
  | { type: 'move'; id: string; workspace: string }
  | { type: 'resize'; id: string; w: number; h: number }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'addWorkspace' }
  | { type: 'updateWorkspace'; id: string; patch: Partial<Pick<Workspace, 'name' | 'icon' | 'color'>> }
  | { type: 'moveWorkspace'; id: string; dir: -1 | 1 }
  | { type: 'removeWorkspace'; id: string }

function makeWidget(type: WidgetType, data?: Partial<WidgetDataMap[WidgetType]>, title?: string, catalogId?: string): Widget {
  return {
    id: uid(),
    type,
    title: title ?? WIDGETS[type].label,
    data: { ...WIDGETS[type].createData(), ...data },
    ...(catalogId ? { catalogId } : {})
  } as Widget
}

const bottomOf = (layout: LayoutItem[]): number => layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)

/** Primer hueco libre (de arriba abajo, de izquierda a derecha) donde cabe un widget de w×h. */
function firstFit(layout: LayoutItem[], w: number, h: number): { x: number; y: number } {
  const width = Math.min(w, GRID_COLS)
  const overlaps = (x: number, y: number): boolean =>
    layout.some((l) => x < l.x + l.w && x + width > l.x && y < l.y + l.h && y + h > l.y)
  for (let y = 0; ; y++) {
    for (let x = 0; x <= GRID_COLS - width; x++) if (!overlaps(x, y)) return { x, y }
  }
}

/**
 * Coloca los widgets sin huecos ni solapes: recorre en orden de lectura y pone
 * cada uno en la primera posición libre (de arriba abajo, de izquierda a derecha).
 * Los fijados se quedan donde están y los demás los rodean.
 */
export function arrange(ws: Workspace): LayoutItem[] {
  const pinned = new Set(ws.widgets.filter((w) => w.pinned).map((w) => w.id))
  const rows: boolean[][] = []
  const occupied = (x: number, y: number): boolean => !!rows[y]?.[x]
  const fill = (l: LayoutItem): void => {
    for (let y = l.y; y < l.y + l.h; y++) {
      rows[y] ??= []
      for (let x = l.x; x < l.x + l.w; x++) rows[y][x] = true
    }
  }
  const fits = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (occupied(xx, yy)) return false
    return true
  }
  const result = new Map<string, LayoutItem>()
  for (const l of ws.layout) if (pinned.has(l.i)) {
    fill(l)
    result.set(l.i, l)
  }
  const free = ws.layout.filter((l) => !pinned.has(l.i)).sort((a, b) => a.y - b.y || a.x - b.x)
  for (const l of free) {
    const w = Math.min(l.w, GRID_COLS)
    let placed: LayoutItem | null = null
    for (let y = 0; !placed; y++) {
      for (let x = 0; x <= GRID_COLS - w; x++) {
        if (fits(x, y, w, l.h)) {
          placed = { ...l, x, y, w }
          break
        }
      }
    }
    fill(placed)
    result.set(l.i, placed)
  }
  return ws.layout.map((l) => result.get(l.i) ?? l)
}

export function defaultSettings(): Settings {
  const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  return {
    theme: 'system',
    locked: false,
    reduceTransparency: false,
    glass: 60,
    reduceMotion: false,
    clock: { hour12, showSeconds: false, date: 'long' },
    welcomeSeen: false,
    defaultBrowser: 'system',
    favorites: []
  }
}

const sizeOf = (type: WidgetType, size: SizeName): { w: number; h: number } => WIDGETS[type].sizes[size]

export function defaultState(): AppState {
  // Primer escritorio equilibrado: tres columnas de 4 que acaban a la misma altura, sin huecos.
  type Slot = [WidgetType, x: number, y: number, w: number, h: number, data?: Partial<WidgetDataMap[WidgetType]>]
  const content: Record<string, Slot[]> = {
    trabajo: [
      ['calendar', 0, 0, 4, 12, { view: 'agenda' }],
      ['tasks', 4, 0, 4, 12],
      ['pomodoro', 8, 0, 4, 6],
      ['notes', 8, 6, 4, 6]
    ],
    personal: [
      ['calendar', 0, 0, 4, 11],
      ['weather', 0, 11, 4, 5],
      ['tasks', 4, 0, 4, 9],
      ['notes', 4, 9, 4, 7],
      ['music', 8, 0, 4, 9],
      ['links', 8, 9, 4, 7]
    ],
    estudio: [
      ['pomodoro', 0, 0, 4, 6],
      ['timer', 0, 6, 4, 6],
      ['notes', 4, 0, 4, 12],
      ['tasks', 8, 0, 4, 12]
    ]
  }
  return {
    version: 3,
    workspaces: DEFAULT_WORKSPACES.map((ws) => {
      const slots = content[ws.id].map(([type, x, y, w, h, data]) => ({ widget: makeWidget(type, data), x, y, w, h }))
      return { ...ws, widgets: slots.map((s) => s.widget), layout: slots.map(({ widget, x, y, w, h }) => ({ i: widget.id, x, y, w, h })) }
    }),
    activeWorkspace: 'personal',
    settings: defaultSettings()
  }
}

function sanitizeWorkspace(ws: any, index: number): Workspace {
  const fallback = DEFAULT_WORKSPACES.find((d) => d.id === ws.id) ?? DEFAULT_WORKSPACES[index % 3]
  const widgets = (Array.isArray(ws.widgets) ? ws.widgets : [])
    .filter((w: any) => w && WIDGET_TYPES.includes(w.type))
    // Campos nuevos con su valor por defecto; los datos guardados mandan.
    .map((w: any) => ({ ...w, data: { ...WIDGETS[w.type as WidgetType].createData(), ...w.data } }) as Widget)
  const byId = new Map<string, Widget>(widgets.map((w: Widget) => [w.id, w]))
  const layout: LayoutItem[] = (Array.isArray(ws.layout) ? ws.layout : [])
    .filter((l: any) => l && byId.has(l.i))
    .map(({ i, x, y, w, h }: LayoutItem) => {
      // Se respetan los mínimos actuales (pueden haber crecido desde que se guardó).
      const widget = byId.get(i)!
      const min = WIDGETS[widget.type].size
      const height = widget.collapsed ? COLLAPSED_H : Math.max(Number(h) || min.h, min.minH)
      return { i, x: Number(x) || 0, y: Number(y) || 0, w: Math.min(GRID_COLS, Math.max(Number(w) || min.w, min.minW)), h: height }
    })
  for (const w of widgets) {
    if (!layout.some((l) => l.i === w.id)) layout.push({ i: w.id, x: 0, y: bottomOf(layout), ...sizeOf(w.type, 'm') })
  }
  // Con la lógica actual la cuadrícula no recoloca nada sola: los solapes heredados se corrigen al cargar.
  const statics = new Set<string>(widgets.filter((w: Widget) => w.pinned).map((w: Widget) => w.id))
  return {
    id: String(ws.id || uid()),
    name: String(ws.name || fallback.name),
    icon: String(ws.icon || fallback.icon),
    color: String(ws.color || fallback.color),
    widgets,
    layout: resolveOverlaps(layout, statics, GRID_COLS)
  }
}

/** Tras cambiar el tamaño o añadir un widget: los que pisa se recolocan cerca (sin solapes). */
function settleIn(ws: Workspace, id: string): Workspace {
  const statics = new Set(ws.widgets.filter((w) => w.pinned && w.id !== id).map((w) => w.id))
  return { ...ws, layout: settle(ws.layout, id, statics, GRID_COLS) }
}

function sanitize(raw: any): AppState {
  const defaults = defaultSettings()
  const saved = Array.isArray(raw.workspaces) && raw.workspaces.length ? raw.workspaces : DEFAULT_WORKSPACES
  const workspaces = saved.map(sanitizeWorkspace)
  const settings: Settings = {
    ...defaults,
    ...raw.settings,
    clock: { ...defaults.clock, ...raw.settings?.clock },
    favorites: Array.isArray(raw.settings?.favorites) ? raw.settings.favorites : [],
    glass: Number.isFinite(raw.settings?.glass) ? Math.min(100, Math.max(0, Math.round(raw.settings.glass))) : defaults.glass
  }
  const active = workspaces.some((w: Workspace) => w.id === raw.activeWorkspace) ? raw.activeWorkspace : workspaces[0].id
  return { version: 3, workspaces, activeWorkspace: active, settings }
}

/**
 * Convierte cualquier estado guardado (v1, v2 o v3) al formato actual.
 * v1 tenía un solo panel: pasa entero al espacio «Personal».
 * v2 tenía tres espacios fijos sin icono ni color: se les asignan los de siempre.
 */
export function migrate(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  if (r.version === 2 || r.version === 3) return sanitize(r)
  if (r.version === 1) {
    return sanitize({
      workspaces: DEFAULT_WORKSPACES.map((w) => (w.id === 'personal' ? { ...w, widgets: r.widgets, layout: r.layout } : { ...w, widgets: [], layout: [] })),
      activeWorkspace: 'personal',
      settings: { theme: r.settings?.theme, locked: !!r.settings?.locked }
    })
  }
  return null
}

export function findWidget(state: AppState, id: string): { workspace: Workspace; widget: Widget } | null {
  for (const workspace of state.workspaces) {
    const widget = workspace.widgets.find((w) => w.id === id)
    if (widget) return { workspace, widget }
  }
  return null
}

function updateWorkspace(state: AppState, wsId: string, fn: (ws: Workspace) => Workspace): AppState {
  return { ...state, workspaces: state.workspaces.map((ws) => (ws.id === wsId ? fn(ws) : ws)) }
}

function updateWidget(state: AppState, id: string, fn: (w: Widget) => Widget): AppState {
  const found = findWidget(state, id)
  if (!found) return state
  return updateWorkspace(state, found.workspace.id, (ws) => ({
    ...ws,
    widgets: ws.widgets.map((w) => (w.id === id ? fn(w) : w))
  }))
}

function updateLayoutItem(state: AppState, id: string, fn: (l: LayoutItem) => LayoutItem): AppState {
  const found = findWidget(state, id)
  if (!found) return state
  return updateWorkspace(state, found.workspace.id, (ws) => ({ ...ws, layout: ws.layout.map((l) => (l.i === id ? fn(l) : l)) }))
}

function sameLayout(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(a.map((l) => [l.i, l]))
  return b.every((l) => {
    const o = byId.get(l.i)
    return o && o.x === l.x && o.y === l.y && o.w === l.w && o.h === l.h
  })
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'add': {
      const widget = makeWidget(action.widgetType, action.data, action.title, action.catalogId)
      const { w, h } = sizeOf(action.widgetType, action.size ?? 'm')
      return updateWorkspace(state, state.activeWorkspace, (ws) => ({
        ...ws,
        widgets: [...ws.widgets, widget],
        layout: [...ws.layout, { i: widget.id, ...firstFit(ws.layout, w, h), w, h }]
      }))
    }
    case 'remove': {
      const found = findWidget(state, action.id)
      if (!found) return state
      return updateWorkspace(state, found.workspace.id, (ws) => ({
        ...ws,
        widgets: ws.widgets.filter((w) => w.id !== action.id),
        layout: ws.layout.filter((l) => l.i !== action.id)
      }))
    }
    case 'rename':
      return updateWidget(state, action.id, (w) => ({ ...w, title: action.title }))
    case 'patch':
      return updateWidget(state, action.id, (w) => ({ ...w, data: { ...w.data, ...action.patch } }) as Widget)
    case 'layout': {
      const layout = action.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
      const ws = state.workspaces.find((w) => w.id === action.workspace)
      if (!ws || sameLayout(ws.layout, layout)) return state
      return updateWorkspace(state, action.workspace, (w) => ({ ...w, layout }))
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'workspace':
      return state.workspaces.some((w) => w.id === action.id) ? { ...state, activeWorkspace: action.id } : state
    case 'duplicate': {
      const found = findWidget(state, action.id)
      if (!found) return state
      const copy = { ...structuredClone(found.widget), id: uid(), title: `${found.widget.title} (copia)`, pinned: false }
      const source = found.workspace.layout.find((l) => l.i === action.id)
      const item = source ? { ...source, i: copy.id, y: source.y + source.h } : { i: copy.id, x: 0, y: bottomOf(found.workspace.layout), ...sizeOf(copy.type, 'm') }
      return updateWorkspace(state, found.workspace.id, (ws) =>
        settleIn({ ...ws, widgets: [...ws.widgets, copy], layout: [...ws.layout, { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h }] }, copy.id)
      )
    }
    case 'collapse': {
      const found = findWidget(state, action.id)
      if (!found || !!found.widget.collapsed === action.collapsed) return state
      const current = found.workspace.layout.find((l) => l.i === action.id)
      return updateWorkspace(state, found.workspace.id, (ws) =>
        settleIn(
          {
            ...ws,
            widgets: ws.widgets.map((w) =>
              w.id === action.id ? { ...w, collapsed: action.collapsed, restoreH: action.collapsed ? current?.h : undefined } : w
            ),
            layout: ws.layout.map((l) =>
              l.i === action.id
                ? { ...l, h: action.collapsed ? COLLAPSED_H : (found.widget.restoreH ?? WIDGETS[found.widget.type].size.h) }
                : l
            )
          },
          action.id
        )
      )
    }
    case 'move': {
      const found = findWidget(state, action.id)
      if (!found || found.workspace.id === action.workspace) return state
      const item = found.workspace.layout.find((l) => l.i === action.id)
      const removed = updateWorkspace(state, found.workspace.id, (ws) => ({
        ...ws,
        widgets: ws.widgets.filter((w) => w.id !== action.id),
        layout: ws.layout.filter((l) => l.i !== action.id)
      }))
      const w = item?.w ?? 4
      const h = item?.h ?? 8
      return updateWorkspace(removed, action.workspace, (ws) => ({
        ...ws,
        widgets: [...ws.widgets, { ...found.widget, pinned: false }],
        layout: [...ws.layout, { i: action.id, ...firstFit(ws.layout, w, h), w, h }]
      }))
    }
    case 'resize': {
      const found = findWidget(state, action.id)
      if (!found) return state
      const min = WIDGETS[found.widget.type].size
      const collapsedOff = updateWidget(state, action.id, (w) => ({ ...w, collapsed: false, restoreH: undefined }))
      const resized = updateLayoutItem(collapsedOff, action.id, (l) => ({
        ...l,
        w: Math.min(GRID_COLS, Math.max(min.minW, action.w)),
        h: Math.max(min.minH, action.h),
        x: Math.min(l.x, GRID_COLS - Math.min(GRID_COLS, Math.max(min.minW, action.w)))
      }))
      return updateWorkspace(resized, found.workspace.id, (ws) => settleIn(ws, action.id))
    }
    case 'pin':
      return updateWidget(state, action.id, (w) => ({ ...w, pinned: action.pinned }))
    case 'addWorkspace': {
      const used = new Set(state.workspaces.map((w) => w.color))
      const ws: Workspace = {
        id: uid(),
        name: `Espacio ${state.workspaces.length + 1}`,
        icon: 'grid',
        color: WORKSPACE_COLORS.find((c) => !used.has(c)) ?? WORKSPACE_COLORS[0],
        widgets: [],
        layout: []
      }
      return { ...state, workspaces: [...state.workspaces, ws], activeWorkspace: ws.id }
    }
    case 'updateWorkspace':
      return updateWorkspace(state, action.id, (ws) => ({ ...ws, ...action.patch, name: (action.patch.name ?? ws.name).trim() || ws.name }))
    case 'moveWorkspace': {
      const list = [...state.workspaces]
      const i = list.findIndex((w) => w.id === action.id)
      const j = i + action.dir
      if (i < 0 || j < 0 || j >= list.length) return state
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...state, workspaces: list }
    }
    case 'removeWorkspace': {
      if (state.workspaces.length <= 1) return state
      const i = state.workspaces.findIndex((w) => w.id === action.id)
      const workspaces = state.workspaces.filter((w) => w.id !== action.id)
      const active = state.activeWorkspace === action.id ? workspaces[Math.max(0, i - 1)].id : state.activeWorkspace
      return { ...state, workspaces, activeWorkspace: active }
    }
  }
}

/** Estado global con carga inicial desde disco y guardado automático. */
export function useNidoStore(): { state: AppState; dispatch: Dispatch<Action>; ready: boolean } {
  const [state, dispatch] = useReducer(reducer, undefined, defaultState)
  const [ready, setReady] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    window.nido
      .loadState()
      .then((saved) => {
        const migrated = migrate(saved)
        if (!cancelled && migrated) dispatch({ type: 'hydrate', state: migrated })
      })
      .catch((err) => console.error('[nido] no se pudo cargar el estado', err))
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => window.nido.saveState(state), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state, ready])

  useEffect(() => {
    if (!ready) return
    const flush = (): void => window.nido.saveStateSync(stateRef.current)
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [ready])

  return { state, dispatch, ready }
}
