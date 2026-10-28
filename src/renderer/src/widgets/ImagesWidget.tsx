import { useEffect, useState } from 'react'
import type { ImageEntry } from '../../../shared/types'
import { useActive, useInterval } from '../context'
import { Icon } from '../icons'
import { Spinner } from '../ui/controls'
import { toast } from '../ui/feedback'
import { MenuButton } from '../ui/Menu'
import type { WidgetProps } from './types'

/** Pase de imágenes de carpetas o archivos elegidos por el usuario. */
export function ImagesWidget({ widget, update }: WidgetProps<'images'>): JSX.Element {
  const { sources, interval, fit } = widget.data
  const active = useActive()
  const [images, setImages] = useState<ImageEntry[] | null>(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const key = sources.map((s) => s.id).join('|')

  useEffect(() => {
    if (sources.length === 0) {
      setImages([])
      return
    }
    let cancelled = false
    Promise.all(sources.map((s) => window.nido.files.images(s.id))).then((results) => {
      if (cancelled) return
      const failed = results.find((r) => !r.ok)
      setError(failed && !failed.ok ? failed.error : null)
      setImages(results.flatMap((r) => (r.ok ? r.data : [])))
      setIndex(0)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  // El pase solo avanza mientras el widget se ve.
  useInterval(() => setIndex((i) => i + 1), Math.max(3, interval) * 1000, active && interval > 0 && (images?.length ?? 0) > 1, key, false)

  const add = async (kind: 'images' | 'imageFolder'): Promise<void> => {
    const r = await window.nido.files.pick(kind)
    if (!r.ok) return toast(r.error, 'error')
    const known = new Set(sources.map((s) => s.id))
    const fresh = r.data.filter((p) => !known.has(p.id)).map((p) => ({ id: p.id, name: p.name, kind: p.kind === 'folder' ? ('folder' as const) : ('file' as const) }))
    if (fresh.length) update({ sources: [...sources, ...fresh] })
  }

  const addItems = [
    { label: 'Carpeta de imágenes…', icon: 'folder' as const, onSelect: () => void add('imageFolder') },
    { label: 'Imágenes sueltas…', icon: 'image' as const, onSelect: () => void add('images') }
  ]

  if (sources.length === 0) {
    return (
      <div className="empty-state compact">
        <span className="empty-icon">
          <Icon name="image" size={16} />
        </span>
        <p className="empty-text">Muestra fotos de una carpeta de tu equipo.</p>
        <MenuButton items={addItems} title="Elegir imágenes" className="btn small primary" align="start">
          <Icon name="plus" size={13} /> Elegir
        </MenuButton>
      </div>
    )
  }

  if (!images) return <div className="empty-state compact"><Spinner /></div>
  const list = images
  const current = list.length ? list[((index % list.length) + list.length) % list.length] : null

  return (
    <div className="images">
      <div className={`image-stage fit-${fit}`}>
        {current ? <img key={current.url} src={current.url} alt={current.name} draggable={false} /> : <p className="muted">No hay imágenes compatibles en lo elegido.</p>}
        {list.length > 1 && (
          <>
            <button className="stage-nav prev" title="Anterior" onClick={() => setIndex((i) => i - 1)}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <button className="stage-nav next" title="Siguiente" onClick={() => setIndex((i) => i + 1)}>
              <Icon name="chevronRight" size={16} />
            </button>
          </>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="row images-bar">
        <span className="muted small-text grow" title={current?.name}>
          {current ? `${current.name} · ${((index % list.length) + list.length) % list.length + 1}/${list.length}` : ''}
        </span>
        <MenuButton
          title="Opciones de imágenes"
          className="icon-btn small"
          items={() => [
            ...addItems,
            { separator: true },
            { header: 'Cambiar cada' },
            ...[0, 5, 10, 30, 60].map((s) => ({ label: s === 0 ? 'Manual' : `${s} s`, checked: interval === s, onSelect: () => update({ interval: s }) })),
            { separator: true },
            { label: 'Rellenar el recuadro', checked: fit === 'cover', onSelect: () => update({ fit: 'cover' }) },
            { label: 'Ver la imagen entera', checked: fit === 'contain', onSelect: () => update({ fit: 'contain' }) },
            { separator: true },
            { header: 'Orígenes' },
            ...sources.map((s) => ({ label: `Quitar «${s.name}»`, icon: 'close' as const, onSelect: () => update({ sources: sources.filter((x) => x.id !== s.id) }) }))
          ]}
        >
          <Icon name="settings" size={13} />
        </MenuButton>
      </div>
    </div>
  )
}
