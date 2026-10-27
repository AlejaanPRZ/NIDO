import { contextBridge, ipcRenderer } from 'electron'
import { IPC, MEDIA_SCHEME, type NidoApi, type NowPlayingApi, type NowPlayingState } from '../shared/types'

// Varios widgets pueden suscribirse a la vez: aquí se reparte un único canal
// IPC entre todos y se guarda lo último recibido para quien llegue después.
type StateListener = (state: NowPlayingState) => void
type ThumbListener = (key: string, dataUrl: string) => void
const stateListeners = new Set<StateListener>()
const thumbListeners = new Set<ThumbListener>()
const thumbCache = new Map<string, string>()
let lastState: NowPlayingState | null = null

ipcRenderer.on(IPC.npState, (_e, state: NowPlayingState) => {
  lastState = state
  for (const listener of stateListeners) listener(state)
})
ipcRenderer.on(IPC.npThumb, (_e, key: string, dataUrl: string) => {
  thumbCache.set(key, dataUrl)
  while (thumbCache.size > 20) thumbCache.delete(thumbCache.keys().next().value!)
  for (const listener of thumbListeners) listener(key, dataUrl)
})

const nowPlaying: NowPlayingApi = {
  subscribe(onState, onThumb) {
    stateListeners.add(onState)
    thumbListeners.add(onThumb)
    for (const [key, data] of thumbCache) onThumb(key, data)
    if (lastState) onState(lastState)
    if (stateListeners.size === 1) ipcRenderer.send(IPC.npSubscribe)
    return () => {
      stateListeners.delete(onState)
      thumbListeners.delete(onThumb)
      if (stateListeners.size === 0) ipcRenderer.send(IPC.npUnsubscribe)
    }
  },
  command: (sessionId, command) => ipcRenderer.send(IPC.npCommand, sessionId, command)
}

const api: NidoApi = {
  loadState: () => ipcRenderer.invoke(IPC.loadState),
  saveState: (state) => ipcRenderer.invoke(IPC.saveState, state),
  saveStateSync: (state) => {
    ipcRenderer.sendSync(IPC.saveStateSync, state)
  },
  pickAudioFiles: () => ipcRenderer.invoke(IPC.pickAudioFiles),
  pickAudioFolder: () => ipcRenderer.invoke(IPC.pickAudioFolder),
  mediaUrl: (filePath) => `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`,
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  nowPlaying
}

contextBridge.exposeInMainWorld('nido', api)
