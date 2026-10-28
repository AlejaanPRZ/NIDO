import { useState } from 'react'
import type { PomodoroData, PomodoroPhase } from '../../../shared/types'
import { useInterval } from '../context'
import { Icon } from '../icons'
import { dateKey } from '../util'
import { announce, clockText, pauseClock, remainingOf, startClock } from './alerts'
import type { WidgetProps } from './types'

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: 'Foco', short: 'Descanso', long: 'Descanso largo' }

const minutesOf = (d: PomodoroData, phase: PomodoroPhase): number => (phase === 'focus' ? d.focus : phase === 'short' ? d.short : d.long)

export function PomodoroWidget({ widget, update }: WidgetProps<'pomodoro'>): JSX.Element {
  const d = widget.data
  const [config, setConfig] = useState(false)
  const [, tick] = useState(0)
  const remaining = remainingOf(d.clock)
  const total = minutesOf(d, d.phase) * 60
  const progress = total > 0 ? 1 - remaining / total : 0
  const today = dateKey(new Date())
  const completedToday = d.completed.day === today ? d.completed.count : 0

  /** Pasa a la fase siguiente; `finished` = la anterior terminó (no se saltó). */
  const advance = (finished: boolean): void => {
    let { round } = d
    let completed = d.completed.day === today ? d.completed : { day: today, count: 0 }
    let next: PomodoroPhase
    if (d.phase === 'focus') {
      if (finished) completed = { day: today, count: completed.count + 1 }
      next = round % d.rounds === 0 ? 'long' : 'short'
    } else {
      next = 'focus'
      round = d.phase === 'long' ? 1 : round + 1
    }
    const clock = { running: false, remaining: minutesOf(d, next) * 60 }
    update({ phase: next, round, completed, clock: d.autoStart && finished ? startClock(clock) : clock })
    if (finished) {
      announce(
        d.phase === 'focus' ? 'Bloque de foco terminado' : 'Descanso terminado',
        next === 'focus' ? 'Vuelve al trabajo.' : `Toca ${PHASE_LABEL[next].toLowerCase()} de ${minutesOf(d, next)} min.`
      )
    }
  }

  // Sigue contando aunque el espacio esté oculto: el fin se detecta siempre.
  useInterval(
    () => {
      if (remainingOf(d.clock) <= 0) advance(true)
      else tick((n) => n + 1)
    },
    500,
    d.clock.running
  )

  const toggle = (): void => update({ clock: d.clock.running ? pauseClock(d.clock) : startClock(d.clock) })
  const reset = (): void => update({ clock: { running: false, remaining: total } })

  const setMinutes = (key: 'focus' | 'short' | 'long' | 'rounds', value: number): void => {
    const v = Math.max(1, Math.min(key === 'rounds' ? 12 : 180, Math.round(value) || 1))
    const patch: Partial<PomodoroData> = { [key]: v }
    // Si cambia la duración de la fase actual y está parada, se aplica ya.
    if (!d.clock.running && key === d.phase) patch.clock = { running: false, remaining: v * 60 }
    update(patch)
  }

  const r = 46
  const circumference = 2 * Math.PI * r

  return (
    <div className="pomodoro">
      <div className={`pomo-ring phase-${d.phase}`}>
        <svg viewBox="0 0 110 110" aria-hidden>
          <circle cx="55" cy="55" r={r} className="ring-track" />
          <circle
            cx="55"
            cy="55"
            r={r}
            className="ring-fill"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
          />
        </svg>
        <div className="pomo-center">
          <span className="pomo-time mono">{clockText(remaining)}</span>
          <span className="pomo-phase">{PHASE_LABEL[d.phase]}</span>
        </div>
      </div>
      <div className="pomo-rounds" aria-label={`Ronda ${d.round} de ${d.rounds}`}>
        {Array.from({ length: d.rounds }, (_, i) => (
          <i key={i} className={i < d.round - (d.phase === 'focus' ? 1 : 0) ? 'done' : i === d.round - 1 && d.phase === 'focus' ? 'now' : ''} />
        ))}
      </div>
      <div className="row center">
        <button className="icon-btn" title="Reiniciar esta fase" onClick={reset}>
          <Icon name="reload" size={15} />
        </button>
        <button className="play-btn small" title={d.clock.running ? 'Pausar' : 'Empezar'} onClick={toggle}>
          <Icon name={d.clock.running ? 'pause' : 'play'} size={18} />
        </button>
        <button className="icon-btn" title="Saltar a la siguiente fase" onClick={() => advance(false)}>
          <Icon name="skipForward" size={15} />
        </button>
      </div>
      <div className="row pomo-foot">
        <span className="muted grow">Hoy: {completedToday} {completedToday === 1 ? 'bloque' : 'bloques'}</span>
        <button className="icon-btn small" title="Configurar duraciones" aria-expanded={config} onClick={() => setConfig(!config)}>
          <Icon name="settings" size={13} />
        </button>
      </div>
      {config && (
        <div className="inline-config">
          {(
            [
              ['focus', 'Foco (min)'],
              ['short', 'Descanso (min)'],
              ['long', 'Descanso largo (min)'],
              ['rounds', 'Bloques hasta el largo']
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="field inline">
              <span>{label}</span>
              <input className="input tiny" type="number" min={1} value={d[key]} onChange={(e) => setMinutes(key, Number(e.target.value))} />
            </label>
          ))}
          <label className="check-row">
            <input type="checkbox" className="switch" checked={d.autoStart} onChange={(e) => update({ autoStart: e.target.checked })} />
            Empezar la siguiente fase sola
          </label>
        </div>
      )}
    </div>
  )
}
