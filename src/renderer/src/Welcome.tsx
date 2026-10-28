import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BrandLogo } from './BrandLogo'
import { useApp } from './context'
import { Icon, type IconName } from './icons'
import { useEscape } from './ui/Modal'

// Recorrido de bienvenida (primer inicio; para repetirlo: botón «?» de la barra, F1 o Ajustes → Ayuda). Cuatro escenas con
// una demostración animada de la interfaz real. Cambiar de escena usa transiciones (si se pulsa
// varias veces seguidas, siguen desde donde estaban); las demostraciones son animaciones CSS en bucle
// que solo corren en la escena visible. El estilo base de cada demostración es su estado final, así
// que con movimiento reducido se ve una imagen fija que ya explica la función.

interface Scene {
  id: 'add' | 'move' | 'spaces' | 'connect'
  kicker?: string
  title: string
  text: ReactNode
  demo: () => JSX.Element
}

const kbd = (k: string): JSX.Element => <kbd className="ob-kbd">{k}</kbd>

const SCENES: Scene[] = [
  {
    id: 'add',
    kicker: 'Bienvenido a Nido',
    title: 'Todo en un panel',
    text: (
      <>
        Pulsa «Añadir widget» y elige en el catálogo: notas, tareas, calendario, Pomodoro, tiempo, música, webs… Cada uno, en tamaño pequeño, mediano o grande.
      </>
    ),
    demo: AddDemo
  },
  {
    id: 'move',
    title: 'Colócalo a tu manera',
    text: (
      <>
        Arrastra un widget por su cabecera: si lo sueltas sobre otro, se intercambian. Redimensiónalo desde la esquina, fija los que no quieras mover y deshaz con {kbd('Ctrl')} {kbd('Z')}.
      </>
    ),
    demo: MoveDemo
  },
  {
    id: 'spaces',
    title: 'Un espacio para cada cosa',
    text: (
      <>
        Trabajo, Personal y Estudio vienen de serie, y puedes crear los tuyos con icono y color. Cambia entre ellos con {kbd('Ctrl')} {kbd('1…9')}: la música y los temporizadores siguen sonando.
      </>
    ),
    demo: SpacesDemo
  },
  {
    id: 'connect',
    title: 'Tus cuentas y todo a mano',
    text: (
      <>
        Conecta Google Calendar y Notion en Ajustes → Conexiones. {kbd('Ctrl')} {kbd('K')} busca en notas, tareas, eventos y enlaces, y el widget Multimedia controla lo que suena en otras apps.
      </>
    ),
    demo: ConnectDemo
  }
]

