import { Component, type ReactNode } from 'react'
import { Icon } from '../icons'

interface Props {
  name: string
  children: ReactNode
}

/** Si un widget falla al pintarse, solo él muestra el error; el resto de Nido sigue funcionando. */
export class WidgetErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error(`[nido] el widget «${this.props.name}» ha fallado`, error)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty-state compact">
        <span className="empty-icon">
          <Icon name="alert" size={16} />
        </span>
        <p className="empty-title">Este widget ha fallado</p>
        <p className="empty-text" title={this.state.error.message}>
          Sus datos siguen guardados. {this.state.error.message.slice(0, 120)}
        </p>
        <button className="btn small" onClick={() => this.setState({ error: null })}>
          Volver a cargar
        </button>
      </div>
    )
  }
}
