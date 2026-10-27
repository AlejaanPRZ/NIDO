// Tipos compartidos entre el proceso principal, el preload y el renderer.

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

// ---------- Datos de cada widget ----------

export interface NotesData {
  text: string
}

export interface Task {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none'

export interface TaskFilters {
  /** 'all' | 'open' | 'done' | 'opt:<nombre de una opción de estado>' */
  status: string
  /** 'all' o el nombre de una opción de prioridad */
  priority: string
  due: DueFilter
}

/** Qué propiedad de la base de datos de Notion cumple cada papel (por nombre). */
export interface NotionTaskMapping {
  title: string
  status?: string
  date?: string
  priority?: string
  tags?: string
}

export interface NotionTaskConfig {
  dataSourceId: string
  name: string
  map: NotionTaskMapping
  /** Opción que significa «completada» (para estado/selección). */
  doneValue?: string
}

export interface TasksData {
  tasks: Task[]
  source?: 'local' | 'notion'
  notion?: NotionTaskConfig
  filters?: TaskFilters
}

export interface CalendarEvent {
  id: string
  /** Fecha local en formato YYYY-MM-DD */
  date: string
  /** Hora opcional en formato HH:MM; sin hora es un evento de todo el día */
  time?: string
  endTime?: string
  title: string
  notes?: string
  /** Minutos de antelación del aviso; null = sin aviso; undefined = el del widget */
  reminder?: number | null
}

export type CalendarView = 'agenda' | 'day' | 'week' | 'month'

export interface CalendarData {
  /** Eventos locales de Nido */
  events: CalendarEvent[]
  source?: 'local' | 'google'
  view?: CalendarView
  /** Calendarios de Google visibles; undefined = los marcados en Google */
  calendars?: string[]
  /** Avisos de escritorio de Nido */
  notify?: boolean
  notifyMinutes?: number
}

export interface Track {
  path: string
  name: string
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface MusicData {
  /** 'system': lo que suena en otras apps (Apple Music, Spotify…). 'local': archivos propios. */
  source?: 'system' | 'local'
  /** Sesión del sistema fijada por el usuario (AppUserModelId); sin valor sigue a la activa. */
  sessionId?: string
  tracks: Track[]
  current: number
  volume: number
  muted?: boolean
  shuffle?: boolean
  repeat?: RepeatMode
}

export interface WebData {
  url: string
}

export interface LinkItem {
  id: string
  title: string
  url: string
}

export interface LinkGroup {
  id: string
  name: string
  links: LinkItem[]
}

export interface LinksData {
  groups: LinkGroup[]
  /** Navegador externo; undefined = el predeterminado de Ajustes */
  browserId?: string
}

export interface WidgetDataMap {
  notes: NotesData
  tasks: TasksData
  calendar: CalendarData
  music: MusicData
  web: WebData
  links: LinksData
}

export type WidgetType = keyof WidgetDataMap

interface WidgetBase {
  id: string
  title: string
  collapsed?: boolean
  /** Altura antes de plegar, para restaurarla */
  restoreH?: number
}

export type Widget = {
  [K in WidgetType]: WidgetBase & { type: K; data: WidgetDataMap[K] }
}[WidgetType]

export type WidgetOf<K extends WidgetType> = Extract<Widget, { type: K }>

// ---------- Estado global ----------

export type Theme = 'system' | 'light' | 'dark'

export interface Workspace {
  id: string
  name: string
  widgets: Widget[]
  layout: LayoutItem[]
}

export interface Settings {
  theme: Theme
  locked: boolean
  reduceTransparency: boolean
  reduceMotion: boolean
  clock: { hour12: boolean; showSeconds: boolean }
  welcomeSeen: boolean
  /** 'system' o el id de un navegador detectado/añadido */
  defaultBrowser: string
}

export interface AppState {
  version: 2
  workspaces: Workspace[]
  activeWorkspace: string
  settings: Settings
}

/** Formato del archivo de exportación. */
export interface ExportFile {
  app: 'nido'
  exportedAt: string
  state: AppState
}

// ---------- Resultado de llamadas al proceso principal ----------

export type ErrorCode = 'config' | 'auth' | 'network' | 'notfound' | 'forbidden' | 'rate' | 'invalid' | 'unknown'

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode }

// ---------- Música del sistema ----------

export type MediaStatus = 'Closed' | 'Opened' | 'Changing' | 'Stopped' | 'Playing' | 'Paused'
export type MediaRepeat = 'None' | 'Track' | 'List'

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
  canSeek: boolean
  canShuffle: boolean
  canRepeat: boolean
  shuffle: boolean | null
  repeat: MediaRepeat | null
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

export type MediaCommand = 'toggle' | 'next' | 'prev' | 'seek' | 'shuffle' | 'repeat'

export interface NowPlayingApi {
  /** Devuelve la función para darse de baja. */
  subscribe(onState: (state: NowPlayingState) => void, onThumb: (key: string, dataUrl: string) => void): () => void
  /** seek: segundos; shuffle: boolean; repeat: MediaRepeat */
  command(sessionId: string, command: MediaCommand, value?: number | boolean | string): void
}

// ---------- Google Calendar ----------

export interface GoogleStatus {
  clientId: string
  hasClientSecret: boolean
  connected: boolean
  account?: string
  /** El cifrado del sistema (DPAPI) está disponible */
  encryption: boolean
}

export interface GoogleCalendar {
  id: string
  name: string
  color: string
  primary: boolean
  canWrite: boolean
  /** Marcado como visible en Google Calendar */
  selected: boolean
}

/** Evento unificado (Google o local) para pintar en el calendario. */
export interface CalEvent {
  id: string
  calendarId: string
  title: string
  /** Todo el día: YYYY-MM-DD. Con hora: ISO 8601 con zona. */
  start: string
  /** Todo el día: YYYY-MM-DD exclusivo (como Google). */
  end: string
  allDay: boolean
  location?: string
  description?: string
  color?: string
  htmlLink?: string
  recurring?: boolean
  /** Minutos de aviso; null = ninguno; 'default' = el predeterminado del calendario */
  reminder?: number | null | 'default'
  source: 'google' | 'local'
}

export interface EventInput {
  title: string
  allDay: boolean
  start: string
  end: string
  location?: string
  description?: string
  reminder?: number | null | 'default'
  timeZone: string
}

export interface GoogleEventsQuery {
  calendarIds: string[]
  timeMin: string
  timeMax: string
}

export interface GoogleEventsResult {
  events: CalEvent[]
  /** Calendarios que fallaron (los demás sí se cargaron) */
  failed: { calendarId: string; error: string }[]
}

export interface GoogleApi {
  status(): Promise<Result<GoogleStatus>>
  setCredentials(clientId: string, clientSecret: string): Promise<Result<GoogleStatus>>
  connect(): Promise<Result<GoogleStatus>>
  disconnect(): Promise<Result<GoogleStatus>>
  calendars(): Promise<Result<GoogleCalendar[]>>
  events(query: GoogleEventsQuery): Promise<Result<GoogleEventsResult>>
  createEvent(calendarId: string, input: EventInput): Promise<Result<CalEvent>>
  updateEvent(calendarId: string, eventId: string, input: EventInput): Promise<Result<CalEvent>>
  deleteEvent(calendarId: string, eventId: string): Promise<Result<null>>
}

// ---------- Notion ----------

export interface NotionStatus {
  connected: boolean
  workspace?: string
  bot?: string
  encryption: boolean
}

export interface NotionSource {
  id: string
  title: string
}

export interface NotionProperty {
  id: string
  name: string
  type: string
  options?: { name: string; color: string }[]
  /** Solo en propiedades de estado: grupos (Por hacer, En curso, Completado) */
  groups?: { name: string; options: string[] }[]
}

export interface NotionSchema {
  id: string
  title: string
  properties: NotionProperty[]
}

export type NotionValue =
  | { type: 'title'; value: string }
  | { type: 'status' | 'select'; value: string | null }
  | { type: 'multi_select'; value: string[] }
  | { type: 'date'; value: { start: string; end?: string | null } | null }
  | { type: 'checkbox'; value: boolean }

export interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionValue>
}

