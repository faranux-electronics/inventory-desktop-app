// Main Application Entry Point
const { ipcRenderer } = require('electron');
const Sidebar = require('./src/renderer/components/Sidebar.js');
const Toast = require('./src/renderer/components/Toast.js');
const State = require('./src/renderer/services/state.js');
const API = require('./src/renderer/services/api.js');

// Views
const LoginView = require('./src/renderer/views/Loginview.js');
const DashboardView = require('./src/renderer/views/Dashboardview.js');
const BranchesView = require('./src/renderer/views/Branchesview.js');
const TransfersView = require('./src/renderer/views/Transfersview.js');
const OrdersView = require('./src/renderer/views/Ordersview.js');
const ProfileView = require('./src/renderer/views/ProfileView.js');
const UsersView = require('./src/renderer/views/UsersView.js');

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
            if (!user) {
                this.navigate('login');
                return;
            }

            if (!document.querySelector('.sidebar')) {
                this.renderApp(user);
            }

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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// Export for global access
module.exports = App;