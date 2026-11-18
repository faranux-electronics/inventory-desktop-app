const { app, BrowserWindow, ipcMain, shell, Tray, Menu, Notification } = require('electron');
const http = require('http');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

app.setAppUserModelId('Faranux ERP');
const fs = require('fs');
const localEnvPath = path.join(app.getAppPath(), '.env');
let runtimeConfig = {};
if (app.isPackaged) {
    runtimeConfig = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'app-config.json'), 'utf8'));
} else if (fs.existsSync(localEnvPath)) {
    const localEnv = require('dotenv').parse(fs.readFileSync(localEnvPath));
    runtimeConfig = { GOOGLE_CLIENT_ID: localEnv.GOOGLE_CLIENT_ID };
}
const GOOGLE_CLIENT_ID = runtimeConfig.GOOGLE_CLIENT_ID || '';
const API_URL_ENDPOINT = app.isPackaged ? runtimeConfig.API_URL : 'http://localhost:8000/index.php';
if (app.isPackaged) {
    let apiUrl;
    try { apiUrl = new URL(API_URL_ENDPOINT); } catch (_) { throw new Error('Packaged API_URL must be an absolute HTTPS URL'); }
    if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password) {
        throw new Error('Packaged API_URL must use HTTPS and contain no embedded credentials');
    }
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;

log.info('App starting...');

let authServer = null;
let authTimeout = null;
let authCleanupPromise = null;
let authLoginInProgress = false;
let rejectActiveGoogleLogin = null;
let tray = null;
let isQuitting = false;
let mainWindow = null;

const os = require('os');

let pdfServer = null;
let pdfServerTimeout = null;

function closePdfServer() {
    if (pdfServerTimeout) {
        clearTimeout(pdfServerTimeout);
        pdfServerTimeout = null;
    }
    if (pdfServer) {
        pdfServer.close();
        pdfServer = null;
    }
}

function cleanupAuthServer() {
    if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
    }

    if (authCleanupPromise) return authCleanupPromise;

    const server = authServer;
    authServer = null;
    if (!server || !server.listening) return Promise.resolve();

    if (server.closeAllConnections) server.closeAllConnections();
    authCleanupPromise = new Promise(resolve => {
        server.close(() => resolve());
    }).finally(() => {
        authCleanupPromise = null;
    });
    return authCleanupPromise;
}

function createWindow() {
    const isAutostart = process.argv.includes('--autostart');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: !isAutostart,
        icon: path.join(__dirname, '../assets/logo1.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        }
    });

    mainWindow.setTitle(`Faranux ERP v${app.getVersion()}`);

    mainWindow.loadFile('index.html');

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const target = new URL(url);
            if (target.protocol === 'https:') shell.openExternal(target.href);
        } catch (_) {}
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        try {
            const target = new URL(url);
            const current = new URL(mainWindow.webContents.getURL());
            if (target.protocol !== 'file:' || target.pathname !== current.pathname) event.preventDefault();
        } catch (_) {
            event.preventDefault();
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

function isTrustedMainFrame(event) {
    return Boolean(mainWindow && event?.sender === mainWindow.webContents &&
        event?.senderFrame === mainWindow.webContents.mainFrame);
}

function assertTrustedMainFrame(event) {
    if (!isTrustedMainFrame(event)) throw new Error('Untrusted IPC sender');
}

// Request a single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Instantly kill the duplicate, bypassing lifecycle events.
    app.exit(0);
} else {
    // Listen for a second instance trying to open
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            if (!mainWindow.isVisible()) {
                mainWindow.show();
            }
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createWindow();

        // ─── Custom Application Menu ────────────────────────────────
        const isMac = process.platform === 'darwin';
        const template = [
            ...(isMac ? [{
                label: app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            }] : []),
            {
                label: 'File',
                submenu: [
                    { role: 'close', label: 'Close to System Tray' },
                    { type: 'separator' },
                    { 
                        label: 'Quit Faranux ERP',
                        click: () => {
                            isQuitting = true;
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'delete' },
                    { type: 'separator' },
                    { role: 'selectAll' }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'zoom' },
                    ...(isMac ? [
                        { type: 'separator' },
                        { role: 'front' },
                        { type: 'separator' },
                        { role: 'window' }
                    ] : [
                        { role: 'close' }
                    ])
                ]
            },
            {
                role: 'help',
                submenu: [
                    {
                        label: 'About Faranux ERP',
                        click: async () => {
                            const { dialog } = require('electron');
                            dialog.showMessageBox({
                                title: 'About Faranux ERP',
                                message: 'Faranux ERP Desktop App',
                                detail: 'Version ' + app.getVersion() + '\\nCopyright © Faranux'
                            });
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'View Documentation (GitHub)',
                        click: async () => {
                            const { shell } = require('electron');
                            await shell.openExternal('https://github.com/faranux-electronics/inventory-desktop-app#readme');
                        }
                    },
                    {
                        label: 'View Past Releases',
                        click: async () => {
                            const { shell } = require('electron');
                            await shell.openExternal('https://github.com/faranux-electronics/inventory-desktop-app/releases');
                        }
                    }
                ]
            }
        ];
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);

        // ─── Auto-start on Windows login ──────────────────────────────
        app.setLoginItemSettings({
            openAtLogin: true,
            openAsHidden: true,
            name: 'Faranux ERP',
            args: ['--autostart']
        });

        // Create System Tray
        const iconPath = path.join(__dirname, '../assets/logo1.png');
        tray = new Tray(iconPath);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show Faranux ERP', click: () => mainWindow.show() },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('Faranux ERP');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            mainWindow.show();
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
            else mainWindow.show();
        });

        ipcMain.on('show-os-notification', (event, payload = {}) => {
            if (!isTrustedMainFrame(event)) return;
            const title = typeof payload.title === 'string' ? payload.title.slice(0, 120) : 'Faranux ERP';
            const body = typeof payload.body === 'string' ? payload.body.slice(0, 500) : '';
            const iconPath = path.join(__dirname, '../assets/logo_nots.png');
            const notification = new Notification({ title, body, icon: iconPath });

            // When the user clicks the notification, bring the app to the front
            notification.on('click', () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                }
            });

            notification.show();
        });

        // ─── Auto Updater Events ──────
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

        ipcMain.on('download-update', (event) => {
            if (!isTrustedMainFrame(event)) return;
            log.info('User chose to download update');
            autoUpdater.downloadUpdate();
        });

        ipcMain.on('quit-and-install', (event) => {
            if (!isTrustedMainFrame(event)) return;
            log.info('User chose to quit and install');
            isQuitting = true;
            autoUpdater.quitAndInstall();
        });
    });
}

