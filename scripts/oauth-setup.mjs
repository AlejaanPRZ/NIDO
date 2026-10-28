// Prepara nido.oauth.json (configuración del desarrollador, fuera de git) sin editarlo a mano.
//
//   npm run oauth -- google <ruta al JSON descargado de Google Cloud>
//       El archivo «client_secret_….json» del cliente «Aplicación de escritorio».
//   npm run oauth -- notion <id de la integración pública> <URL https del intercambiador>
//   npm run oauth -- show          (muestra qué hay configurado, sin enseñar secretos)
//
// En la app instalada este archivo viaja junto a Nido (extraResources). Los tokens de cada
// usuario no van aquí: se guardan cifrados en su equipo al conectar.
import fs from 'node:fs'
import { join } from 'node:path'

const file = join(import.meta.dirname, '..', 'nido.oauth.json')
const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) : {})
const write = (config) => fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const [service, ...args] = process.argv.slice(2)
const config = read()

if (service === 'google') {
  if (!args[0] || !fs.existsSync(args[0])) fail('Indica la ruta del JSON descargado de Google Cloud (Clientes → Descargar JSON).')
  const raw = JSON.parse(fs.readFileSync(args[0], 'utf8'))
  const client = raw.installed
  if (!client) fail(raw.web ? 'Ese cliente es de tipo «Aplicación web». Crea uno de tipo «Aplicación de escritorio».' : 'El archivo no parece un cliente OAuth de Google.')
  if (!/\.apps\.googleusercontent\.com$/.test(client.client_id ?? '')) fail('El archivo no trae un client_id válido.')
  config.google = { clientId: client.client_id, ...(client.client_secret ? { clientSecret: client.client_secret } : {}) }
  write(config)
  console.log(`✓ Google configurado (${client.client_id.slice(0, 12)}…).`)
  console.log('  En desarrollo basta con cerrar y abrir Nido (se lee al arrancar). Para otras personas: npm run dist (el instalador lo incluye).')
  console.log('  El JSON descargado ya no hace falta: guárdalo fuera del proyecto o bórralo.')
} else if (service === 'notion') {
  const [clientId, brokerUrl] = args
  if (!clientId || !brokerUrl) fail('Uso: npm run oauth -- notion <id de la integración> <https://tu-intercambiador>')
  let url
  try {
    url = new URL(brokerUrl)
  } catch {
    fail('La URL del intercambiador no es válida.')
  }
  if (url.protocol !== 'https:') fail('El intercambiador debe usar https.')
  config.notion = { clientId, brokerUrl: url.origin + url.pathname.replace(/\/$/, '') }
  write(config)
  console.log(`✓ Notion configurado. En la integración de Notion, la URI de redirección debe ser ${config.notion.brokerUrl}/callback`)
} else if (service === 'show') {
  console.log(`Google: ${config.google?.clientId ? `cliente ${config.google.clientId.slice(0, 12)}… ${config.google.clientSecret ? '(con secreto)' : '(sin secreto)'}` : 'sin configurar'}`)
  console.log(`Notion: ${config.notion?.clientId ? `integración ${config.notion.clientId.slice(0, 8)}… vía ${config.notion.brokerUrl}` : 'sin configurar'}`)
} else {
  fail('Uso: npm run oauth -- google <archivo.json> | notion <id> <url> | show')
}
