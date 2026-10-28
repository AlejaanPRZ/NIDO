import { useMemo, useState, type CSSProperties } from 'react'
import { BrandLogo, hasBrand } from './BrandLogo'
import { CATALOG, CATEGORIES, MODE_LABEL, type CatalogCategory, type CatalogEntry } from './catalog'
import { useApp } from './context'
import { Icon } from './icons'
import { SIZE_LABEL, WIDGETS, type SizeName } from './registry'
import { Segmented } from './ui/controls'
import { toast } from './ui/feedback'
import { Modal } from './ui/Modal'
import { normalizeText } from './util'

type Filter = 'todo' | 'favoritos' | CatalogCategory

/** Biblioteca de widgets: buscar, filtrar por categoría, marcar favoritos y añadir con tamaño. */
export function CatalogDialog({ onClose, onAdded }: { onClose(): void; onAdded(entry: CatalogEntry): void }): JSX.Element {
  const { dispatch, settings, openSettings } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todo')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [sizes, setSizes] = useState<Record<string, SizeName>>({})
  const favorites = new Set(settings.favorites)

  const entries = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    return CATALOG.filter((e) => {
      if (filter === 'favoritos' && !favorites.has(e.id)) return false
      if (filter !== 'todo' && filter !== 'favoritos' && e.category !== filter) return false
      if (onlyAvailable && e.status !== 'disponible') return false
      const text = normalizeText(`${e.title} ${e.description} ${MODE_LABEL[e.mode]} ${e.category}`)
      return terms.every((t) => text.includes(t))
    }).sort((a, b) => Number(a.status !== 'disponible') - Number(b.status !== 'disponible'))
  }, [query, filter, onlyAvailable, settings.favorites])

  const toggleFavorite = (id: string): void =>
    dispatch({ type: 'settings', patch: { favorites: favorites.has(id) ? settings.favorites.filter((f) => f !== id) : [...settings.favorites, id] } })

  const add = (entry: CatalogEntry): void => {
    if (!entry.widget || entry.status !== 'disponible') return
    if (settings.locked) {
      toast('La distribución está bloqueada. Desbloquéala para añadir widgets.', 'info')
      return
    }
    dispatch({ type: 'add', widgetType: entry.widget, data: entry.data, title: entry.widgetTitle, size: sizes[entry.id] ?? 'm', catalogId: entry.id })
    onClose()
    onAdded(entry)
    if (entry.account) {
      toast(`${entry.title} necesita conectar tu cuenta.`, 'info', { label: 'Configurar', run: () => openSettings('conexiones') })
    }
  }

  const count = (f: Filter): number =>
    f === 'todo' ? CATALOG.length : f === 'favoritos' ? settings.favorites.length : CATALOG.filter((e) => e.category === f).length

  return (
    <Modal title="Añadir widget" size="xl" onClose={onClose} className="catalog">
      <div className="catalog-layout">
        <nav className="catalog-nav" aria-label="Categorías">
          {(
            [
              { id: 'todo', label: 'Todo', icon: 'grid' },
              { id: 'favoritos', label: 'Favoritos', icon: 'star' },
              ...CATEGORIES
            ] as { id: Filter; label: string; icon: Parameters<typeof Icon>[0]['name'] }[]
          ).map((c) => (
            <button key={c.id} className={filter === c.id ? 'active' : ''} onClick={() => setFilter(c.id)}>
              <Icon name={c.icon} size={14} />
              <span className="grow">{c.label}</span>
              <span className="nav-count">{count(c.id)}</span>
            </button>
          ))}
        </nav>
        <div className="catalog-main">
          <div className="catalog-top">
            <div className="search-field grow">
              <Icon name="search" size={14} />
              <input autoFocus placeholder="Buscar widgets, servicios o funciones…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar en el catálogo" />
            </div>
            <label className="check-row small-text">
              <input type="checkbox" className="switch" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
              Solo disponibles
            </label>
          </div>
          <div className="catalog-grid">
            {entries.length === 0 && <p className="muted">{filter === 'favoritos' ? 'Marca widgets con la estrella para tenerlos aquí.' : 'Nada coincide con la búsqueda.'}</p>}
            {entries.map((e) => {
              const available = e.status === 'disponible'
              const size = sizes[e.id] ?? 'm'
              const dims = e.widget ? WIDGETS[e.widget].sizes[size] : null
              return (
                <article key={e.id} className={`catalog-card ${available ? '' : 'soon'}`} style={{ '--tint': e.tint } as CSSProperties}>
                  <header className="card-head">
                    {hasBrand(e.brand) ? (
                      <BrandLogo brand={e.brand} name={e.title} size={38} decorative />
                    ) : (
                      <span className="card-icon">
                        <Icon name={e.icon} size={18} />
                      </span>
                    )}
                    <div className="grow">
                      <h3>{e.title}</h3>
                      <div className="badges">
                        <span className={`badge mode-${e.mode}`}>{MODE_LABEL[e.mode]}</span>
                        <span className="badge">{e.account ? 'Requiere cuenta' : 'Sin cuenta'}</span>
                        {!available && <span className="badge soon">Próximamente</span>}
                      </div>
                    </div>
                    <button
                      className={`icon-btn small ${favorites.has(e.id) ? 'fav' : ''}`}
                      aria-pressed={favorites.has(e.id)}
                      title={favorites.has(e.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                      onClick={() => toggleFavorite(e.id)}
                    >
                      <Icon name={favorites.has(e.id) ? 'starFill' : 'star'} size={14} />
                    </button>
                  </header>
                  <p className="card-desc">{e.description}</p>
                  {(e.setup || e.note) && (
                    <ul className="card-notes">
                      {e.setup && (
                        <li>
                          <Icon name="settings" size={11} /> {e.setup}
                        </li>
                      )}
                      {e.note && (
                        <li>
                          <Icon name="info" size={11} /> {e.note}
                        </li>
                      )}
                    </ul>
                  )}
                  <footer className="card-foot">
                    {available && dims ? (
                      <>
                        {/* Forma del tamaño sobre la cuadrícula de 12 columnas (sin datos inventados). */}
                        <span className="size-preview" title={`Ocupa ${dims.w} de 12 columnas y ${dims.h} filas`}>
                          <i style={{ width: `${(dims.w / 12) * 100}%`, height: `${Math.min(100, (dims.h / 14) * 100)}%` }} />
                          <span className="size-dims mono">
                            {dims.w}×{dims.h}
                          </span>
                        </span>
                        <Segmented
                          label="Tamaño"
                          className="compact sizes"
                          value={size}
                          options={(['s', 'm', 'l'] as SizeName[]).map((s) => ({ value: s, label: s.toUpperCase(), title: SIZE_LABEL[s] }))}
                          onChange={(s) => setSizes({ ...sizes, [e.id]: s })}
                        />
                        <span className="grow" />
                        <button className="btn small primary" onClick={() => add(e)}>
                          <Icon name="plus" size={13} /> Añadir
                        </button>
                      </>
                    ) : (
                      <span className="muted small-text">Aún no disponible: no se puede añadir.</span>
                    )}
                  </footer>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
