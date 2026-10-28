import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateStatus } from '../shared/types'
import { markQuitting } from './tray'

// Actualizaciones automáticas con electron-updater: busca al arrancar y cada 6 horas, descarga en
// segundo plano y se instala al reiniciar (o al pulsar «Reiniciar» en el aviso). Solo funciona en
// una copia instalada que se publicó con «publish» (npm run release): electron-builder deja entonces
// app-update.yml junto a la app. En desarrollo, NIDO_UPDATE_CONFIG=<yml> permite probar la búsqueda
// y la descarga contra un servidor propio (instalar no es posible fuera del instalador).

const { autoUpdater } = electronUpdater
const CHECK_EVERY_MS = 6 * 60 * 60_000
const FIRST_CHECK_MS = 15_000

let status: UpdateStatus = { current: app.getVersion(), state: 'unavailable' }
let getWindow: () => BrowserWindow | null = () => null

function publish(patch: Partial<UpdateStatus>): UpdateStatus {
  status = { ...status, ...patch, current: app.getVersion() }
  getWindow()?.webContents.send(IPC.updateEvent, status)
  return status
}

function configured(): string | null {
  const devConfig = !app.isPackaged ? process.env.NIDO_UPDATE_CONFIG : undefined
  if (devConfig) return fs.existsSync(devConfig) ? devConfig : null
  if (!app.isPackaged) return null
  const file = join(process.resourcesPath, 'app-update.yml')
  return fs.existsSync(file) ? file : null
}

function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(text)) return 'Sin conexión con el servidor de actualizaciones.'
  if (/404|Cannot find latest|No published versions/i.test(text)) return 'Todavía no hay ninguna versión publicada.'
  if (/sha512 checksum mismatch/i.test(text)) return 'La descarga llegó dañada; se volverá a intentar.'
  return `No se pudo comprobar: ${text.split('\n')[0].slice(0, 160)}`
}

async function check(): Promise<UpdateStatus> {
  if (status.state === 'unavailable') return status
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return status
  publish({ state: 'checking', message: undefined })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    publish({ state: 'error', message: describe(err), checkedAt: Date.now() })
  }
  return status
}

export function registerUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  ipcMain.handle(IPC.app.updateStatus, () => status)
  ipcMain.handle(IPC.app.checkUpdates, () => check())
  ipcMain.handle(IPC.app.installUpdate, () => {
    if (status.state !== 'ready') return
    markQuitting()
    // isSilent=false: el instalador se ve; isForceRunAfter=true: Nido se vuelve a abrir al terminar.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })

  const config = configured()
  if (!config) {
    status = {
      current: app.getVersion(),
      state: 'unavailable',
      message: app.isPackaged ? 'Esta copia de Nido no se publicó con actualizaciones automáticas.' : 'En desarrollo no hay actualizaciones automáticas.'
    }
    return
  }
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.updateConfigPath = config
  }
  autoUpdater.logger = null
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  status = { current: app.getVersion(), state: 'idle' }

  autoUpdater.on('update-not-available', () => publish({ state: 'uptodate', version: undefined, progress: undefined, checkedAt: Date.now() }))
  autoUpdater.on('update-available', (info) => publish({ state: 'downloading', version: info.version, progress: 0, checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) => publish({ state: 'downloading', progress: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'ready', version: info.version, progress: 100 }))
  autoUpdater.on('error', (err) => publish({ state: 'error', message: describe(err), checkedAt: Date.now() }))

  setTimeout(() => void check(), FIRST_CHECK_MS)
  setInterval(() => void check(), CHECK_EVERY_MS)
}
