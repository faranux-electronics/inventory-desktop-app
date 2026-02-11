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
                    <div class="flex gap-sm">
                        <div class="form-check pt-xs">
                            <input type="checkbox" id="showTrashCheck" class="form-checkbox">
                            <label for="showTrashCheck" class="text-sm select-none cursor-pointer">Show Trash</label>
                        </div>
                        <button class="btn btn-primary" id="addUserBtn">
                            <i class="fa-solid fa-user-plus"></i> Add User
                        </button>
                    </div>
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

    getBranchOptions(selected = null) {
        const options = [`<option value="">Head Office</option>`];
        this.locationsCache.forEach(l => {
            options.push(`<option value="${l.id}" ${l.id == selected ? 'selected' : ''}>${l.name}</option>`);
        });
        return options.join('');
    }

    async loadUsers() {
        const currentUser = this.state.getUser();
        const tbody = document.getElementById('usersTableBody');
        const showTrash = document.getElementById('showTrashCheck')?.checked || false;

        try {
            const res = await API.getUsers(showTrash);
            if (res.status === 'success') {
                if (res.data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-lg text-muted">No users found.</td></tr>`;
                    return;
                }

                tbody.innerHTML = res.data.map(u => {
                    const branchName = u.branch_id
                        ? (this.locationsCache.find(l => l.id == u.branch_id)?.name || 'Unknown Branch')
                        : '<span class="text-muted">Head Office</span>';

                    const isPending = u.status === 'pending';
                    const isActive = u.status === 'active';
                    const isSuspended = u.status === 'suspended';
                    const isDeleted = !!u.deleted_at;

                    let statusBadge = '';
                    if (isPending) statusBadge = '<span class="badge badge-warning ml-sm"><i class="fa-solid fa-clock"></i> Pending</span>';
                    else if (isActive) statusBadge = '<span class="badge badge-success ml-sm">Active</span>';
                    else if (isSuspended) statusBadge = '<span class="badge badge-error ml-sm">Suspended</span>';

                    return `
                    <tr class="${isPending ? 'bg-warning-50' : (isSuspended ? 'bg-error-50' : '')}">
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
                ${isPending || isSuspended ? `
                <button class="btn btn-sm btn-success btn-approve-user" 
                    data-id="${u.id}" 
                    title="Activate User">
                    <i class="fa-solid fa-check"></i>
                </button>
                ` : ''}
                
                ${isActive ? `
                <button class="btn btn-sm btn-warning btn-deactivate-user" 
                    data-id="${u.id}" 
                    title="Deactivate User">
                    <i class="fa-solid fa-ban"></i>
                </button>
                ` : ''}

                <button class="btn btn-sm btn-primary btn-edit-user"
                                    data-id="${u.id}" 
                                    data-role="${u.role}"
                                    data-branch="${u.branch_id || ''}"
                                    title="Edit Role/Branch">
                                    <i class="fa-solid fa-edit"></i>
                                </button>
                                ${isDeleted ? `
                                <button class="btn btn-sm btn-info btn-restore-user" 
                                    data-id="${u.id}" 
                                    data-name="${u.full_name || u.email}"
                                    title="Restore User">
                                    <i class="fa-solid fa-trash-arrow-up"></i>
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-error btn-delete-user" 
                                    data-id="${u.id}" 
                                    data-name="${u.full_name || u.email}"
                                    title="Move to Trash">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            `}
                            </div>
                            ` : '<span class="text-muted">—</span>'}
                        </td>
                    </tr>
                    `;
                }).join('');

                this.attachRowEvents();
            } else {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-error p-lg">Failed to load users</td></tr>`;
        }
    }

    getRoleBadge(role) {
        const map = { admin: 'badge-primary', manager: 'badge-info', cashier: 'badge-neutral' };
        return map[role] || 'badge-neutral';
    }

    attachEvents() {
        document.getElementById('addUserBtn').addEventListener('click', () => this.showAddUserModal());
        document.getElementById('showTrashCheck')?.addEventListener('change', () => {
            this.loadUsers();
        });
    }

    attachRowEvents() {
        // Approve
        document.querySelectorAll('.btn-approve-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const res = await API.approveUser(id);
                if (res.status === 'success') {
                    Toast.success("User approved");
                    this.loadUsers();
                } else {
                    Toast.error(res.message || "Approval failed");
                }
            });
        });

        // Deactivate
        document.querySelectorAll('.btn-deactivate-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                Modal.open({
                    title: "Deactivate User",
                    body: `<p>Are you sure you want to deactivate this user?</p>`,
                    confirmText: "Deactivate",
                    onConfirm: async () => {
                        const res = await API.deactivateUser(id);
                        if (res.status === 'success') {
                            Toast.success("User deactivated");
                            this.loadUsers();
                        } else {
                            Toast.error(res.message || "Failed");
                            throw new Error();
                        }
                    }
                });
            });
        });

        // Edit Role/Branch
        document.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const currentRole = btn.dataset.role;
                const currentBranch = btn.dataset.branch || '';

                Modal.open({
                    title: "Edit User",
                    body: `
                        <div class="form-group mb-md">
                            <label class="form-label">Role</label>
                            <select id="editUserRole" class="form-select">
                                <option value="cashier" ${currentRole === 'cashier' ? 'selected' : ''}>Cashier</option>
                                <option value="manager" ${currentRole === 'manager' ? 'selected' : ''}>Manager</option>
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
                        const newBranch = document.getElementById('editUserBranch').value || null;

                        const res = await API.updateUserRole(id, newRole, newBranch);

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

        // 1. RESTORE (Moved here from attachEvents)
        document.querySelectorAll('.btn-restore-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                // Ensure API.restoreUser is defined in your api.js
                const res = await API.restoreUser(id);
                if (res.status === 'success') {
                    Toast.success("User restored successfully");
                    this.loadUsers();
                } else {
                    Toast.error(res.message || "Failed to restore user");
                }
            });
        });

        // Delete
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
                    onConfirm: async () => {
                        const res = await API.deleteUser(id);
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

    showAddUserModal() {
        Modal.open({
            title: "Add New User",
            body: `
                <div class="form-group mb-md">
                    <label class="form-label">Full Name <span class="text-error">*</span></label>
                    <input type="text" id="addName" class="form-input" required>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Email <span class="text-error">*</span></label>
                    <input type="email" id="addEmail" class="form-input" required>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Password <span class="text-error">*</span></label>
                    <input type="password" id="addPass" class="form-input" required>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Role</label>
                    <select id="addRole" class="form-select">
                        <option value="cashier">Cashier</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Branch</label>
                    <select id="addBranch" class="form-select">
                        <option value="">Head Office</option>
                        ${this.locationsCache.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
                    </select>
                </div>
            `,
            confirmText: "Create User",
            onConfirm: async () => {
                const name = document.getElementById('addName').value.trim();
                const email = document.getElementById('addEmail').value.trim();
                const pass = document.getElementById('addPass').value;
                const role = document.getElementById('addRole').value;
                const branch = document.getElementById('addBranch').value || null;

                if (!name || !email || !pass) {
                    Toast.error("Name, email and password are required");
                    throw new Error("Validation");
                }

                const res = await API.registerUser({
                    full_name: name,
                    email,
                    password: pass,
                    role,
                    branch_id: branch
                });

                if (res.status === 'success') {
                    Toast.success("User created successfully");
                    this.loadUsers();
                } else {
                    Toast.error(res.message || "Failed to create user");
                    throw new Error(res.message);
                }
            }
        });
    }
}

module.exports = UsersView;