import { useState } from 'react'
import { BrandLogo, brandOfBrowser } from '../BrandLogo'
import type { LinkGroup } from '../../../shared/types'
import { browserLabel, useApp } from '../context'
import { Icon } from '../icons'
import { confirmDialog, toast } from '../ui/feedback'
import { MenuButton, type MenuItem } from '../ui/Menu'
import { hostOf, normalizeUrl, uid } from '../util'
import type { WidgetProps } from './types'

/** Enlaces y grupos de enlaces que se abren FUERA de Nido, en el navegador elegido. */
export function LinksWidget({ widget, update }: WidgetProps<'links'>): JSX.Element {
  const { browsers, settings, openSettings } = useApp()
  const { groups } = widget.data
  const effective = widget.data.browserId ?? settings.defaultBrowser
  const [adding, setAdding] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  const open = async (urls: string[]): Promise<void> => {
    const result = await window.nido.browsers.open(effective, urls)
    if (!result.ok) toast(result.error, 'error')
  }

  const setGroups = (next: LinkGroup[]): void => update({ groups: next })

  const browserItems: MenuItem[] = [
    { header: 'Abrir los enlaces con (fuera de Nido)' },
    {
      label: `Según Ajustes (${browserLabel(settings.defaultBrowser, browsers)})`,
      checked: widget.data.browserId === undefined,
      onSelect: () => update({ browserId: undefined })
    },
    { label: 'Navegador predeterminado del sistema', checked: widget.data.browserId === 'system', onSelect: () => update({ browserId: 'system' }) },
    ...browsers.map((b) => ({ label: b.name, checked: widget.data.browserId === b.id, onSelect: () => update({ browserId: b.id }) })),
    { separator: true },
    { label: 'Gestionar navegadores…', icon: 'settings', onSelect: () => openSettings('navegadores') }
  ]

  const addLink = (groupId: string): void => {
    const target = normalizeUrl(url)
    if (!target) return
    setGroups(
      groups.map((g) =>
        g.id === groupId ? { ...g, links: [...g.links, { id: uid(), url: target, title: title.trim() || hostOf(target) }] } : g
      )
    )
    setUrl('')
    setTitle('')
    setAdding(null)
  }

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const commitRename = (): void => {
    const name = renaming?.name.trim()
    if (renaming && name) setGroups(groups.map((g) => (g.id === renaming.id ? { ...g, name } : g)))
    setRenaming(null)
  }

  const removeGroup = async (group: LinkGroup): Promise<void> => {
    const ok =
      group.links.length === 0 ||
      (await confirmDialog({
        title: 'Eliminar grupo',
        message: `¿Eliminar «${group.name}» y sus ${group.links.length} enlaces?`,
        confirmLabel: 'Eliminar',
        danger: true
      }))
    if (ok) setGroups(groups.filter((g) => g.id !== group.id))
  }

  return (
    <div className="links">
      <div className="links-bar">
        <span className="links-target" title={`Los enlaces se abren fuera de Nido, en ${browserLabel(effective, browsers)}`}>
          {brandOfBrowser(browsers.find((b) => b.id === effective)?.name ?? '') ? (
            <BrandLogo brand={brandOfBrowser(browsers.find((b) => b.id === effective)!.name)!} name="" size={18} decorative />
          ) : (
            <Icon name="arrowUpRight" size={13} />
          )}
          <span className="ellipsis">{browserLabel(effective, browsers)}</span>
        </span>
        <MenuButton items={browserItems} title="Elegir navegador externo" className="btn tiny">
          Cambiar
        </MenuButton>
      </div>

      <div className="scroll links-groups">
        {groups.map((group) => (
          <section key={group.id} className="link-group">
            <header className="link-group-head">
              {renaming?.id === group.id ? (
                <input
                  className="input tiny"
                  autoFocus
                  value={renaming.name}
                  aria-label="Nombre del grupo"
                  onChange={(e) => setRenaming({ id: group.id, name: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                />
              ) : (
                <span className="link-group-name" onDoubleClick={() => setRenaming({ id: group.id, name: group.name })}>
                  {group.name}
                </span>
              )}
              <span className="muted count">{group.links.length}</span>
              <span className="grow" />
              <button
                className="btn tiny"
                disabled={group.links.length === 0}
                title={`Abrir los ${group.links.length} enlaces en ${browserLabel(effective, browsers)}`}
                onClick={() => void open(group.links.map((l) => l.url))}
              >
                Abrir todo
              </button>
              <MenuButton
                title="Opciones del grupo"
                className="icon-btn small"
                items={[
                  { label: 'Añadir enlace', icon: 'plus', onSelect: () => setAdding(group.id) },
                  { label: 'Renombrar', icon: 'edit', onSelect: () => setRenaming({ id: group.id, name: group.name }) },
                  { separator: true },
                  { label: 'Eliminar grupo', icon: 'trash', danger: true, onSelect: () => void removeGroup(group) }
                ]}
              >
                <Icon name="more" size={14} />
              </MenuButton>
            </header>
            <ul className="list">
              {group.links.map((link) => (
                <li key={link.id} className="link-row">
                  <button className="link-main" title={`${link.url}\nSe abre en ${browserLabel(effective, browsers)}`} onClick={() => void open([link.url])}>
                    <span className="link-badge">{(link.title || hostOf(link.url)).charAt(0).toUpperCase()}</span>
                    <span className="link-text">
                      <span className="link-title">{link.title}</span>
                      <span className="link-host">{hostOf(link.url)}</span>
                    </span>
                  </button>
                  <button
                    className="icon-btn small hover-only"
                    title="Quitar enlace"
                    onClick={() =>
                      setGroups(groups.map((g) => (g.id === group.id ? { ...g, links: g.links.filter((l) => l.id !== link.id) } : g)))
                    }
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
            {adding === group.id ? (
              <form
                className="link-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  addLink(group.id)
                }}
              >
                <input className="input tiny" autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
                <input className="input tiny" placeholder="Nombre (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
                <div className="row">
                  <button type="button" className="btn tiny" onClick={() => setAdding(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn tiny primary" disabled={!url.trim()}>
                    Añadir
                  </button>
                </div>
              </form>
            ) : (
              <button className="link-btn add-link" onClick={() => setAdding(group.id)}>
                <Icon name="plus" size={12} /> Añadir enlace
              </button>
            )}
          </section>
        ))}
      </div>

      <div className="widget-footer row">
        <button
          className="btn small"
          onClick={() => setGroups([...groups, { id: uid(), name: `Grupo ${groups.length + 1}`, links: [] }])}
        >
          <Icon name="plus" size={13} />
          Grupo
        </button>
      </div>
    </div>
  )
}
