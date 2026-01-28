const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http'); // Required for the local server

// 1. LOAD ENV VARIABLES
require('dotenv').config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

let authServer = null; // Store server reference to close it later

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // For simple requires in renderer
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- NEW GOOGLE LOGIN HANDLER (Loopback Server) ---
ipcMain.handle('login-google', async () => {
    return new Promise((resolve, reject) => {
        if (!GOOGLE_CLIENT_ID) {
            reject("Google Client ID not configured in .env");
            return;
        }

        // Spin up temporary auth server
        authServer = http.createServer((req, res) => {
            // Use try-catch to prevent crashes on malformed URLs
            try {
                const urlObj = new URL(req.url, `http://127.0.0.1:4200`);

                // Step 2: Google redirects here with token in URL hash
                // We serve a page that extracts the hash and posts it back to /token
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

                // Step 3: Receive token from the client-side script
                if (req.method === 'POST' && req.url === '/token') {
                    let body = '';
                    req.on('data', chunk => body += chunk.toString());
                    req.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            res.writeHead(200);
                            res.end('Auth successful');

                            // Send just the ID Token back to renderer
                            resolve(data.id_token);
                        } catch (e) { reject(e); }
                        finally {
                            // Close server immediately after success
                            if (authServer) {
                                authServer.close();
                                authServer = null;
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Auth Server Error:", e);
            }
        });

        // Step 1: Start listener and open external browser
        // We use 127.0.0.1 specifically because 'localhost' can sometimes be ambiguous in OAuth settings
        authServer.listen(4200, '127.0.0.1', () => {
            const redirectUri = 'http://127.0.0.1:4200/callback';
            // Scopes: email, profile, openid are the standard login scopes
            const scope = encodeURIComponent('email profile openid');

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
                `?response_type=token id_token` +
                `&client_id=${GOOGLE_CLIENT_ID}` +
                `&redirect_uri=${redirectUri}` +
                `&scope=${scope}` +
                `&nonce=${Date.now()}`;

            shell.openExternal(authUrl);
        });

        authServer.on('error', (err) => {
            if (authServer) authServer.close();
            reject(new Error('Auth server failed: ' + err.message));
        });
    });
});