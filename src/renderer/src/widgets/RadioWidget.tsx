import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../icons'
import { confirmDialog } from '../ui/feedback'
import { hostOf, uid } from '../util'
import type { WidgetProps } from './types'

type Phase = 'idle' | 'loading' | 'playing' | 'error'

/** Emisoras o episodios por URL de audio directa (MP3/AAC/OGG). No incrusta webs de radio. */
export function RadioWidget({ widget, update }: WidgetProps<'radio'>): JSX.Element {
  const { stations, current, volume } = widget.data
  const audio = useRef<HTMLAudioElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [adding, setAdding] = useState(stations.length === 0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const station = stations.find((s) => s.id === current)

  useEffect(() => {
    if (audio.current) audio.current.volume = volume
  }, [volume])

  const play = (id: string): void => {
    const s = stations.find((x) => x.id === id)
    if (!s || !audio.current) return
    update({ current: id })
    setPhase('loading')
    audio.current.src = s.url
    audio.current.play().catch(() => setPhase('error'))
  }

  const stop = (): void => {
    audio.current?.pause()
    setPhase('idle')
  }

  return (
    <div className="radio">
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setPhase('playing')}
        onWaiting={() => setPhase('loading')}
        onError={() => station && setPhase('error')}
        onPause={() => setPhase((p) => (p === 'error' ? p : 'idle'))}
      />
      <div className="radio-now">
        <button
          className="play-btn small"
          disabled={!station}
          title={phase === 'playing' || phase === 'loading' ? 'Parar' : 'Reproducir'}
          onClick={() => (phase === 'playing' || phase === 'loading' ? stop() : station && play(station.id))}
        >
          <Icon name={phase === 'playing' || phase === 'loading' ? 'pause' : 'play'} size={16} />
        </button>
        <div className="grow radio-info">
          <div className="radio-title">{station?.name ?? 'Elige una emisora'}</div>
          <div className={`radio-status ${phase}`}>
            {phase === 'loading' && 'Conectando…'}
            {phase === 'playing' && (
              <>
                <span className="live-dot" /> En directo
              </>
            )}
            {phase === 'error' && 'No se pudo reproducir: la URL no es un audio directo o no responde.'}
            {phase === 'idle' && (station ? hostOf(station.url) : '')}
          </div>
        </div>
      </div>
      <div className="volume-row">
        <Icon name="volume" size={14} />
        <input
          className="range volume"
          type="range"
          aria-label="Volumen"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          style={{ '--pct': `${volume * 100}%` } as CSSProperties}
          onChange={(e) => update({ volume: Number(e.target.value) })}
        />
      </div>
      <ul className="list scroll">
        {stations.map((s) => (
          <li key={s.id} className={`track ${s.id === current ? 'active' : ''}`}>
            <button className="track-name" onClick={() => play(s.id)} title={s.url}>
              {s.id === current && phase === 'playing' && <span className="eq" aria-hidden />}
              {s.name}
            </button>
            <button
              className="icon-btn small hover-only"
              title="Quitar emisora"
              onClick={async () => {
                if (!(await confirmDialog({ title: 'Quitar emisora', message: `¿Quitar «${s.name}»?`, confirmLabel: 'Quitar' }))) return
                if (s.id === current) stop()
                update({ stations: stations.filter((x) => x.id !== s.id), current: s.id === current ? undefined : current })
              }}
            >
              <Icon name="close" size={11} />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="link-form"
          onSubmit={(e) => {
            e.preventDefault()
            const target = url.trim()
            if (!/^https?:\/\/\S+$/i.test(target)) return
            update({ stations: [...stations, { id: uid(), name: name.trim() || hostOf(target), url: target }] })
            setName('')
            setUrl('')
            setAdding(false)
          }}
        >
          <input className="input tiny" autoFocus placeholder="URL del audio (https://…/stream.mp3)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="input tiny" placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="row">
            {stations.length > 0 && (
              <button type="button" className="btn tiny" onClick={() => setAdding(false)}>
                Cancelar
              </button>
            )}
            <button type="submit" className="btn tiny primary" disabled={!/^https?:\/\/\S+$/i.test(url.trim())}>
              Añadir emisora
            </button>
          </div>
        </form>
      ) : (
        <button className="link-btn add-link" onClick={() => setAdding(true)}>
          <Icon name="plus" size={12} /> Añadir emisora
        </button>
      )}
    </div>
  )
}
