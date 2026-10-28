import { useEffect, useState, type ReactNode } from 'react'
import type { AppState, ErrorCode, ExportFile, GoogleStatus, NotionStatus, Theme } from '../../shared/types'
import { CATALOG } from './catalog'
import { useApp, type SettingsSection } from './context'
import { Icon, type IconName } from './icons'
import { migrate } from './store'
import { Segmented, Spinner, Toggle } from './ui/controls'
import { confirmDialog, toast } from './ui/feedback'
import { Modal } from './ui/Modal'
import { notifyIntegrationsChanged } from './widgets/calendar/useGoogleCalendar'

const SECTIONS: { id: SettingsSection; label: string; icon: IconName; hint: string }[] = [
  { id: 'general', label: 'General', icon: 'settings', hint: 'Tema, reloj y panel' },
  { id: 'conexiones', label: 'Conexiones', icon: 'cloud', hint: 'Google, Notion y servicios' },
  { id: 'navegadores', label: 'Navegadores', icon: 'web', hint: 'Dónde se abren los enlaces' },
  { id: 'datos', label: 'Datos', icon: 'database', hint: 'Copias, exportar e importar' },
  { id: 'atajos', label: 'Atajos', icon: 'keyboard', hint: 'Teclado' },
  { id: 'ayuda', label: 'Ayuda', icon: 'help', hint: 'Bienvenida y consejos' }
]

export const SHORTCUTS: [string, string][] = [
  ['Ctrl + K', 'Buscar y comandos'],
  ['Ctrl + Mayús + A', 'Añadir widget (catálogo)'],
  ['Ctrl + ,', 'Abrir ajustes'],
  ['Ctrl + 1 … 9', 'Ir al espacio por su posición'],
  ['Ctrl + L', 'Bloquear o desbloquear la distribución'],
  ['Ctrl + Mayús + N', 'Añadir una nota'],
  ['Ctrl + B / I', 'Negrita y cursiva en una nota'],
  ['F1', 'Ver la bienvenida'],
  ['Esc', 'Cerrar ventanas, menús y el widget ampliado']
]

const open = (url: string) => () => void window.nido.openExternal(url)

