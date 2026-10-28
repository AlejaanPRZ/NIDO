import { describe, expect, it } from 'vitest'
import type { LayoutItem } from '../src/shared/types'
import { overlaps, resolveMove, resolveOverlaps, settle } from '../src/renderer/src/layoutEngine'

const COLS = 12
const item = (i: string, x: number, y: number, w: number, h: number): LayoutItem => ({ i, x, y, w, h })
const byId = (layout: LayoutItem[]): Record<string, { x: number; y: number }> =>
  Object.fromEntries(layout.map((l) => [l.i, { x: l.x, y: l.y }]))
const noOverlaps = (layout: LayoutItem[]): boolean =>
  layout.every((a, i) => layout.every((b, j) => i === j || !overlaps(a, b)))

describe('overlaps', () => {
  it('detecta el solape y no cuenta los bordes que se tocan', () => {
    expect(overlaps({ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 3, w: 4, h: 4 })).toBe(true)
    expect(overlaps({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 })).toBe(false)
    expect(overlaps({ x: 0, y: 0, w: 4, h: 4 }, { x: 0, y: 4, w: 4, h: 4 })).toBe(false)
  })
})

describe('resolveMove', () => {
  it('intercambia dos widgets del mismo tamaño en columnas distintas', () => {
    const layout = [item('a', 0, 0, 4, 6), item('b', 4, 0, 4, 6)]
    const moved = { ...layout[0], x: 4 }
    const out = resolveMove(layout, moved, new Set(), COLS, layout[0])
    expect(out).not.toBeNull()
    expect(byId(out!)).toEqual({ a: { x: 4, y: 0 }, b: { x: 0, y: 0 } })
  })

  it('al bajar A sobre B en la misma columna, B sube y A queda justo debajo (alturas distintas)', () => {
    const layout = [item('a', 0, 0, 4, 4), item('b', 0, 4, 4, 8)]
    const moved = { ...layout[0], y: 5 }
    const out = resolveMove(layout, moved, new Set(), COLS, layout[0])!
    expect(byId(out)).toEqual({ b: { x: 0, y: 0 }, a: { x: 0, y: 8 } })
    expect(noOverlaps(out)).toBe(true)
  })

  it('no permite soltar encima de un widget fijado', () => {
    const layout = [item('a', 0, 0, 4, 6), item('fijo', 4, 0, 4, 6)]
    const moved = { ...layout[0], x: 4 }
    expect(resolveMove(layout, moved, new Set(['fijo']), COLS, layout[0])).toBeNull()
  })

  it('a un hueco libre lo mueve sin tocar a nadie', () => {
    const layout = [item('a', 0, 0, 4, 6), item('b', 4, 0, 4, 6)]
    const moved = { ...layout[0], x: 8 }
    const out = resolveMove(layout, moved, new Set(), COLS, layout[0])!
    expect(byId(out)).toEqual({ a: { x: 8, y: 0 }, b: { x: 4, y: 0 } })
  })

  it('el resultado nunca deja solapes en un panel lleno', () => {
    const layout = [
      item('cal', 0, 0, 4, 11),
      item('tiempo', 0, 11, 4, 5),
      item('tareas', 4, 0, 4, 9),
      item('notas', 4, 9, 4, 7),
      item('musica', 8, 0, 4, 9),
      item('enlaces', 8, 9, 4, 7)
    ]
    for (const target of layout) {
      for (const source of layout) {
        if (source === target) continue
        const moved = { ...source, x: target.x, y: target.y }
        const out = resolveMove(layout, moved, new Set(), COLS, source)
        expect(out, `${source.i} sobre ${target.i}`).not.toBeNull()
        expect(noOverlaps(out!), `${source.i} sobre ${target.i}`).toBe(true)
        expect(out!.every((l) => l.x >= 0 && l.x + l.w <= COLS && l.y >= 0)).toBe(true)
      }
    }
  })
})

describe('settle y resolveOverlaps', () => {
  it('settle aparta a los que pisa un widget que ha crecido, sin solapes', () => {
    const layout = [item('a', 0, 0, 4, 10), item('b', 0, 6, 4, 4), item('c', 4, 0, 4, 4)]
    const out = settle(layout, 'a', new Set(), COLS)
    expect(noOverlaps(out)).toBe(true)
    expect(byId(out).a).toEqual({ x: 0, y: 0 })
  })

  it('resolveOverlaps corrige un estado guardado con solapes y respeta los fijados', () => {
    const layout = [item('fijo', 0, 0, 6, 6), item('b', 2, 2, 4, 4), item('c', 3, 3, 4, 4)]
    const out = resolveOverlaps(layout, new Set(['fijo']), COLS)
    expect(noOverlaps(out)).toBe(true)
    expect(byId(out).fijo).toEqual({ x: 0, y: 0 })
  })
})
