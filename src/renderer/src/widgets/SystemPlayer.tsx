import { useEffect, useState } from 'react'
import type { MediaCommand, MediaSession, NowPlayingState } from '../../../shared/types'
import { Icon } from '../icons'
import { appName, formatTime, splitArtist } from '../util'
import type { WidgetProps } from './types'

const MAX_THUMBS = 20

function useNowPlaying(): { state: NowPlayingState | null; thumbs: Record<string, string> } {
  const [state, setState] = useState<NowPlayingState | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(
    () =>
      window.nido.nowPlaying.subscribe(setState, (key, dataUrl) =>
        setThumbs((prev) => {
          const entries = Object.entries({ ...prev, [key]: dataUrl })
          return Object.fromEntries(entries.slice(-MAX_THUMBS))
        })
      ),
    []
  )
  return { state, thumbs }
}

/** Posición estimada: Windows da el progreso en un instante y aquí se interpola. */
function useLivePosition(session: MediaSession | undefined): number {
  const playing = session?.status === 'Playing'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [playing])
  if (!session) return 0
  if (!playing) return session.position
  const elapsed = Math.max(0, (now - session.updatedAt) / 1000)
  const position = session.position + elapsed
  return session.duration > 0 ? Math.min(position, session.duration) : position
}

/** Muestra y controla lo que suena en otras apps (Apple Music, Spotify, navegador…). */
export function SystemPlayer({ widget, update }: WidgetProps<'music'>): JSX.Element {
  const { state, thumbs } = useNowPlaying()
  const sessions = (state?.sessions ?? []).filter((s) => s.status !== 'Closed')
  const pinned = sessions.find((s) => s.id === widget.data.sessionId)
  // "Auto": lo que está sonando (si suenan varias, la que Windows marca como activa);
  // si no suena nada, la activa; y si no, la primera.
  const session =
    pinned ??
    sessions.find((s) => s.status === 'Playing' && s.current) ??
    sessions.find((s) => s.status === 'Playing') ??
    sessions.find((s) => s.current) ??
    sessions[0]
  const position = useLivePosition(session)

  if (!state) {
    return <div className="np-empty muted">Conectando con Windows…</div>
  }

  if (!state.available) {
    return (
      <div className="np-empty">
        <span className="empty-badge small">
          <Icon name="music" size={18} />
        </span>
        <p className="np-empty-title">No disponible</p>
        <p className="muted">{state.error ?? 'Los controles multimedia de Windows no responden.'}</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="np-empty">
        <span className="empty-badge small">
          <Icon name="music" size={18} />
        </span>
        <p className="np-empty-title">No suena nada</p>
        <p className="muted">Reproduce algo en Apple Music, Spotify o el navegador y aparecerá aquí.</p>
      </div>
    )
  }

  const { artist, album } = splitArtist(session.artist, session.album)
  const thumb = session.thumbKey ? thumbs[session.thumbKey] : undefined
  const playing = session.status === 'Playing'
  const progress = session.duration > 0 ? (position / session.duration) * 100 : 0
  const send = (command: MediaCommand): void => window.nido.nowPlaying.command(session.id, command)

  return (
    <div className="system-player">
      {sessions.length > 1 && (
        <div className="session-switch">
          <button
            className={`pill small ${!pinned ? 'dark' : ''}`}
            title="Seguir a la app que está sonando"
            onClick={() => update({ sessionId: undefined })}
          >
            Auto
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`pill small ${pinned?.id === s.id ? 'dark' : ''}`}
              title={s.title}
              onClick={() => update({ sessionId: s.id })}
            >
              {s.status === 'Playing' && <span className="live-dot" />}
              {appName(s.id)}
            </button>
          ))}
        </div>
      )}

      <div className="np-main">
        <div className="artwork">{thumb ? <img src={thumb} alt="" /> : <Icon name="music" size={26} />}</div>
        <div className="np-info">
          <span className="np-app">
            {playing && <span className="live-dot" />}
            {appName(session.id)}
          </span>
          <div className="np-title" title={session.title}>
            {session.title || 'Sin título'}
          </div>
          {artist && (
            <div className="np-artist" title={artist}>
              {artist}
            </div>
          )}
          {album && (
            <div className="np-album muted" title={album}>
              {album}
            </div>
          )}
        </div>
      </div>

      {session.duration > 0 && (
        <>
          <div className="progress" aria-hidden>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="row muted times">
            <span className="grow">{formatTime(position)}</span>
            <span>{formatTime(session.duration)}</span>
          </div>
        </>
      )}

      <div className="row transport center">
        <button className="icon-btn big" title="Anterior" disabled={!session.canPrev} onClick={() => send('prev')}>
          <Icon name="skipBack" size={18} />
        </button>
        <button
          className="pill dark round play"
          title={playing ? 'Pausa' : 'Reproducir'}
          disabled={!session.canToggle}
          onClick={() => send('toggle')}
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button className="icon-btn big" title="Siguiente" disabled={!session.canNext} onClick={() => send('next')}>
          <Icon name="skipForward" size={18} />
        </button>
      </div>
    </div>
  )
}
