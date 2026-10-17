const { contextBridge, ipcRenderer, clipboard } = require("electron");

contextBridge.exposeInMainWorld("settingsApi", {
  get: () => ipcRenderer.invoke("settings:get"),
  save: (s) => ipcRenderer.invoke("settings:save", s),
  test: (which, key) => ipcRenderer.invoke("settings:test", which, key),
  openData: () => ipcRenderer.invoke("settings:openData"),
  readClipboard: () => ipcRenderer.invoke("settings:clipboard"),
});