export interface NotionApi {
  status(): Promise<Result<NotionStatus>>
  setToken(token: string): Promise<Result<NotionStatus>>
  disconnect(): Promise<Result<NotionStatus>>
  search(query: string): Promise<Result<NotionSource[]>>
  schema(dataSourceId: string): Promise<Result<NotionSchema>>
  query(dataSourceId: string): Promise<Result<NotionPage[]>>
  create(dataSourceId: string, values: Record<string, NotionValue>): Promise<Result<NotionPage>>
  update(pageId: string, values: Record<string, NotionValue>): Promise<Result<NotionPage>>
}

// ---------- Navegadores ----------

export interface BrowserInfo {
  id: string
  name: string
  path: string
  kind: 'detected' | 'custom'
}

export interface BrowsersApi {
  list(): Promise<Result<BrowserInfo[]>>
  addCustom(): Promise<Result<BrowserInfo | null>>
  removeCustom(id: string): Promise<Result<void>>
  /** browserId 'system' = navegador predeterminado de Windows */
  open(browserId: string, urls: string[]): Promise<Result<null>>
}

// ---------- Datos ----------

export interface DataApi {
  /** Guarda el JSON con un diálogo; devuelve la ruta o null si se cancela. */
  exportConfig(json: string): Promise<Result<string | null>>
  /** Lee un JSON elegido con un diálogo; null si se cancela. */
  importConfig(): Promise<Result<string | null>>
  /** Copia de seguridad del estado actual en disco; devuelve la ruta. */
  backupCurrent(): Promise<Result<string>>
  openDataFolder(): Promise<Result<null>>
}

