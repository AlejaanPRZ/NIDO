import { useEffect, useState, type ReactNode } from 'react'
import type { AppState, ExportFile, GoogleStatus, NotionStatus, Theme } from '../../shared/types'
import { useApp, type SettingsSection } from './context'
import { Icon, type IconName } from './icons'
import { migrate } from './store'
import { Segmented, Spinner, Toggle } from './ui/controls'
import { confirmDialog, toast } from './ui/feedback'
import { Modal } from './ui/Modal'
import { notifyIntegrationsChanged } from './widgets/calendar/useGoogleCalendar'

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'conexiones', label: 'Conexiones', icon: 'cloud' },
  { id: 'navegadores', label: 'Navegadores', icon: 'web' },
  { id: 'datos', label: 'Datos', icon: 'database' },
  { id: 'atajos', label: 'Atajos', icon: 'keyboard' },
  { id: 'ayuda', label: 'Ayuda', icon: 'help' }
]

export const SHORTCUTS: [string, string][] = [
  ['Ctrl + K', 'Buscar widgets, tareas, accesos y acciones'],
  ['Ctrl + ,', 'Abrir ajustes'],
  ['Ctrl + 1 / 2 / 3', 'Ir a Trabajo, Personal o Estudio'],
  ['Ctrl + L', 'Bloquear o desbloquear la distribución'],
  ['Ctrl + Mayús + N', 'Añadir una nota'],
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
  return (
    <Modal title="Ajustes" size="lg" onClose={onClose} className="settings">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Secciones de ajustes">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => onSection(s.id)}>
              <Icon name={s.icon} size={15} />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'general' && <GeneralSection />}
          {section === 'conexiones' && <ConnectionsSection />}
          {section === 'navegadores' && <BrowsersSection />}
          {section === 'datos' && <DataSection state={state} onImport={onImport} />}
          {section === 'atajos' && <ShortcutsSection />}
          {section === 'ayuda' && <HelpSection onShowWelcome={onShowWelcome} />}
        </div>
      </div>
    </Modal>
  )
}

function Group({ title, children, description }: { title: string; description?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="settings-group">
      <h3>{title}</h3>
      {description && <p className="muted group-desc">{description}</p>}
      <div className="settings-card">{children}</div>
    </section>
  )
}

// ---------- General ----------

function GeneralSection(): JSX.Element {
  const { settings, dispatch } = useApp()
  const set = (patch: Partial<typeof settings>): void => dispatch({ type: 'settings', patch })
  const sample = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: settings.clock.showSeconds ? '2-digit' : undefined,
    hour12: settings.clock.hour12
  }).format(new Date())
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
          description="Superficies opacas, sin desenfoque. Más contraste y menos consumo."
          checked={settings.reduceTransparency}
          onChange={(v) => set({ reduceTransparency: v })}
        />
        <Toggle
          label="Reducir movimiento"
          description="Sin animaciones ni transiciones."
          checked={settings.reduceMotion}
          onChange={(v) => set({ reduceMotion: v })}
        />
      </Group>
      <Group title="Reloj" description={`Usa el idioma y la zona horaria del equipo (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Ahora: ${sample}.`}>
        <div className="setting-row">
          <span>Formato</span>
          <Segmented
            label="Formato de hora"
            value={settings.clock.hour12 ? '12' : '24'}
            options={[
              { value: '24', label: '24 horas' },
              { value: '12', label: '12 horas' }
            ]}
            onChange={(v) => set({ clock: { ...settings.clock, hour12: v === '12' } })}
          />
        </div>
        <Toggle
          label="Mostrar segundos"
          checked={settings.clock.showSeconds}
          onChange={(v) => set({ clock: { ...settings.clock, showSeconds: v } })}
        />
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

function StatusPill({ ok, children }: { ok: boolean; children: ReactNode }): JSX.Element {
  return <span className={`status-pill ${ok ? 'ok' : ''}`}>{children}</span>
}

