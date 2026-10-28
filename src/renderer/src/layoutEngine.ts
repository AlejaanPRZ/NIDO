import type { LayoutItem } from '../../shared/types'

// Colocación de widgets en la cuadrícula de 12 columnas, sin la compactación de la librería.
// Al soltar un widget (A) sobre otros, se prueban varias soluciones y se elige la que menos mueve
// al resto del panel:
//   · Intercambio: el widget pisado (B) ocupa el sitio que deja A.
//   · Intercambio de orden en la columna: si A baja sobre B, B sube a donde estaba A y A queda justo
//     debajo de B (y al revés si sube). Sirve aunque tengan alturas distintas.
//   · En ambos casos, los que estorben se desplazan solo lo necesario hacia abajo, en su columna.
//   · Si nada de eso vale, cada widget pisado va al hueco libre más cercano.
// Nunca se empuja en cadena todo el escritorio. Los fijados no se mueven ni se pueden pisar.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const bottomOf = (items: Rect[]): number => items.reduce((max, l) => Math.max(max, l.y + l.h), 0)

/** Coste de mover un widget: cambiar de columna pesa más que bajar unas filas. */
const moveCost = (from: Rect, to: Rect): number => {
  const dy = to.y - from.y
  return Math.abs(to.x - from.x) * 2 + Math.abs(dy) + (dy > 0 ? dy * 0.5 : 0)
}

/** Hueco libre más cercano a want (en celdas). bonus: zona preferida (el hueco que deja el arrastrado). */
function nearestFree(item: LayoutItem, want: Rect, placed: Rect[], cols: number, bonus?: Rect): { x: number; y: number } {
  const w = Math.min(item.w, cols)
  const maxY = bottomOf(placed) + item.h
  let best: { x: number; y: number; score: number } | null = null
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const rect = { x, y, w, h: item.h }
      let score = moveCost(want, rect)
      if (bonus && overlaps(rect, bonus)) score -= 0.75
      if (best && score >= best.score) continue
      if (placed.some((p) => overlaps(rect, p))) continue
      best = { x, y, score }
    }
  }
  return best ?? { x: 0, y: maxY }
}

interface Plan {
  items: Map<string, LayoutItem>
  cost: number
}

/**
 * Coloca primero `fixed` (posiciones decididas) y luego el resto en orden de lectura: el que choque
 * con lo ya colocado baja lo justo, sin cambiar de columna. Devuelve null si algo decidido pisa un fijado.
 */
function cascade(layout: LayoutItem[], fixed: LayoutItem[], statics: Set<string>): Plan | null {
  const placed: LayoutItem[] = layout.filter((l) => statics.has(l.i))
  const ids = new Set(fixed.map((f) => f.i))
  for (const f of fixed) {
    if (placed.some((p) => overlaps(p, f))) return null
    placed.push(f)
  }
  const items = new Map<string, LayoutItem>(fixed.map((f) => [f.i, f]))
  let cost = 0
  const rest = layout.filter((l) => !statics.has(l.i) && !ids.has(l.i)).sort((a, b) => a.y - b.y || a.x - b.x)
  for (const l of rest) {
    let item = l
    for (let guard = 0; guard < 500; guard++) {
      const hits = placed.filter((p) => overlaps(p, item))
      if (!hits.length) break
      item = { ...item, y: Math.max(...hits.map((p) => p.y + p.h)) }
    }
    if (item !== l) cost += moveCost(l, item)
    placed.push(item)
    items.set(l.i, item)
  }
  return { items, cost }
}

/**
 * Distribución resultante de mover (o redimensionar) el widget moved.
 * origin: dónde estaba antes (permite intercambiar). statics: ids de los fijados.
 * Devuelve null si moved pisa un widget fijado (el movimiento no es válido).
 */
export function resolveMove(layout: LayoutItem[], moved: LayoutItem, statics: Set<string>, cols: number, origin?: Rect): LayoutItem[] | null {
  const others = layout.filter((l) => l.i !== moved.i)
  if (others.some((l) => statics.has(l.i) && overlaps(l, moved))) return null
  const hit = others.filter((l) => overlaps(l, moved)).sort((a, b) => a.y - b.y || a.x - b.x)
  if (hit.length === 0) return layout.map((l) => (l.i === moved.i ? moved : l))

  const all = layout.map((l) => (l.i === moved.i ? moved : l))
  const plans: Plan[] = []
  const tryPlan = (fixed: LayoutItem[], extra = 0): void => {
    if (fixed.some((f) => f.x < 0 || f.y < 0 || f.x + f.w > cols)) return
    const plan = cascade(all, fixed, statics)
    if (plan) plans.push({ items: plan.items, cost: plan.cost + extra })
  }

  if (origin && hit.length === 1) {
    const b = hit[0]
    // Intercambio directo: B al sitio de A (alineado a su izquierda o a su derecha).
    for (const x of new Set([origin.x, origin.x + origin.w - b.w])) tryPlan([moved, { ...b, x, y: origin.y }], 0.25)
    // Intercambio de orden en la misma columna: no deja huecos aunque las alturas difieran (gana en empate).
    const sameColumn = moved.x < b.x + b.w && moved.x + moved.w > b.x
    if (sameColumn && moved.y > origin.y) {
      const top = Math.min(origin.y, b.y)
      tryPlan([{ ...b, y: top }, { ...moved, y: top + b.h }])
    } else if (sameColumn && moved.y < origin.y) {
      tryPlan([moved, { ...b, y: moved.y + moved.h }])
    }
  }

  // Siempre disponible: cada pisado al hueco libre más cercano (sin mover a nadie más).
  {
    const placed: LayoutItem[] = [moved, ...others.filter((l) => !hit.includes(l))]
    const items = new Map<string, LayoutItem>()
    let cost = 0
    for (const b of hit) {
      const item = { ...b, ...nearestFree(b, b, placed, cols, origin) }
      cost += moveCost(b, item)
      placed.push(item)
      items.set(b.i, item)
    }
    items.set(moved.i, moved)
    plans.push({ items, cost })
  }

  const best = plans.reduce((a, b) => (b.cost < a.cost ? b : a))
  return layout.map((l) => best.items.get(l.i) ?? (l.i === moved.i ? moved : l))
}

/** Tras cambiar el tamaño de un widget desde el menú (S/M/L, desplegar, duplicar…): sin solapes. */
export function settle(layout: LayoutItem[], id: string, statics: Set<string>, cols: number): LayoutItem[] {
  const item = layout.find((l) => l.i === id)
  if (!item) return layout
  const resolved = resolveMove(layout, item, statics, cols)
  if (resolved) return resolved
  // Pisa un fijado: el que cambia busca sitio cerca.
  const others = layout.filter((l) => l.i !== id)
  const spot = nearestFree(item, item, others, cols)
  return layout.map((l) => (l.i === id ? { ...l, ...spot } : l))
}

/** Corrige solapes heredados (estados guardados con otra lógica): mueve lo mínimo, en orden de lectura. */
export function resolveOverlaps(layout: LayoutItem[], statics: Set<string>, cols: number): LayoutItem[] {
  const placed: LayoutItem[] = layout.filter((l) => statics.has(l.i))
  const out = new Map<string, LayoutItem>(placed.map((l) => [l.i, l]))
  for (const l of [...layout].filter((l) => !statics.has(l.i)).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const item = placed.some((p) => overlaps(p, l)) ? { ...l, ...nearestFree(l, l, placed, cols) } : l
    placed.push(item)
    out.set(l.i, item)
  }
  return layout.map((l) => out.get(l.i) ?? l)
}
