import { useEffect, useRef, useState } from 'react'
import type { Track } from '../../../shared/types'
import { formatTime } from '../util'
import { Icon } from '../icons'
import type { WidgetProps } from './types'

export function MusicWidget({ widget, update }: WidgetProps<'music'>): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const { tracks, volume } = widget.data
  const current = Math.min(widget.data.current, Math.max(0, tracks.length - 1))
  const track: Track | undefined = tracks[current]
  const src = track ? window.nido.mediaUrl(track.path) : undefined

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Intención del usuario de reproducir, independiente de los eventos pause/ended
  // que el elemento emite al terminar o cambiar de pista.
  const wantPlayRef = useRef(false)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !src) return
    setError(null)
    setPosition(0)
    if (wantPlayRef.current) audio.play().catch(() => (wantPlayRef.current = false))
  }, [src])

  const addTracks = (incoming: Track[]): void => {
    const known = new Set(tracks.map((t) => t.path))
    const fresh = incoming.filter((t) => !known.has(t.path))
    if (fresh.length) update({ tracks: [...tracks, ...fresh] })
  }

  const select = (index: number): void => {
    if (!tracks.length) return
    update({ current: (index + tracks.length) % tracks.length })
  }

  const toggle = (): void => {
    const audio = audioRef.current
    if (!audio || !track) return
    if (audio.paused) {
      wantPlayRef.current = true
      audio.play().catch(() => {
        wantPlayRef.current = false
        setError('No se pudo reproducir este archivo.')
      })
    } else {
      wantPlayRef.current = false
      audio.pause()
    }
  }

  const removeTrack = (index: number): void => {
    const next = tracks.filter((_, i) => i !== index)
    update({ tracks: next, current: index < current ? current - 1 : Math.min(current, Math.max(0, next.length - 1)) })
  }

  return (
    <div className="music">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (current < tracks.length - 1) select(current + 1)
          else wantPlayRef.current = false
        }}
        onError={() => track && setError(`No se encuentra o no se puede leer: ${track.name}`)}
      />

      <div className="now-playing">
        <div className="np-title">{track ? track.name : 'Sin música'}</div>
        <div className="np-sub muted">
          {tracks.length ? `Pista ${current + 1} de ${tracks.length}` : 'Añade archivos o una carpeta'}
        </div>
      </div>

      <input
        className="seek"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={position}
        disabled={!track}
        onChange={(e) => {
          const t = Number(e.target.value)
          if (audioRef.current) audioRef.current.currentTime = t
          setPosition(t)
        }}
      />
      <div className="row muted times">
        <span className="grow">{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="row transport">
        <button className="icon-btn big" title="Anterior" disabled={!track} onClick={() => select(current - 1)}>
          <Icon name="skipBack" size={18} />
        </button>
        <button className="pill dark round play" title={playing ? 'Pausa' : 'Reproducir'} disabled={!track} onClick={toggle}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button className="icon-btn big" title="Siguiente" disabled={!track} onClick={() => select(current + 1)}>
          <Icon name="skipForward" size={18} />
        </button>
        <span className="volume-icon muted">
          <Icon name="volume" size={15} />
        </span>
        <input
          className="volume grow"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          title={`Volumen ${Math.round(volume * 100)}%`}
          onChange={(e) => update({ volume: Number(e.target.value) })}
        />
      </div>

      {error && <div className="error">{error}</div>}

      <ul className="list scroll playlist">
        {tracks.map((t, i) => (
          <li key={t.path} className={`track ${i === current ? 'active' : ''}`} title={t.path}>
            <button className="track-name grow" onClick={() => select(i)}>
              {t.name}
            </button>
            <button className="icon-btn" title="Quitar de la lista" onClick={() => removeTrack(i)}>
              <Icon name="close" size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="row widget-footer">
        <button className="pill" onClick={() => window.nido.pickAudioFiles().then(addTracks)}>
          <Icon name="plus" size={14} />
          Archivos
        </button>
        <button className="pill" onClick={() => window.nido.pickAudioFolder().then(addTracks)}>
          <Icon name="folder" size={14} />
          Carpeta
        </button>
        <span className="grow" />
        {tracks.length > 0 && (
          <button
            className="link-btn"
            onClick={() => {
              wantPlayRef.current = false
              audioRef.current?.pause()
              update({ tracks: [], current: 0 })
            }}
          >
            Vaciar
          </button>
        )}
      </div>
    </div>
  )
}
