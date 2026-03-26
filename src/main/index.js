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

// Added this line to disable auto-download so your custom UI prompt works
autoUpdater.autoDownload = false;

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

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

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

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');
app.commandLine.appendSwitch('enable-features', 'NetworkService,SharedArrayBuffer');

app.whenReady().then(() => {
    createWindow();

    // Create System Tray
    const iconPath = path.join(__dirname, 'src', 'assets', 'logo1.png');
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

    tray.setToolTip('Faranux Inventory');
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

    autoUpdater.on('update-available', (info) => {
        if(mainWindow) mainWindow.webContents.send('update-available', info);
    });
    autoUpdater.on('error', (err) => {
        if(mainWindow) mainWindow.webContents.send('update-error', err.message);
    });
    autoUpdater.on('download-progress', (progressObj) => {
        if(mainWindow) mainWindow.webContents.send('download-progress', progressObj);
    });
    autoUpdater.on('update-downloaded', (info) => {
        if(mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    ipcMain.on('download-update', () => autoUpdater.downloadUpdate());
    ipcMain.on('quit-and-install', () => {
        isQuitting = true;
        autoUpdater.quitAndInstall();
    });
});

app.on('window-all-closed', () => {
    cleanupAuthServer();
    // Intentionally omitted app.quit() so tray stays alive
});

app.on('will-quit', async (e) => {
    e.preventDefault();
    await cleanupAuthServer();
    app.exit(0);
});

// Google Login handler
ipcMain.handle('login-google', async () => {
    return new Promise((resolve, reject) => {
        if (authTimeout) clearTimeout(authTimeout);
        authTimeout = setTimeout(async () => {
            await cleanupAuthServer();
            reject(new Error("Login timed out after 5 minutes"));
        }, 5 * 60 * 1000);

        if (authServer) {
            cleanupAuthServer().then(() => startServer());
        } else {
            startServer();
        }

        function startServer() {
            authServer = http.createServer((req, res) => {
                if (req.url.startsWith('/callback')) {
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(`
                        <html><body>
                        <script>
                            const hash = window.location.hash.substring(1);
                            const params = new URLSearchParams(hash);
                            const idToken = params.get('id_token');
                            if (idToken) {
                                fetch('http://127.0.0.1:4200/token', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id_token: idToken })
                                }).then(() => {
                                    document.body.innerHTML = "<h3>Login successful! You can close this window and return to the app.</h3>";
                                    window.close();
                                }).catch(err => {
                                    document.body.innerHTML = "<h3>Error sending token to app.</h3>";
                                });
                            } else {
                                document.body.innerHTML = "<h3>Login failed. No token received.</h3>";
                            }
                        </script>
                        </body></html>
                    `);
                } else if (req.url === '/token' && req.method === 'POST') {
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
        }
    });
});

ipcMain.handle('cancel-google-login', async () => {
    await cleanupAuthServer();
    return true;
});