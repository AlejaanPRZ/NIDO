import { app, dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import { IPC, type AppState } from '../shared/types'
import { handleResult, NidoError } from './errors'

// Todo se guarda como JSON en %APPDATA%/Nido. Las escrituras son atómicas
// (archivo temporal + rename) y se encadenan para que nunca se pisen.

const dataDir = (): string => app.getPath('userData')
const statePath = (): string => join(dataDir(), 'nido-state.json')
const windowPath = (): string => join(dataDir(), 'window.json')
const backupsDir = (): string => join(dataDir(), 'backups')

let writeQueue: Promise<void> = Promise.resolve()

function readJson<T>(path: string): T | null {
  if (!fs.existsSync(path)) return null
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8').replace(/^﻿/, '')) as T
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

/**
 * Devuelve el estado tal cual (v1 o v2); la migración la hace el renderer.
 * Antes de que una versión antigua se sobrescriba, se guarda una copia una sola vez.
 */
export function loadState(): unknown {
  const state = readJson<{ version?: number }>(statePath())
  if (!state || typeof state !== 'object') return null
  const CURRENT = 3
  if (typeof state.version !== 'number' || state.version > CURRENT) return null
  if (state.version < CURRENT) {
    const backup = join(dataDir(), `nido-state.v${state.version}-backup.json`)
    if (!fs.existsSync(backup)) fs.copyFileSync(statePath(), backup)
  }
  return state
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

const MAX_IMPORT_BYTES = 20 * 1024 * 1024

async function exportConfig(win: BrowserWindow | null, json: string): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: 'Exportar configuración de Nido',
    defaultPath: `nido-configuracion-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await fs.promises.writeFile(result.filePath, json, 'utf8')
  return result.filePath
}

async function importConfig(win: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Importar configuración de Nido',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  const { size } = await fs.promises.stat(path)
  if (size > MAX_IMPORT_BYTES) throw new NidoError('invalid', 'El archivo es demasiado grande para ser una configuración de Nido.')
  return (await fs.promises.readFile(path, 'utf8')).replace(/^﻿/, '')
}

/** Copia el estado actual a backups/ antes de reemplazarlo (por ejemplo, al importar). */
async function backupCurrent(): Promise<string> {
  await writeQueue
  await fs.promises.mkdir(backupsDir(), { recursive: true })
  const target = join(backupsDir(), `nido-state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  if (fs.existsSync(statePath())) await fs.promises.copyFile(statePath(), target)
  return target
}

export function registerData(getWindow: () => BrowserWindow | null): void {
  handleResult(IPC.data.exportConfig, (json: string) => exportConfig(getWindow(), String(json)))
  handleResult(IPC.data.importConfig, () => importConfig(getWindow()))
  handleResult(IPC.data.backupCurrent, () => backupCurrent())
  handleResult(IPC.data.openDataFolder, async () => {
    await shell.openPath(dataDir())
    return null
  })
}
