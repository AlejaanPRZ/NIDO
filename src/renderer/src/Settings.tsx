import { useEffect, useState, type ReactNode } from 'react'
import type { AppState, ErrorCode, ExportFile, GoogleCalendar, GoogleStatus, NotionAccess, NotionLinkCheck, NotionStatus, Palette, Theme } from '../../shared/types'
import { BrandLogo, brandOfBrowser, hasBrand } from './BrandLogo'
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

/** Muestras de cada estilo (los colores de su fondo y su acento en claro). */
const PALETTE_OPTIONS: { id: Palette; label: string; hint: string; swatch: string; dot: string }[] = [
  { id: 'nido', label: 'Nido', hint: 'Azules y celestes', swatch: 'linear-gradient(135deg, #cfe2ff, #8fd3ff 55%, #e6eef9)', dot: '#007aff' },
  { id: 'terra', label: 'Terra', hint: 'Terracota, ocre y arena', swatch: 'linear-gradient(135deg, #f0b07a, #e8a13c 45%, #f1e4d4)', dot: '#c4531c' },
  { id: 'bosque', label: 'Bosque', hint: 'Salvia y musgo', swatch: 'linear-gradient(135deg, #a9cfa6, #c6dca0 50%, #e5ede4)', dot: '#237a4b' },
  { id: 'aurora', label: 'Aurora', hint: 'Violeta y rosa', swatch: 'linear-gradient(135deg, #c3a8ff, #ffb0d6 55%, #ebe6f6)', dot: '#7a3fe0' },
  { id: 'grafito', label: 'Grafito', hint: 'Grises neutros', swatch: 'linear-gradient(135deg, #c9c9cf, #e2e2e7 55%, #f4f4f6)', dot: '#34343c' }
]

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
        <div className="setting-block">
          <span>
            Estilo
            <small className="muted">Colores del fondo, del cristal y de los botones. Cada estilo tiene versión clara y oscura.</small>
          </span>
          <div className="palette-picker" role="radiogroup" aria-label="Estilo">
            {PALETTE_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={settings.palette === p.id}
                className={`palette-option ${settings.palette === p.id ? 'active' : ''}`}
                title={p.hint}
                onClick={() => set({ palette: p.id })}
              >
                <span className="palette-swatch" style={{ background: p.swatch }} aria-hidden="true">
                  <span style={{ background: p.dot }} />
                </span>
                <span className="palette-name">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={`setting-row ${settings.reduceTransparency ? 'is-disabled' : ''}`}>
          <span className="grow">
            Intensidad del cristal
            <small className="muted">Más translucidez y desenfoque, o superficies más sólidas y legibles. Por encima del 60 % el cristal se vuelve más líquido y transparente.</small>
          </span>
          <input
            type="range"
            className="range glass-range"
            min={0}
            max={100}
            step={5}
            value={settings.glass}
            disabled={settings.reduceTransparency}
            aria-label="Intensidad del cristal"
            aria-valuetext={`${settings.glass} %`}
            style={{ ['--pct' as string]: `${settings.glass}%` }}
            onChange={(e) => set({ glass: Number(e.target.value) })}
          />
          <span className="mono muted glass-value">{settings.glass} %</span>
        </div>
        <Toggle
          label="Reducir transparencia"
          description="Superficies opacas y sin desenfoque: más contraste y menos consumo."
          checked={settings.reduceTransparency}
          onChange={(v) => set({ reduceTransparency: v })}
        />
        <Toggle
          label="Fondo animado"
          description={
            settings.reduceMotion || settings.reduceTransparency
              ? 'No se mueve mientras estén activados «Reducir movimiento» o «Reducir transparencia».'
              : 'Los degradados del fondo se mueven despacio. Usa algo más de tarjeta gráfica; se paran al arrastrar widgets.'
          }
          checked={settings.animatedBackground}
          onChange={(v) => set({ animatedBackground: v })}
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

  const gState: ConnState = !google ? 'disconnected' : google.connected ? 'connected' : google.expired ? 'expired' : google.builtIn || google.clientId ? 'disconnected' : 'unconfigured'
  const nState: ConnState = !notion ? 'disconnected' : notion.connected ? 'connected' : notion.expired ? 'expired' : 'disconnected'
  const soon = CATALOG.filter((e) => e.status === 'proximamente')

  return (
    <>
      <div className="service-grid">
        <ServiceCard
          logo={<BrandLogo brand="google-calendar" name="Google Calendar" size={40} decorative />}
          name="Google Calendar"
          desc="Ver y gestionar los eventos de tus calendarios."
          state={gState}
          account={google?.account}
          action={gState === 'connected' ? 'Gestionar' : gState === 'expired' ? 'Reconectar' : gState === 'unconfigured' ? 'Configurar' : 'Conectar'}
          onOpen={() => setDetail('google')}
        />
        <ServiceCard
          logo={<BrandLogo brand="notion" name="Notion" size={40} decorative />}
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
              {hasBrand(e.brand) ? <BrandLogo brand={e.brand} name={e.title} size={18} decorative /> : <Icon name={e.icon} size={12} />} {e.title}
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

/** Botón de inicio de sesión de un servicio: su logo y «Conectar con …», como en las apps nativas. */
function SignInButton({ brand, label, busy, onClick, disabled }: { brand: string; label: string; busy: boolean; disabled?: boolean; onClick(): void }): JSX.Element {
  return (
    <button className="btn signin" disabled={busy || disabled} onClick={onClick}>
      <BrandLogo brand={brand} name="" size={22} decorative className="bare" />
      <span>{label}</span>
    </button>
  )
}

/** Mientras el navegador está abierto: qué pasa y cómo cancelarlo. */
function WaitingBrowser({ service, onCancel }: { service: string; onCancel(): void }): JSX.Element {
  return (
    <div className="waiting-browser" role="status">
      <Spinner size={14} />
      <div className="grow">
        <p>
          <b>Continúa en tu navegador.</b> Elige la cuenta y acepta los permisos en {service}.
        </p>
        <p className="muted small-text">Nido espera hasta 5 minutos. Si cierras la pestaña, pulsa Cancelar.</p>
      </div>
      <button className="btn small" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

function GoogleDetail({ onBack }: { onBack(): void }): JSX.Element {
  const { settings, dispatch } = useApp()
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(null)
  const [error, setError] = useState<{ message: string; code: ErrorCode } | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [calendars, setCalendars] = useState<GoogleCalendar[] | null>(null)
  const [calError, setCalError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  useEffect(() => {
    window.nido.google.status().then((r) => {
      if (!r.ok) return
      setStatus(r.data)
      setClientId(r.data.clientId)
    })
  }, [])

  const loadCalendars = async (force = false): Promise<void> => {
    setRefreshing(true)
    const r = await window.nido.google.calendars(force)
    setRefreshing(false)
    if (r.ok) {
      setCalendars(r.data)
      setCalError(null)
      setRefreshedAt(new Date())
      if (force) notifyIntegrationsChanged() // los widgets vuelven a pedir eventos
    } else {
      setCalError(r.error)
      if (r.code === 'auth') window.nido.google.status().then((s) => s.ok && setStatus(s.data))
    }
  }

  useEffect(() => {
    if (!status?.connected) {
      setCalendars(null)
      return
    }
    void loadCalendars()
  }, [status?.connected, status?.account])

  const apply = (r: Awaited<ReturnType<typeof window.nido.google.status>>, message?: string): boolean => {
    if (r.ok) {
      setStatus(r.data)
      setClientId(r.data.clientId)
      setError(null)
      setSecret('')
      if (message) toast(message, 'success')
      notifyIntegrationsChanged()
      return true
    }
    if (r.code === 'cancelled') {
      setError(null)
      toast(r.error)
      return false
    }
    setError({ message: r.error, code: r.code })
    return false
  }

  const saveCredentials = async (): Promise<boolean> => {
    setBusy('save')
    const ok = apply(await window.nido.google.setCredentials(clientId, secret), 'Cliente propio guardado')
    setBusy(null)
    return ok
  }

  const useBuiltIn = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Usar el cliente de Nido',
      message: 'Se borrará tu cliente propio. Si estabas conectado con él, tendrás que volver a conectar.',
      confirmLabel: 'Usar el de Nido'
    })
    if (ok) apply(await window.nido.google.clearCredentials(), 'Ahora se usa el cliente de Nido')
  }

  const connect = async (switching = false): Promise<void> => {
    setBusy('connect')
    setError(null)
    const before = status?.account
    const r = await window.nido.google.connect()
    if (r.ok && switching && before && r.data.account !== before) dispatch({ type: 'settings', patch: { googleCalendars: undefined } })
    apply(r, switching && r.ok && r.data.account === before ? 'Sigues conectado con la misma cuenta' : 'Google Calendar conectado')
    setBusy(null)
  }

  const disconnect = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Desconectar Google Calendar',
      message: 'Nido revocará su acceso en Google y dejará de mostrar tus eventos. Tus eventos en Google no se tocan.',
      confirmLabel: 'Desconectar'
    })
    if (!ok) return
    setBusy('disconnect')
    if (apply(await window.nido.google.disconnect(), 'Google Calendar desconectado')) dispatch({ type: 'settings', patch: { googleCalendars: undefined } })
    setBusy(null)
  }

  if (!status) return <Spinner />
  const canConnect = status.builtIn || !!status.clientId
  const state: ConnState = busy === 'connect' ? 'connecting' : status.connected ? 'connected' : status.expired ? 'expired' : error ? 'error' : canConnect ? 'disconnected' : 'unconfigured'
  const logo = <BrandLogo brand="google-calendar" name="Google Calendar" size={40} decorative />

  // Calendarios que Nido muestra por defecto: los elegidos aquí o, si no hay elección, los marcados en Google.
  const chosen = new Set(settings.googleCalendars ?? calendars?.filter((c) => c.selected || c.primary).map((c) => c.id) ?? [])
  const toggleCalendar = (id: string): void => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    dispatch({ type: 'settings', patch: { googleCalendars: (calendars ?? []).map((c) => c.id).filter((c) => next.has(c)) } })
  }

  return (
    <div className="conn-detail">
      <DetailHeader title="Google Calendar" logo={logo} state={state} account={status.account} onBack={onBack} />
      {!status.encryption && <ErrorBox message="El cifrado de Windows no está disponible: Nido no guardará credenciales." />}
      {status.expired && !status.connected && busy !== 'connect' && !error && (
        <ErrorBox message="Google caducó o revocó el acceso. Vuelve a conectar para seguir viendo tus eventos." code={canConnect ? 'auth' : undefined} onAction={() => void connect()} />
      )}
      {error && <ErrorBox message={error.message} code={error.code === 'forbidden' ? 'auth' : error.code} onAction={(c) => (c === 'config' ? setAdvanced(true) : void connect())} />}

      {status.connected ? (
        <div className="settings-card">
          <p>
            Conectado como <b>{status.account ?? 'tu cuenta'}</b>.
          </p>
          <p className="muted small-text">Calendarios que muestran los widgets de Nido (cada widget puede cambiarlos desde su botón de calendarios):</p>
          <div className="calendar-list">
            {calError ? (
              <ErrorBox message={calError} />
            ) : calendars === null ? (
              <Spinner size={12} />
            ) : calendars.length === 0 ? (
              <p className="muted small-text">Esta cuenta no tiene calendarios.</p>
            ) : (
              calendars.map((c) => (
                <label key={c.id} className="calendar-row">
                  <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggleCalendar(c.id)} aria-label={`Mostrar ${c.name}`} />
                  <span className="cal-dot" style={{ background: c.color }} />
                  <span className="grow ellipsis">{c.name}</span>
                  <span className="tag soft">{c.canWrite ? 'Editable' : 'Solo lectura'}</span>
                </label>
              ))
            )}
          </div>
          <div className="row wrap">
            <button className="btn small" disabled={busy !== null || refreshing} onClick={() => void loadCalendars(true)}>
              <Icon name="reload" size={13} /> {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button className="btn small" disabled={busy !== null || !canConnect} onClick={() => void connect(true)}>
              <Icon name="swap" size={13} /> Cambiar cuenta
            </button>
            <span className="grow" />
            <button className="btn small danger-ghost" disabled={busy !== null} onClick={() => void disconnect()}>
              Desconectar
            </button>
          </div>
          {refreshedAt && <p className="muted small-text">Lista leída de Google a las {timeOf.format(refreshedAt)}.</p>}
        </div>
      ) : busy === 'connect' ? (
        <WaitingBrowser service="Google" onCancel={() => void window.nido.google.cancel()} />
      ) : canConnect ? (
        <div className="signin-card">
          <p>Se abrirá tu navegador para que elijas tu cuenta de Google y autorices a Nido. Nido nunca ve tu contraseña.</p>
          <SignInButton brand="google" label={status.expired ? 'Volver a conectar con Google' : 'Conectar con Google'} busy={busy !== null} onClick={() => void connect()} />
          <p className="muted small-text">Nido podrá ver tu lista de calendarios y ver, crear, editar o borrar eventos. Nada más.</p>
        </div>
      ) : (
        <div className="signin-card">
          <p>
            <b>La conexión con Google aún no está disponible en esta copia de Nido.</b> Antes, quien publica Nido tiene que registrarla una vez en Google Cloud; después bastará con este botón.
          </p>
          <SignInButton brand="google" label="Conectar con Google" busy={false} disabled onClick={() => undefined} />
          <p className="muted small-text">Si tienes tu propio proyecto de Google Cloud, puedes usarlo en las opciones avanzadas.</p>
        </div>
      )}

      <details className="advanced" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary>Opciones avanzadas</summary>
        <div className="form">
          <p className="step-text">
            <b>Cliente OAuth propio.</b> Solo si prefieres usar tu propio proyecto de Google Cloud{status.builtIn ? ' en lugar del de Nido' : ''}.
          </p>
          <details className="mini-steps">
            <summary>Cómo crearlo</summary>
            <ol>
              <li>
                <button className="link-btn" onClick={open('https://console.cloud.google.com/projectcreate')}>Crea un proyecto</button> y{' '}
                <button className="link-btn" onClick={open('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com')}>habilita Google Calendar API</button>.
              </li>
              <li>
                En <button className="link-btn" onClick={open('https://console.cloud.google.com/auth/overview')}>Google Auth Platform</button>: público <b>Externo</b> y tu cuenta como <b>usuario de prueba</b>.
              </li>
              <li>
                En <b>Clientes</b> → <b>Crear cliente</b> → tipo <b>Aplicación de escritorio</b>. Copia el ID y el secreto.
              </li>
            </ol>
          </details>
          <label className="field">
            <span>ID de cliente</span>
            <input className="input mono" value={clientId} spellCheck={false} placeholder="123456789-xxxx.apps.googleusercontent.com" onChange={(e) => setClientId(e.target.value)} />
          </label>
          <label className="field">
            <span>Secreto de cliente {status.hasClientSecret && <small className="muted">(guardado)</small>}</span>
            <input
              className="input mono"
              type="password"
              value={secret}
              autoComplete="off"
              placeholder={status.hasClientSecret ? '•••••••• — escribe para cambiarlo' : 'GOCSPX-…'}
              onChange={(e) => setSecret(e.target.value)}
            />
            <small className="muted">Google lo genera también para apps de escritorio. En estas apps no es confidencial; Nido lo guarda cifrado igualmente.</small>
          </label>
          <div className="row">
            <button className="btn small" disabled={!clientId.trim() || busy !== null || (clientId === status.clientId && !secret)} onClick={() => void saveCredentials()}>
              {busy === 'save' ? 'Guardando…' : 'Guardar cliente propio'}
            </button>
            {status.builtIn && status.clientId && (
              <button className="btn small ghost" disabled={busy !== null} onClick={() => void useBuiltIn()}>
                Volver al cliente de Nido
              </button>
            )}
          </div>
          <div className="tech">
            <p>
              <b>Permisos:</b> calendar.calendarlist.readonly (ver tu lista de calendarios) y calendar.events (ver, crear, editar y borrar eventos). Si en Google desmarcas alguno, Nido no guarda la conexión.
            </p>
            <p>
              <b>Método:</b> OAuth 2.0 para apps de escritorio en el navegador del sistema, con redirección a 127.0.0.1 en un puerto aleatorio y PKCE (S256). El token se guarda cifrado con Windows y se revoca al desconectar.
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
  const [busy, setBusy] = useState<'connect' | 'token' | null>(null)
  const [error, setError] = useState<{ message: string; code: ErrorCode } | null>(null)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    window.nido.notion.status().then((r) => r.ok && setStatus(r.data))
  }, [])

  const apply = (r: Awaited<ReturnType<typeof window.nido.notion.status>>, message: string): void => {
    if (r.ok) {
      setStatus(r.data)
      setToken('')
      setError(null)
      toast(message, 'success')
      notifyIntegrationsChanged()
    } else if (r.code === 'cancelled') {
      setError(null)
      toast(r.error)
    } else {
      setError({ message: r.error, code: r.code })
    }
  }

  const connect = async (): Promise<void> => {
    setBusy('connect')
    setError(null)
    apply(await window.nido.notion.connect(), 'Notion conectado')
    setBusy(null)
  }

  const saveToken = async (): Promise<void> => {
    setBusy('token')
    setError(null)
    apply(await window.nido.notion.setToken(token), 'Notion conectado')
    setBusy(null)
  }

  const disconnect = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Desconectar Notion',
      message:
        status?.method === 'oauth'
          ? 'Nido borrará su acceso guardado. Para retirarlo también en Notion: Ajustes → Conexiones → Nido → Desconectar. Tus páginas no se tocan.'
          : 'Nido borrará el token guardado. Para revocarlo del todo, elimina la integración en Notion. Tus páginas no se tocan.',
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

  // El formulario del token: principal si esta copia no trae inicio de sesión oficial; avanzado si lo trae.
  const tokenForm = (
    <ol className="stepper compact">
      <Step n={1} title="Crea una integración interna">
        <p className="step-text">
          En <button className="link-btn" onClick={open('https://www.notion.so/profile/integrations')}>tus integraciones de Notion</button> → Nueva integración → tipo <b>Interna</b>, en el espacio de trabajo de tus
          tareas. En Capacidades, deja activado leer, actualizar e insertar contenido.
        </p>
      </Step>
      <Step n={2} title="Pega su token">
        <p className="step-text">En la integración → Configuración → Token de integración interna (empieza por «ntn_»).</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void saveToken()
          }}
        >
          <input className="input mono grow" type="password" autoComplete="off" aria-label="Token de integración" value={token} placeholder="ntn_…" onChange={(e) => setToken(e.target.value)} />
          <button className="btn small primary" type="submit" disabled={!token.trim() || busy !== null}>
            {busy === 'token' ? 'Comprobando…' : 'Conectar'}
          </button>
        </form>
        <p className="muted small-text">Nido lo comprueba con Notion antes de guardarlo y lo guarda cifrado con Windows.</p>
      </Step>
      <Step n={3} title="Comparte solo lo que Nido necesita">
        <p className="step-text">
          En Notion, abre la base de datos o la página con tus casillas → <b>•••</b> → <b>Conexiones</b> → <b>Añadir conexiones</b> → tu integración. Sin este paso, Nido no ve nada. Compartir con una
          integración no hace pública la página ni la enseña a otras personas.
        </p>
      </Step>
    </ol>
  )

  return (
    <div className="conn-detail">
      <DetailHeader title="Notion" logo={<BrandLogo brand="notion" name="Notion" size={40} decorative />} state={state} account={status.workspace} onBack={onBack} />
      {status.expired && !status.connected && !busy && !error && (
        <ErrorBox
          message={
            status.oauth
              ? 'Notion ya no acepta el acceso guardado (se retiró o se borró la conexión). Vuelve a conectar.'
              : 'Notion ya no acepta el token guardado (se borró la integración o se regeneró su token). Pega el token actual.'
          }
          code={status.oauth ? 'auth' : undefined}
          onAction={() => void connect()}
        />
      )}
      {error && (
        <ErrorBox
          message={error.message}
          // Sin inicio de sesión oficial, «Volver a conectar» no tendría adónde ir: el formulario del token ya está a la vista.
          code={error.code === 'auth' && !status.oauth ? undefined : error.code}
          onAction={(c) => (c === 'config' ? setAdvanced(true) : void connect())}
        />
      )}

      {status.connected ? (
        <NotionConnected status={status} busy={busy !== null} onPick={status.method === 'oauth' && status.oauth ? () => void connect() : undefined} onDisconnect={() => void disconnect()} />
      ) : busy === 'connect' ? (
        <WaitingBrowser service="Notion" onCancel={() => void window.nido.notion.cancel()} />
      ) : status.oauth ? (
        <div className="signin-card">
          <p>
            Se abrirá Notion en tu navegador. Inicia sesión como siempre —también con Google, si así entras en Notion—, elige el espacio de trabajo y las páginas o bases de datos que Nido podrá ver.
          </p>
          <SignInButton brand="notion" label="Conectar con Notion" busy={busy !== null} onClick={() => void connect()} />
          <p className="muted small-text">Entrar en Notion con Google no conecta Google Calendar: cada servicio se autoriza por separado.</p>
        </div>
      ) : (
        <div className="settings-card">
          <p>
            <b>Conecta con un token de integración interna.</b> Es la forma de Notion para uso personal, y solo da acceso a las páginas y bases de datos que compartas con la integración.
          </p>
          {tokenForm}
        </div>
      )}

      {status.oauth && !status.connected && busy !== 'connect' && (
        <details className="advanced" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
          <summary>Opciones avanzadas</summary>
          <div className="form">
            <p className="step-text">
              <b>Token de integración interna.</b> Alternativa al inicio de sesión, pensada para uso personal.
            </p>
            {tokenForm}
          </div>
        </details>
      )}

      <div className="tech">
        {status.method === 'oauth' || (status.oauth && !status.connected) ? (
          <p>
            <b>Método:</b> autorización oficial de Notion (OAuth de integración pública) en el navegador del sistema. El código se canjea en un servicio aparte que guarda el secreto de Notion; Nido solo guarda el
            token, cifrado con Windows.
          </p>
        ) : (
          <p>
            <b>Método:</b> token de una integración interna, validado con Notion y guardado cifrado con Windows (DPAPI). «Conectar con Notion» (inicio de sesión en el navegador) aparece cuando esta copia de Nido
            trae configurada la integración pública del desarrollador.
          </p>
        )}
        <p>
          <b>Acceso:</b> solo a las páginas y bases de datos compartidas con la conexión. API de Notion 2026-03-11.
        </p>
      </div>
    </div>
  )
}

