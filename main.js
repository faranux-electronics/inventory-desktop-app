// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#f0f2f5', // Matches your CSS body background
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Allows require() in renderer.js
            enableRemoteModule: true
        }
    });

    // Load the index.html from the src folder
    win.loadFile(path.join(__dirname, 'src', 'index.html'));

    // Optional: Open DevTools automatically for debugging
    // win.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});