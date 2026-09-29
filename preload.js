const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('zippping', {
  chooseOutputDir: () => ipcRenderer.invoke('choose-output-dir'),
  processImage: (payload) => ipcRenderer.invoke('process-image', payload),
  processRendered: (payload) => ipcRenderer.invoke('process-rendered', payload),
  revealOutput: (outputPath) => ipcRenderer.invoke('reveal-output', outputPath),
  pathForFile: (file) => webUtils.getPathForFile(file)
});
