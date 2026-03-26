// updater.js - Electron Auto Update Listener
const { ipcRenderer } = require('electron');
const Toast = require('./renderer/components/Toast.js');
const Modal = require('./renderer/components/Modal.js');

function initUpdater() {

    // Fired when a new version is found and needs to be downloaded
    ipcRenderer.on('update-available', (event, info) => {
        Modal.open({
            title: 'Update Available',
            body: `
                <div class="text-center">
                    <p><strong>Version ${info.version}</strong> is available and ready to download.</p>
                    <p>Download now, or click <em>Later</em> to be reminded next time you open the app.</p>
                </div>
            `,
            confirmText: 'Download Now',
            cancelText: 'Later',
            onConfirm: () => {
                Toast.info('Downloading update in the background…');
                ipcRenderer.send('download-update');
            }
        });
    });

    // Fired during download — show a progress toast
    ipcRenderer.on('download-progress', (event, progress) => {
        const percent = Math.round(progress.percent);
        Toast.info(`Downloading update: ${percent}%`, 1500);
    });

    // Fired when download is complete — including on app restart if the update
    // was already downloaded in a previous session. The loading guard in
    // index.js (main process) ensures this IPC arrives only after the
    // renderer is fully ready, so the Modal will always open.
    ipcRenderer.on('update-downloaded', (event, info) => {
        Modal.open({
            title: '✅ Update Ready to Install',
            body: `
                <div class="text-center">
                    <p><strong>Version ${info.version}</strong> has been downloaded and is ready to install.</p>
                    <p>The app will restart automatically to apply the update.</p>
                </div>
            `,
            confirmText: 'Restart & Install',
            cancelText: 'Later',
            onConfirm: () => ipcRenderer.send('quit-and-install')
        });
    });

    // Fired if the updater hits an error
    ipcRenderer.on('update-error', (event, err) => {
        Toast.error('Update failed: ' + err);
    });
}

module.exports = initUpdater;