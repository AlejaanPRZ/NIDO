// Tipos compartidos entre el proceso principal, el preload y el renderer.

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface NotesData {
  text: string
}

export interface Task {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export interface TasksData {
  tasks: Task[]
}

export interface CalendarEvent {
  id: string
  /** Fecha local en formato YYYY-MM-DD */
  date: string
  /** Hora opcional en formato HH:MM */
  time?: string
  title: string
}

export interface CalendarData {
  events: CalendarEvent[]
}

export interface Track {
  path: string
  name: string
}

export interface MusicData {
  /** 'system': lo que suena en otras apps (Apple Music, Spotify…). 'local': archivos propios. */
  source?: 'system' | 'local'
  /** Sesión del sistema fijada por el usuario (AppUserModelId); sin valor sigue a la activa. */
  sessionId?: string
  tracks: Track[]
  current: number
  volume: number
}

export interface WebData {
  url: string
}

export interface WidgetDataMap {
  notes: NotesData
  tasks: TasksData
  calendar: CalendarData
  music: MusicData
  web: WebData
}

export type WidgetType = keyof WidgetDataMap

export type Widget = {
  [K in WidgetType]: { id: string; title: string; type: K; data: WidgetDataMap[K] }
}[WidgetType]

export type WidgetOf<K extends WidgetType> = Extract<Widget, { type: K }>

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  theme: Theme
  locked: boolean
}

export interface AppState {
  version: 1
  widgets: Widget[]
  layout: LayoutItem[]
  settings: Settings
}

export type MediaStatus = 'Closed' | 'Opened' | 'Changing' | 'Stopped' | 'Playing' | 'Paused'

/** Una app que reproduce algo, tal como la ven los controles multimedia de Windows. */
export interface MediaSession {
  /** AppUserModelId de la app, p. ej. "AppleInc.AppleMusicWin_…!App" */
  id: string
  title: string
  artist: string
  album: string
  status: MediaStatus
  canToggle: boolean
  canNext: boolean
  canPrev: boolean
  /** Segundos, medidos en `updatedAt` */
  position: number
  duration: number
  /** Epoch en ms del último dato de progreso */
  updatedAt: number
  thumbKey: string | null
  /** Es la sesión que Windows considera activa */
  current: boolean
}

export interface NowPlayingState {
  available: boolean
  error?: string
  sessions: MediaSession[]
}

export type MediaCommand = 'toggle' | 'next' | 'prev'

export interface NowPlayingApi {
  /** Devuelve la función para darse de baja. */
  subscribe(onState: (state: NowPlayingState) => void, onThumb: (key: string, dataUrl: string) => void): () => void
  command(sessionId: string, command: MediaCommand): void
}

/** API expuesta al renderer a través de contextBridge como `window.nido`. */
export interface NidoApi {
  loadState(): Promise<AppState | null>
  saveState(state: AppState): Promise<void>
  /** Guardado síncrono para el cierre de la ventana. */
  saveStateSync(state: AppState): void
  pickAudioFiles(): Promise<Track[]>
  pickAudioFolder(): Promise<Track[]>
  mediaUrl(filePath: string): string
  openExternal(url: string): Promise<void>
  nowPlaying: NowPlayingApi
}

export const IPC = {
  loadState: 'nido:load-state',
  saveState: 'nido:save-state',
  saveStateSync: 'nido:save-state-sync',
  pickAudioFiles: 'nido:pick-audio-files',
  pickAudioFolder: 'nido:pick-audio-folder',
  openExternal: 'nido:open-external',
  npSubscribe: 'nido:np-subscribe',
  npUnsubscribe: 'nido:np-unsubscribe',
  npState: 'nido:np-state',
  npThumb: 'nido:np-thumb',
  npCommand: 'nido:np-command'
} as const

export const MEDIA_SCHEME = 'nido-media'
