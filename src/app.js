// Main Application Entry Point
const { ipcRenderer } = require('electron');
const Sidebar = require('./src/renderer/components/Sidebar.js');
const Toast = require('./src/renderer/components/Toast.js');
const State = require('./src/renderer/services/state.js');
const API = require('./src/renderer/services/api.js');
const Modal = require('./src/renderer/components/Modal.js');
const NotificationManager = require('./src/renderer/services/NotificationManager.js');

// Views
const LoginView = require('./src/renderer/views/auth/Loginview.js');
const ProductsView = require('./src/renderer/views//products/ProductsView.js');
const BranchesView = require('./src/renderer/views/branches/Branchesview.js');
const TransfersView = require('./src/renderer/views/transfer/Transfersview.js');
const OrdersView = require('./src/renderer/views/Ordersview.js');
const ProfileView = require('./src/renderer/views/profile/ProfileView.js');
const UsersView = require('./src/renderer/views/users/UsersView.js');
const ImportView = require('./src/renderer/views/import/ImportView.js');
const PosView = require('./src/renderer/views/pos/POSView.js');
const LogsView = require("./src/renderer/views/logger/LogsView.js");
const NotsView = require('./src/renderer/views/notifications/NotsView.js');

// Download progress listener
ipcRenderer.on('download-progress', (event, progressObj) => {
    const percent = Math.round(progressObj.percent);
    const existingToast = document.getElementById('update-progress-toast');
    if (existingToast) {
        existingToast.querySelector('.toast-msg').textContent = `Downloading update: ${percent}%`;
    } else {
        Toast.info(`Downloading update: ${percent}%`, 3000);
    }
});

// Update error
ipcRenderer.on('update-error', (event, errorStr) => {
    Toast.error(`Update error: ${errorStr}`);
});

class App {
    constructor() {
        this.state = State;
        this.notifManager = null;

        this.sidebar = new Sidebar(
            (view) => this.navigate(view),
            () => this.handleLogout()
        );

        this.views = {
            login: new LoginView(this),
            products: new ProductsView(this),
            branches: new BranchesView(this),
            transfers: new TransfersView(this),
            orders: new OrdersView(this),
            import: new ImportView(this),
            profile: new ProfileView(this),
            users: new UsersView(this),
            pos: new PosView(this),
            logs: new LogsView(this),
            nots: new NotsView(this)
        };

        this.currentView = null;
        this.init();
    }

    init() {
        const user = this.state.getUser();
        if (user) {
            this.renderApp(user);
            this.navigate('transfers');
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
        this.sidebar.loadLocations(this.state);

        if (!this.notifManager) {
            this.notifManager = new NotificationManager(this.sidebar);
            this.notifManager.startPolling(30000);
        }
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

    handleLogout() {
        this.state.logout();

        if (this.notifManager) {
            this.notifManager.stopPolling();
            this.notifManager = null;
        }

        this.navigate('login');
        Toast.info('Logged out successfully');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

module.exports = App;