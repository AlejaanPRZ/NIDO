import { Icon, type IconName } from './icons'

// Logos de marca locales (generados con scripts/brands.mjs; procedencia en brands/SOURCES.md).
// Se pintan siempre igual: sobre una placa clara con margen, sin estirar ni recortar
// (object-fit: contain), y con el nombre del servicio como texto alternativo.
const FILES = import.meta.glob<string>('./brands/*.svg', { eager: true, query: '?url', import: 'default' })

const URLS: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.slice(9, -4), url]))

export const hasBrand = (id: string | undefined): id is string => !!id && id in URLS

interface Props {
  /** id del logo (nombre del archivo en brands/) */
  brand: string
  /** Nombre del servicio: texto alternativo y tooltip */
  name: string
  size?: number
  /** Icono propio si no hay logo para esa marca */
  fallback?: IconName
  className?: string
  /** Sin tooltip cuando el nombre ya se lee al lado */
  decorative?: boolean
}

export function BrandLogo({ brand, name, size = 28, fallback = 'web', className = '', decorative = false }: Props): JSX.Element {
  const url = URLS[brand]
  return (
    <span
      className={`brand-tile ${url ? '' : 'generic'} ${className}`}
      style={{ width: size, height: size }}
      title={decorative ? undefined : name}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {url ? <img src={url} alt="" draggable={false} /> : <Icon name={fallback} size={Math.round(size * 0.55)} />}
    </span>
  )
}

/** Logo de la app que reproduce, a partir del AppUserModelId que da Windows. */
export function brandOfApp(appId: string): string | undefined {
  const id = appId.toLowerCase()
  const known: [string, string][] = [
    ['applemusic', 'apple-music'],
    ['itunes', 'itunes'],
    ['spotify', 'spotify'],
    ['tidal', 'tidal'],
    ['deezer', 'deezer'],
    ['vlc', 'vlc'],
    ['operagx', 'opera-gx'],
    ['opera', 'opera'],
    ['msedge', 'edge'],
    ['chrome', 'chrome'],
    ['firefox', 'firefox'],
    ['brave', 'brave'],
    ['vivaldi', 'vivaldi']
  ]
  return known.find(([needle]) => id.includes(needle))?.[1]
}

/** Logo de un navegador detectado, por su id o su nombre. */
export function brandOfBrowser(idOrName: string): string | undefined {
  const s = idOrName.toLowerCase()
  if (s.includes('gx')) return 'opera-gx'
  for (const [needle, brand] of [
    ['edge', 'edge'],
    ['chromium', ''],
    ['chrome', 'chrome'],
    ['firefox', 'firefox'],
    ['brave', 'brave'],
    ['opera', 'opera'],
    ['vivaldi', 'vivaldi']
  ] as const) {
    if (s.includes(needle)) return brand || undefined
  }
  return undefined
}
