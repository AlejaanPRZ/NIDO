import { useCallback, useState } from 'react'
import type { RecentItem } from '../../../shared/types'
import { useActive, useInterval } from '../context'
import { Icon, type IconName } from '../icons'
import { confirmDialog, toast } from '../ui/feedback'
import { relativeTime } from '../util'
import type { WidgetProps } from './types'

const KIND_ICON: Record<string, IconName> = { app: 'apps', folder: 'folder', file: 'file' }

/** Lo abierto desde Nido (lanzadores). No consulta el historial de Windows. */
export function RecentWidget({ widget }: WidgetProps<'recent'>): JSX.Element {
  const [items, setItems] = useState<RecentItem[] | null>(null)
  const load = useCallback(() => {
    window.nido.files.recent().then((r) => r.ok && setItems(r.data))
  }, [])
  useInterval(load, 15_000, useActive())

  const open = async (id: string): Promise<void> => {
    const r = await window.nido.files.open(id)
    if (!r.ok) toast(r.error, 'error')
    load()
  }

  if (items && items.length === 0) {
    return (
      <div className="empty-state compact">
        <span className="empty-icon">
          <Icon name="clock" size={16} />
        </span>
        <p className="empty-text">Aquí aparecerá lo que abras desde «Aplicaciones y carpetas». Nido no lee el historial de Windows.</p>
      </div>
    )
  }

  return (
    <div className="recent">
      <ul className="list scroll">
        {(items ?? []).slice(0, widget.data.limit).map((r) => (
          <li key={r.id} className="recent-row">
            <button className="link-main" title={r.path} onClick={() => void open(r.id)}>
              <span className={`launch-icon small kind-${r.kind}`}>
                <Icon name={KIND_ICON[r.kind]} size={14} />
              </span>
              <span className="link-text">
                <span className="link-title">{r.name}</span>
                <span className="link-host">{relativeTime(new Date(r.at))}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {items && items.length > 0 && (
        <div className="widget-footer row">
          <span className="grow" />
          <button
            className="link-btn"
            onClick={async () => {
              if (await confirmDialog({ title: 'Vaciar recientes', message: 'Se olvidará la lista de elementos abiertos desde Nido. Los archivos no se tocan.', confirmLabel: 'Vaciar' })) {
                await window.nido.files.clearRecent()
                load()
              }
            }}
          >
            Vaciar
          </button>
        </div>
      )}
    </div>
  )
}
