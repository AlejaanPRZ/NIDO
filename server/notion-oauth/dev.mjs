// Ejecuta worker.js en Node para pruebas locales: node server/notion-oauth/dev.mjs
// Lee NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, PUBLIC_URL, NOTION_API y PORT (47310) del entorno.
import http from 'node:http'
import worker from './worker.js'

const port = Number(process.env.PORT ?? 47310)
const env = {
  NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET,
  PUBLIC_URL: process.env.PUBLIC_URL ?? `http://127.0.0.1:${port}`,
  NOTION_API: process.env.NOTION_API
}

http
  .createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body })
    const response = await worker.fetch(request, env)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  .listen(port, '127.0.0.1', () => console.log(`intercambiador de Notion en http://127.0.0.1:${port}`))
