// updater.js - Electron Auto Update Listener
const { ipcRenderer } = require('electron');
const Toast = require('./renderer/components/Toast.js');
const Modal = require('./renderer/components/Modal.js');

function initUpdater() {

    ipcRenderer.on('update-available', (event, info) => {
        Modal.open({
            title: "Update Available",
            body: `
                <div class="text-center">
                    <h3>Version ${info.version} is available</h3>
                    <p>A new update is ready to download.</p>
                </div>
            `,
            confirmText: "Download",
            cancelText: "Later",
            onConfirm: () => ipcRenderer.send('download-update')
        });
    });

    ipcRenderer.on('download-progress', (event, progress) => {
        const percent = Math.round(progress.percent);
        Toast.info(`Downloading update: ${percent}%`, 1500);
    });

    ipcRenderer.on('update-downloaded', (event, info) => {
        Modal.open({
            title: "Update Ready",
            body: `<p>Version ${info.version} downloaded.</p>`,
            confirmText: "Restart & Install",
            onConfirm: () => ipcRenderer.send('quit-and-install')
        });
    });

    ipcRenderer.on('update-error', (event, err) => {
        Toast.error("Update failed: " + err);
    });
}

module.exports = initUpdater;
