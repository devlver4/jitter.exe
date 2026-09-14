const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listDrawings:      ()           => ipcRenderer.invoke('list-drawings'),
  loadDrawing:       (id)         => ipcRenderer.invoke('load-drawing', id),
  saveDrawing:       (meta, data) => ipcRenderer.invoke('save-drawing', { meta, drawData: data }),
  deleteDrawing:     (id)         => ipcRenderer.invoke('delete-drawing', id),
  saveMeta:          (list)       => ipcRenderer.invoke('save-meta', list),
  listFolders:       ()           => ipcRenderer.invoke('list-folders'),
  saveFolders:       (list)       => ipcRenderer.invoke('save-folders', list),
  openDrawingsFolder:()           => ipcRenderer.invoke('open-drawings-folder'),
});
