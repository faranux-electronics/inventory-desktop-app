const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const UserTable = require('./components/UserTable.js');
const UserModals = require('./components/UserModals.js');
const NavPermissionsPanel = require('./components/NavPermissionsPanel.js');

class AccessView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
        this.tableComponent = new UserTable(this);
        this.modals = new UserModals(this);
        this.navPanel = new NavPermissionsPanel(this.state);
        this.currentTab = 'users';      // 'users' | 'trash' | 'navigation'
        this.userSubTab = 'active';     // 'active' | 'trash'  (sub-tab within users tab)
    }

    render() {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row">
                    <h1 class="page-title text-neutral-800 font-normal">Access Management</h1>
                </div>
            </div>

            <!-- Primary tabs -->
            <div class="tabs mb-md" style="display: flex; gap: 0; border-bottom: 2px solid #c3c4c7;">
                <button class="primary-tab-btn active" data-tab="users"
                    style="${this._primaryTabStyle(true)}">
                    <i class="fa-solid fa-users-gear"></i> Users
                </button>
                <button class="primary-tab-btn" data-tab="navigation"
                    style="${this._primaryTabStyle(false)}">
                    <i class="fa-solid fa-sliders"></i> Navigation
                </button>
            </div>

            <!-- Users panel -->
            <div id="tab-panel-users">
                <!-- Secondary tabs: Active / Trash -->
                <div style="display: flex; gap: 16px; border-bottom: 1px solid #c3c4c7; margin-bottom: 12px;">
                    <button class="sub-tab-btn active" data-subtab="active"
                        style="${this._subTabStyle(true)}">Active Users</button>
                    <button class="sub-tab-btn" data-subtab="trash"
                        style="${this._subTabStyle(false)}">Trash</button>
                </div>

                <div class="flex items-center gap-sm mb-md p-sm justify-between"
                     style="background:#f8f9fa; border:1px solid #c3c4c7; border-radius:4px; flex-wrap:wrap;">
                    <div class="search-box" style="min-width:280px; position:relative;">
                        <i class="fa-solid fa-search" style="font-size:13px; color:#8c8f94; position:absolute; left:10px; top:50%; transform:translateY(-50%);"></i>
                        <input type="text" id="userSearch" class="search-input form-input-sm w-full"
                               style="background:white; padding-left:32px; border-color:#8c8f94;"
                               placeholder="Search by name or email...">
                    </div>
                    <button class="btn btn-sm" id="addUserBtn"
                            style="background:white; border:1px solid #2271b1; color:#2271b1; padding:6px 14px; font-weight:500;">
                        <i class="fa-solid fa-user-plus"></i> Add New User
                    </button>
                </div>

                <div style="background:white; border:1px solid #c3c4c7; border-radius:4px; overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead style="background:white; border-bottom:1px solid #c3c4c7;">
                            <tr>
                                <th style="padding:10px; color:#2c3338; font-weight:400; border-bottom:1px solid #c3c4c7; text-align:left;">Name</th>
                                <th style="padding:10px; color:#2c3338; font-weight:400; border-bottom:1px solid #c3c4c7; text-align:left;">Email</th>
                                <th style="padding:10px; color:#2c3338; font-weight:400; border-bottom:1px solid #c3c4c7; text-align:left;">Role</th>
                                <th style="padding:10px; color:#2c3338; font-weight:400; border-bottom:1px solid #c3c4c7; text-align:left;">Status</th>
                                <th style="padding:10px; color:#2c3338; font-weight:400; border-bottom:1px solid #c3c4c7; text-align:left;">Assigned Branches</th>
                                <th style="padding:10px; color:#2c3338; font-weight:400; border-bottom:1px solid #c3c4c7;" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="6" class="text-center p-lg text-muted">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Navigation panel -->
            <div id="tab-panel-navigation" style="display:none;">
                <div id="nav-perms-container"></div>
            </div>
        `;

        this.init();
    }

    _primaryTabStyle(active) {
        return active
            ? 'padding:10px 20px; border:none; background:#2271b1; color:white; font-weight:600; cursor:pointer; border-radius:4px 4px 0 0; margin-right:2px;'
            : 'padding:10px 20px; border:none; background:#f0f0f1; color:#50575e; font-weight:600; cursor:pointer; border-radius:4px 4px 0 0; margin-right:2px;';
    }

    _subTabStyle(active) {
        return active
            ? 'padding:8px 16px; border:none; background:none; border-bottom:2px solid #2271b1; color:#2271b1; font-weight:600; cursor:pointer;'
            : 'padding:8px 16px; border:none; background:none; border-bottom:2px solid transparent; color:#50575e; font-weight:600; cursor:pointer;';
    }

    async init() {
        try {
            const locRes = await API.getLocations();
            this.locationsCache = locRes.status === 'success' ? locRes.data : [];
            this.loadUsers();
            this.attachEvents();
        } catch (e) {
            Toast.error("Failed to initialize view data");
        }
    }

    async loadUsers() {
        const currentUser = this.state.getUser();
        const tbody = document.getElementById('usersTableBody');
        const searchQuery = document.getElementById('userSearch')?.value.toLowerCase() || '';

        try {
            const res = await API.getUsers(true);
            if (res.status === 'success') {
                let users = res.data;

                if (this.userSubTab === 'trash') {
                    users = users.filter(u => u.deleted_at !== null);
                } else {
                    users = users.filter(u => u.deleted_at === null);
                }

                if (searchQuery) {
                    users = users.filter(u =>
                        (u.name && u.name.toLowerCase().includes(searchQuery)) ||
                        (u.email && u.email.toLowerCase().includes(searchQuery))
                    );
                }

                this.tableComponent.render(users, currentUser);
            } else {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error p-lg">Failed to load users</td></tr>`;
        }
    }

    attachEvents() {
        // Primary tab switching (Users / Navigation)
        document.querySelectorAll('.primary-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.currentTab = tab;

                document.querySelectorAll('.primary-tab-btn').forEach((b, i) => {
                    b.style.cssText = this._primaryTabStyle(b === btn);
                });

                document.getElementById('tab-panel-users').style.display = tab === 'users' ? '' : 'none';
                document.getElementById('tab-panel-navigation').style.display = tab === 'navigation' ? '' : 'none';

                if (tab === 'navigation') {
                    this.navPanel.render(document.getElementById('nav-perms-container'));
                }
            });
        });

        // Sub-tab switching (Active / Trash)
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.userSubTab = btn.dataset.subtab;

                document.querySelectorAll('.sub-tab-btn').forEach(b => {
                    b.style.cssText = this._subTabStyle(b === btn);
                    b.classList.toggle('active', b === btn);
                });

                const addBtn = document.getElementById('addUserBtn');
                if (addBtn) addBtn.style.display = this.userSubTab === 'trash' ? 'none' : 'block';

                this.loadUsers();
            });
        });

        document.getElementById('addUserBtn').addEventListener('click', () => this.modals.showAddUserModal());
        document.getElementById('userSearch')?.addEventListener('input', () => this.loadUsers());
    }
}

module.exports = AccessView;