import { app, globalShortcut, Menu, nativeImage, Notification, Tray, type BrowserWindow, type NativeImage } from 'electron'
import { type AppBehavior } from '../shared/types'

// Bandeja del sistema y atajo global: Nido sigue disponible aunque se cierre la ventana, y se muestra
// u oculta desde cualquier app. «Salir» (menú de la bandeja) es lo que cierra Nido de verdad.

let tray: Tray | null = null
let quitting = false
let hintShown = false
let behavior: AppBehavior = { closeToTray: true, shortcut: 'Control+Alt+N' }
let registered = ''

/** Marca para que el cierre de la ventana no la mande a la bandeja (Salir, instalar actualización…). */
export function markQuitting(): void {
  quitting = true
}

/**
 * Icono de la bandeja: el mismo cuadrado redondeado con degradado azul de la marca, dibujado píxel a
 * píxel (no hay archivo de icono que distribuir). Bordes suavizados y un brillo arriba a la izquierda.
 */
function drawMark(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4)
  const stops: [number, [number, number, number]][] = [
    [0, [0x5a, 0xc8, 0xfa]],
    [0.55, [0x00, 0x7a, 0xff]],
    [1, [0x58, 0x56, 0xd6]]
  ]
  const gradient = (t: number): [number, number, number] => {
    for (let i = 1; i < stops.length; i++) {
      const [t1, c1] = stops[i]
      const [t0, c0] = stops[i - 1]
      if (t <= t1) {
        const k = (t - t0) / (t1 - t0)
        return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k) as [number, number, number]
      }
    }
    return stops[stops.length - 1][1]
  }
  const r = size * 0.28
  const half = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distancia con signo a un cuadrado redondeado (negativa dentro).
      const px = Math.abs(x + 0.5 - half) - (half - r - 0.5)
      const py = Math.abs(y + 0.5 - half) - (half - r - 0.5)
      const d = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r
      const alpha = Math.min(1, Math.max(0, 0.5 - d))
      if (alpha <= 0) continue
      let [cr, cg, cb] = gradient((x + y) / (2 * (size - 1)))
      const glow = Math.max(0, 1 - Math.hypot(x - size * 0.3, y - size * 0.25) / (size * 0.45)) * 0.55
      cr += (255 - cr) * glow
      cg += (255 - cg) * glow
      cb += (255 - cb) * glow
      const o = (y * size + x) * 4
      // Windows espera BGRA con alfa premultiplicado.
      buf[o] = Math.round(cb * alpha)
      buf[o + 1] = Math.round(cg * alpha)
      buf[o + 2] = Math.round(cr * alpha)
      buf[o + 3] = Math.round(alpha * 255)
    }
  }
  return buf
}

function trayIcon(): NativeImage {
  const image = nativeImage.createFromBitmap(drawMark(16), { width: 16, height: 16, scaleFactor: 1 })
  image.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: drawMark(32) })
  return image
}

/** Muestra Nido (aunque esté minimizado u oculto) o lo oculta si ya está delante. */
function toggle(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isVisible() && win.isFocused() && !win.isMinimized()) {
    win.hide()
    return
  }
  show(win)
}

export function show(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

const shortcutLabel = (accelerator: string): string => accelerator.replace('Control', 'Ctrl').replace(/\+/g, ' + ')

function refreshMenu(getWindow: () => BrowserWindow | null): void {
  if (!tray) return
  const win = getWindow()
  const visible = !!win && win.isVisible() && !win.isMinimized()
  tray.setToolTip(behavior.shortcut && registered ? `Nido (${shortcutLabel(registered)})` : 'Nido')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? 'Ocultar Nido' : 'Mostrar Nido', click: () => toggle(getWindow()) },
      { type: 'separator' },
      {
        label: 'Salir de Nido',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

/** Crea el icono de la bandeja y engancha el cierre de la ventana. */
export function setupTray(getWindow: () => BrowserWindow | null): void {
  tray = new Tray(trayIcon())
  tray.on('click', () => toggle(getWindow()))
  refreshMenu(getWindow)
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

/** Cada ventana nueva: cerrar la oculta (si así está configurado) y el menú sigue su visibilidad. */
export function attachWindow(win: BrowserWindow, getWindow: () => BrowserWindow | null): void {
  win.on('close', (event) => {
    if (quitting || !behavior.closeToTray || !tray) return
    event.preventDefault()
    win.hide()
    // La primera vez se explica dónde ha ido, para que no parezca que se ha cerrado.
    if (!hintShown && Notification.isSupported()) {
      hintShown = true
      new Notification({
        title: 'Nido sigue abierto',
        body: registered ? `Está en la bandeja del sistema. Ábrelo con ${shortcutLabel(registered)} o desde su icono.` : 'Está en la bandeja del sistema. Ábrelo desde su icono.',
        silent: true
      }).show()
    }
  })
  for (const event of ['show', 'hide', 'minimize', 'restore'] as const) win.on(event as 'show', () => refreshMenu(getWindow))
}

/** Aplica lo elegido en Ajustes. Devuelve si el atajo se pudo registrar (otra app puede tenerlo). */
export function setBehavior(next: AppBehavior, getWindow: () => BrowserWindow | null): { shortcutOk: boolean } {
  behavior = { closeToTray: !!next.closeToTray, shortcut: String(next.shortcut ?? '') }
  let ok = true
  if (behavior.shortcut !== registered) {
    if (registered) globalShortcut.unregister(registered)
    registered = ''
    if (behavior.shortcut) {
      try {
        ok = globalShortcut.register(behavior.shortcut, () => toggle(getWindow()))
      } catch {
        ok = false
      }
      if (ok) registered = behavior.shortcut
    }
  } else if (behavior.shortcut) {
    ok = !!registered
  }
  refreshMenu(getWindow)
  return { shortcutOk: ok }
}
