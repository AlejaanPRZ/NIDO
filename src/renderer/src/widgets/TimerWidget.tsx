import { useState } from 'react'
import { useInterval } from '../context'
import { Icon } from '../icons'
import { Segmented } from '../ui/controls'
import { parseTime } from '../util'
import { announce, clockText, pauseClock, remainingOf, startClock } from './alerts'
import type { WidgetProps } from './types'

const PRESETS = [60, 5 * 60, 10 * 60, 25 * 60]

/** Cronómetro con centésimas. */
function stopwatchText(ms: number): string {
  const cs = Math.floor((ms % 1000) / 10)
  return `${clockText(Math.floor(ms / 1000))}.${String(cs).padStart(2, '0')}`
}

export function TimerWidget({ widget, update }: WidgetProps<'timer'>): JSX.Element {
  const d = widget.data
  const [, tick] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sw = d.stopwatch
  const elapsed = sw.running && sw.startedAt ? sw.elapsed + (Date.now() - sw.startedAt) : sw.elapsed
  const remaining = remainingOf(d.timer)

  // El temporizador avisa aunque su espacio esté oculto.
  useInterval(
    () => {
      if (d.timer.running && remainingOf(d.timer) <= 0) {
        update({ timer: { running: false, remaining: d.duration } })
        announce(widget.title, `Ha terminado la cuenta atrás de ${clockText(d.duration)}.`)
      } else tick((n) => n + 1)
    },
    d.mode === 'stopwatch' && sw.running ? 50 : 250,
    d.timer.running || sw.running
  )

  const setDuration = (seconds: number): void => update({ duration: seconds, timer: { running: false, remaining: seconds } })

  const commitDraft = (): void => {
    const seconds = parseTime(draft.includes(':') ? draft : `${draft}:00`)
    if (seconds === null || seconds <= 0 || seconds > 24 * 3600) {
      setError('Escribe minutos (5) o mm:ss (02:30)')
      return
    }
    setDuration(seconds)
    setEditing(false)
    setError(null)
  }

  return (
    <div className="timer-widget">
      <Segmented
        label="Modo"
        className="full compact"
        value={d.mode}
        options={[
          { value: 'timer', label: 'Temporizador' },
          { value: 'stopwatch', label: 'Cronómetro' }
        ]}
        onChange={(mode) => update({ mode })}
      />
      {d.mode === 'timer' ? (
        <>
          {editing ? (
            <form
              className="timer-edit"
              onSubmit={(e) => {
                e.preventDefault()
                commitDraft()
              }}
            >
              <input
                className="input mono big-input"
                autoFocus
                aria-label="Duración"
                placeholder="05:00"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
              />
              <button className="btn small primary" type="submit">
                Fijar
              </button>
            </form>
          ) : (
            <button
              className={`timer-display mono ${d.timer.running ? 'running' : ''}`}
              title={d.timer.running ? undefined : 'Pulsa para cambiar la duración'}
              disabled={d.timer.running}
              onClick={() => {
                setDraft(clockText(d.duration))
                setEditing(true)
              }}
            >
              {clockText(remaining)}
            </button>
          )}
          {error && <p className="field-error">{error}</p>}
          <div className="chip-row center">
            {PRESETS.map((s) => (
              <button key={s} className={`chip ${d.duration === s ? 'active' : ''}`} disabled={d.timer.running} onClick={() => setDuration(s)}>
                {s / 60}<span className="unit"> min</span>
              </button>
            ))}
          </div>
          <div className="row center">
            <button className="icon-btn" title="Reiniciar" onClick={() => update({ timer: { running: false, remaining: d.duration } })}>
              <Icon name="reload" size={15} />
            </button>
            <button
              className="play-btn small"
              title={d.timer.running ? 'Pausar' : 'Empezar'}
              onClick={() => update({ timer: d.timer.running ? pauseClock(d.timer) : startClock(d.timer.remaining > 0 ? d.timer : { ...d.timer, remaining: d.duration }) })}
            >
              <Icon name={d.timer.running ? 'pause' : 'play'} size={18} />
            </button>
            <span style={{ width: 30 }} />
          </div>
        </>
      ) : (
        <>
          <div className="timer-display mono static">{stopwatchText(elapsed)}</div>
          <div className="row center">
            <button
              className="icon-btn"
              title={sw.running ? 'Vuelta' : 'Poner a cero'}
              disabled={!sw.running && elapsed === 0}
              onClick={() =>
                update({
                  stopwatch: sw.running ? { ...sw, laps: [elapsed, ...sw.laps].slice(0, 50) } : { running: false, elapsed: 0, laps: [] }
                })
              }
            >
              <Icon name={sw.running ? 'flag' : 'reload'} size={15} />
            </button>
            <button
              className="play-btn small"
              title={sw.running ? 'Parar' : 'Empezar'}
              onClick={() =>
                update({
                  stopwatch: sw.running
                    ? { ...sw, running: false, elapsed, startedAt: undefined }
                    : { ...sw, running: true, startedAt: Date.now() }
                })
              }
            >
              <Icon name={sw.running ? 'pause' : 'play'} size={18} />
            </button>
            <span style={{ width: 30 }} />
          </div>
          {sw.laps.length > 0 && (
            <ol className="laps scroll" reversed>
              {sw.laps.map((lap, i) => (
                <li key={i} className="mono">
                  <span className="muted">Vuelta {sw.laps.length - i}</span>
                  <span>{stopwatchText(lap - (sw.laps[i + 1] ?? 0))}</span>
                  <span className="muted">{stopwatchText(lap)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
