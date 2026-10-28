import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch } from 'react'
import type { BrowserInfo, Settings } from '../../shared/types'
import type { Action } from './store'

export type SettingsSection = 'general' | 'conexiones' | 'navegadores' | 'datos' | 'atajos' | 'ayuda'

export interface AppContextValue {
  dispatch: Dispatch<Action>
  settings: Settings
  browsers: BrowserInfo[]
  refreshBrowsers(): void
  openSettings(section?: SettingsSection): void
  openCatalog(): void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp fuera de AppContext')
  return ctx
}

// ---------- Actividad: pausar lo que no se ve ----------

/** true si el espacio del widget es el visible. Lo provee cada cuadrícula. */
export const WorkspaceActiveContext = createContext(true)

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * ¿Debe el widget refrescar datos ahora? No, si su espacio está oculto o la
 * ventana minimizada. (El audio y los temporizadores no dependen de esto.)
 */
export function useActive(): boolean {
  const workspaceActive = useContext(WorkspaceActiveContext)
  const visible = useDocumentVisible()
  return workspaceActive && visible
}

/**
 * setInterval que solo corre mientras `enabled`. Ejecuta `fn` al empezar, al
 * reanudarse y cada vez que cambia `resetKey` (p. ej. al cambiar de ciudad o de feeds).
 */
export function useInterval(fn: () => void, ms: number, enabled = true, resetKey?: string, immediate = true): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!enabled) return
    if (immediate) ref.current()
    const timer = setInterval(() => ref.current(), ms)
    return () => clearInterval(timer)
  }, [ms, enabled, resetKey, immediate])
}

/** Hora actual que se actualiza cada `ms` (solo mientras se ve). */
export function useNow(ms = 1000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date())
  useInterval(() => setNow(new Date()), ms, enabled)
  return now
}

export function useBrowsers(): { browsers: BrowserInfo[]; refresh(): void } {
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([])
  const refresh = useCallback(() => {
    window.nido.browsers.list().then((r) => r.ok && setBrowsers(r.data))
  }, [])
  useEffect(refresh, [refresh])
  return { browsers, refresh }
}

/** Nombre que se muestra para un id de navegador ('system' incluido). */
export function browserLabel(id: string, browsers: BrowserInfo[]): string {
  if (id === 'system') return 'Navegador predeterminado del sistema'
  return browsers.find((b) => b.id === id)?.name ?? 'Navegador no disponible'
}

// ---------- Elementos que los widgets publican para el buscador ----------

export interface SearchEntry {
  label: string
  detail?: string
}

const searchItems = new Map<string, SearchEntry[]>()

/** Un widget publica lo que tiene (p. ej. tareas de Notion) para que el buscador lo encuentre. */
export function publishSearchItems(widgetId: string, items: SearchEntry[] | null): void {
  if (items) searchItems.set(widgetId, items)
  else searchItems.delete(widgetId)
}

export const getSearchItems = (widgetId: string): SearchEntry[] => searchItems.get(widgetId) ?? []
