import { app } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'

// Configuración del desarrollador (no del usuario): los clientes OAuth con los que se publica Nido.
// Vive en nido.oauth.json, fuera del repositorio (.gitignore). electron-builder lo copia junto a la
// app (extraResources) y en desarrollo se lee de la raíz del proyecto o de NIDO_OAUTH_CONFIG.
//
// - Google: cliente «Aplicación de escritorio». Google trata las apps de escritorio como clientes
//   públicos que no pueden guardar secretos, así que su ID (y el secreto que genera) puede ir aquí.
// - Notion: su OAuth exige un secreto confidencial, que NUNCA va en la app. Aquí solo va la URL del
//   intercambiador (server/notion-oauth), que guarda el secreto y canjea los códigos.

export interface OAuthApps {
  google?: { clientId: string; clientSecret?: string }
  notion?: { clientId: string; brokerUrl: string }
}

let cached: OAuthApps | null = null

function candidates(): string[] {
  const list: string[] = []
  if (!app.isPackaged && process.env.NIDO_OAUTH_CONFIG) list.push(process.env.NIDO_OAUTH_CONFIG)
  if (app.isPackaged) list.push(join(process.resourcesPath, 'nido.oauth.json'))
  else list.push(join(app.getAppPath(), 'nido.oauth.json'))
  return list
}

function valid(raw: any): OAuthApps {
  const out: OAuthApps = {}
  const g = raw?.google
  if (typeof g?.clientId === 'string' && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(g.clientId)) {
    out.google = { clientId: g.clientId, ...(typeof g.clientSecret === 'string' && g.clientSecret ? { clientSecret: g.clientSecret } : {}) }
  }
  const n = raw?.notion
  if (typeof n?.clientId === 'string' && n.clientId && typeof n?.brokerUrl === 'string') {
    try {
      const url = new URL(n.brokerUrl)
      // El intercambiador recibe códigos de autorización: solo https (o http local en desarrollo).
      const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
      if (url.protocol === 'https:' || (!app.isPackaged && local && url.protocol === 'http:')) {
        out.notion = { clientId: n.clientId, brokerUrl: url.origin + url.pathname.replace(/\/$/, '') }
      }
    } catch {
      // URL no válida: Notion queda sin OAuth integrado.
    }
  }
  return out
}

export function oauthApps(): OAuthApps {
  if (cached) return cached
  for (const path of candidates()) {
    try {
      if (fs.existsSync(path)) {
        cached = valid(JSON.parse(fs.readFileSync(path, 'utf8').replace(/^﻿/, '')))
        return cached
      }
    } catch (err) {
      console.error(`[nido] nido.oauth.json no válido (${path})`, err)
    }
  }
  cached = {}
  return cached
}
