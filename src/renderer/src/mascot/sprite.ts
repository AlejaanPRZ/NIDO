// Braco de Weimar en pixel art, dibujado con formas simples sobre una cuadrícula de W×H y con el
// contorno calculado al final: gris plata liso, orejas largas algo más oscuras, ojos ámbar y collar
// rosa. Mira a la derecha; para ir a la izquierda se voltea con CSS. Módulo puro (sin DOM) para
// poder probarlo fuera del navegador.

export const W = 32
export const H = 20
const GROUND = H - 1

/** Índices de color; 0 es transparente. */
export const PALETTE = [
  '',
  '#2b2a2c', // 1 contorno
  '#b9b5b0', // 2 gris plata (cuerpo)
  '#8f8b87', // 3 gris en sombra (patas del otro lado)
  '#aaa6a1', // 4 gris de la cabeza, el cuello y la cola
  '#7d7975', // 5 gris oscuro (orejas, párpados)
  '#4a4444', // 6 nariz
  '#e9788a', // 7 lengua
  '#f06aa0', // 8 collar rosa
  '#d9a23c', // 9 ojos ámbar
  '#cdc9c4', // 10 brillo del lomo
  '#1d1a1a', // 11 pupila
  '#fffaf0' // 12 brillo del ojo
]
const OUTLINE = 1
const COAT = 2
const SHADE = 3
const HEAD = 4
const DARK = 5
const NOSE = 6
const TONGUE = 7
const COLLAR = 8
const EYE = 9
const SHINE = 10
const PUPIL = 11
const GLINT = 12

type Pt = [number, number]

class Grid {
  readonly px = new Uint8Array(W * H)
  put(x: number, y: number, c: number): void {
    if (x >= 0 && x < W && y >= 0 && y < H) this.px[y * W + x] = c
  }
  get(x: number, y: number): number {
    return x >= 0 && x < W && y >= 0 && y < H ? this.px[y * W + x] : 0
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.put(x, y, c)
  }
  points(list: Pt[], c: number): void {
    for (const [x, y] of list) this.put(x, y, c)
  }
  /** Contorno de 1 píxel alrededor de la silueta (vecinos en cruz). */
  outline(): void {
    const filled = this.px.slice()
    const at = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H && filled[y * W + x] !== 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (filled[y * W + x] !== 0) continue
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.px[y * W + x] = OUTLINE
      }
    }
  }
}

export interface Leg {
  /** Desplazamiento horizontal del pie (paso) */
  dx: number
  /** Píxeles que se levanta del suelo */
  lift: number
}

export type Tail = 'mid' | 'up' | 'down' | 'straight' | 'ground' | 'groundUp'

export interface Pose {
  body: 'stand' | 'sit' | 'lie' | 'bow'
  /** Solo de pie: delante cerca, delante lejos, detrás cerca, detrás lejos */
  legs?: [Leg, Leg, Leg, Leg]
  /** Sube (negativo) o baja el cuerpo, para el balanceo al andar */
  bob?: number
  head?: { dx: number; dy: number }
  tail: Tail
  mouth?: boolean
  eyes?: 'open' | 'closed'
  /** Muestra: la pata delantera cercana doblada en alto */
  paw?: boolean
  /** Sentado: rascándose la oreja con la pata trasera (0/1 = fotograma) */
  scratch?: 0 | 1
}

const STILL: Leg = { dx: 0, lift: 0 }

/** Cabeza con hocico, oreja caída, ojo y nariz. (hx, hy) = esquina superior izquierda del cráneo. */
function head(g: Grid, hx: number, hy: number, pose: Pose): void {
  g.rect(hx, hy, hx + 5, hy + 4, HEAD)
  g.put(hx, hy, 0)
  g.put(hx + 5, hy, 0)
  // Hocico largo y recto, típico de los perros de muestra.
  g.rect(hx + 5, hy + 2, hx + 7, hy + 4, HEAD)
  g.put(hx + 7, hy + 2, NOSE)
  if (pose.mouth) {
    g.put(hx + 6, hy + 4, 0)
    g.put(hx + 7, hy + 4, 0)
    g.rect(hx + 5, hy + 5, hx + 6, hy + 5, HEAD)
    g.put(hx + 6, hy + 5, TONGUE)
  }
  if (pose.eyes === 'closed') {
    g.rect(hx + 3, hy + 2, hx + 4, hy + 2, DARK)
  } else {
    // Ojo de 2×2: brillo, iris ámbar y pupila (mira hacia delante).
    g.put(hx + 3, hy + 1, GLINT)
    g.put(hx + 4, hy + 1, EYE)
    g.put(hx + 3, hy + 2, EYE)
    g.put(hx + 4, hy + 2, PUPIL)
  }
  // Oreja larga y caída.
  g.rect(hx, hy + 1, hx + 1, hy + 6, DARK)
}

