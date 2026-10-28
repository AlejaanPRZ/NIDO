import type { CountdownState } from '../../../shared/types'
import { toast } from '../ui/feedback'

/** Segundos que quedan de una cuenta atrás (guardada con su hora de fin si corre). */
export function remainingOf(clock: CountdownState, now = Date.now()): number {
  return clock.running && clock.endsAt ? Math.max(0, (clock.endsAt - now) / 1000) : clock.remaining
}

export const startClock = (clock: CountdownState, now = Date.now()): CountdownState => ({
  running: true,
  endsAt: now + clock.remaining * 1000,
  remaining: clock.remaining
})

export const pauseClock = (clock: CountdownState, now = Date.now()): CountdownState => ({
  running: false,
  remaining: Math.ceil(remainingOf(clock, now))
})

let audio: AudioContext | null = null

/** Campanita corta generada (sin archivos de sonido). */
export function chime(): void {
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.6)
      osc.connect(gain).connect(audio.destination)
      osc.start(t + i * 0.18)
      osc.stop(t + i * 0.18 + 0.65)
    }
  } catch {
    // Sin audio disponible: queda el aviso visual.
  }
}

/** Aviso de fin: sonido, notificación de Windows y aviso dentro de Nido. */
export function announce(title: string, body: string): void {
  chime()
  try {
    new Notification(title, { body })
  } catch {
    // Si Windows no deja notificar, queda el toast.
  }
  toast(`${title} · ${body}`, 'success')
}

/** "m:ss" o "h:mm:ss" para cuentas atrás (redondeando hacia arriba). */
export function clockText(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`
}
