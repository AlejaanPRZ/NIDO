import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppState } from '../../shared/types'
import { getSearchItems, useApp } from './context'
import { Icon, type IconName } from './icons'
import { WIDGETS, WIDGET_TYPES } from './registry'
import { WORKSPACES } from './store'
import { toast } from './ui/feedback'
import { useEscape } from './ui/Modal'
import { hostOf, normalizeText } from './util'

interface Item {
  id: string
  group: string
  icon: IconName
  label: string
  detail?: string
  run(): void
}

const MAX_RESULTS = 40

/** Buscador de widgets, tareas, eventos, accesos y acciones. */
export function CommandPalette({
  state,
  onClose,
  onFocusWidget,
  onShowWelcome
}: {
  state: AppState
  onClose(): void
  onFocusWidget(id: string): void
  onShowWelcome(): void
}): JSX.Element {
  const { dispatch, openSettings, settings } = useApp()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEscape(onClose)

  const items = useMemo<Item[]>(() => {
    const all: Item[] = []
    for (const ws of state.workspaces) {
      for (const w of ws.widgets) {
        all.push({
          id: `w:${w.id}`,
          group: 'Widgets',
          icon: WIDGETS[w.type].icon,
          label: w.title,
          detail: `${WIDGETS[w.type].label} · ${ws.name}`,
          run: () => onFocusWidget(w.id)
        })
        if (w.type === 'tasks') {
          for (const t of w.data.tasks) {
            all.push({ id: `t:${t.id}`, group: 'Tareas', icon: t.done ? 'check' : 'tasks', label: t.text, detail: `${w.title} · ${ws.name}`, run: () => onFocusWidget(w.id) })
          }
        }
        if (w.type === 'links') {
          for (const g of w.data.groups) {
            for (const l of g.links) {
              all.push({
                id: `l:${l.id}`,
                group: 'Accesos',
                icon: 'link',
                label: l.title,
                detail: `${hostOf(l.url)} · ${g.name}`,
                run: () => {
                  void window.nido.browsers
                    .open(w.data.browserId ?? settings.defaultBrowser, [l.url])
                    .then((r) => !r.ok && toast(r.error, 'error'))
                }
              })
            }
          }
        }
        if (w.type === 'notes' && w.data.text.trim()) {
          all.push({ id: `n:${w.id}`, group: 'Notas', icon: 'notes', label: w.data.text.trim().split('\n')[0].slice(0, 80), detail: `${w.title} · ${ws.name}`, run: () => onFocusWidget(w.id) })
        }
        // Lo que publican los widgets conectados (tareas de Notion, eventos de Google…).
        for (const [i, entry] of getSearchItems(w.id).entries()) {
          all.push({
            id: `p:${w.id}:${i}`,
            group: w.type === 'calendar' ? 'Eventos' : 'Tareas',
            icon: w.type === 'calendar' ? 'calendar' : 'tasks',
            label: entry.label,
            detail: entry.detail,
            run: () => onFocusWidget(w.id)
          })
        }
      }
    }
    const actions: Item[] = [
      ...WORKSPACES.map((w, i) => ({
        id: `a:ws:${w.id}`,
        group: 'Acciones',
        icon: w.icon,
        label: `Ir a ${w.name}`,
        detail: `Ctrl+${i + 1}`,
        run: () => dispatch({ type: 'workspace', id: w.id })
      })),
      ...WIDGET_TYPES.map((t) => ({
        id: `a:add:${t}`,
        group: 'Acciones',
        icon: 'plus' as IconName,
        label: `Añadir ${WIDGETS[t].label.toLowerCase()}`,
        detail: WIDGETS[t].description,
        run: () => (settings.locked ? toast('La distribución está bloqueada.', 'info') : dispatch({ type: 'add', widgetType: t }))
      })),
      { id: 'a:settings', group: 'Acciones', icon: 'settings', label: 'Abrir ajustes', detail: 'Ctrl+,', run: () => openSettings() },
      { id: 'a:connections', group: 'Acciones', icon: 'cloud', label: 'Conexiones (Google, Notion)', run: () => openSettings('conexiones') },
      { id: 'a:browsers', group: 'Acciones', icon: 'web', label: 'Navegadores', run: () => openSettings('navegadores') },
      { id: 'a:lock', group: 'Acciones', icon: settings.locked ? 'unlock' : 'lock', label: settings.locked ? 'Desbloquear distribución' : 'Bloquear distribución', detail: 'Ctrl+L', run: () => dispatch({ type: 'settings', patch: { locked: !settings.locked } }) },
      { id: 'a:export', group: 'Acciones', icon: 'download', label: 'Exportar configuración', run: () => openSettings('datos') },
      { id: 'a:welcome', group: 'Acciones', icon: 'help', label: 'Ver la bienvenida', detail: 'F1', run: onShowWelcome }
    ]
    return [...all, ...actions]
  }, [state, settings, dispatch, openSettings, onFocusWidget, onShowWelcome])

  const results = useMemo(() => {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return items.filter((i) => i.group === 'Widgets' || i.group === 'Acciones').slice(0, MAX_RESULTS)
    return items
      .filter((i) => {
        const text = normalizeText(`${i.label} ${i.detail ?? ''} ${i.group}`)
        return terms.every((t) => text.includes(t))
      })
      .slice(0, MAX_RESULTS)
  }, [items, query])

  const choose = (item: Item | undefined): void => {
    if (!item) return
    onClose()
    item.run()
  }

  const move = (delta: number): void => {
    const next = (index + delta + results.length) % Math.max(1, results.length)
    setIndex(next)
    listRef.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  let lastGroup = ''
  return createPortal(
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette glass-strong" role="dialog" aria-label="Buscar">
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            placeholder="Buscar widgets, tareas, accesos o acciones…"
            value={query}
            aria-label="Buscar"
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                move(-1)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(results[index])
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && <p className="muted palette-empty">Nada coincide con «{query}».</p>}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <div key={item.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  data-i={i}
                  role="option"
                  aria-selected={i === index}
                  className={`palette-item ${i === index ? 'active' : ''}`}
                  onMouseMove={() => i !== index && setIndex(i)}
                  onClick={() => choose(item)}
                >
                  <Icon name={item.icon} size={15} />
                  <span className="palette-label">{item.label}</span>
                  {item.detail && <span className="palette-detail">{item.detail}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
