import { useEffect, useRef, useState } from 'react'
import { ANIMATIONS, H, PALETTE, paint, W, type Activity, type Pose } from './sprite'

// Braco de Weimar que pasea por el borde inferior de Nido y hace cosas de perro: olfatear, sentarse, mover la
// cola, quedarse en muestra, rascarse, estirarse, ladrar y dormir (más si no tocas el equipo un rato).
// Un bucle de requestAnimationFrame lo mueve sin repintar React; los fotogramas se dibujan una sola
// vez. No recibe clics salvo sobre el propio perro (acariciarlo), y se para al arrastrar widgets, con
// la ventana oculta y con «Reducir movimiento».

const SCALE = 3
const SPRITE_W = W * SCALE
const SPRITE_H = H * SCALE
const SPEED = 46 // px por segundo
const MARGIN = 10
const IDLE_MS = 90_000

type Bubble = { kind: 'bark' | 'zzz' | 'hearts'; key: number } | null

/** Actividad, duración (s) y peso al elegir; sleepy: si llevas un rato sin tocar nada. */
const ACTIVITIES: { name: Activity; min: number; max: number; weight: number; sleepy: number }[] = [
  { name: 'sniff', min: 2, max: 4, weight: 5, sleepy: 1 },
  { name: 'sit', min: 3, max: 7, weight: 4, sleepy: 2 },
  { name: 'wag', min: 1.5, max: 3, weight: 3, sleepy: 0 },
  { name: 'point', min: 2.5, max: 4.5, weight: 2, sleepy: 0 },
  { name: 'scratch', min: 1.2, max: 2.2, weight: 2, sleepy: 1 },
  { name: 'stretch', min: 1.2, max: 2, weight: 2, sleepy: 2 },
  { name: 'bark', min: 1, max: 1.6, weight: 1, sleepy: 0 },
  { name: 'sleep', min: 8, max: 16, weight: 1, sleepy: 12 }
]

const cache = new Map<Pose, HTMLCanvasElement>()
function frameCanvas(pose: Pose): HTMLCanvasElement {
  let c = cache.get(pose)
  if (c) return c
  c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const px = paint(pose)
  for (let i = 0; i < px.length; i++) {
    if (!px[i]) continue
    const hex = PALETTE[px[i]]
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16)
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16)
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  cache.set(pose, c)
  return c
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min)

