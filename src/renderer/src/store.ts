import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react'
import type { AppState, LayoutItem, Settings, Widget, WidgetDataMap, WidgetType } from '../../shared/types'
import { WIDGETS, WIDGET_TYPES } from './registry'
import { uid } from './util'

export const GRID_COLS = 12
const SAVE_DELAY_MS = 400

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'add'; widgetType: WidgetType }
  | { type: 'remove'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'patch'; id: string; patch: Partial<WidgetDataMap[WidgetType]> }
  | { type: 'layout'; layout: LayoutItem[] }
  | { type: 'settings'; patch: Partial<Settings> }

function makeWidget(type: WidgetType): Widget {
  return { id: uid(), type, title: WIDGETS[type].label, data: WIDGETS[type].createData() } as Widget
}

function bottomOf(layout: LayoutItem[]): number {
  return layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)
}

export function defaultState(): AppState {
  const notes = makeWidget('notes')
  const tasks = makeWidget('tasks')
  const calendar = makeWidget('calendar')
  const music = makeWidget('music')
  const web = makeWidget('web')
  if (notes.type === 'notes') {
    notes.data.text =
      'Bienvenido a Nido.\n\n· Arrastra un widget desde su cabecera.\n· Redimensiona desde la esquina inferior derecha.\n· Doble clic en el título para renombrar.\n\nTodo se guarda solo.'
  }
  return {
    version: 1,
    widgets: [notes, tasks, calendar, music, web],
    layout: [
      { i: notes.id, x: 0, y: 0, w: 4, h: 8 },
      { i: tasks.id, x: 4, y: 0, w: 4, h: 8 },
      { i: calendar.id, x: 8, y: 0, w: 4, h: 10 },
      { i: music.id, x: 0, y: 8, w: 4, h: 8 },
      { i: web.id, x: 4, y: 8, w: 4, h: 12 }
    ],
    settings: { theme: 'system', locked: false }
  }
}

/** Repara un estado cargado: descarta widgets desconocidos y alinea layout ↔ widgets. */
function sanitize(state: AppState): AppState {
  const fallback = defaultState()
  const widgets = (state.widgets ?? []).filter((w) => WIDGET_TYPES.includes(w.type))
  const ids = new Set(widgets.map((w) => w.id))
  const layout = (state.layout ?? []).filter((l) => ids.has(l.i))
  for (const w of widgets) {
    if (!layout.some((l) => l.i === w.id)) {
      const { w: width, h } = WIDGETS[w.type].size
      layout.push({ i: w.id, x: 0, y: bottomOf(layout), w: width, h })
    }
  }
  return { version: 1, widgets, layout, settings: { ...fallback.settings, ...state.settings } }
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
      return sanitize(action.state)
    case 'add': {
      const widget = makeWidget(action.widgetType)
      const { w, h } = WIDGETS[action.widgetType].size
      return {
        ...state,
        widgets: [...state.widgets, widget],
        layout: [...state.layout, { i: widget.id, x: 0, y: bottomOf(state.layout), w, h }]
      }
    }
    case 'remove':
      return {
        ...state,
        widgets: state.widgets.filter((w) => w.id !== action.id),
        layout: state.layout.filter((l) => l.i !== action.id)
      }
    case 'rename':
      return {
        ...state,
        widgets: state.widgets.map((w) => (w.id === action.id ? { ...w, title: action.title } : w))
      }
    case 'patch':
      return {
        ...state,
        widgets: state.widgets.map((w) =>
          w.id === action.id ? ({ ...w, data: { ...w.data, ...action.patch } } as Widget) : w
        )
      }
    case 'layout': {
      const layout = action.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
      return sameLayout(state.layout, layout) ? state : { ...state, layout }
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
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
        if (!cancelled && saved) dispatch({ type: 'hydrate', state: saved })
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
