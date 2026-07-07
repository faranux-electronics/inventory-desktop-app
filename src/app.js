// Main Application Entry Point
const {ipcRenderer} = require('electron');
const Sidebar = require('./src/renderer/components/Sidebar.js');
const Toast = require('./src/renderer/components/Toast.js');
const State = require('./src/renderer/services/state.js');
const API = require('./src/renderer/services/api.js');
const Modal = require('./src/renderer/components/Modal.js');
const NotificationManager = require('./src/renderer/services/NotificationManager.js');
const initUpdater = require('./src/updater.js');

// Views
const LoginView = require('./src/renderer/views/auth/Loginview.js');
const ProductsView = require('./src/renderer/views//products/ProductsView.js');
const BranchesView = require('./src/renderer/views/branches/Branchesview.js');
const TransfersView = require('./src/renderer/views/transfer/Transfersview.js');
const ProfileView = require('./src/renderer/views/profile/ProfileView.js');
const ImportView = require('./src/renderer/views/import/ImportView.js');
const PosView = require('./src/renderer/views/pos/POSView.js');
const LogsView = require("./src/renderer/views/logger/LogsView.js");
const NotsView = require('./src/renderer/views/notifications/NotsView.js');
const AccessView = require('./src/renderer/views/users/AccessView');

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
            import: new ImportView(this),
            profile: new ProfileView(this),
            access: new AccessView(this),
            pos: new PosView(this),
            logs: new LogsView(this),
            nots: new NotsView(this)
        };

        this.currentView = null;
    }

    async init() {
        const user = this.state.getUser();
        if (user) {
            await this.renderApp(user);
            await this.navigate('transfers');
        } else {
            this.navigate('login');
        }
    }

    async renderApp(user) {
        const app = document.getElementById('app');
        app.innerHTML = `
      ${this.sidebar.render(user)}
      <div class="main-content">
        <div class="content-wrapper" id="content"></div>
      </div>
    `;
        this.sidebar.attachEvents();
        this.sidebar.loadLocations(this.state);
        this.sidebar.loadAppVersion();

        const navRes = await API.getNavPermissions();
        if (navRes.status === 'success') {
            this.state.setNavPermissions(navRes.data);
            // Re-render sidebar with permissions
            document.getElementById('mainSidebar').outerHTML =
                this.sidebar.render(user, navRes.data) // see note below*
            this.sidebar.attachEvents();
            this.sidebar.loadAppVersion();
        }

        if (!this.notifManager) {
            this.notifManager = new NotificationManager(this.sidebar);
            this.notifManager.startPolling(30000);
        }
    }

    async ensureNavPermissionsLoaded() {
        if (!this.state.getNavPermissions()) {
            const navRes = await API.getNavPermissions();
            if (navRes.status === 'success') {
                this.state.setNavPermissions(navRes.data);
            }
        }
    }

    async navigate(viewName) {
        const view = this.views[viewName];
        if (!view) return;
        this.currentView = view;
        if (viewName === 'login') {
            document.getElementById('app').innerHTML = '';
            view.render();
        } else {
            const user = this.state.getUser();
            if (!user) {
                this.navigate('login');
                return;
            }
            if (!document.querySelector('.sidebar')) await this.renderApp(user);
            this.sidebar.setActive(viewName);
            
            // Ensure nav permissions are loaded before rendering views that depend on them
            if (viewName === 'transfers') {
                await this.ensureNavPermissionsLoaded();
            }
            
            view.render();
        }
    }

    async handleLogout() {
        this.state.logout();

        if (this.notifManager) {
            this.notifManager.stopPolling();
            this.notifManager = null;
        }

        await this.navigate('login');
        Toast.info('Logged out successfully');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // FIX: initUpdater() is called BEFORE new App() so IPC listeners are
    // registered as early as possible — ensuring update-downloaded fires
    // even when electron-updater emits it immediately on startup because
    // the update was already downloaded in a previous session.
    initUpdater();

    window.app = new App();
    window.app.init();
});

module.exports = App;