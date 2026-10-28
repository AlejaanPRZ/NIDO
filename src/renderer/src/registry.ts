import type { WidgetDataMap, WidgetType } from '../../shared/types'
import type { IconName } from './icons'
import { uid } from './util'

export type SizeName = 's' | 'm' | 'l'
type Size = { w: number; h: number }

interface WidgetDefinition<K extends WidgetType> {
  label: string
  icon: IconName
  description: string
  /** Tamaño por defecto (= mediano) y mínimo en el que caben sus controles */
  size: { w: number; h: number; minW: number; minH: number }
  /** Tamaños rápidos: pequeño, mediano y grande */
  sizes: Record<SizeName, Size>
  createData(): WidgetDataMap[K]
}

/** Construye la definición: el mediano es el tamaño por defecto. */
function def<K extends WidgetType>(
  label: string,
  icon: IconName,
  description: string,
  min: Size,
  sizes: Record<SizeName, Size>,
  createData: () => WidgetDataMap[K]
): WidgetDefinition<K> {
  return { label, icon, description, size: { ...sizes.m, minW: min.w, minH: min.h }, sizes, createData }
}

const today = (): string => new Date().toISOString().slice(0, 10)

export const WIDGETS: { [K in WidgetType]: WidgetDefinition<K> } = {
  notes: def('Notas', 'notes', 'Texto con formato básico y listas', { w: 2, h: 4 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 7 }, l: { w: 6, h: 11 } }, () => ({
    text: '',
    mode: 'edit'
  })),
  tasks: def('Tareas', 'tasks', 'Lista local o base de datos de Notion', { w: 3, h: 6 }, { s: { w: 3, h: 7 }, m: { w: 4, h: 9 }, l: { w: 6, h: 12 } }, () => ({
    tasks: [],
    source: 'local'
  })),
  calendar: def('Calendario', 'calendar', 'Eventos locales o de Google Calendar', { w: 3, h: 8 }, { s: { w: 3, h: 9 }, m: { w: 4, h: 11 }, l: { w: 6, h: 13 } }, () => ({
    events: [],
    source: 'local',
    view: 'month',
    notify: false,
    notifyMinutes: 10
  })),
  music: def('Música', 'music', 'Lo que suena en tus apps o tus archivos', { w: 3, h: 9 }, { s: { w: 3, h: 9 }, m: { w: 4, h: 10 }, l: { w: 5, h: 12 } }, () => ({
    source: 'system',
    tracks: [],
    current: 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: 'off'
  })),
  web: def('Panel web', 'web', 'Una página dentro de Nido', { w: 3, h: 6 }, { s: { w: 4, h: 8 }, m: { w: 6, h: 11 }, l: { w: 8, h: 15 } }, () => ({
    url: 'https://duckduckgo.com'
  })),
  links: def('Enlaces', 'link', 'Enlaces y grupos que se abren en tu navegador', { w: 3, h: 4 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 7 }, l: { w: 4, h: 10 } }, () => ({
    groups: [{ id: uid(), name: 'Favoritos', links: [] }]
  })),
  pomodoro: def('Pomodoro', 'timer', 'Bloques de foco y descanso configurables', { w: 2, h: 5 }, { s: { w: 2, h: 5 }, m: { w: 3, h: 6 }, l: { w: 4, h: 8 } }, () => ({
    focus: 25,
    short: 5,
    long: 15,
    rounds: 4,
    autoStart: false,
    phase: 'focus',
    round: 1,
    clock: { running: false, remaining: 25 * 60 },
    completed: { day: today(), count: 0 }
  })),
  timer: def('Temporizador', 'stopwatch', 'Cuenta atrás y cronómetro con vueltas', { w: 2, h: 5 }, { s: { w: 2, h: 5 }, m: { w: 3, h: 6 }, l: { w: 3, h: 8 } }, () => ({
    mode: 'timer',
    duration: 5 * 60,
    timer: { running: false, remaining: 5 * 60 },
    stopwatch: { running: false, elapsed: 0, laps: [] }
  })),
  worldclock: def('Relojes del mundo', 'globeClock', 'La hora en varias ciudades', { w: 2, h: 3 }, { s: { w: 3, h: 4 }, m: { w: 4, h: 5 }, l: { w: 6, h: 6 } }, () => ({
    zones: [
      { id: uid(), label: 'Nueva York', tz: 'America/New_York' },
      { id: uid(), label: 'Londres', tz: 'Europe/London' },
      { id: uid(), label: 'Tokio', tz: 'Asia/Tokyo' }
    ]
  })),
  calculator: def('Calculadora', 'calculator', 'Operaciones con historial', { w: 2, h: 7 }, { s: { w: 3, h: 8 }, m: { w: 3, h: 9 }, l: { w: 4, h: 10 } }, () => ({
    history: []
  })),
  habits: def('Hábitos', 'flame', 'Seguimiento diario con rachas', { w: 3, h: 4 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 6 }, l: { w: 6, h: 8 } }, () => ({
    habits: []
  })),
  launcher: def('Aplicaciones y carpetas', 'apps', 'Accesos a programas, carpetas y documentos', { w: 2, h: 3 }, { s: { w: 3, h: 4 }, m: { w: 4, h: 5 }, l: { w: 6, h: 6 } }, () => ({
    items: []
  })),
  images: def('Imágenes', 'image', 'Pase de imágenes de tu equipo', { w: 2, h: 4 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 7 }, l: { w: 6, h: 10 } }, () => ({
    sources: [],
    interval: 10,
    fit: 'cover'
  })),
  recent: def('Recientes', 'clock', 'Lo último que abriste desde Nido', { w: 3, h: 4 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 6 }, l: { w: 4, h: 9 } }, () => ({
    limit: 12
  })),
  system: def('Sistema', 'gauge', 'CPU, memoria y batería', { w: 2, h: 4 }, { s: { w: 3, h: 4 }, m: { w: 3, h: 5 }, l: { w: 4, h: 6 } }, () => ({
    show: { cpu: true, memory: true, battery: true }
  })),
  weather: def('Tiempo', 'cloudSun', 'Previsión con Open-Meteo, sin cuenta', { w: 2, h: 4 }, { s: { w: 3, h: 4 }, m: { w: 4, h: 5 }, l: { w: 6, h: 6 } }, () => ({
    units: 'c'
  })),
  rss: def('Noticias RSS', 'rss', 'Titulares de tus feeds RSS o Atom', { w: 3, h: 5 }, { s: { w: 3, h: 6 }, m: { w: 4, h: 8 }, l: { w: 6, h: 11 } }, () => ({
    feeds: [],
    limit: 20
  })),
  holidays: def('Festivos y cuentas atrás', 'flag', 'Próximos festivos y tus fechas', { w: 3, h: 4 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 7 }, l: { w: 4, h: 9 } }, () => ({
    country: 'ES',
    countdowns: []
  })),
  converter: def('Conversor', 'swap', 'Unidades y divisas (BCE)', { w: 3, h: 5 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 6 }, l: { w: 4, h: 7 } }, () => ({
    mode: 'units',
    units: { category: 'longitud', from: 'km', to: 'mi', value: '1' },
    currency: { from: 'EUR', to: 'USD', amount: '1' }
  })),
  search: def('Buscador', 'search', 'Busca en la web con el motor que elijas', { w: 2, h: 2 }, { s: { w: 3, h: 2 }, m: { w: 4, h: 2 }, l: { w: 6, h: 2 } }, () => ({
    engine: 'duckduckgo'
  })),
  radio: def('Radio y podcasts', 'radio', 'Emisoras y episodios por URL de audio', { w: 3, h: 5 }, { s: { w: 3, h: 5 }, m: { w: 4, h: 6 }, l: { w: 4, h: 9 } }, () => ({
    stations: [],
    volume: 0.8
  }))
}

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[]

/** Altura (en filas) de un widget plegado: solo cabecera y resumen. */
export const COLLAPSED_H = 2

export const SIZE_LABEL: Record<SizeName, string> = { s: 'Pequeño', m: 'Mediano', l: 'Grande' }
