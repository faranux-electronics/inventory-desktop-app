const {app, BrowserWindow, ipcMain, shell, Tray, Menu} = require('electron');
const http = require('http');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

require('dotenv').config({ path: path.join(app.getAppPath(), '.env') });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'faranux-electronics',
    repo: 'inventory-desktop-app'
});

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;   // ← This is the key fix
log.info('App starting...');

let authServer = null;
let authTimeout = null;
let tray = null;
let isQuitting = false;
let mainWindow = null;

function cleanupAuthServer() {
    if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
    }

    if (authServer) {
        return new Promise((resolve) => {
            authServer.close(() => {
                authServer = null;
                resolve();
            });
            // Force close after 1 second if not responding
            setTimeout(() => {
                if (authServer) authServer = null;
                resolve();
            }, 1000);
        });
    }
    return Promise.resolve();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile('index.html');

    // Intercept external links and open in default browser
    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Handle navigation attempts
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow.webContents.getURL() && (url.startsWith('http://') || url.startsWith('https://'))) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    // Intercept close to hide to tray instead of quitting
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.once('ready-to-show', () => {
        if (app.isPackaged) {
            log.info('Checking for updates...');
            autoUpdater.checkForUpdates();
        } else {
            log.info('Running in dev mode. Updates disabled.');
        }
    });

    return mainWindow;
}

// Ignore certificate errors during development
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-certificate-errors-spki-list');
app.commandLine.appendSwitch('ignore-certificate-revocation-list');
app.commandLine.appendSwitch('allow-insecure-localhost');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('allow-popups');
app.commandLine.appendSwitch('allow-popups-to-escape-sandbox');
app.commandLine.appendSwitch('enable-features', 'NetworkService,SharedArrayBuffer');

app.whenReady().then(() => {
    createWindow();

    // Create System Tray
    const iconPath = path.join(__dirname, '../assets/logo1.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {label: 'Show Faranux MIS', click: () => mainWindow.show()},
        {type: 'separator'},
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Faranux MIS');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.show();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        else mainWindow.show();
    });

    // Handle bringing window to front when notification is clicked
    ipcMain.on('show-window', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // IPC handler for opening URLs in external browser manually
    ipcMain.on('open-external', (event, url) => {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            shell.openExternal(url);
        }
    });

    // ─── Auto Updater Events (Safely guarded against loading states) ──────
    autoUpdater.on('checking-for-update', () => log.info('Checking for update...'));
    autoUpdater.on('update-not-available', (info) => log.info('Update not available.', info));

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info.version);
        if (mainWindow) {
            if (mainWindow.webContents.isLoading()) {
                mainWindow.webContents.once('did-finish-load', () => {
                    mainWindow.webContents.send('update-available', info);
                });
            } else {
                mainWindow.webContents.send('update-available', info);
            }
        }
    });

    autoUpdater.on('error', (err) => {
        log.error('Update error:', err.message);
        if (mainWindow) {
            if (mainWindow.webContents.isLoading()) {
                mainWindow.webContents.once('did-finish-load', () => {
                    mainWindow.webContents.send('update-error', err.message);
                });
            } else {
                mainWindow.webContents.send('update-error', err.message);
            }
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow) mainWindow.webContents.send('download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded:', info.version);
        if (mainWindow) {
            if (mainWindow.webContents.isLoading()) {
                mainWindow.webContents.once('did-finish-load', () => {
                    mainWindow.webContents.send('update-downloaded', info);
                });
            } else {
                mainWindow.webContents.send('update-downloaded', info);
            }
        }
    });

    ipcMain.on('download-update', () => {
        log.info('User chose to download update');
        autoUpdater.downloadUpdate();
    });

    ipcMain.on('quit-and-install', () => {
        log.info('User chose to quit and install');
        isQuitting = true;
        autoUpdater.quitAndInstall();
    });
});

app.on('window-all-closed', () => {
    cleanupAuthServer();
    // Intentionally omitted app.quit() so tray stays alive on Windows/Linux
    if (process.platform === 'darwin') {
        app.quit(); // Standard macOS behavior
    }
});

app.on('will-quit', async (e) => {
    e.preventDefault();
    await cleanupAuthServer();
    app.exit(0);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Google Login handler
ipcMain.handle('login-google', async () => {
    // Clean up any existing server first
    await cleanupAuthServer();

    return new Promise((resolve, reject) => {
        if (!GOOGLE_CLIENT_ID) {
            reject(new Error("Google Client ID not configured in .env"));
            return;
        }

        // Timeout: reject after 5 minutes if no response
        authTimeout = setTimeout(async () => {
            await cleanupAuthServer();
            reject(new Error("Authentication timeout - please try again"));
        }, 5 * 60 * 1000);

        authServer = http.createServer((req, res) => {
            try {
                const urlObj = new URL(req.url, `http://127.0.0.1:4200`);

                if (urlObj.pathname === '/callback') {
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(`
                        <html lang="en">
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
                                    setTimeout(() => window.close(), 1000);
                                }).catch(err => {
                                    document.querySelector('h1').textContent = "Error";
                                    document.querySelector('p').textContent = "Failed to send token to app.";
                                    document.querySelector('.spinner').style.display = 'none';
                                });
                            } else {
                                document.querySelector('h1').textContent = "Authentication Failed";
                                document.querySelector('p').textContent = "No token found.";
                                document.querySelector('.spinner').style.display = 'none';
                            }
                            </script>
                        </body>
                        </html>
                    `);
                    return;
                }

                if (req.method === 'POST' && urlObj.pathname === '/token') {
                    let body = '';
                    req.on('data', chunk => body += chunk.toString());
                    req.on('end', async () => {
                        try {
                            const data = JSON.parse(body);
                            res.writeHead(200);
                            res.end('Auth successful');
                            resolve(data.id_token);
                        } catch (e) {
                            reject(e);
                        } finally {
                            await cleanupAuthServer();
                        }
                    });
                }
            } catch (e) {
                console.error(e);
            }
        });

        authServer.on('error', async (err) => {
            await cleanupAuthServer();
            reject(new Error("Server error: " + err.message));
        });

        authServer.listen(4200, '127.0.0.1', (err) => {
            if (err) {
                cleanupAuthServer();
                reject(err);
                return;
            }

            const redirectUri = 'http://127.0.0.1:4200/callback';
            const scope = encodeURIComponent('email profile openid');
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token id_token&client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&nonce=${Date.now()}`;
            shell.openExternal(authUrl);
        });
    });
});

// Handler to manually cancel Google login
ipcMain.handle('cancel-google-login', async () => {
    await cleanupAuthServer();
    return {status: 'cancelled'};
});