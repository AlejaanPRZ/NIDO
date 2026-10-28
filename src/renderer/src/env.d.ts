import type { NidoApi } from '../../shared/types'

declare global {
  /** import.meta.glob de Vite (solo la forma que usa BrandLogo). */
  interface ImportMeta {
    glob<T>(pattern: string, options: { eager: true; query: string; import: string }): Record<string, T>
  }

  interface Window {
    nido: NidoApi
  }

  /** Subconjunto de Electron.WebviewTag que usa el panel web. */
  interface WebviewElement extends HTMLElement {
    src: string
    loadURL(url: string): Promise<void>
    getURL(): string
    canGoBack(): boolean
    canGoForward(): boolean
    goBack(): void
    goForward(): void
    reload(): void
    stop(): void
    /** Si la página está reproduciendo sonido (música, vídeo, llamada) */
    isCurrentlyAudible(): boolean
  }
}

export {}
