const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class UsersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
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
                                <th>Role</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            <tr><td colspan="4" class="text-center p-lg">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.loadUsers();
        this.attachEvents();
    }

    async loadUsers() {
        const currentUser = this.state.getUser();
        const tbody = document.getElementById('usersTableBody');

        try {
            const res = await API.getUsers(currentUser.role);
            if(res.status === 'success') {
                tbody.innerHTML = res.data.map(u => `
                    <tr>
                        <td><span class="font-semibold">${u.full_name || u.name || 'No Name'}</span></td>
                        <td>${u.email}</td>
                        <td><span class="badge ${this.getRoleBadge(u.role)}">${u.role.toUpperCase()}</span></td>
                        <td>
                            ${currentUser.id !== u.id ? `
                            <div class="flex gap-sm">
                                <button class="btn btn-sm btn-secondary btn-edit-role" data-id="${u.id}" data-role="${u.role}" title="Change Role">
                                    <i class="fa-solid fa-user-tag"></i>
                                </button>
                                <button class="btn btn-sm btn-danger btn-delete-user" data-id="${u.id}" data-name="${u.full_name || u.email}" title="Delete User">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            ` : '<span class="text-muted text-xs">It\'s You</span>'}
                        </td>
                    </tr>
                `).join('');

                this.attachItemEvents();
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-error p-lg">Failed to load users</td></tr>`;
        }
    }

    getRoleBadge(role) {
        if(role === 'admin') return 'badge-error';
        if(role === 'manager') return 'badge-warning';
        if(role === 'cashier') return 'badge-success';
        return 'badge-neutral';
    }

    attachEvents() {
        document.getElementById('addUserBtn').addEventListener('click', () => {
            Modal.open({
                title: "Add New User",
                body: `
                    <div class="form-group mb-md">
                        <label class="form-label">Full Name</label>
                        <input type="text" id="newUserName" class="form-input">
                    </div>
                    <div class="form-group mb-md">
                        <label class="form-label">Email</label>
                        <input type="email" id="newUserEmail" class="form-input">
                    </div>
                    <div class="form-group mb-md">
                        <label class="form-label">Password</label>
                        <input type="password" id="newUserPass" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Role</label>
                        <select id="newUserRole" class="form-select">
                            <option value="cashier">Cashier</option>
                            <option value="manager">Manager</option>
                            <option value="accountant">Accountant</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                `,
                confirmText: "Create User",
                onConfirm: async () => {
                    const name = document.getElementById('newUserName').value;
                    const email = document.getElementById('newUserEmail').value;
                    const password = document.getElementById('newUserPass').value;
                    const role = document.getElementById('newUserRole').value;

                    if(!name || !email || !password) {
                        Toast.error("All fields are required");
                        throw new Error("Validation Error");
                    }

                    const res = await API.registerUser({ name, email, password, role }, this.state.getUser().role);
                    if(res.status === 'success') {
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
        // Edit Role
        document.querySelectorAll('.btn-edit-role').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const currentRole = btn.dataset.role;

                Modal.open({
                    title: "Change User Role",
                    body: `
                        <div class="form-group">
                            <label class="form-label">Select New Role</label>
                            <select id="editUserRole" class="form-select">
                                <option value="cashier" ${currentRole === 'cashier' ? 'selected' : ''}>Cashier</option>
                                <option value="manager" ${currentRole === 'manager' ? 'selected' : ''}>Manager</option>
                                <option value="accountant" ${currentRole === 'accountant' ? 'selected' : ''}>Accountant</option>
                                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                    `,
                    confirmText: "Update Role",
                    onConfirm: async () => {
                        const newRole = document.getElementById('editUserRole').value;
                        const res = await API.updateUserRole(id, newRole, this.state.getUser().role);
                        if(res.status === 'success') {
                            Toast.success("Role updated");
                            this.loadUsers();
                        } else {
                            Toast.error(res.message);
                        }
                    }
                });
            });
        });

        // Delete User (Using Modal now)
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
                        if(res.status === 'success') {
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