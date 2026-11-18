const Toast = require('./renderer/components/Toast.js');
const Modal = require('./renderer/components/Modal.js');

function initUpdater() {
    const desktop = globalThis.window?.faranuxDesktop;
    if (!desktop) return;

    desktop.onUpdateAvailable(info => {
        Modal.open({
            title: 'Update Available',
            body: '<div class="text-center"><h3>Version ' + info.version + ' is available</h3><p>A new update is ready to download.</p></div>',
            confirmText: 'Download',
            cancelText: 'Later',
            onConfirm: () => desktop.downloadUpdate()
        });
    });

    desktop.onDownloadProgress(progress => {
        Toast.info('Downloading update: ' + Math.round(progress.percent) + '%', 1500);
    });

    desktop.onUpdateDownloaded(info => {
        Modal.open({
            title: 'Update Ready',
            body: '<p>Version ' + info.version + ' downloaded.</p>',
            confirmText: 'Restart & Install',
            onConfirm: () => desktop.quitAndInstall()
        });
    });
    desktop.onUpdateError(error => Toast.error('Update failed: ' + error));
}

module.exports = initUpdater;
