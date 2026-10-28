import { dialog, protocol, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import { basename, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { MEDIA_SCHEME, type Track } from '../shared/types'
import { IMAGE_MIME, isAllowedImage } from './files'

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm'
}

const MAX_FOLDER_TRACKS = 2000

const isAudio = (p: string): boolean => extname(p).toLowerCase() in AUDIO_MIME
const toTrack = (p: string): Track => ({ path: p, name: basename(p, extname(p)) })

/** Debe llamarse antes de `app.ready`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
  ])
}

/**
 * Sirve archivos locales en nido-media://local/<ruta codificada>:
 * audio (con soporte de Range para poder buscar en la pista) e imágenes,
 * estas solo si el usuario eligió el archivo o su carpeta.
 */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (isAllowedImage(filePath)) {
      try {
        const data = await fs.promises.readFile(filePath)
        return new Response(data, { headers: { 'Content-Type': IMAGE_MIME[extname(filePath).toLowerCase()], 'Cache-Control': 'max-age=3600' } })
      } catch {
        return new Response('No encontrado', { status: 404 })
      }
    }
    if (!isAudio(filePath)) return new Response('Tipo no permitido', { status: 403 })

    let size: number
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) throw new Error('no es un archivo')
      size = stat.size
    } catch {
      return new Response('No encontrado', { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': AUDIO_MIME[extname(filePath).toLowerCase()],
      'Accept-Ranges': 'bytes'
    }
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
    let start = 0
    let end = size - 1
    let status = 200
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1])
        if (range[2]) end = Math.min(Number(range[2]), size - 1)
      } else {
        // bytes=-N → los últimos N bytes
        start = Math.max(0, size - Number(range[2]))
      }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    }
    headers['Content-Length'] = String(end - start + 1)
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream
    return new Response(stream, { status, headers })
  })
}

export async function pickAudioFiles(win: BrowserWindow | null): Promise<Track[]> {
  const options: Electron.OpenDialogOptions = {
    title: 'Añadir canciones',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: Object.keys(AUDIO_MIME).map((e) => e.slice(1)) }]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths.filter(isAudio).map(toTrack)
}

export async function pickAudioFolder(win: BrowserWindow | null): Promise<Track[]> {
  const options: Electron.OpenDialogOptions = { title: 'Añadir carpeta de música', properties: ['openDirectory'] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return []

  const found: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= MAX_FOLDER_TRACKS) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && isAudio(full)) found.push(full)
    }
  }
  await walk(result.filePaths[0])
  return found.sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map(toTrack)
}
