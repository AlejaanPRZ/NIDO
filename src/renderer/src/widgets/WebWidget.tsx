import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../context'
import { Icon } from '../icons'
import { toast } from '../ui/feedback'
import { MenuButton, type MenuItem } from '../ui/Menu'
import { hostOf, normalizeUrl } from '../util'
import { useHeaderSlot } from '../WidgetFrame'
import type { WidgetProps } from './types'

/** Páginas de inicio de sesión que suelen negarse a funcionar dentro de una app. */
const SIGN_IN_HOSTS = ['accounts.google.com', 'login.live.com', 'login.microsoftonline.com', 'appleid.apple.com']

/**
 * Panel web integrado basado en <webview>: proceso aislado, sin Node, con sesión
 * persistente compartida entre paneles (partition "persist:nido-web").
 * Es el motor Chromium de Nido; los navegadores instalados solo se usan para
 * abrir la página fuera (menú ↗), nunca se incrustan.
 * La barra de dirección se puede plegar: entonces atrás, recargar y abrir fuera van en la
 * cabecera del widget y la página ocupa todo el alto. No se toca el diseño de la página.
 */
export function WebWidget({ widget, update }: WidgetProps<'web'>): JSX.Element {
  const { browsers, openSettings } = useApp()
  const slot = useHeaderSlot()
  const ref = useRef<WebviewElement>(null)
  // El src solo se fija al montar; después se navega con loadURL para no recargar en cada guardado.
  const [initialUrl] = useState(() => widget.data.url || 'https://duckduckgo.com')
  const [address, setAddress] = useState(initialUrl)
  const [current, setCurrent] = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [failed, setFailed] = useState<string | null>(null)
  const showBar = widget.data.bar !== false

  const updateRef = useRef(update)
  updateRef.current = update

  const openIn = (browserId: string): void => {
    void window.nido.browsers.open(browserId, [current]).then((r) => !r.ok && toast(r.error, 'error'))
  }

  useEffect(() => {
    const view = ref.current
    if (!view) return
    const onNavigate = (): void => {
      const url = view.getURL()
      setAddress(url)
      setCurrent(url)
      setNav({ back: view.canGoBack(), forward: view.canGoForward() })
      // Las páginas de inicio de sesión no se guardan como destino: al reabrir, se vuelve al servicio.
      if (!SIGN_IN_HOSTS.includes(hostOf(url))) updateRef.current({ url })
    }
    const onStart = (): void => {
      setLoading(true)
      setFailed(null)
    }
    const onStop = (): void => setLoading(false)
    const onFail = (e: Event): void => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & { errorCode: number; errorDescription: string; isMainFrame: boolean }
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

  const outsideItems = (): MenuItem[] => [
    { header: 'Abrir fuera de Nido con' },
    { label: 'Navegador predeterminado del sistema', onSelect: () => openIn('system') },
    ...browsers.map((b) => ({ label: b.name, onSelect: () => openIn(b.id) })),
    { separator: true },
    { label: 'Gestionar navegadores…', icon: 'settings' as const, onSelect: () => openSettings('navegadores') }
  ]

  const reload = (
    <button type="button" className="icon-btn" title={loading ? 'Detener' : 'Recargar'} aria-label={loading ? 'Detener' : 'Recargar'} onClick={() => (loading ? ref.current?.stop() : ref.current?.reload())}>
      <Icon name={loading ? 'close' : 'reload'} size={15} />
    </button>
  )
  const back = (
    <button type="button" className="icon-btn" title="Atrás" aria-label="Atrás" disabled={!nav.back} onClick={() => ref.current?.goBack()}>
      <Icon name="arrowLeft" size={15} />
    </button>
  )
  const outside = (
    <MenuButton title="Abrir esta página en un navegador externo" items={outsideItems}>
      <Icon name="arrowUpRight" size={15} />
    </MenuButton>
  )

  const signIn = SIGN_IN_HOSTS.includes(hostOf(current))

  return (
    <div className={`web ${showBar ? '' : 'bar-hidden'}`}>
      {showBar ? (
        <form
          className="row web-bar"
          onSubmit={(e) => {
            e.preventDefault()
            go()
          }}
        >
          {back}
          <button type="button" className="icon-btn" title="Adelante" aria-label="Adelante" disabled={!nav.forward} onClick={() => ref.current?.goForward()}>
            <Icon name="arrowRight" size={15} />
          </button>
          {reload}
          <input
            className="input tiny grow"
            value={address}
            spellCheck={false}
            aria-label="Dirección del panel integrado"
            title="Panel integrado: la página se muestra dentro de Nido"
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          {outside}
          <button type="button" className="icon-btn" title="Plegar la barra (la navegación pasa a la cabecera)" aria-label="Plegar la barra de dirección" onClick={() => update({ bar: false })}>
            <Icon name="chevronUp" size={15} />
          </button>
        </form>
      ) : (
        slot &&
        createPortal(
          <span className="web-mini">
            {back}
            {reload}
            {outside}
            <button type="button" className="icon-btn" title="Mostrar la barra de dirección" aria-label="Mostrar la barra de dirección" onClick={() => update({ bar: true })}>
              <Icon name="chevronDown" size={15} />
            </button>
          </span>,
          slot
        )
      )}
      {signIn && (
        <div className="web-hint">
          <Icon name="info" size={13} />
          <span className="grow">Si {hostOf(current).includes('google') ? 'Google' : 'el servicio'} no deja iniciar sesión dentro de Nido, ábrelo en tu navegador.</span>
          <button type="button" className="btn tiny" onClick={() => openIn('system')}>
            Abrir fuera
          </button>
        </div>
      )}
      <div className="web-view-wrap">
        <webview ref={ref} src={initialUrl} partition="persist:nido-web" className="web-view" />
        {failed && (
          <div className="web-error">
            <p>{failed}</p>
            <div className="row center">
              <button className="btn primary" onClick={() => ref.current?.reload()}>
                Reintentar
              </button>
              <button className="btn" onClick={() => openIn('system')}>
                Abrir en el navegador
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