app.on('window-all-closed', () => {
    cleanupAuthServer();
    closePdfServer();
    if (process.platform === 'darwin') {
        app.quit();
    }
});

app.on('will-quit', async (e) => {
    e.preventDefault();
    if (tray && !tray.isDestroyed()) tray.destroy();
    await cleanupAuthServer();
    closePdfServer();
    app.exit(0);
});

// Catch terminal close (Ctrl+C) to free up port 4200 during development
process.on('SIGINT', async () => {
    await cleanupAuthServer();
    app.exit(0);
});

process.on('SIGTERM', async () => {
    await cleanupAuthServer();
    app.exit(0);
});

ipcMain.handle('get-app-version', (event) => {
    assertTrustedMainFrame(event);
    return app.getVersion();
});

ipcMain.handle('get-api-url', (event) => {
    assertTrustedMainFrame(event);
    return API_URL_ENDPOINT;
});

// Google Login handler
ipcMain.handle('login-google', async (event) => {
    assertTrustedMainFrame(event);
    if (authLoginInProgress) {
        throw new Error('Google sign-in is already in progress. Finish or cancel the open sign-in window.');
    }
    authLoginInProgress = true;

    try {
        await cleanupAuthServer();
        return await new Promise((resolve, reject) => {
        rejectActiveGoogleLogin = reject;
        if (!GOOGLE_CLIENT_ID) {
            reject(new Error("Google Client ID not configured in .env"));
            return;
        }

        authTimeout = setTimeout(async () => {
            await cleanupAuthServer();
            reject(new Error("Authentication timeout - please try again"));
        }, 5 * 60 * 1000);

        authServer = http.createServer((req, res) => {
            try {
                const urlObj = new URL(req.url, `http://127.0.0.1:4200`);

                if (urlObj.pathname === '/callback') {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
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
                                    document.querySelector('h1').textContent = "Login Successful!";
                                    document.querySelector('p').textContent = "You can safely close this browser tab. Your app is ready.";
                                    document.querySelector('.spinner').style.display = 'none';
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

                            // Steal focus back to the Electron app
                            if (mainWindow) {
                                if (mainWindow.isMinimized()) {
                                    mainWindow.restore();
                                }
                                mainWindow.show();

                                // Toggle always on top to force Windows to bring it to the absolute front
                                mainWindow.setAlwaysOnTop(true);
                                mainWindow.focus();
                                mainWindow.setAlwaysOnTop(false);
                            }
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
            if (err.code === 'EADDRINUSE') {
                reject(new Error('Server error (EADDRINUSE): Google sign-in port 4200 is already in use. Close the other sign-in session and try again.'));
            } else {
                reject(new Error("Server error: " + err.message));
            }
        });

        authServer.listen(4200, '127.0.0.1', () => {
            const redirectUri = 'http://127.0.0.1:4200/callback';
            const scope = encodeURIComponent('email profile openid');
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token id_token&client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&nonce=${Date.now()}`;
            shell.openExternal(authUrl);
        });
        });
    } finally {
        authLoginInProgress = false;
        rejectActiveGoogleLogin = null;
    }
});

ipcMain.handle('open-pdf-in-browser', async (event, payload = {}) => {
    assertTrustedMainFrame(event);
    const { buffer, filename } = payload;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > 25 * 1024 * 1024 || typeof filename !== 'string') {
        throw new Error('Invalid PDF request');
    }
    try {
        closePdfServer(); // close any previous ephemeral server first

        const tempDir = path.join(os.tmpdir(), 'faranux-mis-print');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(tempDir, safeFilename);
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return await new Promise((resolve) => {
            pdfServer = http.createServer((req, res) => {
                res.writeHead(200, {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `inline; filename="${safeFilename}"`
                });
                fs.createReadStream(filePath).pipe(res);
            });

            pdfServer.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });

            pdfServer.listen(0, '127.0.0.1', async () => {
                const port = pdfServer.address().port;
                const url = `http://127.0.0.1:${port}/${encodeURIComponent(safeFilename)}`;

                await shell.openExternal(url);

                // Auto-shutdown the ephemeral server after 2 minutes, cleanup temp file
                pdfServerTimeout = setTimeout(() => {
                    closePdfServer();
                    fs.unlink(filePath, () => { });
                }, 2 * 60 * 1000);

                resolve({ success: true });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Handler to manually cancel Google login
ipcMain.handle('cancel-google-login', async (event) => {
    assertTrustedMainFrame(event);
    const rejectLogin = rejectActiveGoogleLogin;
    rejectActiveGoogleLogin = null;
    await cleanupAuthServer();
    if (rejectLogin) rejectLogin(new Error('Google login cancelled'));
    return { status: 'cancelled' };
});
