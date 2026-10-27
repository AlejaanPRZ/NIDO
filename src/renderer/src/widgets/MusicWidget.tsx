import { LocalPlayer } from './LocalPlayer'
import { SystemPlayer } from './SystemPlayer'
import type { WidgetProps } from './types'

export function MusicWidget(props: WidgetProps<'music'>): JSX.Element {
  // Los widgets guardados antes de existir el modo sistema no tienen `source`.
  const source = props.widget.data.source ?? 'system'
  return (
    <div className="music">
      <div className="segmented">
        <button
          className={source === 'system' ? 'active' : ''}
          onClick={() => props.update({ source: 'system' })}
        >
          Ahora suena
        </button>
        <button className={source === 'local' ? 'active' : ''} onClick={() => props.update({ source: 'local' })}>
          Mis archivos
        </button>
      </div>
      {source === 'system' ? <SystemPlayer {...props} /> : <LocalPlayer {...props} />}
    </div>
  )
}
