// Main Application Entry Point
const Sidebar = require('./renderer/components/Sidebar.js');
const Toast = require('./renderer/components/Toast.js');
const State = require('./renderer/services/state.js');
const API = require('./renderer/services/api.js');
const Modal = require('./renderer/components/Modal.js');
const NotificationManager = require('./renderer/services/NotificationManager.js');
const initUpdater = require('./updater.js');
const Theme = require('./renderer/services/Theme.js');

// Views
const LoginView = require('./renderer/views/auth/Loginview.js');
const ProductsView = require('./renderer/views/products/ProductsView.js');
const BranchesView = require('./renderer/views/branches/Branchesview.js');
const TransfersView = require('./renderer/views/transfer/Transfersview.js');
const ProfileView = require('./renderer/views/profile/ProfileView.js');
const ImportView = require('./renderer/views/import/ImportView.js');
const PosView = require('./renderer/views/pos/POSView.js');
const LogsView = require("./renderer/views/logger/LogsView.js");
const NotsView = require('./renderer/views/notifications/NotsView.js');
const AccessView = require('./renderer/views/users/AccessView');
const MpsView = require('./renderer/views/mps/MpsView.js');
const NAV_ITEMS = require('./renderer/config/navRegistry.js');

class App {
    constructor() {
        this.state = State;
        this.notifManager = null;
        this.authRedirectInProgress = false;

        this.sidebar = new Sidebar(
            (view) => this.navigate(view),
            () => this.handleLogout()
        );

        this.views = {
            login: new LoginView(this),
            products: new ProductsView(this),
            branches: new BranchesView(this),
            pos: new PosView(this),
            transfers: new TransfersView(this),
            import: new ImportView(this),
            profile: new ProfileView(this),
            access: new AccessView(this),
            logs: new LogsView(this),
            nots: new NotsView(this),
            mps: new MpsView(this)
        };

        this.currentView = null;
    }

    async init() {
        Theme.apply();
        const user = this.state.getUser();
        if (user) {
            await this.renderApp(user);
            await this.navigate('pos');
        } else {
            this.navigate('login');
        }
    }

    async renderApp(user) {
        this.views.products?._bgSync?.start();
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
        if (!this.state.getUser()) return;
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
        const previousView = this.currentView;
        this.currentView = view;
        if (viewName === 'login') {
            if (previousView && previousView !== view && typeof previousView.suspend === 'function') previousView.suspend();
            document.getElementById('app').innerHTML = '';
            view.render();
        } else {
            const user = this.state.getUser();
            if (!user) {
                this.navigate('login');
                return;
            }
            if (viewName === 'mps') {
                await this.ensureNavPermissionsLoaded();
                const role = user.role;
                const permissions = this.state.getNavPermissions();
                const navItem = NAV_ITEMS.find(item => item.key === 'mps');
                const allowed = permissions?.[role] && Object.prototype.hasOwnProperty.call(permissions[role], 'mps')
                    ? permissions[role].mps === true
                    : navItem.defaultRoles.includes(role);
                if (!allowed) {
                    Toast.error('You do not have access to the Master Planner tab.');
                    return;
                }
            }
            if (!document.querySelector('.sidebar')) await this.renderApp(user);
            this.sidebar.setActive(viewName);

            // Ensure nav permissions are loaded before rendering views that depend on them
            if (viewName === 'pos') {
                await this.ensureNavPermissionsLoaded();
            }

            if (previousView && previousView !== view && typeof previousView.suspend === 'function') previousView.suspend();
            view.render();
        }
    }

    async handleAuthenticationRequired(message) {
        if (this.authRedirectInProgress) return;
        this.authRedirectInProgress = true;
        this.views.products?._bgSync?.stop();
        this.state.logout();
        if (this.notifManager) {
            this.notifManager.stopPolling();
            this.notifManager = null;
        }
        await this.navigate('login');
        if (typeof Toast.warning === 'function') Toast.warning(message);
        else Toast.info(message);
    }

    resetAuthenticationFailure() {
        this.authRedirectInProgress = false;
    }

    async handleLogout() {
        await this.handleAuthenticationRequired('Logged out successfully');
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
