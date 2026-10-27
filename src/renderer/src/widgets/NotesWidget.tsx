import type { WidgetProps } from './types'

export function NotesWidget({ widget, update }: WidgetProps<'notes'>): JSX.Element {
  const words = widget.data.text.trim() ? widget.data.text.trim().split(/\s+/).length : 0
  return (
    <div className="notes">
      <textarea
        className="notes-area"
        value={widget.data.text}
        placeholder="Escribe algo…"
        spellCheck
        onChange={(e) => update({ text: e.target.value })}
      />
      <div className="widget-footer muted">{words} palabras</div>
    </div>
  )
}
