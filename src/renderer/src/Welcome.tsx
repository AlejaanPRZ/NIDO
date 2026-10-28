import { useApp } from './context'
import { Icon, type IconName } from './icons'

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'plus', title: 'Añade lo que uses', text: '«Añadir widget» abre el catálogo: notas, tareas, Pomodoro, tiempo, música, webs… en tamaño S, M o L.' },
  { icon: 'grid', title: 'Colócalo a tu gusto', text: 'Arrastra por la cabecera, redimensiona desde la esquina y usa ⋯ para fijar, ajustar o ampliar.' },
  { icon: 'briefcase', title: 'Espacios propios', text: 'Crea espacios con su icono y color; doble clic en una pestaña para editarla. Ctrl+1…9 para cambiar.' },
  { icon: 'cloud', title: 'Tus cuentas', text: 'Google Calendar y Notion se conectan en Ajustes → Conexiones. Ctrl+K busca en todo.' }
]

/** Mensaje de bienvenida: solo la primera vez (se puede volver a ver desde Ajustes → Ayuda). */
export function Welcome({ onClose }: { onClose(): void }): JSX.Element {
  const { openSettings } = useApp()
  return (
    <section className="welcome glass" aria-labelledby="welcome-title">
      <button className="icon-btn welcome-close" title="Cerrar bienvenida" aria-label="Cerrar bienvenida" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
      <div className="welcome-head">
        <span className="brand-mark big" aria-hidden />
        <div>
          <h1 id="welcome-title">Bienvenido a Nido</h1>
          <p className="muted">Tus notas, tareas, calendario, música y webs en un solo panel.</p>
        </div>
      </div>
      <div className="welcome-grid">
        {POINTS.map((p) => (
          <div key={p.title} className="welcome-point">
            <span className="welcome-icon">
              <Icon name={p.icon} size={16} />
            </span>
            <div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="welcome-actions">
        <button
          className="btn"
          onClick={() => {
            onClose()
            openSettings('conexiones')
          }}
        >
          Conectar cuentas
        </button>
        <button className="btn primary" onClick={onClose}>
          Empezar
        </button>
      </div>
    </section>
  )
}
