const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listDrawings:      ()           => ipcRenderer.invoke('list-drawings'),
  loadDrawing:       (id)         => ipcRenderer.invoke('load-drawing', id),
  saveDrawing:       (meta, data) => ipcRenderer.invoke('save-drawing', { meta, drawData: data }),
  deleteDrawing:     (id)         => ipcRenderer.invoke('delete-drawing', id),
  openDrawingsFolder:()           => ipcRenderer.invoke('open-drawings-folder'),
});
