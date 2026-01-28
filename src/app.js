// Main Application Entry Point
const { ipcRenderer } = require('electron'); // This works now!
const Sidebar = require('./src/renderer/components/Sidebar.js');
const Toast = require('./src/renderer/components/Toast.js');
const State = require('./src/renderer/services/state.js');
const API = require('./src/renderer/services/api.js');
const Modal = require('./src/renderer/components/Modal.js'); // Import Modal here

// Views
const LoginView = require('./src/renderer/views/Loginview.js');
const DashboardView = require('./src/renderer/views/Dashboardview.js');
const BranchesView = require('./src/renderer/views/Branchesview.js');
const TransfersView = require('./src/renderer/views/Transfersview.js');
const OrdersView = require('./src/renderer/views/Ordersview.js');
const ProfileView = require('./src/renderer/views/ProfileView.js');
const UsersView = require('./src/renderer/views/UsersView.js');

// --- AUTO UPDATE LISTENERS ---
// 1. Listen for available updates
ipcRenderer.on('update-available', (event, info) => {
    Modal.open({
        title: "Update Available",
        body: `
            <div class="text-center">
                <i class="fa-solid fa-cloud-arrow-down text-primary-500" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>A new version <b>(${info.version})</b> is available.</p>
                <p class="text-sm text-muted">Would you like to download it now?</p>
            </div>
        `,
        confirmText: "Download Update",
        cancelText: "Later",
        onConfirm: () => {
            ipcRenderer.send('download-update');
            Toast.info("Downloading update in background...");
        }
    });
});

// 2. Listen for download completion
ipcRenderer.on('update-downloaded', (event, info) => {
    Modal.open({
        title: "Update Ready",
        body: `
            <div class="text-center">
                <i class="fa-solid fa-gift text-success-500" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>Version <b>${info.version}</b> has been downloaded.</p>
                <p class="text-sm text-muted">Restart the app to apply changes.</p>
            </div>
        `,
        confirmText: "Restart Now",
        cancelText: "Later",
        onConfirm: () => {
            ipcRenderer.send('quit-and-install');
        }
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

    // ... rest of your App class (init, renderApp, navigate, handleLogin, etc)
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