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
  /** Markdown sencillo: **negrita**, *cursiva*, # títulos, - listas, - [ ] casillas */
  text: string
  mode?: 'edit' | 'view'
}

export type Priority = 'alta' | 'media' | 'baja'

export interface Subtask {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id: string
  text: string
  done: boolean
  createdAt: number
  priority?: Priority
  /** YYYY-MM-DD */
  due?: string
  subtasks?: Subtask[]
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

/** Casillas (bloques to_do) de una página normal de Notion. */
export interface NotionPageConfig {
  pageId: string
  name: string
}

export interface TasksData {
  tasks: Task[]
  source?: 'local' | 'notion'
  notion?: NotionTaskConfig
  /** Si está, el widget usa las casillas de esta página en vez de una base de datos */
  notionPage?: NotionPageConfig
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
  /** Barra de dirección de Nido visible (si no, la navegación va en la cabecera del widget) */
  bar?: boolean
  /** No se suspende aunque no se vea (p. ej. una llamada o un chat que debe seguir conectado) */
  keepAlive?: boolean
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

/** Temporizador que sobrevive a reinicios: si está en marcha se guarda la hora de fin. */
export interface CountdownState {
  running: boolean
  /** Epoch ms en que termina (si está en marcha) */
  endsAt?: number
  /** Segundos que quedan (si está en pausa) */
  remaining: number
}

export type PomodoroPhase = 'focus' | 'short' | 'long'

export interface PomodoroData {
  /** Minutos */
  focus: number
  short: number
  long: number
  /** Sesiones de foco antes del descanso largo */
  rounds: number
  autoStart: boolean
  phase: PomodoroPhase
  round: number
  clock: CountdownState
  /** Sesiones completadas hoy */
  completed: { day: string; count: number }
}

export interface TimerData {
  mode: 'timer' | 'stopwatch'
  /** Segundos del temporizador */
  duration: number
  timer: CountdownState
  stopwatch: { running: boolean; startedAt?: number; elapsed: number; laps: number[] }
}

export interface WorldClockData {
  zones: { id: string; label: string; tz: string }[]
}

export interface CalculatorData {
  history: { expr: string; result: string; at: number }[]
}

export interface Habit {
  id: string
  name: string
  color: string
  /** Días cumplidos, YYYY-MM-DD */
  days: string[]
}

export interface HabitsData {
  habits: Habit[]
}

/** Elemento de un lanzador: apunta a un id que el proceso principal tiene en su lista permitida. */
export interface LauncherItem {
  id: string
  name: string
  kind: 'app' | 'folder' | 'file'
}

export interface LauncherData {
  items: LauncherItem[]
}

export interface ImagesData {
  /** Ids de carpetas o imágenes elegidas por el usuario (lista permitida en main) */
  sources: { id: string; name: string; kind: 'folder' | 'file' }[]
  /** Segundos entre imágenes; 0 = manual */
  interval: number
  fit: 'cover' | 'contain'
}

export interface RecentData {
  limit: number
}

export interface SystemData {
  show: { cpu: boolean; memory: boolean; battery: boolean }
}

export interface Place {
  name: string
  admin?: string
  country?: string
  lat: number
  lon: number
}

export interface WeatherData {
  place?: Place
  units: 'c' | 'f'
}

export interface RssData {
  feeds: { id: string; url: string; title?: string }[]
  limit: number
}

export interface HolidaysData {
  /** ISO 3166-1 alfa-2 */
  country: string
  countdowns: { id: string; title: string; date: string }[]
}

export interface ConverterData {
  mode: 'units' | 'currency'
  units: { category: string; from: string; to: string; value: string }
  currency: { from: string; to: string; amount: string }
}

export interface SearchData {
  engine: string
  /** Navegador externo; undefined = el de Ajustes */
  browserId?: string
}

export interface RadioData {
  stations: { id: string; name: string; url: string }[]
  current?: string
  volume: number
}

export interface WidgetDataMap {
  notes: NotesData
  tasks: TasksData
  calendar: CalendarData
  music: MusicData
  web: WebData
  links: LinksData
  pomodoro: PomodoroData
  timer: TimerData
  worldclock: WorldClockData
  calculator: CalculatorData
  habits: HabitsData
  launcher: LauncherData
  images: ImagesData
  recent: RecentData
  system: SystemData
  weather: WeatherData
  rss: RssData
  holidays: HolidaysData
  converter: ConverterData
  search: SearchData
  radio: RadioData
}

export type WidgetType = keyof WidgetDataMap

interface WidgetBase {
  id: string
  title: string
  collapsed?: boolean
  /** Altura antes de plegar, para restaurarla */
  restoreH?: number
  /** Fijado: no se mueve ni redimensiona al organizar o arrastrar otros */
  pinned?: boolean
  /** Entrada del catálogo de la que salió (p. ej. un panel web predefinido) */
  catalogId?: string
}

export type Widget = {
  [K in WidgetType]: WidgetBase & { type: K; data: WidgetDataMap[K] }
}[WidgetType]

export type WidgetOf<K extends WidgetType> = Extract<Widget, { type: K }>

// ---------- Estado global ----------

export type Theme = 'system' | 'light' | 'dark'
/** Estilo de color (Ajustes → Estilo); cada uno tiene versión clara y oscura */
export type Palette = 'nido' | 'terra' | 'bosque' | 'aurora' | 'grafito'

export interface Workspace {
  id: string
  name: string
  /** Nombre de un icono de icons.tsx */
  icon: string
  /** Color de acento del espacio (hex) */
  color: string
  widgets: Widget[]
  layout: LayoutItem[]
}

export interface Settings {
  theme: Theme
  palette: Palette
  /** Los degradados del fondo se mueven despacio */
  animatedBackground: boolean
  /** Minutos sin verse tras los que un panel web se suspende para liberar memoria; 0 = nunca */
  suspendWebAfter: number
  /** Mascota (un braco en pixel art) paseando por el borde inferior */
  mascot: boolean
  /** Al cerrar la ventana, Nido sigue en la bandeja del sistema */
  closeToTray: boolean
  /** Atajo global para mostrar u ocultar Nido (acelerador de Electron); '' = sin atajo */
  globalShortcut: string
  locked: boolean
  reduceTransparency: boolean
  /** Intensidad del cristal (0–100): translucidez y desenfoque de las superficies */
  glass: number
  reduceMotion: boolean
  clock: { hour12: boolean; showSeconds: boolean; date: 'long' | 'short' | 'hidden' }
  welcomeSeen: boolean
  /** 'system' o el id de un navegador detectado/añadido */
  defaultBrowser: string
  /** Ids del catálogo marcados como favoritos */
  favorites: string[]
  /** Calendarios de Google que muestran por defecto los widgets (Ajustes); sin valor, los marcados en Google */
  googleCalendars?: string[]
}

export interface AppState {
  version: 3
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

export type ErrorCode = 'config' | 'auth' | 'cancelled' | 'conflict' | 'network' | 'notfound' | 'forbidden' | 'rate' | 'invalid' | 'unknown'

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
  /** Tipo de contenido que declara la app; algunas no lo dicen (Unknown) */
  kind?: 'Music' | 'Video' | 'Image' | 'Unknown'
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
  /** Esta copia de Nido trae su propio cliente OAuth (nido.oauth.json): basta con «Conectar con Google» */
  builtIn: boolean
  /** ID de un cliente propio del usuario (opciones avanzadas); vacío si usa el integrado */
  clientId: string
  hasClientSecret: boolean
  connected: boolean
  /** Google revocó o caducó el acceso: hay que volver a conectar */
  expired: boolean
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
  /** Borra el cliente propio y vuelve al integrado (si lo hay) */
  clearCredentials(): Promise<Result<GoogleStatus>>
  connect(): Promise<Result<GoogleStatus>>
  /** Cancela la espera de la autorización en el navegador */
  cancel(): Promise<Result<null>>
  disconnect(): Promise<Result<GoogleStatus>>
  /** Lista de calendarios (con force, sin caché) */
  calendars(force?: boolean): Promise<Result<GoogleCalendar[]>>
  events(query: GoogleEventsQuery): Promise<Result<GoogleEventsResult>>
  createEvent(calendarId: string, input: EventInput): Promise<Result<CalEvent>>
  updateEvent(calendarId: string, eventId: string, input: EventInput): Promise<Result<CalEvent>>
  deleteEvent(calendarId: string, eventId: string): Promise<Result<null>>
}

// ---------- Notion ----------

export interface NotionStatus {
  /** Esta copia de Nido tiene configurado el OAuth público de Notion (cliente + intercambiador) */
  oauth: boolean
  connected: boolean
  /** Cómo se conectó: autorización oficial de Notion o token de integración interna */
  method?: 'oauth' | 'internal'
  /** Notion rechazó el token guardado */
  expired: boolean
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
  /** Última edición en Notion (ISO; Notion la redondea al minuto) */
  lastEdited?: string
  properties: Record<string, NotionValue>
}

/** Resultado de «Comprobar acceso». */
export interface NotionAccess {
  workspace?: string
  /** Nombre de la integración (bot) con la que se conectó */
  bot?: string
  method?: 'oauth' | 'internal'
  /** Bases de datos (fuentes de datos) que la conexión puede ver */
  sources: number
  /** Las primeras que ve, para mostrarlas */
  list: NotionSource[]
  /** Páginas normales (no filas) que ve: pueden tener casillas */
  pages: NotionSource[]
  /** La base de datos elegida se puede leer (si se indicó) */
  readable?: boolean
  /** Tareas que devuelve esa base de datos */
  rows?: number
  /** Por qué no se puede leer (sin compartir o sin la capacidad necesaria) */
  problem?: string
}

export interface NotionApi {
  status(): Promise<Result<NotionStatus>>
  /** Autorización oficial en el navegador (elige espacio y páginas en Notion) */
  connect(): Promise<Result<NotionStatus>>
  cancel(): Promise<Result<null>>
  setToken(token: string): Promise<Result<NotionStatus>>
  disconnect(): Promise<Result<NotionStatus>>
  search(query: string): Promise<Result<NotionSource[]>>
  schema(dataSourceId: string): Promise<Result<NotionSchema>>
  query(dataSourceId: string): Promise<Result<NotionPage[]>>
  create(dataSourceId: string, values: Record<string, NotionValue>): Promise<Result<NotionPage>>
  /**
   * Cambia propiedades de una página. Con before (los valores que había al empezar a editar),
   * main comprueba antes que no hayan cambiado en Notion; si cambiaron, falla con 'conflict'.
   */
  update(pageId: string, values: Record<string, NotionValue>, before?: Record<string, NotionValue>): Promise<Result<NotionPage>>
  /** Comprueba el token, cuántas bases de datos ve y si puede leer la elegida */
  check(dataSourceId?: string): Promise<Result<NotionAccess>>
  /** Comprueba el enlace (o ID) de una base de datos y devuelve sus fuentes de datos legibles */
  resolve(link: string): Promise<Result<NotionLinkCheck>>
  /** Páginas normales compartidas con la conexión (no filas de bases de datos) */
  searchPages(query: string): Promise<Result<NotionSource[]>>
  /** Casillas de una página, recorriendo bloques anidados y paginando */
  todos(pageId: string): Promise<Result<NotionPageTodos>>
  /** Marca o desmarca una casilla; con before, falla con 'conflict' si cambió en Notion */
  setTodo(blockId: string, checked: boolean, before?: boolean): Promise<Result<NotionTodo>>
}

export interface NotionLinkCheck {
  /** Qué es el enlace: una base de datos (o fuente de datos) o una página normal */
  kind: 'database' | 'page'
  /** Nombre de la base de datos o de la página */
  title: string
  /** Fuentes de datos legibles (solo si es una base de datos) */
  sources: (NotionSource & { pages: number })[]
  /** Si es una página: sus casillas y las bases de datos que contiene */
  page?: NotionPageTodos
}

/** Una casilla (bloque to_do) de una página. */
export interface NotionTodo {
  id: string
  text: string
  checked: boolean
  /** 0 en el primer nivel; 1, 2… si está dentro de otra casilla */
  depth: number
  /** Encabezado bajo el que está, si lo hay */
  section?: string
}

export interface NotionPageTodos {
  id: string
  title: string
  url?: string
  todos: NotionTodo[]
  /** Bases de datos dentro de la página (bloques child_database) */
  databases: NotionSource[]
  /** La página es muy larga y no se leyó entera */
  truncated: boolean
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

// ---------- Archivos, aplicaciones e imágenes (lista permitida en main) ----------

export type PickKind = 'app' | 'folder' | 'file' | 'images' | 'imageFolder'

export interface PickedItem {
  id: string
  name: string
  path: string
  kind: 'app' | 'folder' | 'file'
}

export interface RecentItem {
  id: string
  name: string
  path: string
  kind: 'app' | 'folder' | 'file'
  at: number
}

export interface ImageEntry {
  name: string
  url: string
}

export interface FilesApi {
  /** Diálogo del sistema; lo elegido pasa a la lista permitida. */
  pick(kind: PickKind): Promise<Result<PickedItem[]>>
  /** Abre con la aplicación predeterminada y lo anota en «Recientes». */
  open(id: string): Promise<Result<null>>
  reveal(id: string): Promise<Result<null>>
  forget(id: string): Promise<Result<null>>
  /** Imágenes de una carpeta o archivo de la lista permitida. */
  images(id: string): Promise<Result<ImageEntry[]>>
  recent(): Promise<Result<RecentItem[]>>
  clearRecent(): Promise<Result<null>>
}

// ---------- Información pública sin cuenta ----------

export interface WeatherReport {
  current: { temperature: number; code: number; time: string }
  daily: { date: string; code: number; max: number; min: number }[]
  units: string
  fetchedAt: number
}

export interface Holiday {
  date: string
  localName: string
  name: string
  global: boolean
}

export interface CurrencyRates {
  base: string
  /** Fecha de los tipos según la fuente */
  date: string
  rates: Record<string, number>
  fetchedAt: number
}

export interface InfoApi {
  geocode(query: string): Promise<Result<Place[]>>
  weather(lat: number, lon: number, units: 'c' | 'f'): Promise<Result<WeatherReport>>
  /** XML del feed (se interpreta en el renderer con DOMParser) */
  feed(url: string): Promise<Result<string>>
  holidays(country: string, year: number): Promise<Result<Holiday[]>>
  rates(base: string): Promise<Result<CurrencyRates>>
}

export interface SystemStats {
  /** 0–100, media de todos los núcleos desde la lectura anterior */
  cpu: number
  cores: number
  memUsed: number
  memTotal: number
  uptime: number
}

/** API expuesta al renderer a través de contextBridge como `window.nido`. */
// ---------- App: bandeja, atajo global y actualizaciones ----------

export interface AppBehavior {
  closeToTray: boolean
  shortcut: string
}

export interface UpdateStatus {
  /** Versión instalada */
  current: string
  /**
   * unavailable: esta copia no tiene actualizaciones configuradas (desarrollo o sin publicar);
   * ready: descargada, se instala al reiniciar.
   */
  state: 'unavailable' | 'idle' | 'checking' | 'uptodate' | 'downloading' | 'ready' | 'error'
  version?: string
  /** 0–100 mientras se descarga */
  progress?: number
  message?: string
  checkedAt?: number
}

export interface AppApi {
  /** Aplica el comportamiento de la ventana; shortcutOk es false si otra app ya usa el atajo */
  setBehavior(behavior: AppBehavior): Promise<{ shortcutOk: boolean }>
  updateStatus(): Promise<UpdateStatus>
  checkUpdates(): Promise<UpdateStatus>
  /** Cierra Nido, instala la actualización descargada y lo vuelve a abrir */
  installUpdate(): Promise<void>
  onUpdate(listener: (status: UpdateStatus) => void): () => void
}

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
  files: FilesApi
  info: InfoApi
  system: { stats(): Promise<Result<SystemStats>> }
  app: AppApi
}

export const IPC = {
  app: {
    setBehavior: 'nido:app:behavior',
    updateStatus: 'nido:app:update-status',
    checkUpdates: 'nido:app:check-updates',
    installUpdate: 'nido:app:install-update'
  },
  updateEvent: 'nido:app:update-event',
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
    clearCredentials: 'nido:google:clear-credentials',
    connect: 'nido:google:connect',
    cancel: 'nido:google:cancel',
    disconnect: 'nido:google:disconnect',
    calendars: 'nido:google:calendars',
    events: 'nido:google:events',
    createEvent: 'nido:google:create-event',
    updateEvent: 'nido:google:update-event',
    deleteEvent: 'nido:google:delete-event'
  },
  notion: {
    status: 'nido:notion:status',
    connect: 'nido:notion:connect',
    cancel: 'nido:notion:cancel',
    setToken: 'nido:notion:set-token',
    disconnect: 'nido:notion:disconnect',
    search: 'nido:notion:search',
    schema: 'nido:notion:schema',
    query: 'nido:notion:query',
    create: 'nido:notion:create',
    update: 'nido:notion:update',
    check: 'nido:notion:check',
    resolve: 'nido:notion:resolve',
    searchPages: 'nido:notion:searchPages',
    todos: 'nido:notion:todos',
    setTodo: 'nido:notion:setTodo'
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
  },
  files: {
    pick: 'nido:files:pick',
    open: 'nido:files:open',
    reveal: 'nido:files:reveal',
    forget: 'nido:files:forget',
    images: 'nido:files:images',
    recent: 'nido:files:recent',
    clearRecent: 'nido:files:clear-recent'
  },
  info: {
    geocode: 'nido:info:geocode',
    weather: 'nido:info:weather',
    feed: 'nido:info:feed',
    holidays: 'nido:info:holidays',
    rates: 'nido:info:rates'
  },
  system: {
    stats: 'nido:system:stats'
  }
} as const

export const MEDIA_SCHEME = 'nido-media'

/** AppUserModelId de Nido (se excluye de «Ahora suena»). */
export const APP_ID = 'app.nido.desktop'
