import { app, dialog, shell, type BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { basename, dirname, extname, join, normalize } from 'node:path'
import { IPC, MEDIA_SCHEME, type ImageEntry, type PickedItem, type PickKind, type RecentItem } from '../shared/types'
import { handleResult, NidoError } from './errors'

// Aplicaciones, carpetas, documentos e imágenes que el usuario elige con un
// diálogo del sistema. Solo lo elegido entra en la lista permitida y el
// renderer se refiere a ello por id: nunca puede pedir abrir una ruta cualquiera.
// «Recientes» son únicamente los elementos abiertos desde Nido.

interface Stored extends PickedItem {}
interface FilesDb {
  items: Stored[]
  recent: RecentItem[]
}

export const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp'
}
const MAX_RECENT = 50
const MAX_IMAGES = 500

const dbPath = (): string => join(app.getPath('userData'), 'files.json')
let db: FilesDb | null = null

function load(): FilesDb {
  if (db) return db
  try {
    db = fs.existsSync(dbPath()) ? JSON.parse(fs.readFileSync(dbPath(), 'utf8')) : null
  } catch {
    db = null
  }
  db ??= { items: [], recent: [] }
  return db
}

function save(): void {
  const tmp = `${dbPath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), 'utf8')
  fs.renameSync(tmp, dbPath())
}

const idFor = (path: string): string => 'f_' + createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 12)
const isImage = (p: string): boolean => extname(p).toLowerCase() in IMAGE_MIME

function remember(path: string, kind: PickedItem['kind']): PickedItem {
  const item: Stored = { id: idFor(path), name: basename(path, kind === 'app' ? extname(path) : ''), path, kind }
  const data = load()
  data.items = [...data.items.filter((i) => i.id !== item.id), item]
  save()
  return item
}

function find(id: string): Stored {
  const item = load().items.find((i) => i.id === id)
  if (!item) throw new NidoError('notfound', 'Ese elemento ya no está en la lista de Nido. Vuelve a añadirlo.')
  if (!fs.existsSync(item.path)) throw new NidoError('notfound', `No se encuentra «${item.name}» en ${item.path}.`)
  return item
}

/** ¿Puede el protocolo nido-media servir esta imagen? Solo si se eligió ella o su carpeta. */
export function isAllowedImage(path: string): boolean {
  if (!isImage(path)) return false
  const target = normalize(path).toLowerCase()
  const folder = dirname(target)
  return load().items.some((i) => {
    const p = normalize(i.path).toLowerCase()
    return (i.kind === 'file' && p === target) || (i.kind === 'folder' && p === folder)
  })
}

async function pick(win: BrowserWindow | null, kind: PickKind): Promise<PickedItem[]> {
  const imageExts = Object.keys(IMAGE_MIME).map((e) => e.slice(1))
  const options: Electron.OpenDialogOptions =
    kind === 'app'
      ? { title: 'Elegir una aplicación', properties: ['openFile'], filters: [{ name: 'Aplicaciones y accesos directos', extensions: ['exe', 'lnk', 'appref-ms'] }] }
      : kind === 'folder' || kind === 'imageFolder'
        ? { title: kind === 'folder' ? 'Elegir una carpeta' : 'Elegir una carpeta de imágenes', properties: ['openDirectory'] }
        : kind === 'images'
          ? { title: 'Elegir imágenes', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imágenes', extensions: imageExts }] }
          : { title: 'Elegir documentos', properties: ['openFile', 'multiSelections'] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled) return []
  const itemKind: PickedItem['kind'] = kind === 'app' ? 'app' : kind === 'folder' || kind === 'imageFolder' ? 'folder' : 'file'
  return result.filePaths.map((p) => remember(p, itemKind))
}

async function open(id: string): Promise<null> {
  const item = find(id)
  const error = await shell.openPath(item.path)
  if (error) throw new NidoError('unknown', `Windows no pudo abrir «${item.name}»: ${error}`)
  const data = load()
  data.recent = [{ ...item, at: Date.now() }, ...data.recent.filter((r) => r.id !== id)].slice(0, MAX_RECENT)
  save()
  return null
}

async function images(id: string): Promise<ImageEntry[]> {
  const item = find(id)
  const toEntry = (p: string): ImageEntry => ({ name: basename(p), url: `${MEDIA_SCHEME}://local/${encodeURIComponent(p)}` })
  if (item.kind === 'file') return isImage(item.path) ? [toEntry(item.path)] : []
  const names = await fs.promises.readdir(item.path)
  return names
    .filter(isImage)
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .slice(0, MAX_IMAGES)
    .map((n) => toEntry(join(item.path, n)))
}

export function registerFiles(getWindow: () => BrowserWindow | null): void {
  handleResult(IPC.files.pick, (kind: PickKind) => pick(getWindow(), kind))
  handleResult(IPC.files.open, (id: string) => open(String(id)))
  handleResult(IPC.files.reveal, (id: string) => {
    shell.showItemInFolder(find(String(id)).path)
    return null
  })
  handleResult(IPC.files.forget, (id: string) => {
    const data = load()
    data.items = data.items.filter((i) => i.id !== id)
    save()
    return null
  })
  handleResult(IPC.files.images, (id: string) => images(String(id)))
  handleResult(IPC.files.recent, () => {
    // Se descartan los que ya no existen en disco.
    return load().recent.filter((r) => fs.existsSync(r.path))
  })
  handleResult(IPC.files.clearRecent, () => {
    load().recent = []
    save()
    return null
  })
}
