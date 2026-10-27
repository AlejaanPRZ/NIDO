import type { WidgetDataMap, WidgetType } from '../../shared/types'
import type { IconName } from './icons'

interface WidgetDefinition<K extends WidgetType> {
  label: string
  icon: IconName
  size: { w: number; h: number; minW: number; minH: number }
  createData(): WidgetDataMap[K]
}

export const WIDGETS: { [K in WidgetType]: WidgetDefinition<K> } = {
  notes: {
    label: 'Notas',
    icon: 'notes',
    size: { w: 4, h: 7, minW: 2, minH: 3 },
    createData: () => ({ text: '' })
  },
  tasks: {
    label: 'Tareas',
    icon: 'tasks',
    size: { w: 4, h: 8, minW: 3, minH: 4 },
    createData: () => ({ tasks: [] })
  },
  calendar: {
    label: 'Calendario',
    icon: 'calendar',
    size: { w: 4, h: 10, minW: 3, minH: 8 },
    createData: () => ({ events: [] })
  },
  music: {
    label: 'Música',
    icon: 'music',
    size: { w: 4, h: 9, minW: 3, minH: 7 },
    createData: () => ({ source: 'system', tracks: [], current: 0, volume: 0.8 })
  },
  web: {
    label: 'Panel web',
    icon: 'web',
    size: { w: 8, h: 12, minW: 3, minH: 5 },
    createData: () => ({ url: 'https://duckduckgo.com' })
  }
}

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[]
