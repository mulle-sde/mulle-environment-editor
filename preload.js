const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  readEnvironmentFiles: (projectPath) => ipcRenderer.invoke('read-environment-files', projectPath),
  saveEnvironmentFiles: (envData) => ipcRenderer.invoke('save-environment-files', envData),
  runMulleCommand: (command) => ipcRenderer.invoke('run-mulle-command', command),
  evaluateValue: (env, value) => ipcRenderer.invoke('evaluate-value', env, value),

  // Send menu actions to main process
  sendMenuAction: (action) => ipcRenderer.send('menu-action', action),

  // Register menu event listeners
  onMenuOpenProject: (callback) => ipcRenderer.on('menu-open-project', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', callback),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu-save-as', callback),
  onMenuBack: (callback) => ipcRenderer.on('menu-back', callback),
  onMenuAddVariable: (callback) => ipcRenderer.on('menu-add-variable', callback),
  onMenuDeleteVariable: (callback) => ipcRenderer.on('menu-delete-variable', callback),
  onMenuAddScope: (callback) => ipcRenderer.on('menu-add-scope', callback),
  onMenuToggleFilter: (callback) => ipcRenderer.on('menu-toggle-filter', callback),
  onOpenRecentProject: (callback) => ipcRenderer.on('open-recent-project', callback),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});