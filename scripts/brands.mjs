// Genera los logos de marca de src/renderer/src/brands/ a partir de paquetes con licencia CC0:
//   - @iconify-json/logos (gilbarbara/logos): logos a todo color.
//   - simple-icons: un solo color, con el color oficial de la marca.
// Uso: node scripts/brands.mjs   (los SVG resultantes se guardan en el repositorio; Nido no los
// descarga en tiempo de ejecución). Los logos son marcas de sus dueños: ver brands/SOURCES.md.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const logos = require('@iconify-json/logos/icons.json')
const si = require('simple-icons')
const logosVersion = require('@iconify-json/logos/package.json').version
const siVersion = JSON.parse(fs.readFileSync(join(import.meta.dirname, '..', 'node_modules', 'simple-icons', 'package.json'), 'utf8')).version

// id en Nido → [nombre, origen]. 'logos:x' = icono x de @iconify-json/logos; 'si:x' = siX de simple-icons.
const BRANDS = {
  'google-calendar': ['Google Calendar', 'logos:google-calendar'],
  notion: ['Notion', 'logos:notion-icon'],
  spotify: ['Spotify', 'logos:spotify-icon'],
  'apple-music': ['Apple Music', 'si:Applemusic'],
  itunes: ['iTunes', 'si:Itunes'],
  youtube: ['YouTube', 'logos:youtube-icon'],
  gmail: ['Gmail', 'logos:google-gmail'],
  whatsapp: ['WhatsApp', 'logos:whatsapp-icon'],
  telegram: ['Telegram', 'logos:telegram'],
  discord: ['Discord', 'logos:discord-icon'],
  slack: ['Slack', 'logos:slack-icon'],
  teams: ['Microsoft Teams', 'logos:microsoft-teams'],
  onedrive: ['OneDrive', 'logos:microsoft-onedrive'],
  'google-translate': ['Google Translate', 'si:Googletranslate'],
  deepl: ['DeepL', 'si:Deepl'],
  chatgpt: ['ChatGPT', 'logos:openai-icon'],
  claude: ['Claude', 'logos:claude-icon'],
  gemini: ['Gemini', 'logos:google-gemini-icon'],
  perplexity: ['Perplexity', 'logos:perplexity-icon'],
  dropbox: ['Dropbox', 'logos:dropbox'],
  'google-drive': ['Google Drive', 'logos:google-drive'],
  obsidian: ['Obsidian', 'logos:obsidian-icon'],
  todoist: ['Todoist', 'logos:todoist-icon'],
  trello: ['Trello', 'logos:trello'],
  asana: ['Asana', 'logos:asana-icon'],
  clickup: ['ClickUp', 'logos:clickup-icon'],
  github: ['GitHub', 'logos:github-icon'],
  chrome: ['Google Chrome', 'logos:chrome'],
  edge: ['Microsoft Edge', 'logos:microsoft-edge'],
  firefox: ['Firefox', 'logos:firefox'],
  brave: ['Brave', 'logos:brave'],
  opera: ['Opera', 'logos:opera'],
  'opera-gx': ['Opera GX', 'si:Operagx'],
  vivaldi: ['Vivaldi', 'logos:vivaldi-icon'],
  tidal: ['TIDAL', 'logos:tidal-icon'],
  deezer: ['Deezer', 'si:Deezer'],
  vlc: ['VLC', 'si:Vlcmediaplayer'],
  duckduckgo: ['DuckDuckGo', 'logos:duckduckgo'],
  bing: ['Bing', 'logos:bing'],
  google: ['Google', 'logos:google-icon'],
  wikipedia: ['Wikipedia', 'si:Wikipedia']
}

const out = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'brands')
fs.mkdirSync(out, { recursive: true })
for (const f of fs.readdirSync(out)) if (f.endsWith('.svg')) fs.rmSync(join(out, f))

const rows = []
for (const [id, [name, source]] of Object.entries(BRANDS)) {
  const [pkg, key] = source.split(':')
  let svg
  let guidelines = ''
  if (pkg === 'logos') {
    const icon = logos.icons[key]
    if (!icon) throw new Error(`No existe logos:${key}`)
    const w = icon.width ?? logos.width ?? 256
    const h = icon.height ?? logos.height ?? 256
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${w} ${h}">${icon.body}</svg>`
  } else {
    const icon = si[`si${key}`]
    if (!icon) throw new Error(`No existe simple-icons si${key}`)
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${icon.hex}" d="${icon.path}"/></svg>`
    guidelines = icon.guidelines ?? ''
  }
  fs.writeFileSync(join(out, `${id}.svg`), svg + '\n')
  const origin = pkg === 'logos' ? `@iconify-json/logos ${logosVersion} · \`${key}\`` : `simple-icons ${siVersion} · \`si${key}\``
  rows.push(`| ${id} | ${name} | ${origin} | CC0-1.0 | ${guidelines ? `[normas](${guidelines})` : '—'} |`)
}

fs.writeFileSync(
  join(out, 'SOURCES.md'),
  `# Logos de marca

Generados con \`node scripts/brands.mjs\`. Ambos paquetes publican los archivos con licencia CC0-1.0;
eso cubre el dibujo, **no** la marca: cada logo es una marca registrada de su dueño y solo se usa para
identificar el servicio al que Nido se conecta o abre. Nido no está asociado ni respaldado por ninguno.

Reglas al usarlos (ver \`BrandLogo.tsx\`): sin estirar, recortar, recolorear ni rotar; siempre dentro
de una placa clara con margen, con el nombre del servicio como texto accesible.

Sin logo propio (se muestra un icono genérico): Outlook, Microsoft To Do, Amazon Music y Chromium
(no están en paquetes con licencia verificable; Microsoft pidió retirarlos de Simple Icons).

| id | Marca | Origen | Licencia del archivo | Normas de marca |
|---|---|---|---|---|
${rows.join('\n')}
`
)
console.log(`${rows.length} logos en ${out}`)
