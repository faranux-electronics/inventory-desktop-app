const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class UsersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header">
                <div class="header-row">
                    <h1 class="page-title">User Management</h1>
                    <button class="btn btn-primary" id="addUserBtn">
                        <i class="fa-solid fa-user-plus"></i> Add User
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role & Status</th>
                                <th>Assigned Branch</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="5" class="text-center p-lg text-muted">Loading...</td></tr>
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

        try {
            const res = await API.getUsers(currentUser.role);
            if (res.status === 'success') {
                if (res.data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-lg text-muted">No users found.</td></tr>`;
                    return;
                }

                tbody.innerHTML = res.data.map(u => {
                    // Map Branch ID to Name
                    const branchName = u.branch_id
                        ? (this.locationsCache.find(l => l.id == u.branch_id)?.name || 'Unknown Branch')
                        : '<span class="text-muted">Head Office</span>';

                    // Check Status
                    const isPending = u.status === 'pending';
                    const statusBadge = isPending
                        ? '<span class="badge badge-warning ml-sm"><i class="fa-solid fa-clock"></i> Pending</span>'
                        : '<span class="badge badge-success ml-sm">Active</span>';

                    return `
                    <tr class="${isPending ? 'bg-warning-50' : ''}">
                        <td>
                            <div class="font-semibold">${u.full_name || u.name || 'No Name'}</div>
                        </td>
                        <td>${u.email}</td>
                        <td>
                            <span class="badge ${this.getRoleBadge(u.role)}">${u.role.toUpperCase()}</span>
                            ${statusBadge}
                        </td>
                        <td>${branchName}</td>
                        <td>
                            ${currentUser.id !== u.id ? `
                            <div class="flex gap-sm">
                                ${isPending ? `
                                <button class="btn btn-sm btn-success btn-approve-user" 
                                    data-id="${u.id}" 
                                    title="Approve User">
                                    <i class="fa-solid fa-check"></i> Approve
                                </button>
                                ` : ''}

                                <button class="btn btn-sm btn-secondary btn-edit-user" 
                                    data-id="${u.id}" 
                                    data-role="${u.role}" 
                                    data-branch="${u.branch_id || ''}"
                                    title="Edit User">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button class="btn btn-sm btn-danger btn-delete-user" 
                                    data-id="${u.id}" 
                                    data-name="${u.full_name || u.email}" 
                                    title="Delete User">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            ` : '<span class="badge badge-neutral">You</span>'}
                        </td>
                    </tr>
                `}).join('');

                this.attachItemEvents();
            } else {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-error p-lg">Failed to load users</td></tr>`;
        }
    }

    getRoleBadge(role) {
        if (role === 'admin') return 'badge-error';
        if (role === 'manager') return 'badge-warning';
        if (role === 'cashier') return 'badge-success';
        return 'badge-neutral';
    }

    getBranchOptions(selectedId) {
        let html = `<option value="" ${!selectedId ? 'selected' : ''}>-- Head Office / None --</option>`;
        this.locationsCache.forEach(loc => {
            const isSel = loc.id == selectedId ? 'selected' : '';
            html += `<option value="${loc.id}" ${isSel}>${loc.name}</option>`;
        });
        return html;
    }

    attachEvents() {
        document.getElementById('addUserBtn').addEventListener('click', () => {
            Modal.open({
                title: "Add New User",
                body: `
                    <div class="form-group mb-md">
                        <label class="form-label">Full Name</label>
                        <input type="text" id="newUserName" class="form-input" placeholder="e.g. John Doe">
                    </div>
                    <div class="form-group mb-md">
                        <label class="form-label">Email</label>
                        <input type="email" id="newUserEmail" class="form-input" placeholder="john@example.com">
                    </div>
                    <div class="form-group mb-md">
                        <label class="form-label">Password</label>
                        <input type="password" id="newUserPass" class="form-input" placeholder="******">
                    </div>
                    <div class="row flex gap-md">
                        <div class="form-group flex-1">
                            <label class="form-label">Role</label>
                            <select id="newUserRole" class="form-select">
                                <option value="cashier">Cashier</option>
                                <option value="manager">Manager</option>
                                <option value="accountant">Accountant</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div class="form-group flex-1">
                            <label class="form-label">Assigned Branch</label>
                            <select id="newUserBranch" class="form-select">
                                ${this.getBranchOptions()}
                            </select>
                        </div>
                    </div>
                `,
                confirmText: "Create User",
                onConfirm: async () => {
                    const name = document.getElementById('newUserName').value;
                    const email = document.getElementById('newUserEmail').value;
                    const password = document.getElementById('newUserPass').value;
                    const role = document.getElementById('newUserRole').value;
                    const branch_id = document.getElementById('newUserBranch').value;

                    if (!name || !email || !password) {
                        Toast.error("All fields are required");
                        throw new Error("Validation Error");
                    }

                    const res = await API.registerUser({ name, email, password, role, branch_id }, this.state.getUser().role);
                    if (res.status === 'success') {
                        Toast.success("User created successfully");
                        this.loadUsers();
                    } else {
                        Toast.error(res.message);
                        throw new Error(res.message);
                    }
                }
            });
        });
    }

    attachItemEvents() {
        // 1. Approve User
        document.querySelectorAll('.btn-approve-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                try {
                    const res = await API.approveUser(id, this.state.getUser().role);
                    if (res.status === 'success') {
                        Toast.success("User approved successfully!");
                        this.loadUsers();
                    } else {
                        Toast.error(res.message || "Approval failed");
                    }
                } catch (e) {
                    Toast.error("Network error during approval");
                }
            });
        });

        // 2. Edit User
        document.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const currentRole = btn.dataset.role;
                const currentBranch = btn.dataset.branch;

                Modal.open({
                    title: "Edit User",
                    body: `
                        <div class="form-group mb-md">
                            <label class="form-label">Role</label>
                            <select id="editUserRole" class="form-select">
                                <option value="cashier" ${currentRole === 'cashier' ? 'selected' : ''}>Cashier</option>
                                <option value="manager" ${currentRole === 'manager' ? 'selected' : ''}>Manager</option>
                                <option value="accountant" ${currentRole === 'accountant' ? 'selected' : ''}>Accountant</option>
                                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Assigned Branch</label>
                            <select id="editUserBranch" class="form-select">
                                ${this.getBranchOptions(currentBranch)}
                            </select>
                        </div>
                    `,
                    confirmText: "Update User",
                    onConfirm: async () => {
                        const newRole = document.getElementById('editUserRole').value;
                        const newBranch = document.getElementById('editUserBranch').value;

                        const res = await API.updateUserRole(id, newRole, this.state.getUser().role, newBranch);

                        if (res.status === 'success') {
                            Toast.success("User updated");
                            this.loadUsers();
                        } else {
                            Toast.error(res.message);
                            throw new Error(res.message);
                        }
                    }
                });
            });
        });

        // 3. Delete User
        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = btn.dataset.name;
                const id = btn.dataset.id;

                Modal.open({
                    title: "Delete User",
                    body: `
                        <div class="text-center">
                            <i class="fa-solid fa-triangle-exclamation text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                            <p class="text-neutral-700 mb-sm">Are you sure you want to delete <b>${name}</b>?</p>
                            <p class="text-xs text-muted">This action cannot be undone.</p>
                        </div>
                    `,
                    confirmText: "Delete",
                    cancelText: "Cancel",
                    onConfirm: async () => {
                        const res = await API.deleteUser(id, this.state.getUser().role);
                        if (res.status === 'success') {
                            Toast.success("User deleted");
                            this.loadUsers();
                        } else {
                            Toast.error(res.message);
                            throw new Error(res.message);
                        }
                    }
                });
            });
        });
    }
}

module.exports = UsersView;