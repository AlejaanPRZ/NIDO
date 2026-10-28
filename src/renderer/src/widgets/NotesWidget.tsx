import { useRef, type ReactNode } from 'react'
import { Icon, type IconName } from '../icons'
import { Segmented } from '../ui/controls'
import type { WidgetProps } from './types'

// Formato básico en Markdown sencillo. La vista se construye con elementos de
// React (nunca HTML del usuario): títulos, listas, casillas, negrita, cursiva,
// código y enlaces que se abren fuera de Nido.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const label = t.slice(1, t.indexOf(']'))
      const href = m[2]
      out.push(
        <a key={k} href={href} onClick={(e) => (e.preventDefault(), void window.nido.openExternal(href))} title={href}>
          {label}
        </a>
      )
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Rendered({ text, onToggle }: { text: string; onToggle(line: number): void }): JSX.Element {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: ReactNode[] } | null = null
  const flush = (): void => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={`l${blocks.length}`}>{list.items}</Tag>)
    list = null
  }
  lines.forEach((line, n) => {
    const task = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(line)
    const bullet = /^\s*[-*] (.*)$/.exec(line)
    const ordered = /^\s*\d+[.)] (.*)$/.exec(line)
    const heading = /^(#{1,3}) (.*)$/.exec(line)
    if (task) {
      if (!list || list.ordered) (flush(), (list = { ordered: false, items: [] }))
      const done = task[1] !== ' '
      list!.items.push(
        <li key={n} className={`md-task ${done ? 'done' : ''}`}>
          <input type="checkbox" checked={done} onChange={() => onToggle(n)} aria-label={task[2]} />
          <span>{inline(task[2], `t${n}`)}</span>
        </li>
      )
    } else if (bullet || ordered) {
      const isOrdered = !!ordered
      if (!list || list.ordered !== isOrdered) (flush(), (list = { ordered: isOrdered, items: [] }))
      list!.items.push(<li key={n}>{inline((bullet ?? ordered)![1], `b${n}`)}</li>)
    } else {
      flush()
      if (heading) {
        const H = (['h3', 'h4', 'h5'] as const)[heading[1].length - 1]
        blocks.push(<H key={n}>{inline(heading[2], `h${n}`)}</H>)
      } else if (line.trim()) blocks.push(<p key={n}>{inline(line, `p${n}`)}</p>)
      else blocks.push(<div key={n} className="md-gap" />)
    }
  })
  flush()
  return <div className="md">{blocks}</div>
}

const TOOLS: { icon: IconName; title: string; wrap?: string; prefix?: string }[] = [
  { icon: 'bold', title: 'Negrita (Ctrl+B)', wrap: '**' },
  { icon: 'italic', title: 'Cursiva (Ctrl+I)', wrap: '*' },
  { icon: 'heading', title: 'Título', prefix: '## ' },
  { icon: 'list', title: 'Lista', prefix: '- ' },
  { icon: 'checklist', title: 'Lista de tareas', prefix: '- [ ] ' }
]

export function NotesWidget({ widget, update }: WidgetProps<'notes'>): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { text } = widget.data
  const mode = widget.data.mode ?? 'edit'
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  /** Aplica una herramienta a la selección y recoloca el cursor. */
  const apply = (tool: (typeof TOOLS)[number]): void => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    let next: string
    let cursor: [number, number]
    if (tool.wrap) {
      const sel = text.slice(s, e) || 'texto'
      next = text.slice(0, s) + tool.wrap + sel + tool.wrap + text.slice(e)
      cursor = [s + tool.wrap.length, s + tool.wrap.length + sel.length]
    } else {
      // Prefijo al principio de cada línea seleccionada.
      const lineStart = text.lastIndexOf('\n', s - 1) + 1
      const block = text.slice(lineStart, e)
      const prefixed = block
        .split('\n')
        .map((l) => (l.startsWith(tool.prefix!) ? l.slice(tool.prefix!.length) : tool.prefix + l))
        .join('\n')
      next = text.slice(0, lineStart) + prefixed + text.slice(e)
      cursor = [lineStart + prefixed.length, lineStart + prefixed.length]
    }
    update({ text: next })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(...cursor)
    })
  }

  const toggleLine = (n: number): void => {
    const lines = text.split('\n')
    lines[n] = lines[n].replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'))
    update({ text: lines.join('\n') })
  }

  return (
    <div className="notes">
      <div className="notes-bar">
        {mode === 'edit' &&
          TOOLS.map((t) => (
            <button key={t.icon} className="icon-btn small" title={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(t)}>
              <Icon name={t.icon} size={13} />
            </button>
          ))}
        <span className="grow" />
        <Segmented
          label="Modo de la nota"
          className="compact"
          value={mode}
          options={[
            { value: 'edit', label: 'Editar' },
            { value: 'view', label: 'Ver' }
          ]}
          onChange={(m) => update({ mode: m })}
        />
      </div>
      {mode === 'edit' ? (
        <textarea
          ref={ref}
          className="notes-area"
          value={text}
          placeholder="Escribe algo… (**negrita**, - lista, - [ ] tarea)"
          spellCheck
          aria-label="Texto de la nota"
          onChange={(e) => update({ text: e.target.value })}
          onKeyDown={(e) => {
            if (e.ctrlKey && (e.key === 'b' || e.key === 'i')) {
              e.preventDefault()
              apply(TOOLS[e.key === 'b' ? 0 : 1])
            }
          }}
        />
      ) : (
        <div className="notes-view scroll" onDoubleClick={() => update({ mode: 'edit' })} title="Doble clic para editar">
          {text.trim() ? <Rendered text={text} onToggle={toggleLine} /> : <p className="muted">Nota vacía.</p>}
        </div>
      )}
      <div className="widget-footer muted">
        {words} {words === 1 ? 'palabra' : 'palabras'} · se guarda solo
      </div>
    </div>
  )
}
