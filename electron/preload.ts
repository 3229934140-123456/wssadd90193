import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (filters: Electron.FileFilter[]) => {
    return ipcRenderer.invoke('select-file', filters)
  },
  saveReport: (content: string, defaultName: string) => {
    return ipcRenderer.invoke('save-report', content, defaultName)
  }
})
