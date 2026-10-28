import { useCallback, useEffect, useState } from 'react'
import { BrandLogo } from '../../BrandLogo'
import type { ErrorCode, NotionPageConfig, NotionPageTodos, TaskFilters } from '../../../../shared/types'
import { publishSearchItems, useActive, useApp, useInterval } from '../../context'
import { Icon } from '../../icons'
import { EmptyState, Spinner } from '../../ui/controls'
import { MenuButton, type MenuItem } from '../../ui/Menu'

const REFRESH_MS = 60_000
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

const ERROR_TITLE: Partial<Record<ErrorCode, string>> = {
  network: 'Sin conexión con Notion',
  notfound: 'Nido no ve esta página',
  forbidden: 'Sin permiso en Notion',
  auth: 'Notion rechazó el acceso'
}

/**
 * Casillas (bloques to_do) de una página normal de Notion. Marcar o desmarcar solo cambia esa casilla
 * (main envía únicamente `checked`); el resto de la página no se toca. Crear casillas se hace en Notion.
 */
export function NotionChecklist({
  widgetId,
  config,
  filters,
  onFilters,
  onConfigure,
  onAuthError
}: {
  widgetId: string
  config: NotionPageConfig
  filters: TaskFilters
  onFilters(f: TaskFilters): void
  onConfigure(): void
  onAuthError(): void
}): JSX.Element {
  const { openSettings } = useApp()
  const [page, setPage] = useState<NotionPageTodos | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [loadError, setLoadError] = useState<{ message: string; code: ErrorCode } | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(async () => {
    setSyncing(true)
    const r = await window.nido.notion.todos(config.pageId)
    setSyncing(false)
    if (!r.ok) {
      setLoadError({ message: r.error, code: r.code })
      if (r.code === 'auth') onAuthError()
      return
    }
    setPage(r.data)
    setLoadError(null)
    setLastSync(new Date())
  }, [config.pageId, onAuthError])

  useInterval(() => void load(), REFRESH_MS, useActive())

  useEffect(() => {
    publishSearchItems(
      widgetId,
      (page?.todos ?? []).filter((t) => !t.checked && t.text).map((t) => ({ label: t.text, detail: `Notion · ${config.name}` }))
    )
    return () => publishSearchItems(widgetId, null)
  }, [page, widgetId, config.name])

  const toggle = async (id: string, checked: boolean): Promise<void> => {
    // Al momento en la lista; si Notion no lo acepta, se vuelve a su estado real.
    setPage((p) => (p ? { ...p, todos: p.todos.map((t) => (t.id === id ? { ...t, checked } : t)) } : p))
    setFailed(null)
    const r = await window.nido.notion.setTodo(id, checked, !checked)
    if (!r.ok) {
      setFailed(r.error)
      if (r.code === 'auth') onAuthError()
    }
    void load()
  }

  const openInNotion = (): void => void window.nido.openExternal(page?.url ?? `https://www.notion.so/${config.pageId.replace(/-/g, '')}`)

  const menu = (): MenuItem[] => [
    { label: 'Actualizar', icon: 'reload', disabled: syncing, onSelect: () => void load() },
    { label: 'Abrir en Notion', icon: 'arrowUpRight', onSelect: openInNotion },
    { label: 'Cambiar página o base de datos', icon: 'file', onSelect: onConfigure },
    { separator: true },
    { label: 'Reconectar Notion', icon: 'link', onSelect: () => openSettings('conexiones') }
  ]

  if (!page && !loadError) return <EmptyState icon={<Spinner />} title="Leyendo las casillas…" />

  // La lectura falló y no hay datos anteriores: se dice el error, nunca «sin casillas».
  if (!page && loadError) {
    return (
      <EmptyState
        icon={<BrandLogo brand="notion" name="Notion" size={28} decorative />}
        title={ERROR_TITLE[loadError.code] ?? 'No se pudieron leer las casillas'}
        action={
          <div className="row center wrap">
            <button className="btn small primary" onClick={() => void load()}>
              Reintentar
            </button>
            {loadError.code === 'auth' || loadError.code === 'forbidden' ? (
              <button className="btn small" onClick={() => openSettings('conexiones')}>
                Abrir Conexiones
              </button>
            ) : (
              <button className="btn small" onClick={onConfigure}>
                Elegir otra
              </button>
            )}
          </div>
        }
      >
        {loadError.message}
      </EmptyState>
    )
  }

  const todos = page!.todos
  const visible = todos.filter((t) => (filters.status === 'done' ? t.checked : filters.status === 'all' ? true : !t.checked))
  const pending = todos.filter((t) => !t.checked).length

  return (
    <div className="tasks-notion">
      <div className="filters">
        <select className="chip-select" aria-label="Filtrar casillas" value={filters.status === 'done' || filters.status === 'all' ? filters.status : 'open'} onChange={(e) => onFilters({ ...filters, status: e.target.value })}>
          <option value="open">Sin marcar</option>
          <option value="done">Marcadas</option>
          <option value="all">Todas</option>
        </select>
        <span className="muted small-text ellipsis" title={page!.title}>
          {pending} de {todos.length} · {page!.title}
        </span>
      </div>

      {todos.length === 0 ? (
        <EmptyState
          icon={<Icon name="checklist" size={22} />}
          title="Esta página no tiene casillas"
          action={
            <div className="row center wrap">
              <button className="btn small" onClick={openInNotion}>
                Abrir en Notion
              </button>
              <button className="btn small" onClick={onConfigure}>
                Elegir otra
              </button>
            </div>
          }
        >
          Añádelas en Notion como «Lista de tareas» (/tarea o «[]»). Aparecerán aquí al actualizar.
        </EmptyState>
      ) : (
        <ul className="list scroll">
          {visible.length === 0 && <li className="empty muted">{filters.status === 'done' ? 'Ninguna casilla marcada.' : 'Todo marcado.'}</li>}
          {visible.map((t, i) => (
            <li key={t.id} className="todo-item">
              {t.section && t.section !== visible[i - 1]?.section && <p className="list-label">{t.section}</p>}
              <label className={`task ${t.checked ? 'done' : ''}`} style={{ paddingLeft: t.depth * 18 }}>
                <input type="checkbox" checked={t.checked} aria-label={t.text || 'Casilla sin texto'} onChange={() => void toggle(t.id, !t.checked)} />
                <span className="task-main">
                  <span className="task-title">{t.text || 'Sin texto'}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {page!.truncated && <p className="muted small-text">La página es muy larga: solo se muestran las casillas de los primeros bloques.</p>}

      {failed && (
        <div className="sync-error" role="alert">
          <Icon name="alert" size={13} />
          <span className="grow">No se pudo cambiar la casilla: {failed}</span>
          <button className="icon-btn small" title="Descartar" aria-label="Descartar" onClick={() => setFailed(null)}>
            <Icon name="close" size={11} />
          </button>
        </div>
      )}

      <div className="sync-line" aria-live="polite">
        {loadError ? (
          <>
            <Icon name="alert" size={13} />
            <span className="grow error-text" title={loadError.message}>
              {loadError.code === 'network' ? 'Sin conexión: mostrando lo último cargado' : loadError.message}
            </span>
            <button className="link-btn" onClick={() => void load()}>
              Reintentar
            </button>
          </>
        ) : (
          <>
            {syncing ? <Spinner size={11} /> : <BrandLogo brand="notion" name="" size={14} decorative className="bare" />}
            <span className="grow ellipsis">{syncing ? 'Actualizando…' : lastSync ? `Actualizado a las ${clock.format(lastSync)}` : 'Notion'}</span>
          </>
        )}
        <button className="icon-btn small" title="Actualizar" aria-label="Actualizar" disabled={syncing} onClick={() => void load()}>
          <Icon name="reload" size={12} />
        </button>
        <MenuButton items={menu} title="Opciones de Notion" className="icon-btn small">
          <Icon name="more" size={13} />
        </MenuButton>
      </div>
    </div>
  )
}
