export const uid = (): string => crypto.randomUUID()

/** Fecha local en formato YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
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
