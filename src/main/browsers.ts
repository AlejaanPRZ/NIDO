import { dialog, shell, type BrowserWindow } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { basename, join } from 'node:path'
import { IPC, type BrowserInfo } from '../shared/types'
import { handleResult, NidoError } from './errors'
import { getConfig, updateConfig } from './secrets'

// Navegadores externos: se detectan en el registro (StartMenuInternet, donde
// se registran los navegadores en Windows) y en rutas de instalación conocidas.
// Abrir un enlace aquí lanza el navegador fuera de Nido; el panel web integrado
// es otra cosa (un <webview> de Chromium dentro de la app).

const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows'
const REG = join(SYSTEM_ROOT, 'System32', 'reg.exe')
const REG_ROOTS = [
  'HKCU\\Software\\Clients\\StartMenuInternet',
  'HKLM\\SOFTWARE\\Clients\\StartMenuInternet',
  'HKLM\\SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet'
]
const CACHE_MS = 30_000
const MAX_URLS = 40

const env = (name: string): string => process.env[name] ?? ''
const KNOWN: { name: string; paths: string[] }[] = [
  { name: 'Microsoft Edge', paths: [`${env('ProgramFiles(x86)')}\\Microsoft\\Edge\\Application\\msedge.exe`, `${env('ProgramFiles')}\\Microsoft\\Edge\\Application\\msedge.exe`] },
  { name: 'Google Chrome', paths: [`${env('ProgramFiles')}\\Google\\Chrome\\Application\\chrome.exe`, `${env('ProgramFiles(x86)')}\\Google\\Chrome\\Application\\chrome.exe`, `${env('LOCALAPPDATA')}\\Google\\Chrome\\Application\\chrome.exe`] },
  { name: 'Mozilla Firefox', paths: [`${env('ProgramFiles')}\\Mozilla Firefox\\firefox.exe`, `${env('ProgramFiles(x86)')}\\Mozilla Firefox\\firefox.exe`] },
  { name: 'Brave', paths: [`${env('ProgramFiles')}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`, `${env('LOCALAPPDATA')}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`] },
  { name: 'Opera', paths: [`${env('LOCALAPPDATA')}\\Programs\\Opera\\opera.exe`, `${env('ProgramFiles')}\\Opera\\opera.exe`] },
  { name: 'Opera GX', paths: [`${env('LOCALAPPDATA')}\\Programs\\Opera GX\\opera.exe`, `${env('ProgramFiles')}\\Opera GX\\opera.exe`] },
  { name: 'Vivaldi', paths: [`${env('LOCALAPPDATA')}\\Vivaldi\\Application\\vivaldi.exe`, `${env('ProgramFiles')}\\Vivaldi\\Application\\vivaldi.exe`] },
  { name: 'Chromium', paths: [`${env('LOCALAPPDATA')}\\Chromium\\Application\\chrome.exe`] }
]

let cache: { at: number; list: BrowserInfo[] } | null = null

const idFor = (path: string): string => 'b_' + createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 10)

function reg(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(REG, ['query', ...args], { windowsHide: true, encoding: 'latin1' }, (err, stdout) => resolve(err ? '' : stdout))
  })
}

