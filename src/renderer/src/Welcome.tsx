import { useApp } from './context'
import { Icon, type IconName } from './icons'

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'grid', title: 'Widgets a tu medida', text: 'Arrástralos por la cabecera, cambia su tamaño desde la esquina y usa ⋯ para ampliar, plegar o duplicar.' },
  { icon: 'briefcase', title: 'Tres espacios', text: 'Trabajo, Personal y Estudio tienen su propio panel. Cambia con Ctrl+1, 2 y 3.' },
  { icon: 'cloud', title: 'Tus cuentas', text: 'Conecta Google Calendar y Notion en Ajustes → Conexiones. La música de tus apps aparece sola.' },
  { icon: 'search', title: 'Todo a mano', text: 'Ctrl+K busca widgets, tareas y accesos. Todo se guarda solo en este equipo.' }
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