function ConnectionsSection(): JSX.Element {
  return (
    <>
      <GoogleConnection />
      <NotionConnection />
      <p className="muted small-text">
        Los tokens se guardan cifrados con el sistema de Windows (DPAPI) en tu carpeta de datos y nunca salen de este equipo
        salvo hacia Google o Notion.
      </p>
    </>
  )
}

function GoogleConnection(): JSX.Element {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    window.nido.google.status().then((r) => {
      if (!r.ok) return
      setStatus(r.data)
      setClientId(r.data.clientId)
      setHelp(!r.data.clientId)
    })
  }, [])

  const apply = (r: Awaited<ReturnType<typeof window.nido.google.status>>, message?: string): void => {
    if (r.ok) {
      setStatus(r.data)
      setError(null)
      setSecret('')
      if (message) toast(message, 'success')
      notifyIntegrationsChanged()
    } else setError(r.error)
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    apply(await window.nido.google.setCredentials(clientId, secret), 'Credenciales de Google guardadas')
    setBusy(null)
  }

  const connect = async (): Promise<void> => {
    setBusy('connect')
    setError(null)
    apply(await window.nido.google.connect(), 'Google Calendar conectado')
    setBusy(null)
  }

  const disconnect = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Desconectar Google Calendar',
      message: 'Nido revocará su acceso a tu cuenta y dejará de mostrar tus eventos. Tus eventos en Google no se tocan.',
      confirmLabel: 'Desconectar'
    })
    if (!ok) return
    setBusy('disconnect')
    apply(await window.nido.google.disconnect(), 'Google Calendar desconectado')
    setBusy(null)
  }

  return (
    <Group title="Google Calendar">
      <div className="conn-head">
        <span className="conn-logo google" aria-hidden>
          <Icon name="calendar" size={16} />
        </span>
        <div className="grow">
          <strong>Google Calendar</strong>
          <p className="muted small-text">Ver tus calendarios y crear, editar o eliminar eventos.</p>
        </div>
        {!status ? (
          <Spinner />
        ) : status.connected ? (
          <StatusPill ok>Conectado{status.account ? ` · ${status.account}` : ''}</StatusPill>
        ) : (
          <StatusPill ok={false}>{status.clientId ? 'Sin conectar' : 'Sin configurar'}</StatusPill>
        )}
      </div>

      {status && !status.encryption && (
        <p className="warn-line">
          <Icon name="alert" size={13} /> El cifrado de Windows no está disponible: Nido no guardará credenciales.
        </p>
      )}

      {status && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="field">
            <span>ID de cliente OAuth</span>
            <input
              className="input mono"
              value={clientId}
              spellCheck={false}
              placeholder="123456789-xxxx.apps.googleusercontent.com"
              onChange={(e) => setClientId(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Secreto de cliente</span>
            <input
              className="input mono"
              type="password"
              value={secret}
              autoComplete="off"
              placeholder={status.hasClientSecret ? '•••••••• (guardado; escribe para cambiarlo)' : 'GOCSPX-…'}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <div className="row">
            <button className="btn small" type="submit" disabled={!clientId.trim() || busy !== null}>
              {busy === 'save' ? 'Guardando…' : 'Guardar credenciales'}
            </button>
            <span className="grow" />
            {status.connected ? (
              <button className="btn small danger-ghost" type="button" disabled={busy !== null} onClick={disconnect}>
                Desconectar
              </button>
            ) : (
              <button
                className="btn small primary"
                type="button"
                disabled={!status.clientId || busy !== null}
                title={!status.clientId ? 'Guarda primero el ID de cliente' : undefined}
                onClick={connect}
              >
                {busy === 'connect' ? 'Esperando a Google…' : 'Conectar con Google'}
              </button>
            )}
          </div>
          {busy === 'connect' && (
            <p className="muted small-text">
              <Spinner size={11} /> Se ha abierto Google en tu navegador. Inicia sesión y acepta los permisos; tienes 5 minutos.
            </p>
          )}
          {error && <p className="field-error">{error}</p>}
        </form>
      )}

      <button className="link-btn" onClick={() => setHelp(!help)}>
        {help ? 'Ocultar los pasos' : 'Cómo conseguir el ID y el secreto de cliente'}
      </button>
      {help && (
        <ol className="steps">
          <li>
            Abre{' '}
            <button className="link-btn" onClick={open('https://console.cloud.google.com/projectcreate')}>
              Google Cloud Console
            </button>{' '}
            y crea un proyecto (por ejemplo, «Nido»).
          </li>
          <li>
            En{' '}
            <button className="link-btn" onClick={open('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com')}>
              Google Calendar API
            </button>{' '}
            pulsa <b>Habilitar</b>.
          </li>
          <li>
            Ve a{' '}
            <button className="link-btn" onClick={open('https://console.cloud.google.com/auth/overview')}>
              Google Auth Platform
            </button>{' '}
            → <b>Empezar</b>: nombre «Nido», tu correo, público <b>Externo</b>, y crea.
          </li>
          <li>
            En <b>Público</b> (Audience) → <b>Usuarios de prueba</b>, añade tu cuenta de Google.
          </li>
          <li>
            En <b>Clientes</b> → <b>Crear cliente</b>, tipo <b>Aplicación de escritorio</b>, nombre «Nido». Copia el <b>ID de cliente</b> y el{' '}
            <b>secreto</b>.
          </li>
          <li>
            Pégalos arriba, pulsa <b>Guardar credenciales</b> y luego <b>Conectar con Google</b>. Nido solo pide ver tu lista de
            calendarios y gestionar eventos.
          </li>
          <li className="muted">
            Mientras la app esté «En prueba», Google caduca el acceso cada 7 días: si un día ves «desconectado», vuelve a conectar.
          </li>
        </ol>
      )}
    </Group>
  )
}