/** Primer valor REG_SZ/REG_EXPAND_SZ de la salida de `reg query … /ve`. */
function regValue(output: string): string | null {
  const line = output.split(/\r?\n/).find((l) => /\sREG_(EXPAND_)?SZ\s/.test(l))
  if (!line) return null
  const value = line.replace(/^.*?\sREG_(EXPAND_)?SZ\s+/, '').trim()
  return value.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`)
}

/** Ruta del .exe a partir de un comando como `"C:\…\chrome.exe" --flag`. */
function exeFromCommand(command: string): string | null {
  const quoted = /^"([^"]+\.exe)"/i.exec(command)
  if (quoted) return quoted[1]
  const bare = /^(.+?\.exe)\b/i.exec(command)
  return bare ? bare[1] : null
}

async function detect(): Promise<BrowserInfo[]> {
  const found = new Map<string, BrowserInfo>()
  const add = (name: string, path: string): void => {
    const key = path.toLowerCase()
    if (found.has(key) || !fs.existsSync(path)) return
    found.set(key, { id: idFor(path), name, path, kind: 'detected' })
  }

  for (const root of REG_ROOTS) {
    const keys = (await reg([root]))
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^HKEY_/i.test(l) && l.length > root.length + 6 && l.includes('StartMenuInternet\\'))
    for (const key of keys) {
      if (/IEXPLORE/i.test(key)) continue // Internet Explorer ya no abre páginas en Windows 11
      const name = regValue(await reg([key, '/ve'])) ?? key.split('\\').pop() ?? 'Navegador'
      const command = regValue(await reg([`${key}\\shell\\open\\command`, '/ve']))
      const exe = command ? exeFromCommand(command) : null
      if (exe) add(name, exe)
    }
  }
  for (const known of KNOWN) for (const path of known.paths) if (path && !path.startsWith('\\')) add(known.name, path)
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function customBrowsers(): BrowserInfo[] {
  return (getConfig().browsers?.custom ?? []).map((b) => ({ ...b, kind: 'custom' as const }))
}

async function list(): Promise<BrowserInfo[]> {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), list: await detect() }
  return [...cache.list, ...customBrowsers()]
}

async function addCustom(win: BrowserWindow | null): Promise<BrowserInfo | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Elegir el ejecutable del navegador',
    properties: ['openFile'],
    filters: [{ name: 'Programas', extensions: ['exe'] }]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  if (!/\.exe$/i.test(path) || !fs.existsSync(path)) throw new NidoError('invalid', 'Elige un archivo .exe que exista.')
  const raw = basename(path, '.exe')
  const browser: BrowserInfo = { id: idFor(path), name: raw.charAt(0).toUpperCase() + raw.slice(1), path, kind: 'custom' }
  updateConfig((c) => {
    const custom = (c.browsers?.custom ?? []).filter((b) => b.id !== browser.id)
    c.browsers = { ...c.browsers, custom: [...custom, { id: browser.id, name: browser.name, path: browser.path }] }
  })
  return browser
}

function removeCustom(id: string): void {
  updateConfig((c) => {
    if (c.browsers?.custom) c.browsers.custom = c.browsers.custom.filter((b) => b.id !== id)
  })
}

async function open(browserId: string, urls: string[]): Promise<null> {
  const valid = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u))
  if (valid.length === 0) throw new NidoError('invalid', 'No hay enlaces válidos (http o https) para abrir.')
  if (valid.length > MAX_URLS) throw new NidoError('invalid', `Como máximo ${MAX_URLS} enlaces a la vez.`)

  if (browserId === 'system') {
    for (const url of valid) await shell.openExternal(url)
    return null
  }
  // El ejecutable se resuelve aquí a partir del id: el renderer nunca indica una ruta.
  const browser = (await list()).find((b) => b.id === browserId)
  if (!browser) throw new NidoError('notfound', 'Ese navegador ya no está disponible. Elige otro en el selector.')
  if (!fs.existsSync(browser.path)) {
    cache = null
    throw new NidoError('notfound', `No se encuentra ${browser.name} en ${browser.path}.`)
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(browser.path, valid, { detached: true, stdio: 'ignore' })
    child.once('error', (err) => reject(new NidoError('unknown', `No se pudo abrir ${browser.name}: ${err.message}`)))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
  return null
}

export function registerBrowsers(getWindow: () => BrowserWindow | null): void {
  handleResult(IPC.browsers.list, () => list())
  handleResult(IPC.browsers.addCustom, () => addCustom(getWindow()))
  handleResult(IPC.browsers.removeCustom, (id: string) => removeCustom(String(id)))
  handleResult(IPC.browsers.open, (id: string, urls: string[]) => open(String(id), urls))
}
