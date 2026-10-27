import { createContext, useCallback, useContext, useEffect, useState, type Dispatch } from 'react'
import type { BrowserInfo, Settings } from '../../shared/types'
import type { Action } from './store'

export type SettingsSection = 'general' | 'conexiones' | 'navegadores' | 'datos' | 'atajos' | 'ayuda'

export interface AppContextValue {
  dispatch: Dispatch<Action>
  settings: Settings
  browsers: BrowserInfo[]
  refreshBrowsers(): void
  openSettings(section?: SettingsSection): void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp fuera de AppContext')
  return ctx
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
