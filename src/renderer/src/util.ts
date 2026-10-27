export const uid = (): string => crypto.randomUUID()

/** Fecha local en formato YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Segundos → "m:ss" o "h:mm:ss". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** "2:35", "02:35", "1:02:35" o "155" → segundos; null si no es válido. */
export function parseTime(input: string): number | null {
  const value = input.trim().replace(/[.,]/g, ':')
  if (/^\d+$/.test(value)) return Number(value)
  const parts = value.split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null
  const nums = parts.map(Number)
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]]
  if (s >= 60 || (nums.length === 3 && m >= 60)) return null
  return h * 3600 + m * 60 + s
}

// ---------- Fechas ----------

export const DAY_MS = 86_400_000

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes())
}

/** Lunes de la semana de `d`. */
export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7))
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "YYYY-MM-DD" → fecha local a medianoche (sin el desfase UTC de new Date(str)). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Inicio de un evento (todo el día o con hora) como Date local. */
export function eventDate(value: string, allDay: boolean): Date {
  return allDay ? fromDateKey(value.slice(0, 10)) : new Date(value)
}

/** Date → ISO 8601 con la zona local (2026-10-27T15:30:00+01:00), como espera Google. */
export function toLocalIso(d: Date): string {
  const pad = (n: number): string => String(Math.abs(n)).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
}

export const timeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "en 25 minutos", "hace 2 horas", "mañana"… */
export function relativeTime(target: Date, now = new Date()): string {
  const diff = target.getTime() - now.getTime()
  const minutes = Math.round(diff / 60_000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(diff / 3_600_000)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  return relative.format(Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / DAY_MS), 'day')
}

/** Texto sin mayúsculas ni tildes, para buscar. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Nombre legible de una app a partir de su AppUserModelId de Windows. */
export function appName(appId: string): string {
  const id = appId.toLowerCase()
  const known: [string, string][] = [
    ['applemusic', 'Apple Music'],
    ['itunes', 'iTunes'],
    ['spotify', 'Spotify'],
    ['tidal', 'TIDAL'],
    ['deezer', 'Deezer'],
    ['amazon', 'Amazon Music'],
    ['zunemusic', 'Reproductor multimedia'],
    ['zunevideo', 'Películas y TV'],
    ['vlc', 'VLC'],
    ['opera', 'Opera'],
    ['msedge', 'Edge'],
    ['chrome', 'Chrome'],
    ['firefox', 'Firefox'],
    ['brave', 'Brave']
  ]
  const match = known.find(([needle]) => id.includes(needle))
  if (match) return match[1]
  const last = appId.split(/[\\/!]/).filter(Boolean).pop() ?? appId
  return last.replace(/\.exe$/i, '')
}

/**
 * Apple Music para Windows manda "Artista — Álbum" en el campo de artista y
 * deja el álbum vacío; aquí se separan.
 */
export function splitArtist(artist: string, album: string): { artist: string; album: string } {
  if (!album && artist.includes(' — ')) {
    const [a, ...rest] = artist.split(' — ')
    return { artist: a, album: rest.join(' — ') }
  }
  return { artist, album }
}

/** Convierte lo que escribe el usuario en una URL navegable (o una búsqueda). */
export function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value) || /^localhost(:\d+)?(\/.*)?$/.test(value)) {
    return `https://${value}`
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
}
