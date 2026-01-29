const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http');
const path = require('path');
const { autoUpdater } = require('electron-updater');

require('dotenv').config({ path: path.join(app.getAppPath(), '.env') });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// --- CONFIGURE AUTO UPDATER ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let authServer = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,    // Allows 'require' in app.js
            contextIsolation: false,  // Required when nodeIntegration is true
        }
    });

    win.loadFile('index.html');

    win.once('ready-to-show', () => {
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });

    return win;
}

app.whenReady().then(() => {
    const mainWindow = createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // --- UPDATER EVENTS ---
    autoUpdater.on('update-available', (info) => {
        if(mainWindow) mainWindow.webContents.send('update-available', info);
    });

    ipcMain.on('download-update', () => {
        autoUpdater.downloadUpdate();
    });

    autoUpdater.on('update-downloaded', (info) => {
        if(mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    ipcMain.on('quit-and-install', () => {
        autoUpdater.quitAndInstall();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- GOOGLE LOGIN (Existing) ---
ipcMain.handle('login-google', async () => {
    return new Promise((resolve, reject) => {
        if (!GOOGLE_CLIENT_ID) {
            reject("Google Client ID not configured in .env");
            return;
        }

        authServer = http.createServer((req, res) => {
            try {
                const urlObj = new URL(req.url, `http://127.0.0.1:4200`);
                if (urlObj.pathname === '/callback') {
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(`<html><body><script>
                        const params = new URLSearchParams(window.location.hash.substring(1));
                        if (params.has('id_token')) {
                            fetch('/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id_token: params.get('id_token') })
                            }).then(() => window.close());
                        }
                    </script></body></html>`);
                    return;
                }
                if (req.method === 'POST' && req.url === '/token') {
                    let body = '';
                    req.on('data', chunk => body += chunk.toString());
                    req.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            res.writeHead(200); res.end('Auth successful');
                            resolve(data.id_token);
                        } catch (e) { reject(e); }
                        finally { if (authServer) { authServer.close(); authServer = null; } }
                    });
                }
            } catch (e) { console.error(e); }
        });

        authServer.listen(4200, '127.0.0.1', () => {
            const redirectUri = 'http://127.0.0.1:4200/callback';
            const scope = encodeURIComponent('email profile openid');
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token id_token&client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&nonce=${Date.now()}`;
            shell.openExternal(authUrl);
        });
    });
});