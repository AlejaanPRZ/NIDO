import type { PickKind } from '../../../shared/types'
import { Icon, type IconName } from '../icons'
import { toast } from '../ui/feedback'
import { MenuButton } from '../ui/Menu'
import type { WidgetProps } from './types'

const KIND_ICON: Record<string, IconName> = { app: 'apps', folder: 'folder', file: 'file' }

/** Accesos a aplicaciones, carpetas y documentos elegidos por el usuario. */
export function LauncherWidget({ widget, update }: WidgetProps<'launcher'>): JSX.Element {
  const { items } = widget.data

  const add = async (kind: PickKind): Promise<void> => {
    const r = await window.nido.files.pick(kind)
    if (!r.ok) return toast(r.error, 'error')
    const known = new Set(items.map((i) => i.id))
    const fresh = r.data.filter((p) => !known.has(p.id)).map((p) => ({ id: p.id, name: p.name, kind: p.kind }))
    if (fresh.length) update({ items: [...items, ...fresh] })
  }

  const open = async (id: string): Promise<void> => {
    const r = await window.nido.files.open(id)
    if (!r.ok) toast(r.error, 'error')
  }

  const addMenu = [
    { label: 'Aplicación…', icon: 'apps' as const, onSelect: () => void add('app') },
    { label: 'Carpeta…', icon: 'folder' as const, onSelect: () => void add('folder') },
    { label: 'Documentos…', icon: 'file' as const, onSelect: () => void add('file') }
  ]

  if (items.length === 0) {
    return (
      <div className="empty-state compact">
        <span className="empty-icon">
          <Icon name="apps" size={16} />
        </span>
        <p className="empty-text">Accesos directos a programas, carpetas o documentos de tu equipo.</p>
        <MenuButton items={addMenu} title="Añadir acceso" className="btn small primary" align="start">
          <Icon name="plus" size={13} /> Añadir
        </MenuButton>
      </div>
    )
  }

  return (
    <div className="launcher">
      <div className="launcher-grid scroll">
        {items.map((item) => (
          <div key={item.id} className="launch-tile">
            <button className="launch-main" title={`Abrir ${item.name}`} onClick={() => void open(item.id)}>
              <span className={`launch-icon kind-${item.kind}`}>
                <Icon name={KIND_ICON[item.kind]} size={18} />
              </span>
              <span className="launch-name">{item.name}</span>
            </button>
            <MenuButton
              title={`Opciones de ${item.name}`}
              className="icon-btn small launch-more"
              items={[
                { label: 'Abrir', icon: 'arrowUpRight', onSelect: () => void open(item.id) },
                { label: 'Mostrar en el Explorador', icon: 'folder', onSelect: () => void window.nido.files.reveal(item.id).then((r) => !r.ok && toast(r.error, 'error')) },
                { separator: true },
                { label: 'Quitar de aquí', icon: 'close', danger: true, onSelect: () => update({ items: items.filter((i) => i.id !== item.id) }) }
              ]}
            >
              <Icon name="more" size={13} />
            </MenuButton>
          </div>
        ))}
      </div>
      <div className="widget-footer row">
        <MenuButton items={addMenu} title="Añadir acceso" className="btn small" align="start">
          <Icon name="plus" size={13} /> Añadir
        </MenuButton>
      </div>
    </div>
  )
}
