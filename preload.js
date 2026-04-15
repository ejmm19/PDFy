const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file-dialog'),
  saveFile: () => ipcRenderer.invoke('save-file-dialog'),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', { filePath, data }),
  openImage: () => ipcRenderer.invoke('open-image-dialog'),

  onFileOpened: (callback) => ipcRenderer.on('file-opened', (_, data) => callback(data)),
  onSaveFile: (callback) => ipcRenderer.on('save-file', () => callback()),
  onSaveFileAs: (callback) => ipcRenderer.on('save-file-as', (_, data) => callback(data)),
  onUndo: (callback) => ipcRenderer.on('undo', () => callback()),
  onRedo: (callback) => ipcRenderer.on('redo', () => callback()),
  onZoomIn: (callback) => ipcRenderer.on('zoom-in', () => callback()),
  onZoomOut: (callback) => ipcRenderer.on('zoom-out', () => callback()),
  onZoomFit: (callback) => ipcRenderer.on('zoom-fit', () => callback()),
});
