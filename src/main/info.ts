import { IPC, type CurrencyRates, type Holiday, type Place, type WeatherReport } from '../shared/types'
import { handleResult, NidoError } from './errors'
import { cachedGet } from './net'

// Proveedores públicos sin cuenta ni clave, comprobados en su documentación:
// - Open-Meteo (tiempo y geocodificación; CC BY 4.0, hay que citar la fuente)
// - Nager.Date (festivos por país, con nombre local)
// - Frankfurter (tipos de cambio del Banco Central Europeo)
// - RSS/Atom: cualquier URL http(s) que indique el usuario

const MIN = 60_000

const describe =
  (service: string) =>
  (status: number, body: any): NidoError => {
    if (status === 404) return new NidoError('notfound', `${service} no tiene datos para eso.`)
    if (status === 429) return new NidoError('rate', `${service} limita las peticiones ahora mismo.`)
    if (status >= 500) return new NidoError('network', `${service} no responde. Reintenta en unos minutos.`)
    return new NidoError('invalid', body?.reason ?? body?.message ?? `Error ${status} de ${service}.`)
  }

async function geocode(query: string): Promise<Place[]> {
  const name = query.trim()
  if (name.length < 2) return []
  const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '6', language: 'es', format: 'json' })}`
  const json = await cachedGet<any>(url, 24 * 60 * MIN, 'json', describe('Open-Meteo'))
  return (json.results ?? []).map((r: any) => ({
    name: r.name,
    admin: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude
  }))
}

async function weather(lat: number, lon: number, units: 'c' | 'f'): Promise<WeatherReport> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new NidoError('invalid', 'Ubicación no válida.')
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
    ...(units === 'f' ? { temperature_unit: 'fahrenheit' } : {})
  })
  // Open-Meteo actualiza cada 15 minutos: no tiene sentido preguntar más a menudo.
  const json = await cachedGet<any>(`https://api.open-meteo.com/v1/forecast?${params}`, 15 * MIN, 'json', describe('Open-Meteo'))
  return {
    current: { temperature: json.current.temperature_2m, code: json.current.weather_code, time: json.current.time },
    daily: (json.daily.time as string[]).map((date, i) => ({
      date,
      code: json.daily.weather_code[i],
      max: json.daily.temperature_2m_max[i],
      min: json.daily.temperature_2m_min[i]
    })),
    units: json.current_units?.temperature_2m ?? (units === 'f' ? '°F' : '°C'),
    fetchedAt: Date.now()
  }
}

async function feed(url: string): Promise<string> {
  if (!/^https?:\/\/\S+$/i.test(url)) throw new NidoError('invalid', 'La dirección del feed debe empezar por http:// o https://')
  return cachedGet<string>(url, 15 * MIN, 'text', describe(new URL(url).hostname))
}

async function holidays(country: string, year: number): Promise<Holiday[]> {
  if (!/^[A-Z]{2}$/.test(country)) throw new NidoError('invalid', 'Código de país no válido.')
  const json = await cachedGet<any[]>(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
    12 * 60 * MIN,
    'json',
    describe('Nager.Date')
  )
  return json.map((h) => ({ date: h.date, localName: h.localName, name: h.name, global: !!h.global }))
}

async function rates(base: string): Promise<CurrencyRates> {
  if (!/^[A-Z]{3}$/.test(base)) throw new NidoError('invalid', 'Moneda no válida.')
  // El BCE publica una vez al día laborable; una hora de caché es de sobra.
  const json = await cachedGet<any>(`https://api.frankfurter.dev/v1/latest?base=${base}`, 60 * MIN, 'json', describe('Frankfurter'))
  return { base: json.base, date: json.date, rates: { ...json.rates, [json.base]: 1 }, fetchedAt: Date.now() }
}

export function registerInfo(): void {
  handleResult(IPC.info.geocode, (q: string) => geocode(String(q ?? '')))
  handleResult(IPC.info.weather, (lat: number, lon: number, units: 'c' | 'f') => weather(Number(lat), Number(lon), units === 'f' ? 'f' : 'c'))
  handleResult(IPC.info.feed, (url: string) => feed(String(url ?? '').trim()))
  handleResult(IPC.info.holidays, (country: string, year: number) => holidays(String(country).toUpperCase(), Number(year)))
  handleResult(IPC.info.rates, (base: string) => rates(String(base).toUpperCase()))
}
