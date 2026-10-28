// Intercambiador OAuth de Notion para Nido (Cloudflare Worker, sin dependencias).
//
// Notion exige un secreto de cliente confidencial para canjear el código de autorización, y una
// app de escritorio no puede guardarlo. Este servicio lo guarda (como secreto del Worker) y hace
// solo tres cosas; no almacena tokens ni datos de nadie:
//
//   GET  /callback  Notion vuelve aquí tras autorizar. Se reenvía el navegador al servidor local de
//                   Nido (http://127.0.0.1:<puerto>/notion), con el puerto tomado del state.
//   POST /token     Nido canjea { code, state, verifier }. El hash del verificador debe coincidir
//                   con el que viaja en el state (como PKCE): un código interceptado no basta.
//   POST /refresh   Nido renueva { refresh_token }.
//
// Variables: NOTION_CLIENT_ID, NOTION_CLIENT_SECRET (secreto), PUBLIC_URL (p. ej.
// https://nido-notion.<cuenta>.workers.dev). Opcional, solo para pruebas: NOTION_API.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

const page = (title, text, status = 400) =>
  new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f3f8ff;color:#1d1d1f"><div style="text-align:center;max-width:420px"><h1 style="font-size:22px">${title}</h1><p style="color:#5b6472">${text}</p></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function decodeState(raw) {
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
    const state = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)))
    const port = Number(state?.p)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null
    if (typeof state.n !== 'string' || typeof state.c !== 'string' || state.c.length < 40) return null
    return { port, challenge: state.c }
  } catch {
    return null
  }
}

async function notionToken(env, body) {
  const api = env.NOTION_API || 'https://api.notion.com/v1'
  const res = await fetch(`${api}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2026-03-11'
    },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return json({ error: data.error ?? 'token_error', error_description: data.error_description ?? data.message }, res.status >= 500 ? 502 : 400)
  // Solo lo que Nido necesita.
  return json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    bot_id: data.bot_id,
    workspace_id: data.workspace_id,
    workspace_name: data.workspace_name
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET || !env.PUBLIC_URL) return json({ error: 'server_misconfigured' }, 500)

    if (request.method === 'GET' && url.pathname === '/callback') {
      const raw = url.searchParams.get('state') ?? ''
      const state = decodeState(raw)
      if (!state) return page('Solicitud no válida', 'Vuelve a Nido e inténtalo de nuevo.')
      // Solo se reenvía al propio equipo (127.0.0.1): nunca a otro dominio.
      const back = new URL(`http://127.0.0.1:${state.port}/notion`)
      back.searchParams.set('state', raw)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (code) back.searchParams.set('code', code)
      else back.searchParams.set('error', error ?? 'unknown')
      return Response.redirect(back.toString(), 302)
    }

    if (request.method === 'POST' && (url.pathname === '/token' || url.pathname === '/refresh')) {
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object') return json({ error: 'invalid_request' }, 400)
      if (url.pathname === '/refresh') {
        if (typeof body.refresh_token !== 'string' || !body.refresh_token) return json({ error: 'invalid_request' }, 400)
        return notionToken(env, { grant_type: 'refresh_token', refresh_token: body.refresh_token })
      }
      const state = typeof body.state === 'string' ? decodeState(body.state) : null
      if (!state || typeof body.code !== 'string' || typeof body.verifier !== 'string') return json({ error: 'invalid_request' }, 400)
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.verifier))
      if (b64url(digest) !== state.challenge) return json({ error: 'invalid_grant', error_description: 'verificador incorrecto' }, 400)
      return notionToken(env, { grant_type: 'authorization_code', code: body.code, redirect_uri: `${env.PUBLIC_URL.replace(/\/$/, '')}/callback` })
    }

    return json({ error: 'not_found' }, 404)
  }
}
