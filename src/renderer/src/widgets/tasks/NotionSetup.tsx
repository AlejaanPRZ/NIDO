import { useEffect, useState } from 'react'
import type { NotionSchema, NotionSource, NotionTaskConfig, NotionTaskMapping } from '../../../../shared/types'
import { Icon } from '../../icons'
import { Spinner } from '../../ui/controls'
import { COMPATIBLE, guessDone, guessMapping, propByName, ROLE_LABEL, type Role } from './notionModel'

interface Props {
  current?: NotionTaskConfig
  onSave(config: NotionTaskConfig): void
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

/** Elegir la base de datos de Notion y qué propiedad es cada cosa. */
export function NotionSetup({ current, onSave, onCancel }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<NotionSource[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<NotionSource | null>(current ? { id: current.dataSourceId, title: current.name } : null)
  const [schema, setSchema] = useState<NotionSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [map, setMap] = useState<NotionTaskMapping | null>(current?.map ?? null)
  const [doneValue, setDoneValue] = useState<string | undefined>(current?.doneValue)

  useEffect(() => {
    if (chosen) return
    const timer = setTimeout(() => {
      setSources(null)
      window.nido.notion.search(query).then((r) => {
        if (r.ok) {
          setSources(r.data)
          setSearchError(null)
        } else setSearchError(r.error)
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [query, chosen])

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

  if (!chosen) {
    return (
      <div className="notion-setup">
        <p className="setup-title">
          <Icon name="database" size={15} />
          Elige la base de datos de tareas
        </p>
        <input
          className="input"
          autoFocus
          placeholder="Buscar en Notion…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="list scroll">
          {searchError && <p className="field-error">{searchError}</p>}
          {!sources && !searchError && <Spinner />}
          {sources?.length === 0 && (
            <p className="muted small-text">
              No aparece ninguna. En Notion, abre la base de datos → ••• → Conexiones y añade tu integración.
            </p>
          )}
          {sources?.map((s) => (
            <button key={s.id} className="list-btn" onClick={() => setChosen(s)}>
              <Icon name="database" size={14} />
              <span className="grow">{s.title}</span>
              <Icon name="chevronRight" size={14} />
            </button>
          ))}
        </div>
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
