const Toast = require('../components/Toast.js');
const API = require('../services/api.js');
const UserTable = require('./users/UserTable.js');
const UserModals = require('./users/UserModals.js');

class UsersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
        this.tableComponent = new UserTable(this);
        this.modals = new UserModals(this);
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row">
                    <h1 class="page-title text-neutral-800 font-normal">User Management</h1>
                </div>
            </div>

            <div class="flex items-center gap-sm mb-md p-sm justify-between" style="background: #f8f9fa; border: 1px solid #c3c4c7; border-radius: 4px; flex-wrap: wrap;">
                
                <div class="flex items-center gap-md">
                    <div class="search-box" style="min-width: 280px;">
                        <i class="fa-solid fa-search" style="font-size: 13px; color: #8c8f94; left: 10px;"></i>
                        <input type="text" id="userSearch" class="search-input form-input-sm w-full" 
                               style="background: white; padding-left: 32px; border-color: #8c8f94;" 
                               placeholder="Search by name or email...">
                    </div>
                    
                    <div class="flex items-center gap-xs ml-sm">
                        <input type="checkbox" id="showTrashCheck" style="margin-top:2px; cursor: pointer;">
                        <label for="showTrashCheck" class="text-sm font-semibold cursor-pointer text-neutral-700">Show Trash</label>
                    </div>
                </div>
                
                <button class="btn btn-sm" id="addUserBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1; padding: 6px 14px; font-weight: 500;">
                    <i class="fa-solid fa-user-plus"></i> Add New User
                </button>
            </div>

            <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: white; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Name</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Email</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Role</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Status</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Assigned Branches</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="6" class="text-center p-lg text-muted">Loading...</td></tr>
                        </tbody>
                    </table>
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
        const showTrash = document.getElementById('showTrashCheck')?.checked || false;
        const searchQuery = document.getElementById('userSearch')?.value.toLowerCase() || '';

        try {
            const res = await API.getUsers(showTrash);
            if (res.status === 'success') {
                let users = res.data;

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
        document.getElementById('addUserBtn').addEventListener('click', () => this.modals.showAddUserModal());
        document.getElementById('showTrashCheck')?.addEventListener('change', () => this.loadUsers());
        document.getElementById('userSearch')?.addEventListener('input', () => this.loadUsers());
    }
}

module.exports = UsersView;