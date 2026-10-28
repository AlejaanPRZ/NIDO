import { describe, expect, it } from 'vitest'
import type { AppState } from '../src/shared/types'
import { overlaps } from '../src/renderer/src/layoutEngine'
import { defaultState, migrate, reducer } from '../src/renderer/src/store'

const allLayouts = (state: AppState) => state.workspaces.map((ws) => ws.layout)
const noOverlaps = (state: AppState): boolean =>
  allLayouts(state).every((layout) => layout.every((a, i) => layout.every((b, j) => i === j || !overlaps(a, b))))

describe('migrate', () => {
  it('rechaza lo que no es un estado de Nido', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate('hola')).toBeNull()
    expect(migrate({ version: 99 })).toBeNull()
  })

  it('v1 (un solo panel) pasa entero a «Personal» y conserva el tema', () => {
    const v1 = {
      version: 1,
      widgets: [{ id: 'n1', type: 'notes', title: 'Mis notas', data: { text: 'hola' } }],
      layout: [{ i: 'n1', x: 0, y: 0, w: 4, h: 6 }],
      settings: { theme: 'dark', locked: true }
    }
    const state = migrate(v1)!
    expect(state.version).toBe(3)
    expect(state.activeWorkspace).toBe('personal')
    const personal = state.workspaces.find((w) => w.id === 'personal')!
    expect(personal.widgets.map((w) => w.id)).toEqual(['n1'])
    expect((personal.widgets[0].data as { text: string }).text).toBe('hola')
    expect(state.settings.theme).toBe('dark')
    expect(state.settings.locked).toBe(true)
  })

  it('v2 recibe iconos y colores de espacio', () => {
    const v2 = { version: 2, workspaces: [{ id: 'trabajo', name: 'Trabajo', widgets: [], layout: [] }], activeWorkspace: 'trabajo', settings: {} }
    const state = migrate(v2)!
    expect(state.workspaces[0].icon).toBeTruthy()
    expect(state.workspaces[0].color).toMatch(/^#/)
  })

  it('descarta widgets de tipos desconocidos y alinea layout con widgets', () => {
    const raw = {
      version: 3,
      workspaces: [
        {
          id: 'w',
          name: 'W',
          icon: 'home',
          color: '#0a84ff',
          widgets: [
            { id: 'ok', type: 'notes', title: 'Notas', data: {} },
            { id: 'raro', type: 'no-existe', title: '?', data: {} }
          ],
          layout: [
            { i: 'ok', x: 0, y: 0, w: 4, h: 6 },
            { i: 'raro', x: 4, y: 0, w: 4, h: 6 },
            { i: 'huerfano', x: 8, y: 0, w: 4, h: 6 }
          ]
        }
      ],
      activeWorkspace: 'w',
      settings: {}
    }
    const ws = migrate(raw)!.workspaces[0]
    expect(ws.widgets.map((w) => w.id)).toEqual(['ok'])
    expect(ws.layout.map((l) => l.i)).toEqual(['ok'])
  })

  it('corrige ajustes no válidos sin perder los buenos', () => {
    const raw = { version: 3, workspaces: [], activeWorkspace: 'nada', settings: { palette: 'arcoiris', glass: 250, animatedBackground: 1, theme: 'dark' } }
    const state = migrate(raw)!
    expect(state.settings.palette).toBe('nido')
    expect(state.settings.glass).toBe(100)
    expect(state.settings.animatedBackground).toBe(true)
    expect(state.settings.theme).toBe('dark')
    expect(state.workspaces.some((w) => w.id === state.activeWorkspace)).toBe(true)
  })

  it('conserva un estilo válido y los campos nuevos de los widgets', () => {
    const raw = {
      version: 3,
      workspaces: [{ id: 'w', name: 'W', icon: 'home', color: '#0a84ff', widgets: [{ id: 't', type: 'tasks', title: 'Tareas', data: { notionPage: { pageId: 'p', name: 'Mi página' } } }], layout: [{ i: 't', x: 0, y: 0, w: 4, h: 8 }] }],
      activeWorkspace: 'w',
      settings: { palette: 'terra' }
    }
    const state = migrate(raw)!
    expect(state.settings.palette).toBe('terra')
    expect((state.workspaces[0].widgets[0].data as { notionPage?: unknown }).notionPage).toEqual({ pageId: 'p', name: 'Mi página' })
  })

  it('un estado con widgets solapados se guarda ya sin solapes', () => {
    const raw = {
      version: 3,
      workspaces: [
        {
          id: 'w',
          name: 'W',
          icon: 'home',
          color: '#0a84ff',
          widgets: ['a', 'b', 'c'].map((id) => ({ id, type: 'notes', title: id, data: {} })),
          layout: [
            { i: 'a', x: 0, y: 0, w: 4, h: 6 },
            { i: 'b', x: 1, y: 1, w: 4, h: 6 },
            { i: 'c', x: 2, y: 2, w: 4, h: 6 }
          ]
        }
      ],
      activeWorkspace: 'w',
      settings: {}
    }
    expect(noOverlaps(migrate(raw)!)).toBe(true)
  })
})

describe('reducer', () => {
  it('el estado inicial no tiene solapes', () => {
    expect(noOverlaps(defaultState())).toBe(true)
  })

  it('añadir, duplicar y cambiar de tamaño nunca deja solapes', () => {
    let state = defaultState()
    state = reducer(state, { type: 'add', widgetType: 'notes' })
    state = reducer(state, { type: 'add', widgetType: 'pomodoro', size: 'l' })
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspace)!
    const first = ws.widgets[0].id
    state = reducer(state, { type: 'duplicate', id: first })
    state = reducer(state, { type: 'resize', id: first, w: 8, h: 14 })
    expect(noOverlaps(state)).toBe(true)
  })

  it('mover un widget a otro espacio lo saca del suyo y lo coloca sin solapes', () => {
    let state = defaultState()
    const from = state.workspaces[0]
    const id = from.widgets[0].id
    const to = state.workspaces[1].id
    state = reducer(state, { type: 'move', id, workspace: to })
    expect(state.workspaces[0].widgets.some((w) => w.id === id)).toBe(false)
    expect(state.workspaces[1].widgets.some((w) => w.id === id)).toBe(true)
    expect(noOverlaps(state)).toBe(true)
  })

  it('no se puede borrar el último espacio', () => {
    let state = defaultState()
    for (const ws of [...state.workspaces]) state = reducer(state, { type: 'removeWorkspace', id: ws.id })
    expect(state.workspaces.length).toBe(1)
  })
})