/** API expuesta al renderer a través de contextBridge como `window.nido`. */
export interface NidoApi {
  /** Estado tal cual está en disco (v1 o v2); el renderer lo migra. */
  loadState(): Promise<unknown>
  saveState(state: AppState): Promise<void>
  /** Guardado síncrono para el cierre de la ventana. */
  saveStateSync(state: AppState): void
  pickAudioFiles(): Promise<Track[]>
  pickAudioFolder(): Promise<Track[]>
  mediaUrl(filePath: string): string
  openExternal(url: string): Promise<void>
  nowPlaying: NowPlayingApi
  google: GoogleApi
  notion: NotionApi
  browsers: BrowsersApi
  data: DataApi
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
  npCommand: 'nido:np-command',
  google: {
    status: 'nido:google:status',
    setCredentials: 'nido:google:set-credentials',
    connect: 'nido:google:connect',
    disconnect: 'nido:google:disconnect',
    calendars: 'nido:google:calendars',
    events: 'nido:google:events',
    createEvent: 'nido:google:create-event',
    updateEvent: 'nido:google:update-event',
    deleteEvent: 'nido:google:delete-event'
  },
  notion: {
    status: 'nido:notion:status',
    setToken: 'nido:notion:set-token',
    disconnect: 'nido:notion:disconnect',
    search: 'nido:notion:search',
    schema: 'nido:notion:schema',
    query: 'nido:notion:query',
    create: 'nido:notion:create',
    update: 'nido:notion:update'
  },
  browsers: {
    list: 'nido:browsers:list',
    addCustom: 'nido:browsers:add-custom',
    removeCustom: 'nido:browsers:remove-custom',
    open: 'nido:browsers:open'
  },
  data: {
    exportConfig: 'nido:data:export',
    importConfig: 'nido:data:import',
    backupCurrent: 'nido:data:backup',
    openDataFolder: 'nido:data:open-folder'
  }
} as const

export const MEDIA_SCHEME = 'nido-media'

/** AppUserModelId de Nido (se excluye de «Ahora suena»). */
export const APP_ID = 'app.nido.desktop'
