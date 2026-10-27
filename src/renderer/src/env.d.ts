import type { NidoApi } from '../../shared/types'

declare global {
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
  }
}

export {}
