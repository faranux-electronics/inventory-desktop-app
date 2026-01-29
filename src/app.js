// Main Application Entry Point
const { ipcRenderer } = require('electron');
const Sidebar = require('./src/renderer/components/Sidebar.js');
const Toast = require('./src/renderer/components/Toast.js');
const State = require('./src/renderer/services/state.js');
const API = require('./src/renderer/services/api.js');
const Modal = require('./src/renderer/components/Modal.js');

// Views
const LoginView = require('./src/renderer/views/Loginview.js');
const DashboardView = require('./src/renderer/views/Dashboardview.js');
const BranchesView = require('./src/renderer/views/Branchesview.js');
const TransfersView = require('./src/renderer/views/Transfersview.js');
const OrdersView = require('./src/renderer/views/Ordersview.js');
const ProfileView = require('./src/renderer/views/ProfileView.js');
const UsersView = require('./src/renderer/views/UsersView.js');

// --- AUTO UPDATE LISTENERS (MANUAL DOWNLOAD VERSION) ---

// 1. Update available - ask user if they want to download
ipcRenderer.on('update-available', (event, info) => {
    Modal.open({
        title: "Update Available",
        body: `
            <div class="text-center">
                <i class="fa-solid fa-cloud-arrow-down text-primary-500" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h3 style="margin-bottom: 0.5rem;">Version ${info.version} is Available</h3>
                <p class="text-sm text-muted" style="margin-bottom: 1rem;">A new version is ready to download.</p>
                ${info.releaseNotes ? `
                    <div style="text-align: left; max-height: 200px; overflow-y: auto; padding: 1rem; background: #f5f5f5; border-radius: 8px; margin-bottom: 1rem;">
                        <strong>What's New:</strong>
                        <p class="text-sm">${info.releaseNotes}</p>
                    </div>
                ` : ''}
                <p class="text-sm">Download now or later?</p>
            </div>
        `,
        confirmText: "Download Now",
        cancelText: "Remind Me Later",
        onConfirm: () => {
            ipcRenderer.send('download-update');
            Toast.info("Downloading update...", 3000);
        },
        onCancel: () => {
            Toast.info("You can update later from the menu");
        }
    });
});

// 2. Download progress
let progressToastId = null;
ipcRenderer.on('download-progress', (event, progressObj) => {
    const percent = Math.round(progressObj.percent);
    const downloaded = Math.round(progressObj.transferred / 1024 / 1024);
    const total = Math.round(progressObj.total / 1024 / 1024);

    Toast.info(`Downloading: ${percent}% (${downloaded}/${total} MB)`, 2000);
});

// 3. Download complete - prompt to install
ipcRenderer.on('update-downloaded', (event, info) => {
    Modal.open({
        title: "✓ Update Downloaded",
        body: `
            <div class="text-center">
                <i class="fa-solid fa-circle-check text-success-500" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h3 style="margin-bottom: 0.5rem;">Ready to Install v${info.version}</h3>
                <p class="text-sm text-muted">The update has been downloaded successfully.</p>
                <p class="text-sm" style="margin-top: 1rem;">
                    <strong>Install now</strong> (app will restart) or <strong>install later</strong> (on next app launch).
                </p>
            </div>
        `,
        confirmText: "Restart & Install",
        cancelText: "Install on Exit",
        onConfirm: () => {
            ipcRenderer.send('quit-and-install');
        },
        onCancel: () => {
            Toast.success("Update will install when you close the app", 4000);
        }
    });
});

// 4. Error handling
ipcRenderer.on('update-error', (event, error) => {
    Modal.open({
        title: "Update Failed",
        body: `
            <div class="text-center">
                <i class="fa-solid fa-circle-exclamation text-danger-500" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>Unable to download the update.</p>
                <p class="text-sm text-muted">${error}</p>
                <p class="text-sm" style="margin-top: 1rem;">You can try again later or download manually from our website.</p>
            </div>
        `,
        confirmText: "OK",
        cancelText: null
    });
});

class App {
    constructor() {
        this.state = State;
        this.sidebar = new Sidebar(
            (view) => this.navigate(view),
            () => this.handleLogout()
        );

        this.views = {
            login: new LoginView(this),
            dashboard: new DashboardView(this),
            branches: new BranchesView(this),
            transfers: new TransfersView(this),
            orders: new OrdersView(this),
            profile: new ProfileView(this),
            users: new UsersView(this)
        };

        this.currentView = null;
        this.init();
    }

    init() {
        const user = this.state.getUser();
        if (user) {
            this.renderApp(user);
            this.navigate('dashboard');
        } else {
            this.navigate('login');
        }
    }

    renderApp(user) {
        const app = document.getElementById('app');
        app.innerHTML = `
      ${this.sidebar.render(user)}
      <div class="main-content">
        <div class="content-wrapper" id="content"></div>
      </div>
    `;
        this.sidebar.attachEvents();
    }

    navigate(viewName) {
        const view = this.views[viewName];
        if (!view) return;
        this.currentView = view;
        if (viewName === 'login') {
            document.getElementById('app').innerHTML = '';
            view.render();
        } else {
            const user = this.state.getUser();
            if (!user) { this.navigate('login'); return; }
            if (!document.querySelector('.sidebar')) this.renderApp(user);
            this.sidebar.setActive(viewName);
            view.render();
        }
    }

    async handleLogin(credentials) {
        try {
            const res = await API.login(credentials.email, credentials.password);
            if (res.status === 'success') {
                this.state.setUser(res.user);
                this.renderApp(res.user);
                this.navigate('dashboard');
                Toast.success('Welcome back!');
            } else {
                Toast.error(res.message || 'Login failed');
            }
        } catch (error) {
            Toast.error('An error occurred during login');
        }
    }

    async handleGoogleLogin() {
        try {
            const token = await ipcRenderer.invoke('login-google');
            const res = await API.googleLogin(token);
            if (res.status === 'success') {
                this.state.setUser(res.user);
                this.renderApp(res.user);
                this.navigate('dashboard');
                Toast.success('Welcome back!');
            } else {
                Toast.error(res.message || 'Google login failed');
            }
        } catch (error) {
            Toast.error('Google login failed: ' + error);
        }
    }

    handleLogout() {
        this.state.logout();
        this.navigate('login');
        Toast.info('Logged out successfully');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

module.exports = App;