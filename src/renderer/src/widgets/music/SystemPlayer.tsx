import { useEffect, useState } from 'react'
import { APP_ID, type MediaRepeat, type MediaSession, type NowPlayingState, type RepeatMode } from '../../../../shared/types'
import { useActive, useInterval } from '../../context'
import { Icon } from '../../icons'
import { EmptyState } from '../../ui/controls'
import { BrandLogo, brandOfApp } from '../../BrandLogo'
import { appName, splitArtist } from '../../util'
import type { WidgetProps } from '../types'
import { PlayerUI, type Capability } from './PlayerUI'

const MAX_THUMBS = 20
/** Lo que la app dice que reproduce (si no lo dice, no se inventa). */
const KIND_LABEL: Record<string, string> = { Music: 'Música', Video: 'Vídeo', Image: 'Imagen', Unknown: '' }

const TO_MODE: Record<MediaRepeat, RepeatMode> = { None: 'off', List: 'all', Track: 'one' }
const TO_MEDIA: Record<RepeatMode, MediaRepeat> = { off: 'None', all: 'List', one: 'Track' }
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }

function useNowPlaying(): { state: NowPlayingState | null; thumbs: Record<string, string> } {
  const [state, setState] = useState<NowPlayingState | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  // Solo se escucha mientras el widget se ve (su espacio está activo y la ventana visible): así el
  // PowerShell de «Ahora suena» no sigue vivo con Nido en la bandeja o en otro espacio. Al volver,
  // se muestra al momento lo último conocido mientras llega lo actual.
  const active = useActive()
  useEffect(() => {
    if (!active) return
    return window.nido.nowPlaying.subscribe(setState, (key, dataUrl) =>
      setThumbs((prev) => Object.fromEntries(Object.entries({ ...prev, [key]: dataUrl }).slice(-MAX_THUMBS)))
    )
  }, [active])
  return { state, thumbs }
}

/** Posición estimada: Windows da el progreso en un instante y aquí se interpola. */
function useLivePosition(session: MediaSession | undefined): number {
  const playing = session?.status === 'Playing'
  const [now, setNow] = useState(() => Date.now())
  // Solo se repinta el progreso mientras se ve (el audio de la otra app sigue igual), una vez por
  // segundo: el tiempo se muestra en minutos y segundos.
  const active = useActive()
  useInterval(() => setNow(Date.now()), 1000, playing && active)
  if (!session) return 0
  if (!playing) return session.position
  const position = session.position + Math.max(0, (now - session.updatedAt) / 1000)
  return session.duration > 0 ? Math.min(position, session.duration) : position
}

