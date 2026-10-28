import { useState, type CSSProperties } from 'react'
import type { Workspace } from '../../shared/types'
import { useApp } from './context'
import { Icon, type IconName } from './icons'
import { WORKSPACE_COLORS, WORKSPACE_ICONS } from './store'
import { confirmDialog } from './ui/feedback'
import { Modal } from './ui/Modal'

/** Renombrar, cambiar icono y color, reordenar o eliminar un espacio. */
export function WorkspaceDialog({ workspace, index, total, onClose }: { workspace: Workspace; index: number; total: number; onClose(): void }): JSX.Element {
  const { dispatch } = useApp()
  const [name, setName] = useState(workspace.name)
  const set = (patch: Partial<Pick<Workspace, 'name' | 'icon' | 'color'>>): void => dispatch({ type: 'updateWorkspace', id: workspace.id, patch })

  const remove = async (): Promise<void> => {
    const n = workspace.widgets.length
    const ok = await confirmDialog({
      title: 'Eliminar espacio',
      message: n ? `¿Eliminar «${workspace.name}» y sus ${n} widgets? Se perderá su contenido local.` : `¿Eliminar «${workspace.name}»?`,
      confirmLabel: 'Eliminar',
      danger: true
    })
    if (!ok) return
    dispatch({ type: 'removeWorkspace', id: workspace.id })
    onClose()
  }

  return (
    <Modal
      title="Editar espacio"
      size="sm"
      onClose={() => {
        if (name.trim() && name !== workspace.name) set({ name })
        onClose()
      }}
      footer={
        <>
          <button className="btn danger-ghost" disabled={total <= 1} title={total <= 1 ? 'Tiene que quedar al menos un espacio' : undefined} onClick={() => void remove()}>
            <Icon name="trash" size={14} /> Eliminar
          </button>
          <span className="grow" />
          <button
            className="btn primary"
            onClick={() => {
              if (name.trim()) set({ name })
              onClose()
            }}
          >
            Hecho
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span>Nombre</span>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && (set({ name }), onClose())}
          />
        </label>
        <div className="field">
          <span>Icono</span>
          <div className="icon-picker" role="radiogroup" aria-label="Icono">
            {WORKSPACE_ICONS.map((icon) => (
              <button
                key={icon}
                role="radio"
                aria-checked={workspace.icon === icon}
                className={workspace.icon === icon ? 'active' : ''}
                style={{ '--ws': workspace.color } as CSSProperties}
                title={icon}
                onClick={() => set({ icon })}
              >
                <Icon name={icon as IconName} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Color</span>
          <div className="color-picker" role="radiogroup" aria-label="Color">
            {WORKSPACE_COLORS.map((color) => (
              <button
                key={color}
                role="radio"
                aria-checked={workspace.color === color}
                aria-label={color}
                className={workspace.color === color ? 'active' : ''}
                style={{ background: color }}
                onClick={() => set({ color })}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Posición</span>
          <div className="row">
            <button className="btn small" disabled={index === 0} onClick={() => dispatch({ type: 'moveWorkspace', id: workspace.id, dir: -1 })}>
              <Icon name="chevronLeft" size={13} /> Mover a la izquierda
            </button>
            <button className="btn small" disabled={index === total - 1} onClick={() => dispatch({ type: 'moveWorkspace', id: workspace.id, dir: 1 })}>
              Mover a la derecha <Icon name="chevronRight" size={13} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
