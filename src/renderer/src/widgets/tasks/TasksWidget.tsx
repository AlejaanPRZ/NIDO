import { Segmented } from '../../ui/controls'
import type { WidgetProps } from '../types'
import { LocalTasks } from './LocalTasks'
import { NotionTasks } from './NotionTasks'

export function TasksWidget(props: WidgetProps<'tasks'>): JSX.Element {
  const source = props.widget.data.source ?? 'local'
  return (
    <div className="tasks">
      <Segmented
        label="Origen de las tareas"
        className="full compact"
        value={source}
        options={[
          { value: 'local', label: 'Locales', title: 'Lista guardada en este equipo' },
          { value: 'notion', label: 'Notion', title: 'Una base de datos de Notion' }
        ]}
        onChange={(v) => props.update({ source: v })}
      />
      {source === 'notion' ? <NotionTasks {...props} /> : <LocalTasks {...props} />}
    </div>
  )
}
