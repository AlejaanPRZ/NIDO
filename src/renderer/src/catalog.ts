import type { WidgetDataMap, WidgetType } from '../../shared/types'
import type { IconName } from './icons'

// Catálogo de widgets. Cada entrada declara con honestidad cómo funciona:
//   local    → funciona en este equipo, sin cuenta
//   nativo   → interfaz propia con datos de un servicio por su API oficial
//   sistema  → usa funciones de Windows (p. ej. controles multimedia)
//   web      → panel web integrado (vista aislada); el servicio puede impedir el inicio de sesión
//   externo  → abre la app o el navegador; Nido no muestra su contenido
// Lo que aún no está hecho va como «proximamente» y no se puede añadir.

export type CatalogMode = 'local' | 'nativo' | 'sistema' | 'web' | 'externo'

export type CatalogCategory =
  | 'productividad'
  | 'notas'
  | 'musica'
  | 'comunicacion'
  | 'informacion'
  | 'herramientas'
  | 'sistema'

export const CATEGORIES: { id: CatalogCategory; label: string; icon: IconName }[] = [
  { id: 'productividad', label: 'Productividad', icon: 'tasks' },
  { id: 'notas', label: 'Notas y archivos', icon: 'notes' },
  { id: 'musica', label: 'Música y vídeo', icon: 'music' },
  { id: 'comunicacion', label: 'Comunicación', icon: 'chat' },
  { id: 'informacion', label: 'Información', icon: 'cloudSun' },
  { id: 'herramientas', label: 'Herramientas web', icon: 'web' },
  { id: 'sistema', label: 'Equipo', icon: 'gauge' }
]

export const MODE_LABEL: Record<CatalogMode, string> = {
  local: 'Local',
  nativo: 'Integración',
  sistema: 'Windows',
  web: 'Panel web',
  externo: 'Acceso externo'
}

export interface CatalogEntry {
  id: string
  title: string
  description: string
  category: CatalogCategory
  icon: IconName
  /** Color del icono en la tarjeta */
  tint: string
  mode: CatalogMode
  account: boolean
  /** Qué hay que configurar (si algo) */
  setup?: string
  /** Limitación conocida, dicha claramente */
  note?: string
  status: 'disponible' | 'proximamente'
  widget?: WidgetType
  data?: Partial<WidgetDataMap[WidgetType]>
  widgetTitle?: string
}

const C = {
  blue: '#0a84ff',
  green: '#30d158',
  orange: '#ff9f0a',
  red: '#ff453a',
  pink: '#ff375f',
  purple: '#bf5af2',
  indigo: '#5e5ce6',
  teal: '#40c8e0',
  yellow: '#ffd60a',
  gray: '#8e8e93'
}

const web = (
  id: string,
  title: string,
  url: string,
  category: CatalogCategory,
  icon: IconName,
  tint: string,
  description: string,
  note?: string,
  account = true
): CatalogEntry => ({
  id,
  title,
  description,
  category,
  icon,
  tint,
  mode: 'web',
  account,
  status: 'disponible',
  widget: 'web',
  data: { url },
  widgetTitle: title,
  note
})

const soon = (id: string, title: string, category: CatalogCategory, icon: IconName, tint: string, description: string): CatalogEntry => ({
  id,
  title,
  description,
  category,
  icon,
  tint,
  mode: 'nativo',
  account: true,
  status: 'proximamente'
})

const GOOGLE_LOGIN = 'Google puede bloquear el inicio de sesión dentro de apps. Si pasa, usa «Abrir fuera».'
const MS_LOGIN = 'Si Microsoft no permite iniciar sesión en el panel, ábrelo fuera.'