const timeOf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** Conectado: espacio, «Comprobar conexión» (petición real) y comprobar el enlace de una base de datos. */
function NotionConnected({ status, busy, onPick, onDisconnect }: { status: NotionStatus; busy: boolean; onPick?(): void; onDisconnect(): void }): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [access, setAccess] = useState<{ at: Date; data: NotionAccess } | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkResult, setLinkResult] = useState<{ ok: true; data: NotionLinkCheck } | { ok: false; error: string } | null>(null)
  const internal = status.method === 'internal'
  const name = internal ? `«${status.bot ?? 'tu integración'}»` : 'Nido'

  const check = async (): Promise<void> => {
    setChecking(true)
    setCheckError(null)
    const r = await window.nido.notion.check()
    setChecking(false)
    if (r.ok) setAccess({ at: new Date(), data: r.data })
    else {
      setAccess(null)
      setCheckError(r.error)
      // Si Notion rechazó el token, main lo ha borrado: Ajustes y los widgets pasan a «Reconectar».
      if (r.code === 'auth') notifyIntegrationsChanged()
    }
  }

  const checkLink = async (): Promise<void> => {
    setLinkBusy(true)
    setLinkResult(null)
    const r = await window.nido.notion.resolve(link)
    setLinkBusy(false)
    setLinkResult(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error })
  }

  return (
    <div className="settings-card">
      <p>
        Conectado al espacio <b>{status.workspace ?? 'de Notion'}</b>
        {internal ? ` con la integración interna${status.bot ? ` «${status.bot}»` : ''}` : ' con la autorización oficial'}.
      </p>
      <div className="row wrap">
        <button className="btn small" disabled={checking || busy} onClick={() => void check()}>
          <Icon name="reload" size={13} /> {checking ? 'Comprobando…' : 'Comprobar conexión'}
        </button>
        {onPick && (
          <button className="btn small" disabled={busy} onClick={onPick}>
            <Icon name="edit" size={13} /> Elegir páginas
          </button>
        )}
        <span className="grow" />
        <button className="btn small danger-ghost" onClick={onDisconnect}>
          Desconectar
        </button>
      </div>

      {checkError && <ErrorBox message={checkError} />}
      {access && (
        <div className="check-result" role="status">
          <p className="ok-line">
            <Icon name="check" size={13} />
            <span>
              Notion respondió a las {timeOf.format(access.at)}: espacio <b>{access.data.workspace ?? '—'}</b>
              {access.data.bot ? (
                <>
                  , integración <b>{access.data.bot}</b>
                </>
              ) : null}
              .
            </span>
          </p>
          {access.data.sources === 0 && access.data.pages.length === 0 ? (
            <p className="warn-line">
              <Icon name="alert" size={13} />
              <span>
                El token funciona, pero {name} no tiene acceso a nada todavía. En Notion, abre la base de datos o la página con tus casillas → ••• → Conexiones → Añadir conexiones → {name}. Después vuelve a
                comprobar.
              </span>
            </p>
          ) : (
            <>
              {access.data.sources > 0 && (
                <>
                  <p className="muted small-text">
                    {access.data.sources} base{access.data.sources === 1 ? '' : 's'} de datos accesible{access.data.sources === 1 ? '' : 's'}:
                  </p>
                  <ul className="source-list">
                    {access.data.list.map((s) => (
                      <li key={s.id}>
                        <Icon name="database" size={12} /> {s.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {access.data.pages.length > 0 && (
                <>
                  <p className="muted small-text">
                    {access.data.pages.length} página{access.data.pages.length === 1 ? '' : 's'} accesible{access.data.pages.length === 1 ? '' : 's'} (para sus casillas):
                  </p>
                  <ul className="source-list">
                    {access.data.pages.map((s) => (
                      <li key={s.id}>
                        <Icon name="file" size={12} /> {s.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void checkLink()
        }}
      >
        <input className="input grow" aria-label="Enlace de una base de datos o página" placeholder="Enlace de una base de datos o página de Notion" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn small" type="submit" disabled={!link.trim() || linkBusy}>
          {linkBusy ? 'Comprobando…' : 'Comprobar enlace'}
        </button>
      </form>
      {linkResult && !linkResult.ok && <ErrorBox message={linkResult.error} />}
      {linkResult?.ok && (
        <p className="ok-line">
          <Icon name="check" size={13} />
          <span>
            {linkResult.data.kind === 'page' && linkResult.data.page
              ? linkResult.data.page.todos.length
                ? `Acceso correcto a la página «${linkResult.data.title}»: ${linkResult.data.page.todos.length} casilla${linkResult.data.page.todos.length === 1 ? '' : 's'} (${linkResult.data.page.todos.filter((t) => !t.checked).length} sin marcar).`
                : `Acceso correcto a la página «${linkResult.data.title}», pero no tiene casillas (listas de tareas de Notion).`
              : `Acceso correcto a la base de datos «${linkResult.data.title}»: ${linkResult.data.sources.map((s) => `${s.title} (${s.pages} página${s.pages === 1 ? '' : 's'})`).join(', ')}.`}
          </span>
        </p>
      )}
      <p className="muted small-text">La base de datos o la página de tareas se elige en el widget de Tareas (origen Notion).</p>
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
            <BrandLogo brand={brandOfBrowser(b.name) ?? ''} name={b.name} size={28} fallback="web" decorative />
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
