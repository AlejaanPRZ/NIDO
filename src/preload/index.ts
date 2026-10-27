import { contextBridge, ipcRenderer } from 'electron'
import { IPC, MEDIA_SCHEME, type NidoApi } from '../shared/types'

const api: NidoApi = {
  loadState: () => ipcRenderer.invoke(IPC.loadState),
  saveState: (state) => ipcRenderer.invoke(IPC.saveState, state),
  saveStateSync: (state) => {
    ipcRenderer.sendSync(IPC.saveStateSync, state)
  },
  pickAudioFiles: () => ipcRenderer.invoke(IPC.pickAudioFiles),
  pickAudioFolder: () => ipcRenderer.invoke(IPC.pickAudioFolder),
  mediaUrl: (filePath) => `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`,
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url)
}

contextBridge.exposeInMainWorld('nido', api)