function tail(g: Grid, kind: Tail, rx: number, ry: number): void {
  const shapes: Record<Tail, Pt[]> = {
    mid: [[rx - 1, ry], [rx - 2, ry], [rx - 3, ry - 1], [rx - 4, ry - 1], [rx - 5, ry - 2]],
    up: [[rx - 1, ry - 1], [rx - 2, ry - 2], [rx - 3, ry - 3], [rx - 4, ry - 4], [rx - 5, ry - 5]],
    down: [[rx - 1, ry + 1], [rx - 2, ry + 2], [rx - 3, ry + 3], [rx - 4, ry + 4]],
    straight: [[rx - 1, ry], [rx - 2, ry], [rx - 3, ry], [rx - 4, ry], [rx - 5, ry], [rx - 6, ry]],
    ground: [[rx - 1, ry], [rx - 2, ry + 1], [rx - 3, ry + 1], [rx - 4, ry + 1], [rx - 5, ry + 1], [rx - 6, ry + 1]],
    groundUp: [[rx - 1, ry], [rx - 2, ry - 1], [rx - 3, ry - 1], [rx - 4, ry - 2], [rx - 5, ry - 2], [rx - 6, ry - 3]]
  }
  g.points(shapes[kind], HEAD)
}

function leg(g: Grid, x: number, top: number, l: Leg, color: number): void {
  const bottom = GROUND - l.lift
  g.rect(x + l.dx, top, x + l.dx + 1, bottom, color)
  g.put(x + l.dx + 2, bottom, color) // dedos hacia delante
}

function stand(g: Grid, pose: Pose): void {
  const bob = pose.bob ?? 0
  const top = 8 + bob
  const [fn, ff, bn, bf] = pose.legs ?? [STILL, STILL, STILL, STILL]
  const legTop = top + 5
  // Patas del otro lado (en sombra) primero.
  leg(g, 9, legTop, bf, SHADE)
  leg(g, 18, legTop, ff, SHADE)
  // Cuerpo, pecho hondo y grupa redondeada.
  g.rect(9, top, 22, top + 4, COAT)
  g.put(9, top, 0)
  g.put(22, top + 4, COAT)
  g.rect(8, top + 1, 8, top + 3, COAT)
  g.rect(18, top + 5, 22, top + 5, COAT)
  // Volumen: brillo en el lomo y sombra en la barriga.
  g.rect(10, top, 20, top, SHINE)
  g.rect(10, top + 4, 17, top + 4, SHADE)
  // Patas cercanas.
  leg(g, 11, legTop, bn, COAT)
  if (pose.paw) {
    // Muestra: la pata delantera cercana levantada, con la mano doblada hacia abajo por delante.
    g.rect(21, legTop - 1, 22, legTop + 1, COAT)
    g.rect(22, legTop + 2, 23, legTop + 2, COAT)
    g.put(23, legTop + 3, COAT)
  } else {
    leg(g, 20, legTop, fn, COAT)
  }
  tail(g, pose.tail, 8, top + 1)
  const hx = 22 + (pose.head?.dx ?? 0)
  const hy = 2 + bob + (pose.head?.dy ?? 0)
  // Cuello (también cuando baja la cabeza a olfatear) y collar.
  g.rect(21, Math.min(hy + 3, top - 1), 23 + Math.max(0, pose.head?.dx ?? 0), Math.max(hy + 4, top + 1), HEAD)
  head(g, hx, hy, pose)
  // Collar rosa por encima de la oreja caída, para que se vea.
  if ((pose.head?.dy ?? 0) < 4) g.rect(21, top - 1, 24, top, COLLAR)
  else g.rect(21, top - 1, 23, top, COLLAR)
}

function sit(g: Grid, pose: Pose): void {
  // Patas delanteras rectas; detrás, el muslo apoyado en el suelo.
  g.rect(18, 13, 19, GROUND, SHADE)
  g.put(20, GROUND, SHADE)
  g.rect(16, 7, 22, 12, COAT)
  g.put(22, 7, 0)
  g.rect(13, 9, 18, 12, COAT)
  g.rect(10, 11, 17, 17, COAT)
  g.put(10, 11, 0)
  g.put(10, 17, 0)
  g.points([[17, 7], [18, 7], [19, 7], [14, 9], [15, 9], [16, 9], [12, 11], [13, 11], [11, 12]], SHINE)
  if (pose.scratch === undefined) g.rect(13, 18, 16, GROUND, COAT)
  g.rect(20, 13, 21, GROUND, COAT)
  g.put(22, GROUND, COAT)
  tail(g, pose.tail === 'groundUp' ? 'groundUp' : 'ground', 10, 16)
  const hy = 1 + (pose.scratch !== undefined ? 1 : 0)
  g.rect(20, 4, 22, 8, HEAD)
  head(g, 21, hy, pose)
  g.rect(20, 7, 23, 8, COLLAR)
  if (pose.scratch !== undefined) {
    // Pata trasera hacia la oreja, arriba y abajo.
    const s = pose.scratch
    g.points([[16, 12], [17, 11], [18, 10], [19, 9 + s], [16, 13], [17, 12], [18, 11], [19, 10 + s]], COAT)
    g.rect(19, 8 + s, 20, 8 + s, COAT)
  }
}

