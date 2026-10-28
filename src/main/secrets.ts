import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import { NidoError } from './errors'

// Secretos (tokens, client secret) cifrados con safeStorage, que en Windows usa
// DPAPI ligado a la cuenta del usuario. Nunca se envían al renderer.
// La configuración no secreta de las integraciones va aparte, en claro.

const secretsPath = (): string => join(app.getPath('userData'), 'secrets.json')
const configPath = (): string => join(app.getPath('userData'), 'integrations.json')

export type SecretName = 'google.clientSecret' | 'google.refreshToken' | 'notion.token'

export interface IntegrationsConfig {
  google?: { clientId?: string; account?: string; expired?: boolean }
  notion?: { workspace?: string; bot?: string; expired?: boolean }
  browsers?: { custom?: { id: string; name: string; path: string }[] }
}

function readFile<T>(path: string, fallback: T): T {
  try {
    return fs.existsSync(path) ? (JSON.parse(fs.readFileSync(path, 'utf8')) as T) : fallback
  } catch (err) {
    console.error(`[nido] no se pudo leer ${path}`, err)
    return fallback
  }
}

function writeFile(path: string, value: unknown): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  const tmp = `${path}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, path)
}

export const encryptionAvailable = (): Promise<boolean> => safeStorage.isAsyncEncryptionAvailable()

export async function getSecret(name: SecretName): Promise<string | null> {
  const stored = readFile<Record<string, string>>(secretsPath(), {})[name]
  if (!stored || !(await encryptionAvailable())) return null
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(stored, 'base64'))
    // Si Windows ha rotado la clave, se vuelve a cifrar con la nueva.
    if (shouldReEncrypt) await setSecret(name, result)
    return result
  } catch {
    return null
  }
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  if (!(await encryptionAvailable())) {
    throw new NidoError('config', 'El cifrado del sistema no está disponible; Nido no guardará credenciales sin cifrar.')
  }
  const encrypted = await safeStorage.encryptStringAsync(value)
  const all = readFile<Record<string, string>>(secretsPath(), {})
  all[name] = encrypted.toString('base64')
  writeFile(secretsPath(), all)
}

export function deleteSecret(name: SecretName): void {
  const all = readFile<Record<string, string>>(secretsPath(), {})
  if (!(name in all)) return
  delete all[name]
  writeFile(secretsPath(), all)
}

export function getConfig(): IntegrationsConfig {
  return readFile<IntegrationsConfig>(configPath(), {})
}

export function updateConfig(mutate: (config: IntegrationsConfig) => void): IntegrationsConfig {
  const config = getConfig()
  mutate(config)
  writeFile(configPath(), config)
  return config
}
