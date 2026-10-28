import { useState } from 'react'
import { Icon } from '../icons'
import { confirmDialog } from '../ui/feedback'
import type { WidgetProps } from './types'

// Evaluador propio (sin eval): números, + − × ÷ ^, %, paréntesis y decimales con coma o punto.

type Token = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: '(' } | { t: ')' }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  const s = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.')
  for (let i = 0; i < s.length; ) {
    const c = s[i]
    if (/[\d.]/.test(c)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\.?/.exec(s.slice(i))!
      tokens.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if ('+-*/^%'.includes(c)) {
      tokens.push({ t: 'op', v: c })
      i++
    } else if (c === '(' || c === ')') {
      tokens.push({ t: c })
      i++
    } else throw new Error(`Carácter no válido: ${c}`)
  }
  return tokens
}

/** Descenso recursivo: expr = término (± término)*, con ^ asociativo a la derecha. */
export function evaluate(expr: string): number {
  const tokens = tokenize(expr)
  let i = 0
  const peek = (): Token | undefined => tokens[i]
  const parseExpr = (): number => {
    let v = parseTerm()
    while (peek()?.t === 'op' && '+-'.includes((peek() as { v: string }).v)) {
      const op = (tokens[i++] as { v: string }).v
      v = op === '+' ? v + parseTerm() : v - parseTerm()
    }
    return v
  }
  const parseTerm = (): number => {
    let v = parseFactor()
    while (peek()?.t === 'op' && '*/'.includes((peek() as { v: string }).v)) {
      const op = (tokens[i++] as { v: string }).v
      const r = parseFactor()
      if (op === '/' && r === 0) throw new Error('División entre cero')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const parseFactor = (): number => {
    const base = parseUnary()
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '^') {
      i++
      return Math.pow(base, parseFactor())
    }
    return base
  }
  const parseUnary = (): number => {
    const t = peek()
    if (t?.t === 'op' && (t.v === '-' || t.v === '+')) {
      i++
      return t.v === '-' ? -parseUnary() : parseUnary()
    }
    let v = parsePrimary()
    // % como porcentaje: 50% = 0.5
    while (peek()?.t === 'op' && (peek() as { v: string }).v === '%') {
      i++
      v /= 100
    }
    return v
  }
  const parsePrimary = (): number => {
    const t = tokens[i++]
    if (!t) throw new Error('Falta un número')
    if (t.t === 'num') return t.v
    if (t.t === '(') {
      const v = parseExpr()
      if (tokens[i++]?.t !== ')') throw new Error('Falta cerrar un paréntesis')
      return v
    }
    throw new Error('Expresión incompleta')
  }
  const value = parseExpr()
  if (i < tokens.length) throw new Error('Expresión no válida')
  if (!Number.isFinite(value)) throw new Error('Resultado no válido')
  return value
}

/** Sin separador de miles y con coma decimal: así el resultado se puede reutilizar tal cual. */
const format = (n: number): string => String(Number(n.toPrecision(14))).replace('.', ',')

const KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', ',', '=']

export function CalculatorWidget({ widget, update }: WidgetProps<'calculator'>): JSX.Element {
  const [expr, setExpr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const history = widget.data.history

  let preview = ''
  try {
    if (expr && /[\d)]$/.test(expr.trim()) && /[-+×÷*/^%−]/.test(expr)) preview = format(evaluate(expr))
  } catch {
    preview = ''
  }

  const calculate = (): void => {
    if (!expr.trim()) return
    try {
      const result = format(evaluate(expr))
      update({ history: [{ expr, result, at: Date.now() }, ...history].slice(0, 50) })
      setExpr(result)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const press = (key: string): void => {
    setError(null)
    if (key === 'C') setExpr('')
    else if (key === '=') calculate()
    else setExpr((e) => e + key)
  }

  return (
    <div className="calculator">
      <div className="calc-display">
        <input
          className="calc-input mono"
          value={expr}
          aria-label="Operación"
          placeholder="0"
          onChange={(e) => {
            setExpr(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') calculate()
            if (e.key === 'Escape' && expr) {
              e.stopPropagation()
              setExpr('')
            }
          }}
        />
        <span className={`calc-preview mono ${error ? 'error-text' : ''}`}>{error ?? (preview ? `= ${preview}` : ' ')}</span>
      </div>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <button key={k} className={`calc-key ${k === '=' ? 'equals' : /[÷×−+]/.test(k) ? 'op' : k === 'C' ? 'fn' : ''}`} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
      {history.length > 0 && (
        <div className="calc-history">
          <div className="row">
            <span className="muted small-text grow">Historial</span>
            <button
              className="icon-btn small"
              title="Borrar historial"
              onClick={async () => {
                if (await confirmDialog({ title: 'Borrar historial', message: `¿Borrar las ${history.length} operaciones guardadas?`, confirmLabel: 'Borrar', danger: true }))
                  update({ history: [] })
              }}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
          <ul className="list scroll">
            {history.map((h) => (
              <li key={h.at}>
                <button className="calc-line mono" title="Usar este resultado" onClick={() => setExpr(h.result)}>
                  <span className="muted">{h.expr} =</span> <b>{h.result}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
