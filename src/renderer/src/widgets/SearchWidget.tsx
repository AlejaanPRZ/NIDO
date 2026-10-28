import { useState } from 'react'
import { browserLabel, useApp } from '../context'
import { Icon } from '../icons'
import { toast } from '../ui/feedback'
import type { WidgetProps } from './types'

export const ENGINES: Record<string, { label: string; url: (q: string) => string }> = {
  duckduckgo: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${q}` },
  google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${q}` },
  bing: { label: 'Bing', url: (q) => `https://www.bing.com/search?q=${q}` },
  brave: { label: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${q}` },
  ecosia: { label: 'Ecosia', url: (q) => `https://www.ecosia.org/search?q=${q}` },
  wikipedia: { label: 'Wikipedia', url: (q) => `https://es.wikipedia.org/w/index.php?search=${q}` },
  youtube: { label: 'YouTube', url: (q) => `https://www.youtube.com/results?search_query=${q}` },
  rae: { label: 'Diccionario RAE', url: (q) => `https://dle.rae.es/${q}` }
}

/** Busca en la web y abre los resultados en el navegador elegido (fuera de Nido). */
export function SearchWidget({ widget, update }: WidgetProps<'search'>): JSX.Element {
  const { browsers, settings } = useApp()
  const [query, setQuery] = useState('')
  const engine = ENGINES[widget.data.engine] ?? ENGINES.duckduckgo
  const browserId = widget.data.browserId ?? settings.defaultBrowser

  const search = (): void => {
    const q = query.trim()
    if (!q) return
    void window.nido.browsers.open(browserId, [engine.url(encodeURIComponent(q))]).then((r) => {
      if (r.ok) setQuery('')
      else toast(r.error, 'error')
    })
  }

  return (
    <form
      className="search-widget"
      onSubmit={(e) => {
        e.preventDefault()
        search()
      }}
    >
      <select
        className="chip-select"
        aria-label="Motor de búsqueda"
        value={widget.data.engine}
        onChange={(e) => update({ engine: e.target.value })}
        title={`Se abre en ${browserLabel(browserId, browsers)}`}
      >
        {Object.entries(ENGINES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      <input className="input grow" placeholder={`Buscar en ${engine.label}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar" />
      <button className="btn primary small" type="submit" disabled={!query.trim()} title={`Buscar (se abre en ${browserLabel(browserId, browsers)})`}>
        <Icon name="arrowUpRight" size={14} />
      </button>
    </form>
  )
}
