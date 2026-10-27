import { useEffect, useRef, useState } from 'react'
import type { RepeatMode, Track } from '../../../../shared/types'
import { Icon } from '../../icons'
import type { WidgetProps } from '../types'
import { PlayerUI } from './PlayerUI'

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }

/** Reproductor de archivos de audio propios (mp3, flac…) servidos por nido-media://. */
export function LocalPlayer({ widget, update }: WidgetProps<'music'>): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const { tracks, volume } = widget.data
  const muted = !!widget.data.muted
  const shuffle = !!widget.data.shuffle
  const repeat = widget.data.repeat ?? 'off'
  const current = Math.min(widget.data.current, Math.max(0, tracks.length - 1))
  const track: Track | undefined = tracks[current]
  const src = track ? window.nido.mediaUrl(track.path) : undefined

  // Historial para que «Anterior» en aleatorio vuelva a la canción que sonó.
  const history = useRef<number[]>([])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = volume
    audioRef.current.muted = muted
  }, [volume, muted])

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

  const go = (index: number, remember = true): void => {
    if (!tracks.length) return
    if (remember) history.current = [...history.current.slice(-50), current]
    update({ current: (index + tracks.length) % tracks.length })
  }

  const randomOther = (): number => {
    if (tracks.length < 2) return current
    let i = current
    while (i === current) i = Math.floor(Math.random() * tracks.length)
    return i
  }

  const next = (): void => go(shuffle ? randomOther() : current + 1)

  const prev = (): void => {
    const audio = audioRef.current
    // Como en cualquier reproductor: si ya lleva un rato, vuelve al principio.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    if (shuffle && history.current.length) go(history.current.pop()!, false)
    else go(current - 1)
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

  const onEnded = (): void => {
    const audio = audioRef.current
    if (repeat === 'one' && audio) {
      audio.currentTime = 0
      audio.play().catch(() => undefined)
    } else if (shuffle && tracks.length > 1) {
      go(randomOther())
    } else if (current < tracks.length - 1) {
      go(current + 1)
    } else if (repeat === 'all' && tracks.length > 0) {
      if (tracks.length === 1 && audio) {
        audio.currentTime = 0
        audio.play().catch(() => undefined)
      } else go(0)
    } else {
      wantPlayRef.current = false
    }
  }

  const removeTrack = (index: number): void => {
    const rest = tracks.filter((_, i) => i !== index)
    history.current = []
    update({ tracks: rest, current: index < current ? current - 1 : Math.min(current, Math.max(0, rest.length - 1)) })
  }

  const noTrack = { enabled: false, reason: 'Añade canciones para empezar.' }
  const has = (enabled: boolean, reason?: string) => (track ? { enabled, reason } : noTrack)

  return (
    <div className="local-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        onError={() => track && setError(`No se encuentra o no se puede leer: ${track.name}`)}
      />

      <PlayerUI
        title={track ? track.name : 'Sin canciones'}
        subtitle={tracks.length ? `Pista ${current + 1} de ${tracks.length}` : 'Añade archivos o una carpeta'}
        playing={playing}
        position={position}
        duration={duration}
        seek={has(duration > 0, 'El archivo aún no ha cargado.')}
        onSeek={(t) => {
          if (audioRef.current) audioRef.current.currentTime = Math.min(t, duration)
          setPosition(t)
        }}
        toggle={has(true)}
        onToggle={toggle}
        prev={has(true)}
        onPrev={prev}
        next={has(tracks.length > 1, 'Solo hay una canción en la lista.')}
        onNext={next}
        shuffle={{ ...has(tracks.length > 1, 'Solo hay una canción en la lista.'), active: shuffle }}
        onShuffle={() => update({ shuffle: !shuffle })}
        repeat={{ ...has(true), mode: repeat }}
        onRepeat={() => update({ repeat: NEXT_REPEAT[repeat] })}
        volume={{ enabled: true, value: volume, muted }}
        onVolume={(v) => update({ volume: v, muted: v === 0 ? muted : false })}
        onMute={() => update({ muted: !muted })}
      />

      {error && <div className="field-error">{error}</div>}

      <ul className="list scroll playlist">
        {tracks.map((t, i) => (
          <li key={t.path} className={`track ${i === current ? 'active' : ''}`} title={t.path}>
            <button className="track-name" onClick={() => go(i)}>
              {i === current && playing && <span className="eq" aria-hidden />}
              {t.name}
            </button>
            <button className="icon-btn small hover-only" title="Quitar de la lista" onClick={() => removeTrack(i)}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>

      <div className="widget-footer row">
        <button className="btn small" onClick={() => window.nido.pickAudioFiles().then(addTracks)}>
          <Icon name="plus" size={13} />
          Archivos
        </button>
        <button className="btn small" onClick={() => window.nido.pickAudioFolder().then(addTracks)}>
          <Icon name="folder" size={13} />
          Carpeta
        </button>
        <span className="grow" />
        {tracks.length > 0 && (
          <button
            className="link-btn"
            onClick={() => {
              wantPlayRef.current = false
              audioRef.current?.pause()
              history.current = []
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
