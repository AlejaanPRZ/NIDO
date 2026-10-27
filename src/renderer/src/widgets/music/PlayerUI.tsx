import { useState, type CSSProperties, type ReactNode } from 'react'
import type { RepeatMode } from '../../../../shared/types'
import { Icon } from '../../icons'
import { formatTime, parseTime } from '../../util'

/** Si un control está disponible y, si no, por qué (se muestra al usuario). */
export interface Capability {
  enabled: boolean
  reason?: string
}

export interface PlayerUIProps {
  artwork?: string | null
  title: string
  subtitle?: string
  detail?: string
  badge?: ReactNode
  playing: boolean
  position: number
  duration: number
  seek: Capability
  onSeek(seconds: number): void
  toggle: Capability
  onToggle(): void
  prev: Capability
  onPrev(): void
  next: Capability
  onNext(): void
  shuffle: Capability & { active: boolean }
  onShuffle(): void
  repeat: Capability & { mode: RepeatMode }
  onRepeat(): void
  volume: Capability & { value: number; muted: boolean }
  onVolume(value: number): void
  onMute(): void
}

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repetir: desactivado',
  all: 'Repetir: toda la lista',
  one: 'Repetir: esta canción'
}

/** title con el motivo cuando el control está desactivado. */
const tip = (label: string, cap: Capability): string => (cap.enabled ? label : `${label} — ${cap.reason ?? 'No disponible'}`)

export function PlayerUI(p: PlayerUIProps): JSX.Element {
  const [drag, setDrag] = useState<number | null>(null)
  const [jumping, setJumping] = useState(false)
  const [jumpText, setJumpText] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)

  const shown = drag ?? p.position
  const pct = p.duration > 0 ? Math.min(100, (shown / p.duration) * 100) : 0
  const volumePct = (p.volume.muted ? 0 : p.volume.value) * 100

  const commitSeek = (): void => {
    if (drag !== null) p.onSeek(drag)
    setDrag(null)
  }

  const submitJump = (): void => {
    const seconds = parseTime(jumpText)
    if (seconds === null) {
      setJumpError('Usa minutos:segundos, por ejemplo 02:35')
      return
    }
    if (p.duration > 0 && seconds > p.duration) {
      setJumpError(`La canción dura ${formatTime(p.duration)}`)
      return
    }
    p.onSeek(seconds)
    setJumping(false)
    setJumpError(null)
  }

  // Motivos de lo que no está disponible, sin repetir, en una sola línea.
  const reasons = [
    ...new Set(
      [p.seek, p.shuffle, p.repeat, p.volume, p.prev, p.next].filter((c) => !c.enabled && c.reason).map((c) => c.reason!)
    )
  ]

  return (
    <div className="player">
      <div className="player-head">
        <div className="artwork">{p.artwork ? <img src={p.artwork} alt="" /> : <Icon name="music" size={24} />}</div>
        <div className="player-info">
          {p.badge}
          <div className="player-title" title={p.title}>
            {p.title}
          </div>
          {p.subtitle && (
            <div className="player-sub" title={p.subtitle}>
              {p.subtitle}
            </div>
          )}
          {p.detail && (
            <div className="player-detail" title={p.detail}>
              {p.detail}
            </div>
          )}
        </div>
      </div>

      <div className="seek-wrap" title={p.seek.enabled ? undefined : p.seek.reason}>
        <input
          className="range seek"
          type="range"
          aria-label="Posición en la canción"
          min={0}
          max={p.duration || 0}
          step={0.5}
          value={Math.min(shown, p.duration || 0)}
          disabled={!p.seek.enabled || p.duration <= 0}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={() => drag !== null && commitSeek()}
        />
      </div>

      <div className="times">
        {jumping ? (
          <form
            className="jump"
            onSubmit={(e) => {
              e.preventDefault()
              submitJump()
            }}
          >
            <input
              className="input tiny mono"
              autoFocus
              aria-label="Ir al minuto"
              placeholder="02:35"
              value={jumpText}
              onChange={(e) => {
                setJumpText(e.target.value)
                setJumpError(null)
              }}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setJumping(false))}
              onBlur={() => !jumpText && setJumping(false)}
            />
            <button className="btn tiny primary" type="submit">
              Ir
            </button>
          </form>
        ) : (
          <button
            className="time-btn mono"
            disabled={!p.seek.enabled || p.duration <= 0}
            title={tip('Ir a un minuto concreto', p.seek)}
            onClick={() => {
              setJumpText(formatTime(p.position))
              setJumping(true)
            }}
          >
            {formatTime(shown)}
          </button>
        )}
        <span className="mono muted">{p.duration > 0 ? formatTime(p.duration) : '--:--'}</span>
      </div>
      {jumpError && <div className="field-error">{jumpError}</div>}

      <div className="transport">
        <button
          className={`icon-btn ${p.shuffle.active ? 'on' : ''}`}
          aria-pressed={p.shuffle.active}
          disabled={!p.shuffle.enabled}
          title={tip(p.shuffle.active ? 'Aleatorio: activado' : 'Aleatorio: desactivado', p.shuffle)}
          onClick={p.onShuffle}
        >
          <Icon name="shuffle" size={16} />
        </button>
        <button className="icon-btn big" disabled={!p.prev.enabled} title={tip('Anterior', p.prev)} onClick={p.onPrev}>
          <Icon name="skipBack" size={18} />
        </button>
        <button
          className="play-btn"
          disabled={!p.toggle.enabled}
          title={tip(p.playing ? 'Pausa' : 'Reproducir', p.toggle)}
          onClick={p.onToggle}
        >
          <Icon name={p.playing ? 'pause' : 'play'} size={20} />
        </button>
        <button className="icon-btn big" disabled={!p.next.enabled} title={tip('Siguiente', p.next)} onClick={p.onNext}>
          <Icon name="skipForward" size={18} />
        </button>
        <button
          className={`icon-btn ${p.repeat.mode !== 'off' ? 'on' : ''}`}
          aria-pressed={p.repeat.mode !== 'off'}
          disabled={!p.repeat.enabled}
          title={tip(REPEAT_LABEL[p.repeat.mode], p.repeat)}
          onClick={p.onRepeat}
        >
          <Icon name={p.repeat.mode === 'one' ? 'repeatOne' : 'repeat'} size={16} />
        </button>
      </div>

      <div className="volume-row" title={p.volume.enabled ? undefined : p.volume.reason}>
        <button
          className="icon-btn"
          disabled={!p.volume.enabled}
          aria-pressed={p.volume.muted}
          title={tip(p.volume.muted ? 'Quitar silencio' : 'Silenciar', p.volume)}
          onClick={p.onMute}
        >
          <Icon name={p.volume.muted || p.volume.value === 0 ? 'volumeOff' : 'volume'} size={16} />
        </button>
        <input
          className="range volume"
          type="range"
          aria-label="Volumen"
          min={0}
          max={1}
          step={0.01}
          value={p.volume.muted ? 0 : p.volume.value}
          disabled={!p.volume.enabled}
          style={{ '--pct': `${volumePct}%` } as CSSProperties}
          onChange={(e) => p.onVolume(Number(e.target.value))}
        />
        <span className="mono muted vol-num">{p.volume.enabled ? Math.round(volumePct) : '—'}</span>
      </div>

      {reasons.length > 0 && (
        <p className="player-note">
          <Icon name="help" size={13} />
          <span>{reasons.join(' ')}</span>
        </p>
      )}
    </div>
  )
}