function NotionConnection(): JSX.Element {
  const [status, setStatus] = useState<NotionStatus | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    window.nido.notion.status().then((r) => {
      if (!r.ok) return
      setStatus(r.data)
      setHelp(!r.data.connected)
    })
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
    } else setError(r.error)
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

  return (
    <Group title="Notion">
      <div className="conn-head">
        <span className="conn-logo notion" aria-hidden>
          N
        </span>
        <div className="grow">
          <strong>Notion</strong>
          <p className="muted small-text">Usar una base de datos como lista de tareas.</p>
        </div>
        {!status ? (
          <Spinner />
        ) : status.connected ? (
          <StatusPill ok>Conectado{status.workspace ? ` · ${status.workspace}` : ''}</StatusPill>
        ) : (
          <StatusPill ok={false}>Sin conectar</StatusPill>
        )}
      </div>
      {status && !status.connected && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void connect()
          }}
        >
          <label className="field">
            <span>Token de integración interna</span>
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              value={token}
              placeholder="ntn_…"
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <div className="row">
            <span className="grow" />
            <button className="btn small primary" type="submit" disabled={!token.trim() || busy}>
              {busy ? 'Comprobando…' : 'Conectar'}
            </button>
          </div>
          {error && <p className="field-error">{error}</p>}
        </form>
      )}
      {status?.connected && (
        <div className="row">
          <span className="muted small-text grow">{status.bot ? `Integración «${status.bot}».` : ''}</span>
          <button className="btn small danger-ghost" onClick={disconnect}>
            Desconectar
          </button>
        </div>
      )}
      <button className="link-btn" onClick={() => setHelp(!help)}>
        {help ? 'Ocultar los pasos' : 'Cómo crear la integración de Notion'}
      </button>
      {help && (
        <ol className="steps">
          <li>
            Abre{' '}
            <button className="link-btn" onClick={open('https://www.notion.so/profile/integrations')}>
              tus integraciones de Notion
            </button>{' '}
            → <b>Nueva integración</b>.
          </li>
          <li>
            Tipo <b>Interna</b>, elige tu espacio de trabajo y llámala «Nido».
          </li>
          <li>
            En <b>Capacidades</b> deja marcadas: leer, actualizar e insertar contenido.
          </li>
          <li>
            Copia el <b>token de integración interna</b> (empieza por <code>ntn_</code>) y pégalo arriba.
          </li>
          <li>
            En Notion, abre tu base de datos de tareas → <b>•••</b> → <b>Conexiones</b> → añade «Nido».
          </li>
          <li>
            En un widget de Tareas elige <b>Notion</b> y selecciona la base de datos.
          </li>
        </ol>
      )}
    </Group>
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
            <b>Panel web integrado</b>: una página dentro de Nido, con su propio motor (Chromium). No usa tus navegadores.
          </p>
        </div>
        <div>
          <Icon name="arrowUpRight" size={16} />
          <p>
            <b>Navegador externo</b>: abre enlaces y grupos de enlaces fuera de Nido, en el navegador que elijas aquí.
          </p>
        </div>
      </div>
      <Group title="Navegador para abrir enlaces" description="Lo usan los Accesos y la opción ↗ del panel web, salvo que un widget elija otro.">
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
    else if (r.data) toast(`Configuración exportada en ${r.data}`, 'success')
  }

  const importConfig = async (): Promise<void> => {
    const r = await window.nido.data.importConfig()
    if (!r.ok) {
      toast(r.error, 'error')
      return
    }
    if (!r.data) return
    let parsed: unknown
    try {
      parsed = JSON.parse(r.data)
    } catch {
      toast('El archivo no es un JSON válido.', 'error')
      return
    }
    const raw = (parsed as Partial<ExportFile>)?.app === 'nido' ? (parsed as ExportFile).state : parsed
    const next = migrate(raw)
    if (!next) {
      toast('El archivo no parece una configuración de Nido.', 'error')
      return
    }
    const count = next.workspaces.reduce((n, w) => n + w.widgets.length, 0)
    const ok = await confirmDialog({
      title: 'Importar configuración',
      message: `Se reemplazarán tus espacios y ajustes actuales por los del archivo (${count} widgets). Antes se guardará una copia de seguridad de lo actual.`,
      confirmLabel: 'Importar'
    })
    if (!ok) return
    const backup = await window.nido.data.backupCurrent()
    if (!backup.ok) {
      toast(`No se pudo hacer la copia de seguridad: ${backup.error}. No se ha importado nada.`, 'error')
      return
    }
    onImport(next)
    toast(`Configuración importada. Copia anterior en ${backup.data}`, 'success')
  }

  return (
    <>
      <Group title="Guardado" description="Nido guarda solo cada cambio (contenido, distribución y ajustes) en tu carpeta de datos.">
        <div className="row">
          <button className="btn small" onClick={() => void window.nido.data.openDataFolder()}>
            <Icon name="folder" size={13} />
            Abrir carpeta de datos
          </button>
        </div>
      </Group>
      <Group
        title="Exportar e importar"
        description="El archivo incluye espacios, widgets y ajustes. No incluye tokens ni contraseñas de Google o Notion."
      >
        <div className="row">
          <button className="btn small" onClick={exportConfig}>
            <Icon name="download" size={13} />
            Exportar configuración…
          </button>
          <button className="btn small" onClick={importConfig}>
            <Icon name="upload" size={13} />
            Importar configuración…
          </button>
        </div>
      </Group>
    </>
  )
}

function ShortcutsSection(): JSX.Element {
  return (
    <Group title="Atajos de teclado">
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
          <p className="muted small-text grow">Vuelve a ver el mensaje de inicio con lo básico de Nido.</p>
          <button className="btn small" onClick={onShowWelcome}>
            Ver bienvenida
          </button>
        </div>
      </Group>
      <Group title="Consejos">
        <ul className="tips">
          <li>Doble clic en el título de un widget para renombrarlo.</li>
          <li>Doble clic en la cabecera, o el botón ⤢, para ampliarlo temporalmente.</li>
          <li>Plegar deja solo la cabecera con un resumen; la música sigue sonando.</li>
          <li>«Ahora suena» muestra lo que reproduce Apple Music, Spotify o el navegador.</li>
        </ul>
      </Group>
      <p className="muted small-text">Nido 0.2 · Tus datos se guardan solo en este equipo.</p>
    </>
  )
}
