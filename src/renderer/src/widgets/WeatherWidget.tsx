import { useCallback, useEffect, useState } from 'react'
import type { Place, WeatherReport } from '../../../shared/types'
import { useActive, useInterval } from '../context'
import { Icon, type IconName } from '../icons'
import { Spinner } from '../ui/controls'
import { fromDateKey } from '../util'
import type { WidgetProps } from './types'

/** Códigos WMO de Open-Meteo → texto e icono. */
function describe(code: number): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Despejado', icon: 'sun' }
  if (code <= 2) return { label: 'Poco nuboso', icon: 'cloudSun' }
  if (code === 3) return { label: 'Nublado', icon: 'cloud' }
  if (code === 45 || code === 48) return { label: 'Niebla', icon: 'cloud' }
  if (code >= 51 && code <= 57) return { label: 'Llovizna', icon: 'cloud' }
  if (code >= 61 && code <= 67) return { label: 'Lluvia', icon: 'cloud' }
  if (code >= 71 && code <= 77) return { label: 'Nieve', icon: 'cloud' }
  if (code >= 80 && code <= 82) return { label: 'Chubascos', icon: 'cloud' }
  if (code >= 85 && code <= 86) return { label: 'Chubascos de nieve', icon: 'cloud' }
  if (code >= 95) return { label: 'Tormenta', icon: 'alert' }
  return { label: 'Variable', icon: 'cloudSun' }
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

function PlacePicker({ onPick, onCancel }: { onPick(p: Place): void; onCancel?(): void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null)
      return
    }
    const timer = setTimeout(() => {
      window.nido.info.geocode(query).then((r) => {
        if (r.ok) {
          setResults(r.data)
          setError(null)
        } else setError(r.error)
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [query])
  return (
    <div className="place-picker">
      <input
        className="input tiny"
        autoFocus
        placeholder="Busca tu ciudad"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel && (e.stopPropagation(), onCancel())}
      />
      {error && <p className="field-error">{error}</p>}
      <div className="suggestions">
        {results?.map((p) => (
          <button key={`${p.lat},${p.lon}`} className="list-btn" onClick={() => onPick(p)}>
            <span className="grow">{p.name}</span>
            <span className="muted small-text">{[p.admin, p.country].filter(Boolean).join(', ')}</span>
          </button>
        ))}
        {results?.length === 0 && <p className="muted small-text">Sin resultados.</p>}
      </div>
      {onCancel && (
        <button className="link-btn" onClick={onCancel}>
          Cancelar
        </button>
      )}
    </div>
  )
}

export function WeatherWidget({ widget, update }: WidgetProps<'weather'>): JSX.Element {
  const { place, units } = widget.data
  const [report, setReport] = useState<WeatherReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const load = useCallback(() => {
    if (!place) return
    window.nido.info.weather(place.lat, place.lon, units).then((r) => {
      if (r.ok) {
        setReport(r.data)
        setError(null)
      } else setError(r.error)
    })
  }, [place?.lat, place?.lon, units])

  // Open-Meteo actualiza cada 15 min; oculto no se consulta.
  useInterval(load, 15 * 60_000, useActive() && !!place, place ? `${place.lat},${place.lon},${units}` : '')

  if (!place || picking) {
    return (
      <PlacePicker
        onPick={(p) => {
          setReport(null)
          update({ place: p })
          setPicking(false)
        }}
        onCancel={place ? () => setPicking(false) : undefined}
      />
    )
  }

  const now = report ? describe(report.current.code) : null
  return (
    <div className="weather">
      {error && !report && (
        <div className="empty-state compact">
          <p className="empty-text">{error}</p>
          <button className="btn small" onClick={load}>
            Reintentar
          </button>
        </div>
      )}
      {!report && !error && (
        <div className="empty-state compact">
          <Spinner />
        </div>
      )}
      {report && now && (
        <>
          <div className="weather-now">
            <span className="weather-icon">
              <Icon name={now.icon} size={30} />
            </span>
            <div className="grow">
              <div className="weather-temp">{Math.round(report.current.temperature)}°</div>
              <div className="weather-label">{now.label}</div>
            </div>
            <button className="weather-place" title="Cambiar de ciudad" onClick={() => setPicking(true)}>
              {place.name}
              <Icon name="chevronDown" size={12} />
            </button>
          </div>
          <div className="weather-days">
            {report.daily.slice(0, 5).map((d, i) => {
              const info = describe(d.code)
              return (
                <div key={d.date} className="weather-day" title={info.label}>
                  <span className="cap">{i === 0 ? 'Hoy' : weekday.format(fromDateKey(d.date)).replace('.', '')}</span>
                  <Icon name={info.icon} size={16} />
                  <span className="mono">
                    {Math.round(d.max)}° <span className="muted">{Math.round(d.min)}°</span>
                  </span>
                </div>
              )
            })}
          </div>
          <div className="row source-line">
            <button className="link-btn muted-link" onClick={() => void window.nido.openExternal('https://open-meteo.com/')}>
              Datos: Open-Meteo.com
            </button>
            <span className="grow" />
            <button className="link-btn" onClick={() => update({ units: units === 'c' ? 'f' : 'c' })} title="Cambiar unidades">
              °{units === 'c' ? 'C' : 'F'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
