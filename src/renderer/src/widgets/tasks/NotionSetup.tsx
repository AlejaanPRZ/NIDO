import { useEffect, useState } from 'react'
import type {
  ErrorCode,
  NotionLinkCheck,
  NotionPageConfig,
  NotionPageTodos,
  NotionSchema,
  NotionSource,
  NotionStatus,
  NotionTaskConfig,
  NotionTaskMapping
} from '../../../../shared/types'
import { useApp } from '../../context'
import { Icon } from '../../icons'
import { Spinner } from '../../ui/controls'
import { COMPATIBLE, guessDone, guessMapping, propByName, ROLE_LABEL, type Role } from './notionModel'

interface Props {
  current?: NotionTaskConfig
  onSave(config: NotionTaskConfig): void
  onSavePage(config: NotionPageConfig): void
  onCancel?(): void
}

const TYPE_LABEL: Record<string, string> = {
  title: 'título',
  status: 'estado',
  select: 'selección',
  multi_select: 'selección múltiple',
  date: 'fecha',
  checkbox: 'casilla'
}

/** Elegir de dónde salen las tareas: una base de datos (con su asociación de propiedades) o las casillas de una página. */
export function NotionSetup({ current, onSave, onSavePage, onCancel }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ sources: NotionSource[]; pages: NotionSource[] } | null>(null)
  const [searchError, setSearchError] = useState<{ message: string; code: ErrorCode } | null>(null)
  const [searchKey, setSearchKey] = useState(0)
  const [status, setStatus] = useState<NotionStatus | null>(null)
  const [link, setLink] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkResult, setLinkResult] = useState<NotionLinkCheck | null>(null)
  const { openSettings } = useApp()
  const [chosen, setChosen] = useState<NotionSource | null>(current ? { id: current.dataSourceId, title: current.name } : null)
  const [pagePick, setPagePick] = useState<{ id: string; title: string; todos?: NotionPageTodos; error?: string } | null>(null)
  const [schema, setSchema] = useState<NotionSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [map, setMap] = useState<NotionTaskMapping | null>(current?.map ?? null)
  const [doneValue, setDoneValue] = useState<string | undefined>(current?.doneValue)

  useEffect(() => {
    window.nido.notion.status().then((r) => r.ok && setStatus(r.data))
  }, [])

  useEffect(() => {
    if (chosen || pagePick) return
    const timer = setTimeout(() => {
      setFound(null)
      // Bases de datos y páginas normales: en Notion, no todo lo que hay en «Privado» es una base de datos.
      void Promise.all([window.nido.notion.search(query), window.nido.notion.searchPages(query)]).then(([s, p]) => {
        if (s.ok && p.ok) {
          setFound({ sources: s.data, pages: p.data })
          setSearchError(null)
        } else {
          const failed = (!s.ok ? s : p) as { error: string; code: ErrorCode }
          setSearchError({ message: failed.error, code: failed.code })
        }
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [query, chosen, pagePick, searchKey])

  const openPage = (page: NotionSource, todos?: NotionPageTodos): void => {
    setPagePick({ id: page.id, title: page.title, todos })
    if (todos) return
    void window.nido.notion.todos(page.id).then((r) =>
      setPagePick((p) => (p?.id === page.id ? (r.ok ? { ...p, title: r.data.title, todos: r.data } : { ...p, error: r.error }) : p))
    )
  }

  const checkLink = async (target = link): Promise<void> => {
    setLinkBusy(true)
    setLinkError(null)
    setLinkResult(null)
    const r = await window.nido.notion.resolve(target)
    setLinkBusy(false)
    if (!r.ok) return setLinkError(r.error)
    if (r.data.kind === 'page' && r.data.page) openPage({ id: r.data.page.id, title: r.data.title }, r.data.page)
    else if (r.data.sources.length === 1) setChosen(r.data.sources[0])
    else setLinkResult(r.data)
  }

  // Quién tiene que tener acceso en Notion: la integración interna (por su nombre) o Nido.
  const internal = status?.method === 'internal'
  const who = internal ? (status?.bot ? `«${status.bot}»` : 'tu integración') : 'Nido'
  // «Elegir páginas» solo si de verdad hay inicio de sesión oficial (conexión OAuth y app configurada).
  const canPick = status?.method === 'oauth' && status.oauth

  useEffect(() => {
    if (!chosen) return
    setSchema(null)
    setSchemaError(null)
    window.nido.notion.schema(chosen.id).then((r) => {
      if (!r.ok) {
        setSchemaError(r.error)
        return
      }
      setSchema(r.data)
      // Si cambia de base de datos, se propone una asociación nueva.
      if (!current || current.dataSourceId !== chosen.id) {
        const guessed = guessMapping(r.data)
        setMap(guessed)
        setDoneValue(guessDone(propByName(r.data, guessed.status)))
      }
    })
  }, [chosen, current])

  if (pagePick) {
    const todos = pagePick.todos
    const open = todos?.todos.filter((t) => !t.checked).length ?? 0
    return (
      <div className="notion-setup">
        <p className="setup-title">
          <Icon name="file" size={15} />
          <span className="grow">{pagePick.title}</span>
          <button className="link-btn" onClick={() => setPagePick(null)}>
            Cambiar
          </button>
        </p>
        {!todos && !pagePick.error && <Spinner />}
        {pagePick.error && <p className="field-error">{pagePick.error}</p>}
        {todos && (
          <div className="form scroll">
            {todos.todos.length > 0 ? (
              <p className="small-text">
                <b>
                  {todos.todos.length} casilla{todos.todos.length === 1 ? '' : 's'}
                </b>{' '}
                ({open} sin marcar). Nido mostrará las casillas de esta página y podrá marcarlas o desmarcarlas; el resto del contenido no se toca.
              </p>
            ) : (
              <p className="small-text">
                <b>Esta página no tiene casillas.</b> Nido lee las listas de tareas de Notion (bloques «Lista de tareas», los que se crean con /tarea o escribiendo «[]»). El texto normal y las viñetas no cuentan.
              </p>
            )}
            {todos.truncated && <p className="muted small-text">La página es muy larga: solo se han leído los primeros bloques.</p>}
            {todos.databases.length > 0 && (
              <div className="list">
                <p className="muted small-text">Esta página contiene {todos.databases.length === 1 ? 'una base de datos' : 'bases de datos'}:</p>
                {todos.databases.map((db) => (
                  <button key={db.id} className="list-btn" disabled={linkBusy} onClick={() => void checkLink(db.id).then(() => setPagePick(null))}>
                    <Icon name="database" size={14} />
                    <span className="grow">{db.title}</span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              {onCancel && (
                <button className="btn small" onClick={onCancel}>
                  Cancelar
                </button>
              )}
              <span className="grow" />
              {todos.todos.length === 0 ? (
                <button className="btn small" onClick={() => openPage({ id: pagePick.id, title: pagePick.title })}>
                  Comprobar de nuevo
                </button>
              ) : (
                <button className="btn primary small" onClick={() => onSavePage({ pageId: todos.id, name: todos.title })}>
                  Usar las casillas de esta página
                </button>
              )}
            </div>
          </div>
        )}
        {linkError && <p className="field-error">{linkError}</p>}
      </div>
    )
  }

  if (!chosen) {
    const empty = found && found.sources.length === 0 && found.pages.length === 0
    return (
      <div className="notion-setup">
        <p className="setup-title">
          <Icon name="database" size={15} />
          Elige una base de datos o una página con casillas
        </p>
        <input className="input" autoFocus placeholder="Buscar en Notion…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="list scroll">
          {searchError && (
            <div className="empty-inline">
              <p className="field-error">{searchError.message}</p>
              <div className="row wrap">
                <button className="btn small" onClick={() => setSearchKey((k) => k + 1)}>
                  Reintentar
                </button>
                {(searchError.code === 'auth' || searchError.code === 'forbidden') && (
                  <button className="btn small" onClick={() => openSettings('conexiones')}>
                    Abrir Conexiones
                  </button>
                )}
              </div>
            </div>
          )}
          {!found && !searchError && <Spinner />}
          {empty && query.trim() && <p className="muted small-text">Nada de lo que ve {who} coincide con «{query.trim()}».</p>}
          {empty && !query.trim() && (
            <div className="empty-inline">
              <p className="muted small-text">
                <b>{internal ? `La integración ${who} aún no tiene acceso a nada.` : 'Nido aún no tiene acceso a nada.'}</b>{' '}
                {canPick
                  ? 'Pulsa «Elegir páginas en Notion» y marca tu base de datos o la página con tus casillas, o pega su enlace aquí debajo.'
                  : `En Notion, abre la base de datos o la página con tus casillas → ••• → Conexiones → Añadir conexiones → ${who}. Después pulsa «Buscar de nuevo» o pega su enlace aquí debajo.`}
              </p>
              <div className="row wrap">
                {canPick ? (
                  <button
                    className="btn small"
                    onClick={() =>
                      void window.nido.notion.connect().then((r) => {
                        if (r.ok) setSearchKey((k) => k + 1)
                        else if (r.code !== 'cancelled') setSearchError({ message: r.error, code: r.code })
                      })
                    }
                  >
                    Elegir páginas en Notion
                  </button>
                ) : (
                  <button className="btn small" onClick={() => setSearchKey((k) => k + 1)}>
                    Buscar de nuevo
                  </button>
                )}
              </div>
            </div>
          )}
          {found && found.sources.length > 0 && <p className="list-label">Bases de datos</p>}
          {found?.sources.map((s) => (
            <button key={s.id} className="list-btn" onClick={() => setChosen(s)}>
              <Icon name="database" size={14} />
              <span className="grow">{s.title}</span>
              <Icon name="chevronRight" size={14} />
            </button>
          ))}
          {found && found.pages.length > 0 && <p className="list-label">Páginas (casillas)</p>}
          {found?.pages.map((p) => (
            <button key={p.id} className="list-btn" onClick={() => openPage(p)}>
              <Icon name="file" size={14} />
              <span className="grow">{p.title}</span>
              <Icon name="chevronRight" size={14} />
            </button>
          ))}
          {found && !empty && (
            <p className="muted small-text">¿Falta alguna? Notion solo muestra lo que compartiste con {who}, y su búsqueda puede no listarlo todo: pega su enlace.</p>
          )}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void checkLink()
          }}
        >
          <input
            className="input grow"
            aria-label="Enlace de una base de datos o página"
            placeholder="o pega el enlace de una base de datos o página"
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setLinkError(null)
            }}
          />
          <button className="btn small" type="submit" disabled={!link.trim() || linkBusy}>
            {linkBusy ? 'Comprobando…' : 'Comprobar'}
          </button>
        </form>
        {linkError && <p className="field-error">{linkError}</p>}
        {linkResult && (
          <div className="list">
            <p className="muted small-text">«{linkResult.title}» tiene varias fuentes de datos. Elige una:</p>
            {linkResult.sources.map((src) => (
              <button key={src.id} className="list-btn" onClick={() => setChosen(src)}>
                <Icon name="database" size={14} />
                <span className="grow">{src.title}</span>
                <span className="muted small-text">{src.pages} páginas</span>
              </button>
            ))}
          </div>
        )}
        {onCancel && (
          <button className="btn small" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    )
  }

  const statusProp = schema ? propByName(schema, map?.status) : undefined
  const roles: Role[] = ['title', 'status', 'date', 'priority', 'tags']

  return (
    <div className="notion-setup">
      <p className="setup-title">
        <Icon name="database" size={15} />
        <span className="grow">{chosen.title}</span>
        <button className="link-btn" onClick={() => setChosen(null)}>
          Cambiar
        </button>
      </p>
      {schemaError && <p className="field-error">{schemaError}</p>}
      {!schema && !schemaError && <Spinner />}
      {schema && map && (
        <div className="form scroll">
          <p className="muted small-text">Asocia cada dato de Nido con una propiedad de la base de datos.</p>
          {roles.map((role) => {
            const options = schema.properties.filter((p) => COMPATIBLE[role].includes(p.type))
            return (
              <label key={role} className="field inline">
                <span>{ROLE_LABEL[role]}</span>
                <select
                  className="input"
                  value={map[role] ?? ''}
                  onChange={(e) => {
                    const value = e.target.value || undefined
                    setMap({ ...map, [role]: value ?? (role === 'title' ? map.title : undefined) })
                    if (role === 'status') setDoneValue(guessDone(propByName(schema, value)))
                  }}
                >
                  {role !== 'title' && <option value="">— Ninguna —</option>}
                  {options.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({TYPE_LABEL[p.type] ?? p.type})
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
          {statusProp && statusProp.type !== 'checkbox' && (
            <label className="field inline">
              <span>«Completada» es</span>
              <select className="input" value={doneValue ?? ''} onChange={(e) => setDoneValue(e.target.value || undefined)}>
                <option value="">— Elige una opción —</option>
                {(statusProp.options ?? []).map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {statusProp && statusProp.type !== 'checkbox' && !doneValue && (
            <p className="field-error">Elige qué opción significa «completada» para poder marcar tareas.</p>
          )}
          <div className="row">
            {onCancel && (
              <button className="btn small" onClick={onCancel}>
                Cancelar
              </button>
            )}
            <span className="grow" />
            <button
              className="btn primary small"
              disabled={!map.title}
              onClick={() => onSave({ dataSourceId: chosen.id, name: schema.title || chosen.title, map, doneValue })}
            >
              Usar esta base de datos
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