function lie(g: Grid, pose: Pose): void {
  g.rect(21, 17, 26, 17, SHADE)
  g.rect(8, 14, 21, 18, COAT)
  g.put(8, 14, 0)
  g.rect(9, 13, 13, 13, COAT)
  g.rect(10, 13, 13, 13, SHINE)
  g.rect(14, 14, 20, 14, SHINE)
  g.rect(21, 18, 27, 18, COAT)
  g.put(28, 18, COAT)
  tail(g, 'ground', 8, 17)
  g.rect(19, 13, 22, 16, HEAD)
  head(g, 22, 12, { ...pose, eyes: pose.eyes ?? 'closed' })
}

function bow(g: Grid, pose: Pose): void {
  // Estirándose: patas delanteras estiradas en el suelo y la grupa en alto.
  g.rect(10, 12, 11, GROUND, SHADE)
  g.rect(20, 17, 26, 17, SHADE)
  g.rect(9, 7, 14, 11, COAT)
  g.put(9, 7, 0)
  g.rect(14, 9, 18, 13, COAT)
  g.rect(17, 11, 21, 15, COAT)
  g.rect(12, 12, 13, GROUND, COAT)
  g.put(14, GROUND, COAT)
  g.rect(20, 18, 27, GROUND, COAT)
  tail(g, 'up', 9, 8)
  g.rect(20, 11, 23, 14, HEAD)
  head(g, 22, 11, pose)
}

/** Dibuja una pose: devuelve W×H índices de PALETTE. */
export function paint(pose: Pose): Uint8Array {
  const g = new Grid()
  if (pose.body === 'sit') sit(g, pose)
  else if (pose.body === 'lie') lie(g, pose)
  else if (pose.body === 'bow') bow(g, pose)
  else stand(g, pose)
  g.outline()
  return g.px
}

// ---------- Animaciones ----------

const L = (dx: number, lift = 0): Leg => ({ dx, lift })

export type Activity = 'walk' | 'sniff' | 'sit' | 'wag' | 'point' | 'scratch' | 'bark' | 'sleep' | 'stretch'

/** Fotogramas de cada actividad y su velocidad (fotogramas por segundo). */
export const ANIMATIONS: Record<Activity, { fps: number; frames: Pose[] }> = {
  walk: {
    fps: 8,
    frames: [
      { body: 'stand', legs: [L(1), L(-1), L(-1), L(1)], tail: 'mid' },
      { body: 'stand', legs: [L(0, 1), L(0), L(0), L(0, 1)], bob: -1, tail: 'up' },
      { body: 'stand', legs: [L(-1), L(1), L(1), L(-1)], tail: 'mid' },
      { body: 'stand', legs: [L(0), L(0, 1), L(0, 1), L(0)], bob: -1, tail: 'up' }
    ]
  },
  sniff: {
    fps: 4,
    frames: [
      { body: 'stand', head: { dx: 1, dy: 9 }, tail: 'mid' },
      { body: 'stand', head: { dx: 1, dy: 10 }, tail: 'up' }
    ]
  },
  sit: { fps: 1, frames: [{ body: 'sit', tail: 'ground' }] },
  wag: {
    fps: 8,
    frames: [
      { body: 'sit', tail: 'ground' },
      { body: 'sit', tail: 'groundUp' }
    ]
  },
  point: {
    fps: 3,
    frames: [
      { body: 'stand', paw: true, head: { dx: 1, dy: 0 }, tail: 'straight' },
      { body: 'stand', paw: true, head: { dx: 1, dy: 0 }, tail: 'straight' },
      { body: 'stand', paw: true, head: { dx: 1, dy: 0 }, tail: 'mid' }
    ]
  },
  scratch: {
    fps: 9,
    frames: [
      { body: 'sit', scratch: 0, tail: 'ground', eyes: 'closed' },
      { body: 'sit', scratch: 1, tail: 'ground', eyes: 'closed' }
    ]
  },
  bark: {
    fps: 5,
    frames: [
      { body: 'stand', mouth: true, tail: 'up' },
      { body: 'stand', tail: 'up' }
    ]
  },
  sleep: { fps: 1, frames: [{ body: 'lie', tail: 'ground', eyes: 'closed' }] },
  stretch: { fps: 1, frames: [{ body: 'bow', tail: 'up' }] }
}
