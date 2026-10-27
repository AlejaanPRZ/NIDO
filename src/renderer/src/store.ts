import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react'
import type { AppState, LayoutItem, Settings, Widget, WidgetDataMap, WidgetType, Workspace } from '../../shared/types'
import { COLLAPSED_H, WIDGETS, WIDGET_TYPES } from './registry'
import { uid } from './util'

export const GRID_COLS = 12
const SAVE_DELAY_MS = 400

export const WORKSPACES: { id: string; name: string; icon: 'briefcase' | 'home' | 'book' }[] = [
  { id: 'trabajo', name: 'Trabajo', icon: 'briefcase' },
  { id: 'personal', name: 'Personal', icon: 'home' },
  { id: 'estudio', name: 'Estudio', icon: 'book' }
]

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'add'; widgetType: WidgetType }
  | { type: 'remove'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'patch'; id: string; patch: Partial<WidgetDataMap[WidgetType]> }
  | { type: 'layout'; workspace: string; layout: LayoutItem[] }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'workspace'; id: string }
  | { type: 'duplicate'; id: string }
  | { type: 'collapse'; id: string; collapsed: boolean }
  | { type: 'move'; id: string; workspace: string }

function makeWidget(type: WidgetType): Widget {
  return { id: uid(), type, title: WIDGETS[type].label, data: WIDGETS[type].createData() } as Widget
}

const bottomOf = (layout: LayoutItem[]): number => layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)

/** Coloca widgets en columnas de 4 de ancho, rellenando por la columna más baja. */
function autoLayout(widgets: Widget[]): LayoutItem[] {
  const heights = [0, 0, 0]
  return widgets.map((w) => {
    const col = heights.indexOf(Math.min(...heights))
    const { h } = WIDGETS[w.type].size
    const item = { i: w.id, x: col * 4, y: heights[col], w: 4, h }
    heights[col] += h
    return item
  })
}

export function defaultSettings(): Settings {
  const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  return {
    theme: 'system',
    locked: false,
    reduceTransparency: false,
    reduceMotion: false,
    clock: { hour12, showSeconds: false },
    welcomeSeen: false,
    defaultBrowser: 'system'
  }
}

export function defaultState(): AppState {
  const content: Record<string, WidgetType[]> = {
    trabajo: ['tasks', 'calendar', 'notes'],
    personal: ['notes', 'tasks', 'music', 'calendar', 'links'],
    estudio: ['notes', 'tasks', 'web']
  }
  return {
    version: 2,
    workspaces: WORKSPACES.map(({ id, name }) => {
      const widgets = content[id].map(makeWidget)
      return { id, name, widgets, layout: autoLayout(widgets) }
    }),
    activeWorkspace: 'personal',
    settings: defaultSettings()
  }
}

function sanitizeWorkspace(ws: Partial<Workspace> & { id: string; name: string }): Workspace {
  const widgets = (Array.isArray(ws.widgets) ? ws.widgets : [])
    .filter((w) => w && WIDGET_TYPES.includes(w.type))
    // Campos nuevos con su valor por defecto; los datos guardados mandan.
    .map((w) => ({ ...w, data: { ...WIDGETS[w.type].createData(), ...w.data } }) as Widget)
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const layout = (Array.isArray(ws.layout) ? ws.layout : [])
    .filter((l) => l && byId.has(l.i))
    .map(({ i, x, y, w, h }) => {
      // Se respetan los mínimos actuales (pueden haber crecido desde que se guardó).
      const widget = byId.get(i)!
      const min = WIDGETS[widget.type].size
      const height = widget.collapsed ? COLLAPSED_H : Math.max(Number(h) || min.h, min.minH)
      return { i, x: Number(x) || 0, y: Number(y) || 0, w: Math.max(Number(w) || min.w, min.minW), h: height }
    })
  for (const w of widgets) {
    if (!layout.some((l) => l.i === w.id)) {
      const { w: width, h } = WIDGETS[w.type].size
      layout.push({ i: w.id, x: 0, y: bottomOf(layout), w: width, h })
    }
  }
  return { id: ws.id, name: ws.name, widgets, layout }
}

function sanitize(raw: any): AppState {
  const defaults = defaultSettings()
  const saved = Array.isArray(raw.workspaces) ? raw.workspaces : []
  const workspaces = WORKSPACES.map(({ id, name }) => {
    const found = saved.find((w: any) => w?.id === id)
    return sanitizeWorkspace(found ? { ...found, id, name: found.name || name } : { id, name })
  })
  const settings: Settings = {
    ...defaults,
    ...raw.settings,
    clock: { ...defaults.clock, ...raw.settings?.clock }
  }
  const active = workspaces.some((w) => w.id === raw.activeWorkspace) ? raw.activeWorkspace : 'personal'
  return { version: 2, workspaces, activeWorkspace: active, settings }
}

/**
 * Convierte cualquier estado guardado (v1 o v2) al formato actual.
 * v1 tenía un solo panel: pasa entero al espacio «Personal».
 */
export function migrate(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  if (r.version === 2) return sanitize(r)
  if (r.version === 1) {
    return sanitize({
      workspaces: [{ id: 'personal', name: 'Personal', widgets: r.widgets, layout: r.layout }],
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
      const widget = makeWidget(action.widgetType)
      const { w, h } = WIDGETS[action.widgetType].size
      return updateWorkspace(state, state.activeWorkspace, (ws) => ({
        ...ws,
        widgets: [...ws.widgets, widget],
        layout: [...ws.layout, { i: widget.id, x: 0, y: bottomOf(ws.layout), w, h }]
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
      const copy = { ...structuredClone(found.widget), id: uid(), title: `${found.widget.title} (copia)` }
      const source = found.workspace.layout.find((l) => l.i === action.id)
      const item = source
        ? { ...source, i: copy.id, y: source.y + source.h }
        : { i: copy.id, x: 0, y: bottomOf(found.workspace.layout), ...WIDGETS[copy.type].size }
      return updateWorkspace(state, found.workspace.id, (ws) => ({
        ...ws,
        widgets: [...ws.widgets, copy],
        layout: [...ws.layout, { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h }]
      }))
    }
    case 'collapse': {
      const found = findWidget(state, action.id)
      if (!found || !!found.widget.collapsed === action.collapsed) return state
      const current = found.workspace.layout.find((l) => l.i === action.id)
      return updateWorkspace(state, found.workspace.id, (ws) => ({
        ...ws,
        widgets: ws.widgets.map((w) =>
          w.id === action.id ? { ...w, collapsed: action.collapsed, restoreH: action.collapsed ? current?.h : undefined } : w
        ),
        layout: ws.layout.map((l) =>
          l.i === action.id
            ? { ...l, h: action.collapsed ? COLLAPSED_H : (found.widget.restoreH ?? WIDGETS[found.widget.type].size.h) }
            : l
        )
      }))
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
      return updateWorkspace(removed, action.workspace, (ws) => ({
        ...ws,
        widgets: [...ws.widgets, found.widget],
        layout: [...ws.layout, { i: action.id, x: 0, y: bottomOf(ws.layout), w: item?.w ?? 4, h: item?.h ?? 8 }]
      }))
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