/** Bienvenida en varias escenas. onClose se llama al terminar o al saltarla (las dos la marcan como vista). */
export function Welcome({ onClose }: { onClose(): void }): JSX.Element {
  const { openSettings } = useApp()
  const [index, setIndex] = useState(0)
  const dialog = useRef<HTMLElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const last = index === SCENES.length - 1
  const scene = SCENES[index]

  useEscape(onClose)
  useEffect(() => primary.current?.focus(), [index])

  const clamp = (n: number): number => Math.max(0, Math.min(SCENES.length - 1, n))
  // Paso relativo con el valor más reciente: varios clics seguidos suman (no se pierden).
  const step = (delta: number): void => setIndex((i) => clamp(i + delta))
  const go = (n: number): void => setIndex(clamp(n))
  const next = (): void => (last ? onClose() : step(1))

  // Flechas para avanzar y retroceder; Tab no se sale de la ventana.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Tab' && dialog.current) {
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])')].filter((el) => el.offsetParent !== null)
      const first = focusable[0]
      const end = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        end?.focus()
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  return createPortal(
    <div className="ob-backdrop">
      <section ref={dialog} className="onboarding" role="dialog" aria-modal aria-labelledby={`ob-title-${scene.id}`} onKeyDown={onKeyDown}>
        <header className="ob-head">
          <span className="ob-progress" aria-live="polite">
            Paso {index + 1} de {SCENES.length}
          </span>
          <button className="btn small ghost ob-skip" onClick={onClose}>
            Saltar
          </button>
        </header>

        <DemoStage>
          {SCENES.map((s, i) => (
            <div key={s.id} className={`ob-scene ob-demo ob-demo-${s.id} ${sceneState(i, index)}`} aria-hidden="true">
              <s.demo />
            </div>
          ))}
        </DemoStage>

        <div className="ob-copy">
          {SCENES.map((s, i) => (
            <div key={s.id} className={`ob-scene ob-text ${sceneState(i, index)}`} aria-hidden={i !== index} {...(i !== index ? { inert: '' } : {})}>
              {s.kicker && <p className="ob-kicker">{s.kicker}</p>}
              <h2 id={`ob-title-${s.id}`}>{s.title}</h2>
              <p>{s.text}</p>
              {s.id === 'connect' && (
                <button
                  className="link-btn ob-link"
                  tabIndex={i === index ? 0 : -1}
                  onClick={() => {
                    onClose()
                    openSettings('conexiones')
                  }}
                >
                  Abrir Conexiones
                </button>
              )}
            </div>
          ))}
        </div>

        <footer className="ob-foot">
          <div className="ob-dots" role="tablist" aria-label="Pasos">
            {SCENES.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === index}
                aria-label={`Paso ${i + 1}: ${s.title}`}
                className={`ob-dot ${i === index ? 'active' : ''}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="ob-nav">
            <button className="btn ob-back" onClick={() => step(-1)} disabled={index === 0} style={{ visibility: index === 0 ? 'hidden' : undefined }}>
              Atrás
            </button>
            <button ref={primary} className="btn primary ob-next" onClick={next}>
              {last ? 'Empezar' : 'Siguiente'}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  )
}

/** Escena actual, anterior (sale por la izquierda) o siguiente (entra por la derecha). */
const sceneState = (i: number, index: number): string => (i === index ? 'is-active' : i < index ? 'is-before' : 'is-after')

/**
 * Las demostraciones se diseñan a 440×220 y se escalan para caber en el ancho disponible
 * (ventana estrecha o pantalla pequeña) sin recolocar nada.
 */
function DemoStage({ children }: { children: ReactNode }): JSX.Element {
  const outer = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    // Cabe a lo ancho y, en ventanas bajas, deja sitio al texto y los botones.
    const measure = (): void => setScale(Math.max(0.5, Math.min(1.25, el.clientWidth / 440, (window.innerHeight * 0.4) / 220)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return (
    <div ref={outer} className="ob-stage" style={{ height: 220 * scale }}>
      <div className="ob-screen" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

// ---------- Piezas de las demostraciones (versión en miniatura de la interfaz) ----------

function MiniBar({ active = 0 }: { active?: number }): JSX.Element {
  return (
    <div className="ob-bar">
      <span className="brand-mark ob-brand" />
      <span className="ob-tab-pill" />
      {['Trabajo', 'Personal', 'Estudio'].map((t, i) => (
        <span key={t} className={`ob-tab ${i === active ? 'on' : ''}`}>
          {t}
        </span>
      ))}
      <span className="ob-add">
        <Icon name="plus" size={10} /> Añadir widget
      </span>
    </div>
  )
}

function Tile({ icon, tint, title, className = '', children }: { icon: IconName; tint: string; title: string; className?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className={`ob-tile ${className}`}>
      <div className="ob-tile-head">
        <span className="ob-tile-icon" style={{ background: tint }}>
          <Icon name={icon} size={9} />
        </span>
        {title}
      </div>
      <div className="ob-tile-body">{children ?? <Lines n={2} />}</div>
    </div>
  )
}

const Lines = ({ n }: { n: number }): JSX.Element => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className="ob-line" style={{ width: `${88 - i * 22}%` }} />
    ))}
  </>
)

const Cursor = (): JSX.Element => <span className="ob-cursor" />

const RED = 'linear-gradient(160deg, #ff6b6b, #e5383b)'
const BLUE = 'linear-gradient(160deg, #5ac8fa, #0a84ff)'
const YELLOW = 'linear-gradient(160deg, #ffd25a, #f5a524)'
const PINK = 'linear-gradient(160deg, #ff7aa8, #e8467c)'
const SKY = 'linear-gradient(160deg, #7dd3fc, #38bdf8)'
const VIOLET = 'linear-gradient(160deg, #a78bfa, #7c5cf0)'
const ORANGE = 'linear-gradient(160deg, #ffb066, #ff7a1a)'

function AddDemo(): JSX.Element {
  return (
    <>
      <MiniBar />
      <Tile className="ob-a" icon="calendar" tint={RED} title="Calendario">
        <span className="ob-cal" />
      </Tile>
      <Tile className="ob-b" icon="tasks" tint={BLUE} title="Tareas" />
      <span className="ob-slot" />
      <Tile className="ob-c ob-new" icon="notes" tint={YELLOW} title="Notas" />
      <Tile className="ob-d" icon="cloudSun" tint={SKY} title="Tiempo" />
      <div className="ob-sheet">
        <p>Catálogo</p>
        <div className="ob-sheet-cards">
          <span className="ob-card ob-card-pick">
            <span style={{ background: YELLOW }} />
            Notas
          </span>
          <span className="ob-card">
            <span style={{ background: BLUE }} />
            Tareas
          </span>
          <span className="ob-card">
            <span style={{ background: RED }} />
            Pomodoro
          </span>
        </div>
      </div>
      <Cursor />
    </>
  )
}

function MoveDemo(): JSX.Element {
  return (
    <>
      <MiniBar />
      <Tile className="ob-a" icon="calendar" tint={RED} title="Calendario">
        <span className="ob-cal" />
      </Tile>
      <span className="ob-ghost" />
      <Tile className="ob-b ob-swap-b" icon="tasks" tint={BLUE} title="Tareas" />
      <Tile className="ob-c ob-swap-c" icon="notes" tint={YELLOW} title="Notas" />
      <Tile className="ob-d" icon="cloudSun" tint={SKY} title="Tiempo" />
      <span className="ob-toast">
        Se ha recolocado 1 widget <b>Deshacer</b>
      </span>
      <Cursor />
    </>
  )
}

function SpacesDemo(): JSX.Element {
  return (
    <>
      <MiniBar />
      <div className="ob-layout ob-l1">
        <Tile className="ob-a" icon="calendar" tint={RED} title="Calendario">
          <span className="ob-cal" />
        </Tile>
        <Tile className="ob-b" icon="tasks" tint={BLUE} title="Tareas" />
        <Tile className="ob-c" icon="notes" tint={YELLOW} title="Notas" />
        <Tile className="ob-d" icon="timer" tint={ORANGE} title="Pomodoro" />
      </div>
      <div className="ob-layout ob-l2">
        <Tile className="ob-a" icon="music" tint={PINK} title="Multimedia">
          <span className="ob-eq">
            <i />
            <i />
            <i />
            <i />
          </span>
        </Tile>
        <Tile className="ob-b" icon="cloudSun" tint={SKY} title="Tiempo" />
        <Tile className="ob-c" icon="link" tint={VIOLET} title="Enlaces" />
        <Tile className="ob-d" icon="notes" tint={YELLOW} title="Notas" />
      </div>
      <div className="ob-layout ob-l3">
        <Tile className="ob-a" icon="timer" tint={ORANGE} title="Pomodoro">
          <span className="ob-ring" />
        </Tile>
        <Tile className="ob-b" icon="tasks" tint={BLUE} title="Tareas" />
        <Tile className="ob-c" icon="book" tint={VIOLET} title="Apuntes" />
        <Tile className="ob-d" icon="music" tint={PINK} title="Multimedia" />
      </div>
    </>
  )
}

function ConnectDemo(): JSX.Element {
  return (
    <>
      <MiniBar />
      <div className="ob-tile ob-a ob-gcal">
        <div className="ob-tile-head">
          <BrandLogo brand="google-calendar" name="" size={14} decorative className="bare" />
          Google Calendar
        </div>
        <div className="ob-tile-body">
          <span className="ob-event">
            <b>9:00</b> Dentista
          </span>
          <span className="ob-event ob-event-new">
            <b>10:30</b> Reunión de equipo
          </span>
          <span className="ob-event">
            <b>17:00</b> Gimnasio
          </span>
        </div>
      </div>
      <div className="ob-tile ob-notion">
        <div className="ob-tile-head">
          <BrandLogo brand="notion" name="" size={14} decorative className="bare" />
          Notion
        </div>
        <div className="ob-tile-body">
          <span className="ob-todo ob-todo-tick">
            <i>
              <Icon name="check" size={8} />
            </i>
            Enviar factura
          </span>
          <span className="ob-todo">
            <i />
            Preparar informe
          </span>
          <span className="ob-todo">
            <i />
            Comprar pan
          </span>
        </div>
      </div>
      <div className="ob-palette">
        <div className="ob-search">
          <Icon name="search" size={10} />
          <span className="ob-typed">fact</span>
          <span className="ob-caret" />
        </div>
        <span className="ob-result">
          <Icon name="tasks" size={10} /> Enviar factura <small>Tareas</small>
        </span>
        <span className="ob-result dim">
          <Icon name="notes" size={10} /> Facturas de octubre <small>Notas</small>
        </span>
      </div>
    </>
  )
}
