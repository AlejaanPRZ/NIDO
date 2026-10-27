import type { WidgetDataMap, WidgetType } from '../../shared/types'
import type { IconName } from './icons'
import { uid } from './util'

interface WidgetDefinition<K extends WidgetType> {
  label: string
  icon: IconName
  description: string
  size: { w: number; h: number; minW: number; minH: number }
  createData(): WidgetDataMap[K]
}

export const WIDGETS: { [K in WidgetType]: WidgetDefinition<K> } = {
  notes: {
    label: 'Notas',
    icon: 'notes',
    description: 'Texto libre que se guarda solo',
    size: { w: 4, h: 8, minW: 2, minH: 4 },
    createData: () => ({ text: '' })
  },
  tasks: {
    label: 'Tareas',
    icon: 'tasks',
    description: 'Lista local o base de datos de Notion',
    size: { w: 4, h: 10, minW: 3, minH: 6 },
    createData: () => ({ tasks: [], source: 'local' })
  },
  calendar: {
    label: 'Calendario',
    icon: 'calendar',
    description: 'Eventos locales o de Google Calendar',
    size: { w: 4, h: 12, minW: 3, minH: 8 },
    createData: () => ({ events: [], source: 'local', view: 'month', notify: false, notifyMinutes: 10 })
  },
  music: {
    label: 'Música',
    icon: 'music',
    description: 'Lo que suena en tus apps o tus archivos',
    size: { w: 4, h: 11, minW: 3, minH: 10 },
    createData: () => ({ source: 'system', tracks: [], current: 0, volume: 0.8, muted: false, shuffle: false, repeat: 'off' })
  },
  web: {
    label: 'Panel web',
    icon: 'web',
    description: 'Una página dentro de Nido',
    size: { w: 6, h: 12, minW: 3, minH: 6 },
    createData: () => ({ url: 'https://duckduckgo.com' })
  },
  links: {
    label: 'Accesos',
    icon: 'link',
    description: 'Enlaces y grupos que se abren en tu navegador',
    size: { w: 4, h: 9, minW: 3, minH: 5 },
    createData: () => ({ groups: [{ id: uid(), name: 'Favoritos', links: [] }] })
  }
}

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[]

/** Altura (en filas) de un widget plegado: solo cabecera y resumen. */
export const COLLAPSED_H = 2
