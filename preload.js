const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (key, interval, threshold, autoStart) => ipcRenderer.invoke('save-settings', key, interval, threshold, autoStart),
  fetchBalance: () => ipcRenderer.invoke('fetch-balance'),
  getCached: () => ipcRenderer.invoke('get-cached'),
  openRecharge: () => ipcRenderer.invoke('open-recharge'),
  exportCSV: () => ipcRenderer.invoke('export-csv'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  onRefreshBalance: (cb) => { ipcRenderer.on('refresh-balance', cb); }
});
