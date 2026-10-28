import { app, BrowserWindow, ipcMain, screen, session, shell } from 'electron'
import { join } from 'node:path'
import { APP_ID, IPC, type AppBehavior, type AppState } from '../shared/types'
import { registerBrowsers } from './browsers'
import { registerFiles } from './files'
import { registerGoogle } from './google'
import { registerInfo } from './info'
import { registerSystem } from './system'
import { handleMediaProtocol, pickAudioFiles, pickAudioFolder, registerMediaScheme } from './media'
import { registerNotion } from './notion'
import { registerNowPlaying } from './nowPlaying'
import { loadState, loadWindowState, registerData, saveState, saveStateSync, saveWindowState } from './storage'
import { attachWindow, setBehavior, setupTray, show } from './tray'
import { registerUpdater } from './updater'

const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url)

let mainWindow: BrowserWindow | null = null

// Solo en desarrollo: carpeta de datos aparte para probar sin tocar los datos reales.
// Va antes del bloqueo de instancia única, que depende de esta carpeta.
if (!app.isPackaged && process.env.NIDO_USER_DATA_DIR) {
  app.setPath('userData', process.env.NIDO_USER_DATA_DIR)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

registerMediaScheme()

function boundsAreVisible(b: { x?: number; y?: number; width: number; height: number }): boolean {
  if (b.x === undefined || b.y === undefined) return false
  return screen.getAllDisplays().some(({ workArea: a }) => {
    return b.x! < a.x + a.width && b.x! + b.width > a.x && b.y! < a.y + a.height && b.y! + 40 > a.y
  })
}

function createWindow(): void {
  const saved = loadWindowState()
  const visible = boundsAreVisible(saved)

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: visible ? saved.x : undefined,
    y: visible ? saved.y : undefined,
    minWidth: 640,
    minHeight: 480,
    title: 'Nido',
    backgroundColor: '#e9ebf2',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  if (saved.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Se guarda al mover/redimensionar (con debounce) y al cerrar: window.close()
  // desde el renderer no emite 'close', así que no basta con ese evento.
  const win = mainWindow
  let boundsTimer: NodeJS.Timeout | undefined
  const persistBounds = (): void => {
    clearTimeout(boundsTimer)
    if (win.isDestroyed() || win.isMinimized()) return
    saveWindowState({ ...win.getNormalBounds(), maximized: win.isMaximized() })
  }
  const schedulePersist = (): void => {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(persistBounds, 500)
  }
  win.on('resize', schedulePersist)
  win.on('move', schedulePersist)
  win.on('maximize', schedulePersist)
  win.on('unmaximize', schedulePersist)
  win.on('close', persistBounds)
  attachWindow(win, () => mainWindow)
  win.on('closed', () => {
    clearTimeout(boundsTimer)
    mainWindow = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Endurecimiento: la ventana principal no navega fuera de la app y los
// <webview> de los paneles web nunca reciben preload ni acceso a Node.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    if (!isHttpUrl(params.src)) event.preventDefault()
  })

  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (contents.getType() === 'window') {
    contents.on('will-navigate', (event, url) => {
      const devUrl = process.env['ELECTRON_RENDERER_URL']
      if (devUrl && url.startsWith(devUrl)) return
      event.preventDefault()
    })
  }
})

ipcMain.handle(IPC.loadState, () => loadState())
ipcMain.handle(IPC.saveState, (_e, state: AppState) => saveState(state))
ipcMain.on(IPC.saveStateSync, (event, state: AppState) => {
  try {
    saveStateSync(state)
  } catch (err) {
    console.error('[nido] error en guardado síncrono', err)
  }
  event.returnValue = true
})
ipcMain.handle(IPC.pickAudioFiles, () => pickAudioFiles(mainWindow))
ipcMain.handle(IPC.pickAudioFolder, () => pickAudioFolder(mainWindow))
ipcMain.handle(IPC.openExternal, (_e, url: string) => {
  if (isHttpUrl(url)) return shell.openExternal(url)
})
registerNowPlaying()
registerGoogle()
registerNotion()
registerBrowsers(() => mainWindow)
registerData(() => mainWindow)
registerFiles(() => mainWindow)
registerInfo()
registerSystem()
registerUpdater(() => mainWindow)
ipcMain.handle(IPC.app.setBehavior, (_e, behavior: AppBehavior) => setBehavior(behavior, () => mainWindow))

// Abrir Nido otra vez (acceso directo) muestra la ventana, también si estaba en la bandeja.
app.on('second-instance', () => show(mainWindow))

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)
  // Los paneles web se presentan como el Chrome en que se basan, sin «Electron/…» ni «nido/…»:
  // con esas marcas, algunos servicios (Teams, Outlook…) responden «navegador no compatible».
  const web = session.fromPartition('persist:nido-web')
  web.setUserAgent(web.getUserAgent().replace(/\s(?:Electron|nido|Nido)\/\S+/g, ''))
  handleMediaProtocol()
  setupTray(() => mainWindow)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
