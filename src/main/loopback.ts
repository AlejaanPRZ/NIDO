import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { NidoError } from './errors'

// Servidor de un solo uso en 127.0.0.1:<puerto aleatorio> que espera la vuelta del navegador
// tras autorizar (OAuth para apps de escritorio). Lo usan Google y Notion.

const PAGE = (title: string, body: string): string => `<!doctype html><html lang="es"><meta charset="utf-8">
<title>${title}</title><body style="font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:linear-gradient(160deg,#eaf3ff,#f7fbff);color:#1d1d1f">
<div style="text-align:center;max-width:420px;padding:32px;border-radius:24px;background:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.9);box-shadow:0 10px 40px rgba(30,80,160,.12)">
<h1 style="font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#5b6472;margin:0">${body}</p></div></body></html>`

export interface Redirect {
  port: number
  state: string
  /** Parámetros de la URL con la que volvió el navegador (ya comprobado el state). */
  result: Promise<URLSearchParams>
  /** Cancela la espera (el usuario pulsó «Cancelar» en Nido). */
  cancel(): void
}

export async function waitForRedirect(opts: { path: string; state: string | ((port: number) => string); service: string; timeoutMs: number }): Promise<Redirect> {
  const server = http.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  const state = typeof opts.state === 'function' ? opts.state(port) : opts.state
  let cancel: () => void = () => undefined

  const result = new Promise<URLSearchParams>((resolve, reject) => {
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      fn()
    }
    const timer = setTimeout(
      () => finish(() => reject(new NidoError('auth', `Se agotó el tiempo para autorizar en ${opts.service}. Vuelve a intentarlo.`))),
      opts.timeoutMs
    )
    cancel = () => finish(() => reject(new NidoError('cancelled', 'Conexión cancelada.')))
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (url.pathname !== opts.path) {
        res.writeHead(404).end()
        return
      }
      const params = url.searchParams
      const error = params.get('error')
      const stateOk = params.get('state') === state
      const ok = stateOk && !error && !!params.get('code')
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        ok
          ? PAGE('Listo', `Ya puedes cerrar esta pestaña y volver a Nido.`)
          : error === 'access_denied'
            ? PAGE('Autorización cancelada', 'No se ha conectado nada. Puedes cerrar esta pestaña.')
            : PAGE('No se pudo conectar', 'Vuelve a Nido para intentarlo de nuevo.')
      )
      // Una petición con otro state (otra pestaña, un ataque) no cierra la espera de la buena.
      if (!stateOk) return
      finish(() => {
        if (error === 'access_denied') reject(new NidoError('cancelled', `Has cancelado el permiso en ${opts.service}.`))
        else if (error || !params.get('code')) reject(new NidoError('auth', `${opts.service} devolvió un error: ${error ?? 'sin código'}`))
        else resolve(params)
      })
    })
  })
  return { port, state, result, cancel: () => cancel() }
}