/** Muestra y controla lo que suena en otras apps (Apple Music, Spotify, navegador…). */
export function SystemPlayer({ widget, update }: WidgetProps<'music'>): JSX.Element {
  const { state, thumbs } = useNowPlaying()
  // Nido también aparece en Windows cuando suena «Mis archivos»: no se muestra aquí.
  const sessions = (state?.sessions ?? []).filter((s) => s.status !== 'Closed' && s.id !== APP_ID)
  const pinned = sessions.find((s) => s.id === widget.data.sessionId)
  // "Auto": lo que está sonando (si suenan varias, la que Windows marca como activa);
  // si no suena nada, la activa; y si no, la primera.
  const session =
    pinned ??
    sessions.find((s) => s.status === 'Playing' && s.current) ??
    sessions.find((s) => s.status === 'Playing') ??
    sessions.find((s) => s.current) ??
    sessions[0]
  const live = useLivePosition(session)

  // Tras pedir un salto se muestra el destino hasta que Windows confirma la nueva posición.
  const [pendingSeek, setPendingSeek] = useState<{ target: number; at: number } | null>(null)
  useEffect(() => {
    if (!pendingSeek) return
    const timer = setTimeout(() => setPendingSeek(null), 3000)
    return () => clearTimeout(timer)
  }, [pendingSeek])
  const position = pendingSeek && session && session.updatedAt < pendingSeek.at ? pendingSeek.target : live

  if (!state) return <EmptyState title="Conectando con Windows…" />

  if (!state.available) {
    return (
      <EmptyState icon={<Icon name="music" size={18} />} title="No disponible">
        {state.error ?? 'Los controles multimedia de Windows no responden.'}
      </EmptyState>
    )
  }

  if (!session) {
    return (
      <EmptyState icon={<Icon name="music" size={18} />} title="No suena nada">
        Reproduce algo en Apple Music, Spotify o el navegador y aparecerá aquí.
      </EmptyState>
    )
  }

  const app = appName(session.id)
  const { artist, album } = splitArtist(session.artist, session.album)
  const playing = session.status === 'Playing'
  const send = (command: Parameters<typeof window.nido.nowPlaying.command>[1], value?: number | boolean | string): void =>
    window.nido.nowPlaying.command(session.id, command, value)

  // Un único motivo para todo lo que la app no permite, así la nota queda corta.
  // El volumen nunca se puede: Windows no expone el de otra app a través de estos controles.
  const missing = [
    !session.canSeek && 'la posición',
    !session.canShuffle && 'el aleatorio',
    !session.canRepeat && 'la repetición',
    'el volumen'
  ].filter(Boolean) as string[]
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} ni ${missing[missing.length - 1]}` : missing[0]
  const appReason = `${app} no deja cambiar ${list} desde Nido.`
  const cap = (enabled: boolean): Capability => (enabled ? { enabled } : { enabled, reason: appReason })
  const repeatMode = session.repeat ? TO_MODE[session.repeat] : 'off'

  return (
    <div className="system-player">
      {sessions.length > 1 && (
        <div className="chip-row">
          <button
            className={`chip ${!pinned ? 'active' : ''}`}
            title="Seguir a la app que está sonando"
            onClick={() => update({ sessionId: undefined })}
          >
            Auto
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`chip ${pinned?.id === s.id ? 'active' : ''}`}
              title={s.title}
              onClick={() => update({ sessionId: s.id })}
            >
              {s.status === 'Playing' && <span className="live-dot" />}
              {brandOfApp(s.id) && <BrandLogo brand={brandOfApp(s.id)!} name={appName(s.id)} size={16} decorative />}
              {appName(s.id)}
            </button>
          ))}
        </div>
      )}

      <PlayerUI
        hideUnavailable
        artwork={session.thumbKey ? thumbs[session.thumbKey] : null}
        badge={
          <span className="app-badge">
            {playing && <span className="live-dot" />}
            {brandOfApp(session.id) && <BrandLogo brand={brandOfApp(session.id)!} name={app} size={18} decorative />}
            {app}
            {KIND_LABEL[session.kind ?? 'Unknown'] && <span className="kind">· {KIND_LABEL[session.kind ?? 'Unknown']}</span>}
          </span>
        }
        title={session.title || 'Sin título'}
        subtitle={artist}
        detail={album}
        playing={playing}
        position={position}
        duration={session.duration}
        seek={cap(session.canSeek)}
        onSeek={(t) => {
          setPendingSeek({ target: t, at: Date.now() })
          send('seek', t)
        }}
        toggle={session.canToggle ? { enabled: true } : { enabled: false, reason: `${app} no permite pausar ahora.` }}
        onToggle={() => send('toggle')}
        prev={session.canPrev ? { enabled: true } : { enabled: false, reason: `${app} no ofrece pista anterior ahora.` }}
        onPrev={() => send('prev')}
        next={session.canNext ? { enabled: true } : { enabled: false, reason: `${app} no ofrece pista siguiente ahora.` }}
        onNext={() => send('next')}
        shuffle={{ ...cap(session.canShuffle), active: !!session.shuffle }}
        onShuffle={() => send('shuffle', !session.shuffle)}
        repeat={{ ...cap(session.canRepeat), mode: repeatMode }}
        onRepeat={() => send('repeat', TO_MEDIA[NEXT_REPEAT[repeatMode]])}
        volume={{ enabled: false, reason: appReason, value: 1, muted: false }}
        onVolume={() => undefined}
        onMute={() => undefined}
      />
    </div>
  )
}