export function SettingsDialog({
  state,
  section,
  onSection,
  onClose,
  onShowWelcome,
  onImport
}: {
  state: AppState
  section: SettingsSection
  onSection(s: SettingsSection): void
  onClose(): void
  onShowWelcome(): void
  onImport(state: AppState): void
}): JSX.Element {
  const current = SECTIONS.find((s) => s.id === section)!
  return (
    <Modal size="lg" onClose={onClose} className="settings">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Secciones de ajustes">
          <div className="settings-nav-title">Ajustes</div>
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} aria-current={section === s.id} onClick={() => onSection(s.id)}>
              <span className="nav-icon">
                <Icon name={s.icon} size={14} />
              </span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <header className="settings-head">
            <div>
              <h2>{current.label}</h2>
              <p className="muted">{current.hint}</p>
            </div>
            <button className="icon-btn" title="Cerrar (Esc)" aria-label="Cerrar ajustes" onClick={onClose}>
              <Icon name="close" size={15} />
            </button>
          </header>
          <div className="settings-body">
            {section === 'general' && <GeneralSection />}
            {section === 'conexiones' && <ConnectionsSection />}
            {section === 'navegadores' && <BrowsersSection />}
            {section === 'datos' && <DataSection state={state} onImport={onImport} />}
            {section === 'atajos' && <ShortcutsSection />}
            {section === 'ayuda' && <HelpSection onShowWelcome={onShowWelcome} />}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Group({ title, children, description }: { title: string; description?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="settings-group">
      <h3>{title}</h3>
      {description && <p className="group-desc">{description}</p>}
      <div className="settings-card">{children}</div>
    </section>
  )
}

// ---------- General ----------

function GeneralSection(): JSX.Element {
  const { settings, dispatch } = useApp()
  const set = (patch: Partial<typeof settings>): void => dispatch({ type: 'settings', patch })
  return (
    <>
      <Group title="Apariencia">
        <div className="setting-row">
          <span>Tema</span>
          <Segmented<Theme>
            label="Tema"
            value={settings.theme}
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
              { value: 'system', label: 'Automático' }
            ]}
            onChange={(theme) => set({ theme })}
          />
        </div>
        <Toggle
          label="Reducir transparencia"
          description="Superficies opacas y sin desenfoque: más contraste y menos consumo."
          checked={settings.reduceTransparency}
          onChange={(v) => set({ reduceTransparency: v })}
        />
        <Toggle label="Reducir movimiento" description="Sin animaciones ni transiciones." checked={settings.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      </Group>
      <Group title="Reloj" description={`Idioma y zona horaria del equipo (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}>
        <div className="setting-row">
          <span>Hora</span>
          <Segmented
            label="Formato de hora"
            value={settings.clock.hour12 ? '12' : '24'}
            options={[
              { value: '24', label: '24 h' },
              { value: '12', label: '12 h' }
            ]}
            onChange={(v) => set({ clock: { ...settings.clock, hour12: v === '12' } })}
          />
        </div>
        <div className="setting-row">
          <span>Fecha</span>
          <Segmented
            label="Formato de fecha"
            value={settings.clock.date}
            options={[
              { value: 'long', label: 'Completa' },
              { value: 'short', label: 'Corta' },
              { value: 'hidden', label: 'Oculta' }
            ]}
            onChange={(date) => set({ clock: { ...settings.clock, date } })}
          />
        </div>
        <Toggle label="Mostrar segundos" checked={settings.clock.showSeconds} onChange={(v) => set({ clock: { ...settings.clock, showSeconds: v } })} />
      </Group>
      <Group title="Panel">
        <Toggle
          label="Bloquear distribución"
          description="Evita mover, redimensionar, añadir o borrar widgets sin querer (Ctrl+L)."
          checked={settings.locked}
          onChange={(v) => set({ locked: v })}
        />
      </Group>
    </>
  )
}

// ---------- Conexiones ----------

type ConnState = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error' | 'unconfigured'

const STATE_LABEL: Record<ConnState, string> = {
  unconfigured: 'Sin configurar',
  disconnected: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  expired: 'Acceso caducado',
  error: 'Error'
}

function StatePill({ state, account }: { state: ConnState; account?: string }): JSX.Element {
  return (
    <span className={`status-pill s-${state}`}>
      {state === 'connecting' && <Spinner size={10} />}
      {STATE_LABEL[state]}
      {state === 'connected' && account ? ` · ${account}` : ''}
    </span>
  )
}

/** Mensaje de error con la acción que lo resuelve. */
function ErrorBox({ message, code, onAction }: { message: string; code?: ErrorCode; onAction?: (code?: ErrorCode) => void }): JSX.Element {
  const action = code === 'config' ? 'Abrir opciones avanzadas' : code === 'auth' ? 'Volver a conectar' : code === 'network' || code === 'rate' ? 'Reintentar' : null
  return (
    <div className="error-box" role="alert">
      <Icon name="alert" size={14} />
      <span className="grow">{message}</span>
      {action && onAction && (
        <button className="btn tiny" onClick={() => onAction(code)}>
          {action}
        </button>
      )}
    </div>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children?: ReactNode }): JSX.Element {
  return (
    <li className={`step ${done ? 'done' : ''}`}>
      <span className="step-n">{done ? <Icon name="check" size={12} /> : n}</span>
      <div className="step-body">
        <p className="step-title">{title}</p>
        {children}
      </div>
    </li>
  )
}

function ConnectionsSection(): JSX.Element {
  const [detail, setDetail] = useState<'google' | 'notion' | null>(null)
  const [google, setGoogle] = useState<GoogleStatus | null>(null)
  const [notion, setNotion] = useState<NotionStatus | null>(null)

  const refresh = (): void => {
    window.nido.google.status().then((r) => r.ok && setGoogle(r.data))
    window.nido.notion.status().then((r) => r.ok && setNotion(r.data))
  }
  useEffect(refresh, [detail])

  if (detail === 'google') return <GoogleDetail onBack={() => setDetail(null)} />
  if (detail === 'notion') return <NotionDetail onBack={() => setDetail(null)} />

  const gState: ConnState = !google ? 'disconnected' : google.connected ? 'connected' : google.expired ? 'expired' : google.clientId ? 'disconnected' : 'unconfigured'
  const nState: ConnState = !notion ? 'disconnected' : notion.connected ? 'connected' : notion.expired ? 'expired' : 'disconnected'
  const soon = CATALOG.filter((e) => e.status === 'proximamente')

  return (
    <>
      <div className="service-grid">
        <ServiceCard
          logo={<span className="conn-logo google"><Icon name="calendar" size={16} /></span>}
          name="Google Calendar"
          desc="Ver y gestionar los eventos de tus calendarios."
          state={gState}
          account={google?.account}
          action={gState === 'connected' ? 'Gestionar' : gState === 'expired' ? 'Reconectar' : gState === 'unconfigured' ? 'Configurar' : 'Conectar'}
          onOpen={() => setDetail('google')}
        />
        <ServiceCard
          logo={<span className="conn-logo notion">N</span>}
          name="Notion"
          desc="Usar una base de datos como lista de tareas."
          state={nState}
          account={notion?.workspace}
          action={nState === 'connected' ? 'Gestionar' : nState === 'expired' ? 'Reconectar' : 'Conectar'}
          onOpen={() => setDetail('notion')}
        />
      </div>

      <Group title="Funcionan sin cuenta" description="Nido los usa directamente; no hay nada que conectar.">
        <ul className="no-account">
          <li>
            <Icon name="music" size={14} /> <b>Ahora suena</b> — controles multimedia de Windows (Spotify, Apple Music, navegadores…).
          </li>
          <li>
            <Icon name="cloudSun" size={14} /> <b>Tiempo</b> — Open-Meteo, licencia CC BY 4.0.
          </li>
          <li>
            <Icon name="flag" size={14} /> <b>Festivos</b> — Nager.Date.
          </li>
          <li>
            <Icon name="swap" size={14} /> <b>Divisas</b> — tipos del Banco Central Europeo vía Frankfurter.
          </li>
        </ul>
      </Group>

      <Group title="Próximamente" description="Integraciones previstas. Aún no se pueden conectar; mientras, muchas están como panel web en el catálogo.">
        <div className="soon-list">
          {soon.map((e) => (
            <span key={e.id} className="soon-chip" title={e.description}>
              <Icon name={e.icon} size={12} /> {e.title}
            </span>
          ))}
        </div>
      </Group>
      <p className="muted small-text">Los tokens se guardan cifrados con Windows (DPAPI) y solo viajan a Google o Notion. Nunca se incluyen al exportar.</p>
    </>
  )
}

function ServiceCard({ logo, name, desc, state, account, action, onOpen }: { logo: ReactNode; name: string; desc: string; state: ConnState; account?: string; action: string; onOpen(): void }): JSX.Element {
  return (
    <article className={`service-card s-${state}`}>
      <div className="service-head">
        {logo}
        <div className="grow">
          <h4>{name}</h4>
          <StatePill state={state} account={account} />
        </div>
      </div>
      <p className="muted small-text">{desc}</p>
      <button className={`btn small ${state === 'connected' ? '' : 'primary'}`} onClick={onOpen}>
        {action}
      </button>
    </article>
  )
}

function DetailHeader({ title, logo, state, account, onBack }: { title: string; logo: ReactNode; state: ConnState; account?: string; onBack(): void }): JSX.Element {
  return (
    <div className="detail-head">
      <button className="icon-btn" title="Volver a Conexiones" aria-label="Volver a Conexiones" onClick={onBack}>
        <Icon name="chevronLeft" size={16} />
      </button>
      {logo}
      <div className="grow">
        <h3>{title}</h3>
        <StatePill state={state} account={account} />
      </div>
    </div>
  )
}

function GoogleDetail({ onBack }: { onBack(): void }): JSX.Element {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(null)
  const [error, setError] = useState<{ message: string; code: ErrorCode } | null>(null)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    window.nido.google.status().then((r) => {
      if (!r.ok) return
      setStatus(r.data)
      setClientId(r.data.clientId)
    })
  }, [])

  const apply = (r: Awaited<ReturnType<typeof window.nido.google.status>>, message?: string): boolean => {
    if (r.ok) {
      setStatus(r.data)
      setError(null)
      setSecret('')
      if (message) toast(message, 'success')
      notifyIntegrationsChanged()
      return true
    }
    setError({ message: r.error, code: r.code })
    if (r.code === 'config') setAdvanced(true)
    return false
  }

  const saveCredentials = async (): Promise<boolean> => {
    setBusy('save')
    const ok = apply(await window.nido.google.setCredentials(clientId, secret), 'Credenciales guardadas')
    setBusy(null)
    return ok
  }

  const connect = async (): Promise<void> => {
    if (clientId.trim() !== status?.clientId || secret) {
      if (!(await saveCredentials())) return
    }
    setBusy('connect')
    setError(null)
    apply(await window.nido.google.connect(), 'Google Calendar conectado')
    setBusy(null)
  }

  const disconnect = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Desconectar Google Calendar',
      message: 'Nido revocará su acceso y dejará de mostrar tus eventos. Tus eventos en Google no se tocan.',
      confirmLabel: 'Desconectar'
    })
    if (!ok) return
    setBusy('disconnect')
    apply(await window.nido.google.disconnect(), 'Google Calendar desconectado')
    setBusy(null)
  }

  const state: ConnState = busy === 'connect' ? 'connecting' : !status ? 'disconnected' : status.connected ? 'connected' : status.expired ? 'expired' : error ? 'error' : status.clientId ? 'disconnected' : 'unconfigured'
  const logo = (
    <span className="conn-logo google">
      <Icon name="calendar" size={16} />
    </span>
  )
  if (!status) return <Spinner />

  return (
    <div className="conn-detail">
      <DetailHeader title="Google Calendar" logo={logo} state={state} account={status.account} onBack={onBack} />
      {!status.encryption && <ErrorBox message="El cifrado de Windows no está disponible: Nido no guardará credenciales." />}
      {status.expired && !status.connected && <ErrorBox message="Google caducó o revocó el acceso (pasa cada 7 días mientras tu app esté «En prueba»)." code="auth" onAction={() => void connect()} />}
      {error && <ErrorBox message={error.message} code={error.code} onAction={(c) => (c === 'config' ? setAdvanced(true) : void connect())} />}

      {status.connected ? (
        <div className="settings-card">
          <p>
            Conectado como <b>{status.account ?? 'tu cuenta'}</b>. Nido solo puede ver la lista de calendarios y gestionar eventos.
          </p>
          <div className="row">
            <button className="btn small" disabled={busy !== null} onClick={() => void connect()}>
              <Icon name="reload" size={13} /> Reconectar
            </button>
            <span className="grow" />
            <button className="btn small danger-ghost" disabled={busy !== null} onClick={() => void disconnect()}>
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <ol className="stepper">
          <Step n={1} title="Crea un cliente OAuth en Google Cloud" done={!!status.clientId}>
            <p className="step-text">
              Es gratis y tarda unos minutos. Nido no trae credenciales propias: cada usuario usa su propio cliente.
            </p>
            <details className="mini-steps">
              <summary>Ver los pasos</summary>
              <ol>
                <li>
                  <button className="link-btn" onClick={open('https://console.cloud.google.com/projectcreate')}>Crea un proyecto</button> y{' '}
                  <button className="link-btn" onClick={open('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com')}>habilita Google Calendar API</button>.
                </li>
                <li>
                  En <button className="link-btn" onClick={open('https://console.cloud.google.com/auth/overview')}>Google Auth Platform</button>: público <b>Externo</b> y tu cuenta como <b>usuario de prueba</b>.
                </li>
                <li>
                  En <b>Clientes</b> → <b>Crear cliente</b> → tipo <b>Aplicación de escritorio</b>. Copia el ID de cliente.
                </li>
              </ol>
            </details>
          </Step>
          <Step n={2} title="Pega el ID de cliente" done={!!status.clientId && clientId === status.clientId}>
            <div className="row">
              <input
                className="input mono grow"
                value={clientId}
                spellCheck={false}
                aria-label="ID de cliente OAuth"
                placeholder="123456789-xxxx.apps.googleusercontent.com"
                onChange={(e) => setClientId(e.target.value)}
              />
              <button className="btn small" disabled={!clientId.trim() || busy !== null || clientId === status.clientId} onClick={() => void saveCredentials()}>
                {busy === 'save' ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </Step>
          <Step n={3} title="Conecta tu cuenta">
            <p className="step-text">Se abrirá Google en tu navegador para que aceptes los permisos.</p>
            <button className="btn small primary" disabled={!clientId.trim() || busy !== null} onClick={() => void connect()}>
              {busy === 'connect' ? 'Esperando a Google… (5 min máx.)' : status.expired ? 'Volver a conectar' : 'Conectar con Google'}
            </button>
          </Step>
        </ol>
      )}

      <details className="advanced" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary>Opciones avanzadas</summary>
        <div className="form">
          <label className="field">
            <span>Secreto de cliente {status.hasClientSecret && <small className="muted">(guardado)</small>}</span>
            <input
              className="input mono"
              type="password"
              value={secret}
              autoComplete="off"
              placeholder={status.hasClientSecret ? '•••••••• — escribe para cambiarlo' : 'GOCSPX-… (solo si Google lo pide)'}
              onChange={(e) => setSecret(e.target.value)}
            />
            <small className="muted">
              Google genera un secreto también para clientes de escritorio. Su guía lo marca como opcional con PKCE, pero su servidor puede exigirlo: si al conectar aparece «pide el secreto», pégalo aquí. No es confidencial en apps de escritorio; Nido lo guarda cifrado igualmente.
            </small>
          </label>
          {secret && (
            <button className="btn small" disabled={busy !== null} onClick={() => void saveCredentials()}>
              Guardar secreto
            </button>
          )}
          <div className="tech">
            <p>
              <b>Permisos solicitados:</b> calendar.calendarlist.readonly (ver tu lista de calendarios) y calendar.events (crear, editar y borrar eventos).
            </p>
            <p>
              <b>Método:</b> OAuth 2.0 para apps de escritorio con redirección a 127.0.0.1 en un puerto aleatorio y PKCE (S256).
            </p>
          </div>
        </div>
      </details>
    </div>
  )
}

function NotionDetail({ onBack }: { onBack(): void }): JSX.Element {
  const [status, setStatus] = useState<NotionStatus | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; code: ErrorCode } | null>(null)

  useEffect(() => {
    window.nido.notion.status().then((r) => r.ok && setStatus(r.data))
  }, [])

  const connect = async (): Promise<void> => {
    setBusy(true)
    const r = await window.nido.notion.setToken(token)
    setBusy(false)
    if (r.ok) {
      setStatus(r.data)
      setToken('')
      setError(null)
      toast('Notion conectado', 'success')
      notifyIntegrationsChanged()
    } else setError({ message: r.error, code: r.code })
  }

  const disconnect = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Desconectar Notion',
      message: 'Nido borrará el token guardado. Para revocarlo del todo, elimina la integración en Notion. Tus páginas no se tocan.',
      confirmLabel: 'Desconectar'
    })
    if (!ok) return
    const r = await window.nido.notion.disconnect()
    if (r.ok) {
      setStatus(r.data)
      toast('Notion desconectado', 'success')
      notifyIntegrationsChanged()
    }
  }

  if (!status) return <Spinner />
  const state: ConnState = busy ? 'connecting' : status.connected ? 'connected' : status.expired ? 'expired' : error ? 'error' : 'disconnected'

  return (
    <div className="conn-detail">
      <DetailHeader title="Notion" logo={<span className="conn-logo notion">N</span>} state={state} account={status.workspace} onBack={onBack} />
      {status.expired && !status.connected && <ErrorBox message="Notion rechazó el token guardado (se revocó o se borró la integración). Pega uno nuevo." />}
      {error && <ErrorBox message={error.message} code={error.code} onAction={() => void connect()} />}
      {status.connected ? (
        <div className="settings-card">
          <p>
            Conectado al espacio <b>{status.workspace ?? 'de Notion'}</b>
            {status.bot ? ` con la integración «${status.bot}»` : ''}. Elige la base de datos en un widget de Tareas.
          </p>
          <div className="row">
            <span className="grow" />
            <button className="btn small danger-ghost" onClick={() => void disconnect()}>
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <ol className="stepper">
          <Step n={1} title="Crea una integración interna">
            <p className="step-text">
              En <button className="link-btn" onClick={open('https://www.notion.so/profile/integrations')}>tus integraciones de Notion</button> → Nueva integración → tipo <b>Interna</b>. Deja marcadas las capacidades de leer, actualizar e insertar contenido.
            </p>
          </Step>
          <Step n={2} title="Pega su token">
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                void connect()
              }}
            >
              <input className="input mono grow" type="password" autoComplete="off" aria-label="Token de integración" value={token} placeholder="ntn_…" onChange={(e) => setToken(e.target.value)} />
              <button className="btn small primary" type="submit" disabled={!token.trim() || busy}>
                {busy ? 'Comprobando…' : 'Conectar'}
              </button>
            </form>
          </Step>
          <Step n={3} title="Comparte tu base de datos con la integración">
            <p className="step-text">
              En Notion, abre la base de datos de tareas → <b>•••</b> → <b>Conexiones</b> → añade tu integración. Sin esto no aparecerá en Nido.
            </p>
          </Step>
        </ol>
      )}
      <details className="advanced">
        <summary>Opciones avanzadas</summary>
        <div className="tech">
          <p>
            <b>Método:</b> token de integración interna (Notion no exige OAuth para uso personal). API versión 2026-03-11 con «data sources».
          </p>
          <p>
            <b>Acceso:</b> solo a las páginas y bases de datos que compartas con la integración.
          </p>
        </div>
      </details>
    </div>
  )
}

// ---------- Navegadores ----------

function BrowsersSection(): JSX.Element {
  const { browsers, refreshBrowsers, settings, dispatch } = useApp()
  const choose = (id: string): void => dispatch({ type: 'settings', patch: { defaultBrowser: id } })

  const add = async (): Promise<void> => {
    const r = await window.nido.browsers.addCustom()
    if (!r.ok) toast(r.error, 'error')
    else if (r.data) {
      refreshBrowsers()
      toast(`${r.data.name} añadido`, 'success')
    }
  }

  return (
    <>
      <div className="explain">
        <div>
          <Icon name="web" size={16} />
          <p>
            <b>Panel web integrado</b>: la página se ve dentro de Nido, con su propio motor. No usa tus navegadores y algunas webs no permiten iniciar sesión ahí.
          </p>
        </div>
        <div>
          <Icon name="arrowUpRight" size={16} />
          <p>
            <b>Navegador externo</b>: los enlaces, grupos y búsquedas se abren fuera de Nido, en el navegador elegido.
          </p>
        </div>
      </div>
      <Group title="Navegador predeterminado para enlaces" description="Cada widget de Enlaces o Buscador puede elegir otro.">
        <label className="radio-row">
          <input type="radio" name="browser" checked={settings.defaultBrowser === 'system'} onChange={() => choose('system')} />
          <span className="grow">
            Navegador predeterminado del sistema
            <small className="muted">El que tengas configurado en Windows.</small>
          </span>
        </label>
        {browsers.map((b) => (
          <label key={b.id} className="radio-row">
            <input type="radio" name="browser" checked={settings.defaultBrowser === b.id} onChange={() => choose(b.id)} />
            <span className="grow">
              {b.name}
              <small className="muted mono" title={b.path}>
                {b.path}
              </small>
            </span>
            {b.kind === 'custom' ? (
              <button
                className="icon-btn small"
                title="Quitar"
                aria-label={`Quitar ${b.name}`}
                onClick={async (e) => {
                  e.preventDefault()
                  await window.nido.browsers.removeCustom(b.id)
                  if (settings.defaultBrowser === b.id) choose('system')
                  refreshBrowsers()
                }}
              >
                <Icon name="close" size={12} />
              </button>
            ) : (
              <span className="tag soft">detectado</span>
            )}
          </label>
        ))}
        {settings.defaultBrowser !== 'system' && !browsers.some((b) => b.id === settings.defaultBrowser) && (
          <p className="warn-line">
            <Icon name="alert" size={13} /> El navegador elegido ya no está disponible. Elige otro o el del sistema.
          </p>
        )}
        <div className="row">
          <button className="btn small" onClick={add}>
            <Icon name="plus" size={13} />
            Añadir navegador…
          </button>
          <button className="btn small ghost" onClick={refreshBrowsers}>
            <Icon name="reload" size={13} />
            Volver a detectar
          </button>
        </div>
      </Group>
    </>
  )
}

// ---------- Datos ----------

function DataSection({ state, onImport }: { state: AppState; onImport(state: AppState): void }): JSX.Element {
  const exportConfig = async (): Promise<void> => {
    const file: ExportFile = { app: 'nido', exportedAt: new Date().toISOString(), state }
    const r = await window.nido.data.exportConfig(JSON.stringify(file, null, 2))
    if (!r.ok) toast(r.error, 'error')
    else if (r.data) toast(`Exportado en ${r.data}`, 'success')
  }

  const importConfig = async (): Promise<void> => {
    const r = await window.nido.data.importConfig()
    if (!r.ok) return toast(r.error, 'error')
    if (!r.data) return
    let parsed: unknown
    try {
      parsed = JSON.parse(r.data)
    } catch {
      return toast('El archivo no es un JSON válido.', 'error')
    }
    const raw = (parsed as Partial<ExportFile>)?.app === 'nido' ? (parsed as ExportFile).state : parsed
    const next = migrate(raw)
    if (!next) return toast('El archivo no parece una configuración de Nido.', 'error')
    const count = next.workspaces.reduce((n, w) => n + w.widgets.length, 0)
    const ok = await confirmDialog({
      title: 'Importar configuración',
      message: `Se reemplazarán tus espacios, distribución y ajustes por los del archivo (${next.workspaces.length} espacios, ${count} widgets). Antes se guardará una copia de lo actual.`,
      confirmLabel: 'Importar'
    })
    if (!ok) return
    const backup = await window.nido.data.backupCurrent()
    if (!backup.ok) return toast(`No se pudo hacer la copia de seguridad: ${backup.error}. No se ha importado nada.`, 'error')
    onImport(next)
    toast(`Importado. Copia anterior en ${backup.data}`, 'success')
  }

  return (
    <>
      <Group title="Guardado automático" description="Cada cambio (contenido, posiciones y tamaños por espacio, ajustes) se guarda solo en tu carpeta de datos.">
        <div className="row">
          <button className="btn small" onClick={() => void window.nido.data.openDataFolder()}>
            <Icon name="folder" size={13} /> Abrir carpeta de datos
          </button>
        </div>
      </Group>
      <Group title="Exportar e importar" description="Incluye espacios, distribución, widgets y ajustes. Nunca incluye tokens ni secretos de Google o Notion.">
        <div className="row">
          <button className="btn small" onClick={exportConfig}>
            <Icon name="download" size={13} /> Exportar…
          </button>
          <button className="btn small" onClick={importConfig}>
            <Icon name="upload" size={13} /> Importar…
          </button>
        </div>
      </Group>
    </>
  )
}

function ShortcutsSection(): JSX.Element {
  return (
    <Group title="Teclado">
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([keys, action]) => (
            <tr key={keys}>
              <td>
                {keys.split(' + ').map((k, i) => (
                  <span key={k}>
                    {i > 0 && ' + '}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Group>
  )
}

function HelpSection({ onShowWelcome }: { onShowWelcome(): void }): JSX.Element {
  return (
    <>
      <Group title="Bienvenida">
        <div className="row">
          <p className="muted small-text grow">El mensaje de inicio con lo básico de Nido.</p>
          <button className="btn small" onClick={onShowWelcome}>
            Ver bienvenida
          </button>
        </div>
      </Group>
      <Group title="Consejos">
        <ul className="tips">
          <li>«Añadir widget» abre el catálogo: elige tamaño pequeño, mediano o grande.</li>
          <li>En el menú ⋯ de cada widget: tamaño, ajustar al contenido, fijar, duplicar o moverlo a otro espacio.</li>
          <li>«Organizar automáticamente» (menú Editando) recoloca el espacio sin huecos; se puede deshacer.</li>
          <li>Doble clic en una pestaña de espacio para cambiarle nombre, icono y color.</li>
          <li>Los widgets de espacios ocultos no consultan datos; la música y los temporizadores siguen.</li>
        </ul>
      </Group>
      <p className="muted small-text">Nido 0.3 · Tus datos se guardan solo en este equipo.</p>
    </>
  )
}
