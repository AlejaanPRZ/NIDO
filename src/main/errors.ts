import { app, ipcMain } from 'electron'
import type { ErrorCode, Result } from '../shared/types'

/** Error con código para que la interfaz sepa qué mostrar (reconectar, reintentar…). */
export class NidoError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}

export function toFailure(err: unknown): Result<never> {
  if (err instanceof NidoError) return { ok: false, code: err.code, error: err.message }
  console.error('[nido]', err)
  return { ok: false, code: 'unknown', error: err instanceof Error ? err.message : String(err) }
}

/** Registra un handler IPC cuyo resultado viaja como Result (los errores no se lanzan al renderer). */
export function handleResult<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (err) {
      return toFailure(err)
    }
  })
}

/** URL de un servicio externo, sustituible por variable de entorno solo en desarrollo (pruebas con servidores simulados). */
export function serviceUrl(envName: string, fallback: string): string {
  return !app.isPackaged && process.env[envName] ? process.env[envName]! : fallback
}

export async function readJson(res: Response): Promise<any> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 300) }
  }
}
