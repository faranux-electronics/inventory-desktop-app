const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const UserTable = require('./components/UserTable.js');
const UserModals = require('./components/UserModals.js');

class UsersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
        this.tableComponent = new UserTable(this);
        this.modals = new UserModals(this);
        this.currentTab = 'active'; // Default tab
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row">
                    <h1 class="page-title text-neutral-800 font-normal">User Management</h1>
                </div>
            </div>

            <div class="tabs mb-md" style="display: flex; gap: 16px; border-bottom: 1px solid #c3c4c7; padding-bottom: 0;">
                <button class="tab-btn active" data-tab="active" style="padding: 8px 16px; border: none; background: none; border-bottom: 2px solid #2271b1; color: #2271b1; font-weight: 600; cursor: pointer; transition: all 0.2s;">Active Users</button>
                <button class="tab-btn" data-tab="trash" style="padding: 8px 16px; border: none; background: none; border-bottom: 2px solid transparent; color: #50575e; font-weight: 600; cursor: pointer; transition: all 0.2s;">Trash</button>
            </div>

            <div class="flex items-center gap-sm mb-md p-sm justify-between" style="background: #f8f9fa; border: 1px solid #c3c4c7; border-radius: 4px; flex-wrap: wrap;">
                <div class="search-box" style="min-width: 280px; position: relative;">
                    <i class="fa-solid fa-search" style="font-size: 13px; color: #8c8f94; position: absolute; left: 10px; top: 50%; transform: translateY(-50%);"></i>
                    <input type="text" id="userSearch" class="search-input form-input-sm w-full" 
                           style="background: white; padding-left: 32px; border-color: #8c8f94;" 
                           placeholder="Search by name or email...">
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
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7; text-align: left;">Name</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7; text-align: left;">Email</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7; text-align: left;">Role</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7; text-align: left;">Status</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7; text-align: left;">Assigned Branches</th>
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
        const searchQuery = document.getElementById('userSearch')?.value.toLowerCase() || '';

        try {
            // Always fetch with trash=true so we can filter locally without extra API logic changes
            const res = await API.getUsers(true);
            if (res.status === 'success') {
                let users = res.data;

                // Tab Filtering
                if (this.currentTab === 'trash') {
                    users = users.filter(u => u.deleted_at !== null); // Show ONLY trashed
                } else {
                    users = users.filter(u => u.deleted_at === null); // Show ONLY active
                }

                // Search Filtering
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
        document.getElementById('userSearch')?.addEventListener('input', () => this.loadUsers());

        // Tab Switching Logic
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Reset styles for all tabs
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.style.borderBottomColor = 'transparent';
                    b.style.color = '#50575e';
                    b.classList.remove('active');
                });

                // Activate clicked tab
                e.target.style.borderBottomColor = '#2271b1';
                e.target.style.color = '#2271b1';
                e.target.classList.add('active');

                // Update state and reload table
                this.currentTab = e.target.dataset.tab;

                // Hide 'Add User' button if in trash view (optional, but good UX)
                document.getElementById('addUserBtn').style.display = this.currentTab === 'trash' ? 'none' : 'block';

                this.loadUsers();
            });
        });
    }
}

module.exports = UsersView;