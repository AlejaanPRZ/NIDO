import { Segmented } from '../../ui/controls'
import type { WidgetProps } from '../types'
import { LocalPlayer } from './LocalPlayer'
import { SystemPlayer } from './SystemPlayer'

export function MusicWidget(props: WidgetProps<'music'>): JSX.Element {
  // Los widgets guardados antes de existir el modo sistema no tienen `source`.
  const source = props.widget.data.source ?? 'system'
  return (
    <div className="music">
      <Segmented
        label="Fuente de audio"
        className="full"
        value={source}
        options={[
          { value: 'system', label: 'Ahora suena', title: 'Lo que suena en Apple Music, Spotify, el navegador…' },
          { value: 'local', label: 'Mis archivos', title: 'Canciones de tu equipo' }
        ]}
        onChange={(v) => props.update({ source: v })}
      />
      {source === 'system' ? <SystemPlayer {...props} /> : <LocalPlayer {...props} />}
    </div>
  )
}
