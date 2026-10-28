import { NidoError, readJson } from './errors'

// Peticiones HTTP compartidas por los proveedores sin cuenta (tiempo, RSS,
// festivos, divisas): caché con caducidad, una sola petición en curso por URL
// aunque la pidan varios widgets, y reintentos con espera progresiva.

interface Entry {
  at: number
  value: unknown
}

const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()
const MAX_CACHE = 200
const MAX_BYTES = 3 * 1024 * 1024

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Errores que merece la pena reintentar: red, 429 y 5xx. */
const retriable = (status: number): boolean => status === 429 || status >= 500

export async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
      if (!retriable(res.status) || i === attempts - 1) return res
      const retryAfter = Number(res.headers.get('retry-after'))
      await wait(retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 600 * 2 ** i)
    } catch (err) {
      lastError = err
      if (i < attempts - 1) await wait(600 * 2 ** i)
    }
  }
  throw new NidoError('network', `No hay conexión con ${new URL(url).hostname}.`, lastError)
}

async function readLimited(res: Response): Promise<string> {
  const length = Number(res.headers.get('content-length'))
  if (length > MAX_BYTES) throw new NidoError('invalid', 'La respuesta es demasiado grande.')
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new NidoError('invalid', 'La respuesta es demasiado grande.')
  return text
}

/**
 * GET con caché. `parse` convierte la respuesta; si falla la red y hay un valor
 * caducado en caché, se devuelve ese (mejor un dato algo viejo que un error).
 */
export async function cachedGet<T>(
  url: string,
  ttlMs: number,
  kind: 'json' | 'text',
  describe: (status: number, body: any) => NidoError
): Promise<T> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const pending = inFlight.get(url)
  if (pending) return pending as Promise<T>

  const request = (async () => {
    try {
      const res = await fetchWithRetry(url, { headers: { Accept: kind === 'json' ? 'application/json' : '*/*' } })
      if (!res.ok) throw describe(res.status, await readJson(res))
      const value = kind === 'json' ? JSON.parse(await readLimited(res)) : await readLimited(res)
      cache.set(url, { at: Date.now(), value })
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
      return value as T
    } catch (err) {
      if (hit && err instanceof NidoError && err.code === 'network') return hit.value as T
      throw err
    } finally {
      inFlight.delete(url)
    }
  })()
  inFlight.set(url, request)
  return request
}
