const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

require('dotenv').config({ path: path.join(app.getAppPath(), '.env') });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// --- CONFIGURE AUTO UPDATER ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// 2. Configure Logger (Crucial for debugging)
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

let authServer = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    win.loadFile('index.html');

    win.once('ready-to-show', () => {
        // 3. Check for updates ONLY if packaged (not in dev mode)
        if (app.isPackaged) {
            log.info('Checking for updates...');
            // Change to checkForUpdates() to use your custom UI
            autoUpdater.checkForUpdates();
        } else {
            log.info('Running in dev mode. Updates disabled.');
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

    // Log these events to see what's happening
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info);
        if(mainWindow) mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available.', info);
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater. ' + err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log.info(log_message);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded');
        if(mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    // IPC Listeners
    ipcMain.on('download-update', () => {
        log.info('User chose to download update');
        autoUpdater.downloadUpdate();
    });

    ipcMain.on('quit-and-install', () => {
        log.info('User chose to quit and install');
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
                    res.end(`
                        <html>
                        <head>
                            <title>Authenticating...</title>
                            <style>
                            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f5f5f5; text-align: center; }
                            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                            h1 { color: #333; }
                            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                            <div class="spinner"></div>
                            <h1>Authenticating...</h1>
                            <p>Please wait while we log you in.</p>
                            </div>
                            <script>
                            // Extract hash values (access_token, id_token)
                            const hash = window.location.hash.substring(1);
                            const params = new URLSearchParams(hash);
                            
                            if (params.has('id_token')) {
                                fetch('/token', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        id_token: params.get('id_token'),
                                        access_token: params.get('access_token')
                                    })
                                }).then(() => {
                                    document.querySelector('h1').textContent = "Success!";
                                    document.querySelector('p').textContent = "You can close this tab and return to the app.";
                                    document.querySelector('.spinner').style.display = 'none';
                                    setTimeout(() => window.close(), 1000); // Try to close tab
                                });
                            } else {
                                document.querySelector('h1').textContent = "Authentication Failed";
                                document.querySelector('p').textContent = "No token found.";
                            }
                            </script>
                        </body>
                        </html>
                    `);
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