export const CATALOG: CatalogEntry[] = [
  // ---------- Productividad ----------
  { id: 'tasks', title: 'Tareas', description: 'Lista con subtareas, prioridades, fechas y filtros.', category: 'productividad', icon: 'tasks', tint: C.blue, mode: 'local', account: false, status: 'disponible', widget: 'tasks' },
  { id: 'calendar', title: 'Calendario', description: 'Agenda, día, semana y mes con avisos de escritorio.', category: 'productividad', icon: 'calendar', tint: C.red, mode: 'local', account: false, status: 'disponible', widget: 'calendar' },
  {
    id: 'google-calendar',
    title: 'Google Calendar',
    description: 'Tus calendarios de Google: ver, crear, editar y borrar eventos.',
    category: 'productividad',
    icon: 'calendar',
    tint: '#4285f4',
    mode: 'nativo',
    account: true,
    setup: 'Necesita un cliente OAuth de Google (asistente en Ajustes → Conexiones).',
    status: 'disponible',
    widget: 'calendar',
    data: { source: 'google', view: 'agenda' },
    widgetTitle: 'Google Calendar'
  },
  {
    id: 'notion-tasks',
    title: 'Notion · tareas',
    description: 'Una base de datos de Notion como lista de tareas, con filtros.',
    category: 'productividad',
    icon: 'database',
    tint: '#191919',
    mode: 'nativo',
    account: true,
    setup: 'Necesita un token de integración interna de Notion.',
    status: 'disponible',
    widget: 'tasks',
    data: { source: 'notion' },
    widgetTitle: 'Notion'
  },
  { id: 'pomodoro', title: 'Pomodoro', description: 'Bloques de foco y descanso con duración configurable.', category: 'productividad', icon: 'timer', tint: C.red, mode: 'local', account: false, status: 'disponible', widget: 'pomodoro' },
  { id: 'timer', title: 'Temporizador y cronómetro', description: 'Cuenta atrás con aviso y cronómetro con vueltas.', category: 'productividad', icon: 'stopwatch', tint: C.orange, mode: 'local', account: false, status: 'disponible', widget: 'timer' },
  { id: 'habits', title: 'Hábitos', description: 'Marca cada día lo que cumples y sigue tus rachas.', category: 'productividad', icon: 'flame', tint: C.orange, mode: 'local', account: false, status: 'disponible', widget: 'habits' },
  { id: 'calculator', title: 'Calculadora', description: 'Operaciones con paréntesis, porcentajes e historial.', category: 'productividad', icon: 'calculator', tint: C.gray, mode: 'local', account: false, status: 'disponible', widget: 'calculator' },
  soon('outlook-calendar', 'Calendario de Outlook', 'productividad', 'calendar', '#0078d4', 'Eventos de Microsoft 365 / Outlook.com mediante Microsoft Graph.'),
  soon('ms-todo', 'Microsoft To Do', 'productividad', 'tasks', '#2564cf', 'Listas y tareas de Microsoft To Do.'),
  soon('todoist', 'Todoist', 'productividad', 'tasks', '#e44332', 'Proyectos y tareas de Todoist.'),
  soon('trello', 'Trello', 'productividad', 'layout', '#0079bf', 'Tableros y tarjetas de Trello.'),
  soon('asana', 'Asana', 'productividad', 'tasks', '#f06a6a', 'Tareas asignadas en Asana.'),
  soon('clickup', 'ClickUp', 'productividad', 'tasks', '#7b68ee', 'Tareas y listas de ClickUp.'),
  soon('github', 'GitHub', 'productividad', 'code', '#24292f', 'Issues, pull requests y notificaciones.'),

  // ---------- Notas y archivos ----------
  { id: 'notes', title: 'Notas', description: 'Texto con negrita, títulos, listas y casillas. Se guarda solo.', category: 'notas', icon: 'notes', tint: C.yellow, mode: 'local', account: false, status: 'disponible', widget: 'notes' },
  { id: 'launcher', title: 'Aplicaciones y carpetas', description: 'Accesos a programas, carpetas y documentos que elijas.', category: 'notas', icon: 'apps', tint: C.indigo, mode: 'local', account: false, status: 'disponible', widget: 'launcher' },
  { id: 'recent', title: 'Recientes', description: 'Lo que has abierto desde Nido. No lee el historial de Windows.', category: 'notas', icon: 'clock', tint: C.gray, mode: 'local', account: false, status: 'disponible', widget: 'recent' },
  { id: 'images', title: 'Imágenes', description: 'Pase de fotos de una carpeta de tu equipo.', category: 'notas', icon: 'image', tint: C.teal, mode: 'local', account: false, status: 'disponible', widget: 'images' },
  web('drive-web', 'Google Drive (web)', 'https://drive.google.com', 'notas', 'folder', '#1fa463', 'Tu Drive en un panel integrado.', GOOGLE_LOGIN),
  web('onedrive-web', 'OneDrive (web)', 'https://onedrive.live.com', 'notas', 'cloud', '#0078d4', 'Tus archivos de OneDrive en un panel integrado.', MS_LOGIN),
  web('dropbox-web', 'Dropbox (web)', 'https://www.dropbox.com/home', 'notas', 'package', '#0061ff', 'Tus archivos de Dropbox en un panel integrado.'),
  soon('drive', 'Google Drive', 'notas', 'folder', '#1fa463', 'Archivos recientes y búsqueda en Drive con su API.'),
  soon('onedrive', 'OneDrive', 'notas', 'cloud', '#0078d4', 'Archivos de OneDrive con Microsoft Graph.'),
  soon('dropbox', 'Dropbox', 'notas', 'package', '#0061ff', 'Archivos de Dropbox con su API.'),
  soon('obsidian', 'Obsidian', 'notas', 'notes', '#7c3aed', 'Notas de una bóveda local de Obsidian.'),

  // ---------- Música y vídeo ----------
  {
    id: 'now-playing',
    title: 'Ahora suena',
    description: 'Ve y controla lo que suena en Spotify, Apple Music, el navegador…',
    category: 'musica',
    icon: 'music',
    tint: C.pink,
    mode: 'sistema',
    account: false,
    note: 'Usa los controles multimedia de Windows: cada app decide qué permite (pausa, saltar, buscar…).',
    status: 'disponible',
    widget: 'music',
    data: { source: 'system' },
    widgetTitle: 'Ahora suena'
  },
  {
    id: 'local-music',
    title: 'Reproductor local',
    description: 'Tus archivos de audio con cola, aleatorio, repetición y saltos a un minuto.',
    category: 'musica',
    icon: 'music',
    tint: C.pink,
    mode: 'local',
    account: false,
    status: 'disponible',
    widget: 'music',
    data: { source: 'local' },
    widgetTitle: 'Música'
  },
  { id: 'radio', title: 'Radio y podcasts', description: 'Emisoras o episodios por su URL de audio directa.', category: 'musica', icon: 'radio', tint: C.purple, mode: 'local', account: false, setup: 'Añade la URL del stream (MP3/AAC/OGG).', status: 'disponible', widget: 'radio' },
  web('youtube', 'YouTube', 'https://www.youtube.com', 'musica', 'video', '#ff0000', 'YouTube en un panel integrado.', GOOGLE_LOGIN, false),
  web('spotify-web', 'Spotify (web)', 'https://open.spotify.com', 'musica', 'music', '#1db954', 'El reproductor web de Spotify en un panel integrado.', 'La reproducción web puede requerir un navegador compatible con su DRM; si no suena, ábrelo fuera.'),
  soon('spotify', 'Spotify (API)', 'musica', 'music', '#1db954', 'Biblioteca y listas de Spotify con su API oficial.'),

  // ---------- Comunicación ----------
  web('gmail', 'Gmail', 'https://mail.google.com', 'comunicacion', 'mail', '#ea4335', 'Tu correo de Gmail en un panel integrado.', GOOGLE_LOGIN),
  web('outlook-mail', 'Outlook (web)', 'https://outlook.live.com/mail', 'comunicacion', 'mail', '#0078d4', 'Correo de Outlook en un panel integrado.', MS_LOGIN),
  web('whatsapp', 'WhatsApp Web', 'https://web.whatsapp.com', 'comunicacion', 'chat', '#25d366', 'WhatsApp Web; se vincula con el código QR del móvil.', 'Si WhatsApp no admite el panel, usa «Abrir fuera».'),
  web('telegram', 'Telegram Web', 'https://web.telegram.org', 'comunicacion', 'chat', '#26a5e4', 'Telegram en un panel integrado.'),
  web('discord', 'Discord', 'https://discord.com/app', 'comunicacion', 'chat', '#5865f2', 'Discord en un panel integrado.'),
  web('slack', 'Slack', 'https://app.slack.com/client', 'comunicacion', 'chat', '#4a154b', 'Slack en un panel integrado.'),
  web('teams', 'Microsoft Teams', 'https://teams.microsoft.com', 'comunicacion', 'chat', '#5059c9', 'Teams en un panel integrado.', MS_LOGIN),
  soon('gmail-native', 'Gmail (bandeja nativa)', 'comunicacion', 'mail', '#ea4335', 'Correos sin leer con la API de Gmail.'),
  soon('slack-native', 'Slack (nativo)', 'comunicacion', 'chat', '#4a154b', 'Menciones y mensajes con la API de Slack.'),

  // ---------- Información ----------
  { id: 'weather', title: 'Tiempo', description: 'Ahora y los próximos días en tu ciudad.', category: 'informacion', icon: 'cloudSun', tint: C.blue, mode: 'nativo', account: false, setup: 'Elige una ciudad.', note: 'Datos de Open-Meteo (CC BY 4.0).', status: 'disponible', widget: 'weather' },
  { id: 'rss', title: 'Noticias RSS', description: 'Titulares de los feeds RSS o Atom que añadas.', category: 'informacion', icon: 'rss', tint: C.orange, mode: 'nativo', account: false, setup: 'Añade la URL de un feed.', status: 'disponible', widget: 'rss' },
  { id: 'holidays', title: 'Festivos y cuentas atrás', description: 'Próximos festivos de tu país y tus fechas importantes.', category: 'informacion', icon: 'flag', tint: C.red, mode: 'nativo', account: false, note: 'Festivos de Nager.Date.', status: 'disponible', widget: 'holidays' },
  { id: 'converter', title: 'Conversor', description: 'Unidades sin conexión y divisas con tipos del BCE.', category: 'informacion', icon: 'swap', tint: C.green, mode: 'local', account: false, note: 'Divisas de Frankfurter (Banco Central Europeo), con su fecha.', status: 'disponible', widget: 'converter' },
  { id: 'worldclock', title: 'Relojes del mundo', description: 'La hora de varias ciudades de un vistazo.', category: 'informacion', icon: 'globeClock', tint: C.indigo, mode: 'local', account: false, status: 'disponible', widget: 'worldclock' },
  soon('packages', 'Seguimiento de paquetes', 'informacion', 'package', C.orange, 'Pendiente de un proveedor con API pública viable.'),

  // ---------- Herramientas web ----------
  { id: 'search', title: 'Buscador', description: 'Busca en DuckDuckGo, Google, Bing, Wikipedia… en tu navegador.', category: 'herramientas', icon: 'search', tint: C.blue, mode: 'externo', account: false, status: 'disponible', widget: 'search' },
  { id: 'links', title: 'Enlaces', description: 'Enlaces y grupos que se abren en el navegador que elijas.', category: 'herramientas', icon: 'link', tint: C.indigo, mode: 'externo', account: false, status: 'disponible', widget: 'links' },
  { id: 'web', title: 'Panel web', description: 'Cualquier página por URL dentro de Nido.', category: 'herramientas', icon: 'web', tint: C.teal, mode: 'web', account: false, note: 'Algunas webs no permiten iniciar sesión en apps; para esas, usa «Abrir fuera».', status: 'disponible', widget: 'web', widgetTitle: 'Panel web' },
  web('translate', 'Traductor de Google', 'https://translate.google.com', 'herramientas', 'translate', '#4285f4', 'Traduce texto en un panel integrado.', undefined, false),
  web('deepl', 'DeepL', 'https://www.deepl.com/translator', 'herramientas', 'translate', '#0f2b46', 'El traductor de DeepL en un panel integrado.', undefined, false),
  web('chatgpt', 'ChatGPT', 'https://chatgpt.com', 'herramientas', 'sparkle', '#10a37f', 'ChatGPT en un panel integrado.', 'Si el inicio de sesión con Google falla, usa correo o «Abrir fuera».'),
  web('claude', 'Claude', 'https://claude.ai', 'herramientas', 'sparkle', '#d97757', 'Claude en un panel integrado.', 'Si el inicio de sesión con Google falla, usa correo o «Abrir fuera».'),
  web('gemini', 'Gemini', 'https://gemini.google.com', 'herramientas', 'sparkle', '#4285f4', 'Gemini en un panel integrado.', GOOGLE_LOGIN),
  web('perplexity', 'Perplexity', 'https://www.perplexity.ai', 'herramientas', 'sparkle', '#20808d', 'Perplexity en un panel integrado.', undefined, false),

  // ---------- Equipo ----------
  { id: 'system', title: 'Sistema', description: 'Uso de CPU, memoria y batería en tiempo real.', category: 'sistema', icon: 'gauge', tint: C.green, mode: 'local', account: false, note: 'La batería solo aparece en equipos con batería.', status: 'disponible', widget: 'system' }
]

export const catalogById = (id: string | undefined): CatalogEntry | undefined => CATALOG.find((e) => e.id === id)
