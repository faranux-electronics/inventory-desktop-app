const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const PageHeader = require('../../components/PageHeader.js');
const Pagination = require('../../components/Pagination.js');
const Input = require('../../components/Input.js');
const Select = require('../../components/Select.js');
const Button = require('../../components/Button.js');
const Table = require('../../components/Table.js');
const FilterBar = require('../../components/FilterBar.js');
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
        this.currentPage = 1;
        this.pageSize = 20;
        this.filteredUsers = [];
        this.userFilters = {role: '', status: ''};
    }

    render() {
        const content = document.getElementById('content');
        content.dataset.view = 'access';
        content.innerHTML = `
            ${PageHeader.html({title: 'Access Management', icon: 'fa-solid fa-user-shield', subtitle: 'Manage users and navigation permissions.', actions: Button.html({text: 'Add New User', icon: 'fa-solid fa-user-plus', id: 'addUserBtn', variant: 'outline', size: 'md', className: 'access-add-user'}), className: 'page-header-surface access-page-header'})}

            <div class="access-content">
                <!-- Primary tabs -->
                <div class="tabs access-primary-tabs">
                <button class="tab-btn primary-tab-btn active" data-tab="users">
                    <i class="fa-solid fa-users-gear"></i> Users
                </button>
                <button class="tab-btn primary-tab-btn" data-tab="navigation">
                    <i class="fa-solid fa-sliders"></i> Navigation
                </button>
                </div>

                <!-- Users panel -->
                <div id="tab-panel-users">
                <!-- Secondary tabs: Active / Trash -->
                <div class="tabs access-secondary-tabs">
                    <button class="tab-btn sub-tab-btn active" data-subtab="active">Active Users</button>
                    <button class="tab-btn sub-tab-btn" data-subtab="trash">Trash</button>
                </div>

                ${FilterBar.html({className: 'access-user-filter-bar flex items-center mb-md justify-between', ariaLabel: 'Filter users', content: `
                    <div class="access-user-search">
                        <i class="fa-solid fa-search" aria-hidden="true"></i>
                        ${Input.html({type: 'search', id: 'userSearch', ariaLabel: 'Search users by name or email', placeholder: 'Search by name or email...', className: 'access-search-input'})}
                    </div>
                    ${Select.html({id: 'userRoleFilter', ariaLabel: 'Filter users by role', value: this.userFilters.role, className: 'access-user-filter', options: [{value: '', label: 'All roles'}, ...['admin', 'manager', 'cashier', 'supply_chain_manager'].map(role => ({value: role, label: role === 'supply_chain_manager' ? 'Supply Chain Manager' : role.charAt(0).toUpperCase() + role.slice(1)}))]})}
                    ${Select.html({id: 'userStatusFilter', ariaLabel: 'Filter users by status', value: this.userFilters.status, className: 'access-user-filter', options: [{value: '', label: 'All statuses'}, ...['active', 'pending', 'suspended'].map(status => ({value: status, label: status.charAt(0).toUpperCase() + status.slice(1)}))]})}
                    ${Button.html({text: 'Clear Filters', id: 'clearUserFiltersBtn', variant: 'outline', size: 'sm', className: 'access-clear-filters-btn'})}
                `})}

                ${Table.html({
                    headers: ['Name', 'Email', 'Role', 'Status', 'Assigned Branches', {label: 'Actions', className: 'text-right'}],
                    body: '<tr><td colspan="6" class="text-center p-lg text-muted">Loading...</td></tr>',
                    bodyId: 'usersTableBody',
                    className: 'access-users-table',
                    wrapperClass: 'access-users-table-wrapper',
                    ariaLabel: 'Access management users'
                })}
                <div id="userPagination"></div>
                </div>

                <!-- Navigation panel -->
                <div id="tab-panel-navigation" style="display:none;">
                    <div id="nav-perms-container"></div>
                </div>
            </div>
        `;

        this.init();
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

                if (this.userFilters.role) users = users.filter(user => user.role === this.userFilters.role);
                if (this.userFilters.status) users = users.filter(user => user.status === this.userFilters.status);

                this.filteredUsers = users;
                this.currentPage = Math.min(this.currentPage, Math.max(1, Math.ceil(users.length / this.pageSize)));
                this.renderUsersPage(currentUser);
            } else {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error p-lg">Failed to load users</td></tr>`;
        }
    }

    renderUsersPage(currentUser = this.state.getUser()) {
        const start = (this.currentPage - 1) * this.pageSize;
        this.tableComponent.render(this.filteredUsers.slice(start, start + this.pageSize), currentUser);
        Pagination.render(document.getElementById('userPagination'), {
            page: this.currentPage,
            pageSize: this.pageSize,
            total: this.filteredUsers.length,
            itemLabel: 'users',
            pageSizeId: 'userRowsPerPage',
            onPageChange: page => {
                this.currentPage = page;
                this.renderUsersPage(currentUser);
            },
            onPageSizeChange: pageSize => {
                this.pageSize = pageSize;
                this.currentPage = 1;
                this.renderUsersPage(currentUser);
            }
        });
    }

    attachEvents() {
        // Primary tab switching (Users / Navigation)
        document.querySelectorAll('.primary-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.currentTab = tab;

                document.querySelectorAll('.primary-tab-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
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
                this.currentPage = 1;

                document.querySelectorAll('.sub-tab-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });

                const addBtn = document.getElementById('addUserBtn');
                if (addBtn) addBtn.style.display = this.userSubTab === 'trash' ? 'none' : 'block';

                this.loadUsers();
            });
        });

        document.getElementById('addUserBtn').addEventListener('click', () => this.modals.showAddUserModal());
        const reloadFromFirstPage = () => {
            this.currentPage = 1;
            this.loadUsers();
        };
        document.getElementById('userSearch')?.addEventListener('input', reloadFromFirstPage);
        document.getElementById('userRoleFilter')?.addEventListener('change', event => {
            this.userFilters.role = event.target.value;
            reloadFromFirstPage();
        });
        document.getElementById('userStatusFilter')?.addEventListener('change', event => {
            this.userFilters.status = event.target.value;
            reloadFromFirstPage();
        });
        document.getElementById('clearUserFiltersBtn')?.addEventListener('click', () => {
            this.userFilters = {role: '', status: ''};
            this.currentPage = 1;
            document.getElementById('userRoleFilter').value = '';
            document.getElementById('userStatusFilter').value = '';
            document.getElementById('userSearch').value = '';
            this.loadUsers();
        });
    }
}

module.exports = AccessView;