export function Mascot({ reduceMotion }: { reduceMotion: boolean }): JSX.Element {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [bubble, setBubble] = useState<Bubble>(null)
  // Despierta el bucle al instante (al acariciarlo mientras duerme o está quieto).
  const wake = useRef<(() => void) | null>(null)
  // Estado del perro fuera de React: se actualiza en cada fotograma.
  const dog = useRef({
    x: 40,
    dir: 1 as 1 | -1,
    target: 200,
    activity: 'walk' as Activity,
    until: 0,
    frame: 0,
    frameAt: 0,
    drawn: null as Pose | null,
    lastInput: Date.now()
  })

  useEffect(() => {
    const d = dog.current
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    const maxX = (): number => Math.max(MARGIN, window.innerWidth - SPRITE_W - MARGIN)
    d.x = Math.min(d.x, maxX())

    const draw = (pose: Pose): void => {
      if (d.drawn === pose) return
      d.drawn = pose
      ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)
      ctx.drawImage(frameCanvas(pose), 0, 0, SPRITE_W, SPRITE_H)
    }
    // Solo se toca el DOM si algo cambia: escribir el mismo transform en cada fotograma obligaba a
    // recomponer la ventana a la frecuencia del monitor aunque el perro estuviera quieto.
    let placedX = NaN
    let placedDir = 0
    const place = (): void => {
      if (!holder.current) return
      // Posición en múltiplos de un píxel del dibujo, como el pixel art.
      const x = Math.round(d.x / SCALE) * SCALE
      if (x !== placedX) {
        holder.current.style.transform = `translateX(${x}px)`
        placedX = x
      }
      if (d.dir !== placedDir) {
        canvas.current!.style.transform = d.dir < 0 ? 'scaleX(-1)' : ''
        placedDir = d.dir
      }
    }

    const start = (activity: Activity, seconds: number, now: number): void => {
      d.activity = activity
      d.until = now + seconds * 1000
      d.frame = 0
      d.frameAt = now
      setBubble(activity === 'bark' ? { kind: 'bark', key: now } : activity === 'sleep' ? { kind: 'zzz', key: now } : null)
    }
    const walkSomewhere = (now: number): void => {
      const far = window.innerWidth > 600 ? rand(120, 420) : rand(60, 200)
      let target = d.x + (Math.random() < 0.5 ? -far : far)
      target = Math.min(maxX(), Math.max(MARGIN, target))
      if (Math.abs(target - d.x) < 30) target = d.x < maxX() / 2 ? maxX() : MARGIN
      d.target = target
      d.dir = target >= d.x ? 1 : -1
      start('walk', 999, now)
    }
    const pickActivity = (now: number): void => {
      const sleepy = now - d.lastInput > IDLE_MS
      const options = ACTIVITIES.map((a) => ({ ...a, w: sleepy ? a.sleepy : a.weight }))
      let r = Math.random() * options.reduce((s, a) => s + a.w, 0)
      const chosen = options.find((a) => (r -= a.w) < 0) ?? options[0]
      start(chosen.name, rand(chosen.min, chosen.max), now)
    }

    if (reduceMotion) {
      // Sin movimiento: sentado y quieto en la esquina.
      d.activity = 'sit'
      d.x = MARGIN + 8
      d.dir = 1
      place()
      draw(ANIMATIONS.sit.frames[0])
      return
    }

    let raf = 0
    let timer: number | undefined
    let last = performance.now()
    walkSomewhere(last)
    // El bucle solo despierta cuando toca: el siguiente paso, el siguiente fotograma de la animación o la
    // siguiente actividad, no 60–144 veces por segundo.
    const schedule = (now: number): void => {
      const anim = ANIMATIONS[d.activity]
      const nextFrame = anim.frames.length > 1 ? d.frameAt + 1000 / anim.fps : Infinity
      // Andando avanza a saltos de un píxel del dibujo (SCALE px): basta con despertar para el
      // siguiente paso, no en cada fotograma del monitor.
      const nextStep = d.activity === 'walk' ? now + (SCALE / SPEED) * 1000 : d.until
      timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), Math.max(16, Math.min(nextFrame, nextStep) - now))
    }
    wake.current = () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Quieto mientras se arrastra un widget o la ventana no se ve.
      if (document.hidden || document.documentElement.classList.contains('is-pointer-drag')) {
        timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 250)
        return
      }
      const anim = ANIMATIONS[d.activity]
      if (now - d.frameAt >= 1000 / anim.fps) {
        d.frame = (d.frame + 1) % anim.frames.length
        d.frameAt = now
      }
      if (d.activity === 'walk') {
        d.x += d.dir * SPEED * dt
        if ((d.dir > 0 && d.x >= d.target) || (d.dir < 0 && d.x <= d.target) || d.x <= MARGIN || d.x >= maxX()) {
          d.x = Math.min(maxX(), Math.max(MARGIN, d.x))
          pickActivity(now)
        }
      } else if (now >= d.until) {
        // Después de dormir se estira; si no, vuelve a pasear.
        if (d.activity === 'sleep') start('stretch', 1.4, now)
        else walkSomewhere(now)
      }
      place()
      draw(ANIMATIONS[d.activity].frames[d.frame % ANIMATIONS[d.activity].frames.length])
      schedule(now)
    }
    raf = requestAnimationFrame(tick)

    const onInput = (): void => {
      d.lastInput = Date.now()
    }
    const onResize = (): void => {
      d.x = Math.min(d.x, maxX())
      d.target = Math.min(d.target, maxX())
    }
    window.addEventListener('pointerdown', onInput, true)
    window.addEventListener('keydown', onInput, true)
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      wake.current = null
      window.removeEventListener('pointerdown', onInput, true)
      window.removeEventListener('keydown', onInput, true)
      window.removeEventListener('resize', onResize)
    }
  }, [reduceMotion])

  // Acariciarlo: se sienta, mueve la cola y salen corazones.
  const pet = (): void => {
    const d = dog.current
    const now = performance.now()
    d.lastInput = Date.now()
    if (!reduceMotion) {
      d.activity = 'wag'
      d.until = now + 2200
      d.frame = 0
      d.frameAt = now
      wake.current?.()
    }
    setBubble({ kind: 'hearts', key: now })
  }

  useEffect(() => {
    if (!bubble || bubble.kind === 'zzz') return
    const t = setTimeout(() => setBubble(null), bubble.kind === 'hearts' ? 1800 : 1400)
    return () => clearTimeout(t)
  }, [bubble])

  return (
    <div className="mascot" aria-hidden={false}>
      <div className="mascot-dog" ref={holder} style={{ width: SPRITE_W, height: SPRITE_H }}>
        <canvas
          ref={canvas}
          width={SPRITE_W}
          height={SPRITE_H}
          role="img"
          aria-label="Mascota: un braco de Weimar. Haz clic para acariciarlo."
          title="Acariciar"
          onClick={pet}
        />
        <span className="mascot-shadow" />
        {bubble?.kind === 'bark' && (
          <span key={bubble.key} className="mascot-bubble">
            ¡Guau!
          </span>
        )}
        {bubble?.kind === 'zzz' && (
          <span key={bubble.key} className="mascot-zzz" aria-hidden="true">
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        )}
        {bubble?.kind === 'hearts' && (
          <span key={bubble.key} className="mascot-hearts" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  )
}
