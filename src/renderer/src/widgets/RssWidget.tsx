import { useCallback, useState } from 'react'
import { useActive, useApp, useInterval } from '../context'
import { Icon } from '../icons'
import { Spinner } from '../ui/controls'
import { toast } from '../ui/feedback'
import { MenuButton } from '../ui/Menu'
import { hostOf, normalizeUrl, relativeTime, uid } from '../util'
import type { WidgetProps } from './types'

interface Item {
  title: string
  link: string
  date: number | null
  source: string
}

/** RSS 2.0 y Atom con DOMParser (en el renderer; nada se inserta como HTML). */
function parseFeed(xml: string, fallbackTitle: string): { title: string; items: Item[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('No es un feed RSS/Atom válido.')
  const text = (el: Element | null | undefined, sel: string): string => el?.querySelector(sel)?.textContent?.trim() ?? ''
  const channel = doc.querySelector('channel') ?? doc.querySelector('feed')
  const title = text(channel, ':scope > title') || fallbackTitle
  const nodes = [...doc.querySelectorAll('item, entry')].slice(0, 50)
  const items = nodes.map((n) => {
    const atomLink = n.querySelector('link[rel="alternate"], link:not([rel])')?.getAttribute('href')
    const link = atomLink ?? text(n, 'link')
    const raw = text(n, 'pubDate') || text(n, 'published') || text(n, 'updated') || text(n, 'date')
    const date = raw ? Date.parse(raw) : NaN
    return { title: text(n, 'title') || '(sin título)', link, date: Number.isNaN(date) ? null : date, source: title }
  })
  return { title, items: items.filter((i) => /^https?:\/\//.test(i.link)) }
}

export function RssWidget({ widget, update }: WidgetProps<'rss'>): JSX.Element {
  const { settings } = useApp()
  const { feeds, limit } = widget.data
  const [items, setItems] = useState<Item[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const key = feeds.map((f) => f.url).join('|')

  const load = useCallback(() => {
    if (feeds.length === 0) {
      setItems([])
      return
    }
    Promise.all(feeds.map((f) => window.nido.info.feed(f.url).then((r) => ({ f, r })))).then((results) => {
      const all: Item[] = []
      const errs: string[] = []
      for (const { f, r } of results) {
        if (!r.ok) {
          errs.push(`${f.title ?? hostOf(f.url)}: ${r.error}`)
          continue
        }
        try {
          all.push(...parseFeed(r.data, f.title ?? hostOf(f.url)).items)
        } catch (err) {
          errs.push(`${f.title ?? hostOf(f.url)}: ${(err as Error).message}`)
        }
      }
      all.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
      setItems(all)
      setErrors(errs)
    })
    // key resume la lista de feeds
  }, [key])

  useInterval(load, 15 * 60_000, useActive(), key)

  const addFeed = async (): Promise<void> => {
    const target = normalizeUrl(url)
    if (!target) return
    setChecking(true)
    const r = await window.nido.info.feed(target)
    setChecking(false)
    if (!r.ok) return setAddError(r.error)
    try {
      const { title } = parseFeed(r.data, hostOf(target))
      update({ feeds: [...feeds, { id: uid(), url: target, title }] })
      setUrl('')
      setAdding(false)
      setAddError(null)
    } catch (err) {
      setAddError((err as Error).message)
    }
  }

  const open = (link: string): void => {
    void window.nido.browsers.open(settings.defaultBrowser, [link]).then((r) => !r.ok && toast(r.error, 'error'))
  }

  const addForm = (
    <form
      className="link-form"
      onSubmit={(e) => {
        e.preventDefault()
        void addFeed()
      }}
    >
      <input className="input tiny" autoFocus placeholder="https://ejemplo.com/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} />
      {addError && <p className="field-error">{addError}</p>}
      <div className="row">
        {feeds.length > 0 && (
          <button type="button" className="btn tiny" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn tiny primary" disabled={!url.trim() || checking}>
          {checking ? 'Comprobando…' : 'Añadir feed'}
        </button>
      </div>
    </form>
  )

  if (feeds.length === 0) {
    return (
      <div className="rss">
        <p className="muted small-text">Pega la dirección de un feed RSS o Atom (suele acabar en /feed, /rss o .xml).</p>
        {addForm}
      </div>
    )
  }

  return (
    <div className="rss">
      {adding && addForm}
      <ul className="list scroll">
        {!items && (
          <li className="empty">
            <Spinner />
          </li>
        )}
        {items?.slice(0, limit).map((item, i) => (
          <li key={`${item.link}-${i}`}>
            <button className="news-item" title={`Abrir en el navegador\n${item.link}`} onClick={() => open(item.link)}>
              <span className="news-title">{item.title}</span>
              <span className="news-meta">
                {item.source}
                {item.date ? ` · ${relativeTime(new Date(item.date))}` : ''}
              </span>
            </button>
          </li>
        ))}
        {items?.length === 0 && errors.length === 0 && <li className="empty muted">Los feeds no tienen titulares.</li>}
      </ul>
      {errors.length > 0 && (
        <p className="warn-line" title={errors.join('\n')}>
          <Icon name="alert" size={13} /> {errors.length === 1 ? errors[0] : `${errors.length} feeds no responden`}
        </p>
      )}
      <div className="row widget-footer">
        <button className="icon-btn small" title="Actualizar" onClick={load}>
          <Icon name="reload" size={12} />
        </button>
        <span className="grow muted small-text">{feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'}</span>
        <MenuButton
          title="Gestionar feeds"
          className="btn tiny"
          items={() => [
            { label: 'Añadir feed…', icon: 'plus', onSelect: () => setAdding(true) },
            { separator: true },
            ...feeds.map((f) => ({ label: `Quitar «${f.title ?? hostOf(f.url)}»`, icon: 'close' as const, onSelect: () => update({ feeds: feeds.filter((x) => x.id !== f.id) }) }))
          ]}
        >
          Feeds
        </MenuButton>
      </div>
    </div>
  )
}
