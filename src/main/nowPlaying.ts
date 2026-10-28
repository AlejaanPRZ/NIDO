import { app, ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { IPC, type MediaCommand, type MediaSession, type NowPlayingState } from '../shared/types'
import scriptSource from './now-playing.ps1?raw'

// Puente con los controles multimedia de Windows. Un proceso de Windows
// PowerShell (now-playing.ps1) consulta las sesiones y emite JSON por stdout;
// las órdenes (pausa, siguiente…) se le envían por stdin. Solo está vivo
// mientras haya algún widget suscrito.

const COMMANDS: ReadonlySet<MediaCommand> = new Set(['toggle', 'next', 'prev', 'seek', 'shuffle', 'repeat'])
const REPEAT_MODES = new Set(['None', 'Track', 'List'])
const MAX_THUMBS = 20
// Sin nadie mirando, PowerShell se cierra tras este margen: cambiar de espacio y volver enseguida no
// lo relanza (arrancar cuesta 3–4 s), pero en la bandeja o en otro espacio no ocupa memoria.
const STOP_DELAY_MS = 60_000
const MAX_RESTART_DELAY_MS = 30_000

const subscribers = new Set<WebContents>()
const thumbs = new Map<string, string>()
let child: ChildProcessWithoutNullStreams | null = null
let lastState: NowPlayingState = { available: process.platform === 'win32', sessions: [] }
let restartDelay = 2000
let restartTimer: NodeJS.Timeout | undefined
let stopTimer: NodeJS.Timeout | undefined

function broadcast(channel: string, ...args: unknown[]): void {
  for (const wc of subscribers) if (!wc.isDestroyed()) wc.send(channel, ...args)
}

function setState(state: NowPlayingState): void {
  lastState = state
  broadcast(IPC.npState, state)
}

function handleLine(line: string): void {
  let msg: { type?: string; [k: string]: unknown }
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.type === 'state') {
    const raw = msg.sessions
    const sessions = (Array.isArray(raw) ? raw : raw ? [raw] : []) as MediaSession[]
    restartDelay = 2000
    setState({ available: true, sessions })
  } else if (msg.type === 'thumb' && typeof msg.key === 'string' && typeof msg.data === 'string') {
    if (!msg.data.startsWith('data:image/')) return
    thumbs.set(msg.key, msg.data)
    while (thumbs.size > MAX_THUMBS) thumbs.delete(thumbs.keys().next().value!)
    broadcast(IPC.npThumb, msg.key, msg.data)
  } else if (msg.type === 'error') {
    setState({ ...lastState, error: String(msg.message ?? 'Error desconocido') })
  }
}

function powershellPath(): string {
  // Ruta absoluta para no depender del PATH. Debe ser Windows PowerShell 5.1:
  // PowerShell 7 no carga tipos WinRT.
  return join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function start(): void {
  if (child || process.platform !== 'win32') return
  const scriptPath = join(app.getPath('userData'), 'now-playing.ps1')
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    // BOM UTF-8 para que PowerShell 5.1 lea bien los acentos del script.
    fs.writeFileSync(scriptPath, '\uFEFF' + scriptSource, 'utf8')
  } catch (err) {
    setState({ available: false, sessions: [], error: `No se pudo preparar el puente multimedia: ${err}` })
    return
  }

  const proc = spawn(
    powershellPath(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { windowsHide: true }
  )
  child = proc

  let buffer = ''
  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let index: number
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) handleLine(line)
    }
  })
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk: string) => console.error('[nido] now-playing:', chunk.trim()))
  proc.on('error', (err) => console.error('[nido] no se pudo lanzar PowerShell', err))
  proc.on('exit', () => {
    if (child !== proc) return
    child = null
    if (subscribers.size === 0) return
    // Se cayó con widgets mirando: reintento con espera creciente.
    setState({ available: false, sessions: [], error: 'Reconectando con los controles multimedia…' })
    clearTimeout(restartTimer)
    restartTimer = setTimeout(start, restartDelay)
    restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS)
  })
}

function stop(): void {
  clearTimeout(restartTimer)
  clearTimeout(stopTimer)
  const proc = child
  child = null
  if (!proc) return
  proc.stdin.end() // el script sale al cerrarse stdin
  setTimeout(() => proc.exitCode === null && proc.kill(), 2000)
}

function subscribe(wc: WebContents): void {
  clearTimeout(stopTimer)
  if (!subscribers.has(wc)) {
    subscribers.add(wc)
    wc.once('destroyed', () => unsubscribe(wc))
  }
  for (const [key, data] of thumbs) wc.send(IPC.npThumb, key, data)
  wc.send(IPC.npState, lastState)
  start()
}

function unsubscribe(wc: WebContents): void {
  subscribers.delete(wc)
  if (subscribers.size === 0) {
    clearTimeout(stopTimer)
    stopTimer = setTimeout(stop, STOP_DELAY_MS)
  }
}

export function registerNowPlaying(): void {
  ipcMain.on(IPC.npSubscribe, (event) => subscribe(event.sender))
  ipcMain.on(IPC.npUnsubscribe, (event) => unsubscribe(event.sender))
  ipcMain.on(IPC.npCommand, (_event, sessionId: unknown, command: unknown, value: unknown) => {
    if (!child || typeof sessionId !== 'string' || !COMMANDS.has(command as MediaCommand)) return
    // Cada orden se valida aquí; al script le llega JSON en una línea.
    if (command === 'seek' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return
    if (command === 'shuffle' && typeof value !== 'boolean') return
    if (command === 'repeat' && !REPEAT_MODES.has(value as string)) return
    child.stdin.write(JSON.stringify({ cmd: command, id: sessionId, value: value ?? null }) + '\n')
  })
  app.on('before-quit', stop)
}
