const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  listProfiles: () => ipcRenderer.invoke('config:listProfiles'),
  saveProfile: (config) => ipcRenderer.invoke('config:saveProfile', config),
  loadProfile: (profileId) => ipcRenderer.invoke('config:loadProfile', profileId),
  renameProfile: (payload) => ipcRenderer.invoke('config:renameProfile', payload),
  deleteProfile: (profileId) => ipcRenderer.invoke('config:deleteProfile', profileId),
  saveJson: (payload) => ipcRenderer.invoke('file:saveJson', payload),
  loadJson: () => ipcRenderer.invoke('file:loadJson'),
  saveExcel: (payload) => ipcRenderer.invoke('file:saveExcel', payload)
});
