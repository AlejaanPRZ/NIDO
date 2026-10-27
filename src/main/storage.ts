import { app } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import type { AppState } from '../shared/types'

// Todo se guarda como JSON en %APPDATA%/Nido. Las escrituras son atómicas
// (archivo temporal + rename) y se encadenan para que nunca se pisen.

const dataDir = (): string => app.getPath('userData')
const statePath = (): string => join(dataDir(), 'nido-state.json')
const windowPath = (): string => join(dataDir(), 'window.json')

let writeQueue: Promise<void> = Promise.resolve()

function readJson<T>(path: string): T | null {
  if (!fs.existsSync(path)) return null
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as T
  } catch (err) {
    // Archivo dañado: se aparta para no perderlo y se arranca con valores por defecto.
    const backup = `${path}.corrupt-${Date.now()}`
    fs.renameSync(path, backup)
    console.error(`[nido] JSON inválido en ${path}, movido a ${backup}`, err)
    return null
  }
}

function writeJsonSync(path: string, value: unknown): void {
  fs.mkdirSync(dataDir(), { recursive: true })
  const tmp = `${path}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, path)
}

export function loadState(): AppState | null {
  const state = readJson<AppState>(statePath())
  return state && state.version === 1 ? state : null
}

export function saveState(state: AppState): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      await fs.promises.mkdir(dataDir(), { recursive: true })
      const tmp = `${statePath()}.tmp`
      await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
      await fs.promises.rename(tmp, statePath())
    })
    .catch((err) => console.error('[nido] error guardando estado', err))
  return writeQueue
}

export function saveStateSync(state: AppState): void {
  writeJsonSync(statePath(), state)
}

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export function loadWindowState(): WindowState {
  return readJson<WindowState>(windowPath()) ?? { width: 1400, height: 900, maximized: false }
}

export function saveWindowState(state: WindowState): void {
  writeJsonSync(windowPath(), state)
}
