import { useEffect, useRef, useState } from 'react'
import { normalizeUrl } from '../util'
import { Icon } from '../icons'
import type { WidgetProps } from './types'

/**
 * Panel web basado en <webview>: proceso aislado, sin Node, con sesión
 * persistente compartida entre paneles (partition "persist:nido-web").
 */
export function WebWidget({ widget, update }: WidgetProps<'web'>): JSX.Element {
  const ref = useRef<WebviewElement>(null)
  // El src solo se fija al montar; después se navega con loadURL para no recargar en cada guardado.
  const [initialUrl] = useState(() => widget.data.url || 'https://duckduckgo.com')
  const [address, setAddress] = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [failed, setFailed] = useState<string | null>(null)

  const updateRef = useRef(update)
  updateRef.current = update

  useEffect(() => {
    const view = ref.current
    if (!view) return
    const onNavigate = (): void => {
      const url = view.getURL()
      setAddress(url)
      setNav({ back: view.canGoBack(), forward: view.canGoForward() })
      updateRef.current({ url })
    }
    const onStart = (): void => {
      setLoading(true)
      setFailed(null)
    }
    const onStop = (): void => setLoading(false)
    const onFail = (e: Event): void => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & {
        errorCode: number
        errorDescription: string
        isMainFrame: boolean
      }
      // -3 = ERR_ABORTED (navegación cancelada), no es un error real.
      if (isMainFrame && errorCode !== -3) setFailed(errorDescription || 'No se pudo cargar la página')
    }
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate-in-page', onNavigate)
    view.addEventListener('did-start-loading', onStart)
    view.addEventListener('did-stop-loading', onStop)
    view.addEventListener('did-fail-load', onFail)
    return () => {
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate-in-page', onNavigate)
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
      view.removeEventListener('did-fail-load', onFail)
    }
  }, [])

  const go = (): void => {
    const url = normalizeUrl(address)
    if (url) ref.current?.loadURL(url).catch(() => undefined)
  }

  return (
    <div className="web">
      <form
        className="row web-bar"
        onSubmit={(e) => {
          e.preventDefault()
          go()
        }}
      >
        <button type="button" className="icon-btn" title="Atrás" disabled={!nav.back} onClick={() => ref.current?.goBack()}>
          <Icon name="arrowLeft" size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Adelante"
          disabled={!nav.forward}
          onClick={() => ref.current?.goForward()}
        >
          <Icon name="arrowRight" size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={loading ? 'Detener' : 'Recargar'}
          onClick={() => (loading ? ref.current?.stop() : ref.current?.reload())}
        >
          <Icon name={loading ? 'close' : 'reload'} size={15} />
        </button>
        <input
          className="input grow"
          value={address}
          spellCheck={false}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className="icon-btn"
          title="Abrir en el navegador"
          onClick={() => window.nido.openExternal(widget.data.url)}
        >
          <Icon name="arrowUpRight" size={15} />
        </button>
      </form>
      <div className="web-view-wrap">
        <webview ref={ref} src={initialUrl} partition="persist:nido-web" className="web-view" />
        {failed && (
          <div className="web-error">
            <p>{failed}</p>
            <button className="pill dark" onClick={() => ref.current?.reload()}>
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
