const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('faranuxDesktop', Object.freeze({
    getApiUrl: () => ipcRenderer.invoke('get-api-url'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    loginGoogle: () => ipcRenderer.invoke('login-google'),
    cancelGoogleLogin: () => ipcRenderer.invoke('cancel-google-login'),
    openPdfInBrowser: payload => ipcRenderer.invoke('open-pdf-in-browser', payload),
    showOSNotification: payload => ipcRenderer.send('show-os-notification', payload),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    quitAndInstall: () => ipcRenderer.send('quit-and-install'),
    onUpdateAvailable: callback => subscribe('update-available', callback),
    onDownloadProgress: callback => subscribe('download-progress', callback),
    onUpdateDownloaded: callback => subscribe('update-downloaded', callback),
    onUpdateError: callback => subscribe('update-error', callback)
}));
