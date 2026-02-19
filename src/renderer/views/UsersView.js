const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class UsersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
    }

    //
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

                if (users.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" class="text-center p-lg text-muted" style="background: #f9f9f9;">No users found.</td></tr>`;
                    return;
                }

                tbody.innerHTML = users.map(u => {
                    let branchNames = '<span class="text-muted italic">Global / None</span>';
                    if (u.allowed_branches && u.allowed_branches.length > 0) {
                        branchNames = u.allowed_branches.map(id => {
                            return this.locationsCache.find(l => String(l.id) === String(id))?.name || `Branch #${id}`;
                        }).join(', ');
                    }

                    const isPending = u.status === 'pending';
                    const isSuspended = u.status === 'suspended';
                    const isDeleted = !!u.deleted_at;

                    // Role color logic
                    let roleColor = u.role === 'admin' ? '#2271b1' : (u.role === 'manager' ? '#00a32a' : '#50575e');

                    // Status Badge Styling
                    let statusStyle = '';
                    if (u.status === 'active') {
                        statusStyle = 'background: #e2e8f0; color: #334155;';
                    } else if (isPending) {
                        statusStyle = 'background: #fef3c7; color: #b45309;';
                    } else if (isSuspended) {
                        statusStyle = 'background: #fee2e2; color: #b91c1c;';
                    }

                    return `
                    <tr class="hover:bg-neutral-50 transition-colors" style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                        <td style="padding: 12px;">
                            <div style="color: #2271b1; font-weight: 600;">${u.name || 'No Name'}</div>
                        </td>
                        <td style="padding: 12px; color: #50575e;">${u.email}</td>
                        <td style="padding: 12px;">
                            <span style="color: ${roleColor}; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.02em;">${u.role}</span>
                        </td>
                        <td style="padding: 12px;">
                            <span style="${statusStyle} padding: 4px 10px; border-radius: 4px; font-weight: 500; font-size: 12px;">
                                ${u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                            </span>
                        </td>
                        <td style="padding: 12px; color: #50575e; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${branchNames}">
                            ${branchNames}
                        </td>
                        <td style="padding: 12px;" class="text-right">
                            ${currentUser.id !== u.id ? `
                                <div class="flex gap-xs justify-end items-center">
                                <button class="btn btn-sm btn-ghost btn-reset-pass" data-id="${u.id}" data-name="${u.name}" title="Reset Password" style="padding: 4px 8px; color: #dba617; border-color: transparent;">
        <i class="fa-solid fa-key"></i>
    </button>
                                    ${isPending || isSuspended ? `<button class="btn btn-sm btn-ghost btn-approve-user" data-id="${u.id}" title="Activate" style="padding: 4px 8px; color: #00a32a; border-color: transparent;"><i class="fa-solid fa-check"></i></button>` : ''}
                                    ${u.status === 'active' ? `<button class="btn btn-sm btn-ghost btn-deactivate-user" data-id="${u.id}" title="Suspend" style="padding: 4px 8px; color: #dba617; border-color: transparent;"><i class="fa-solid fa-ban"></i></button>` : ''}
                                    <button class="btn btn-sm btn-ghost btn-edit-user" data-id="${u.id}"  data-name="${u.name}" 
    data-email="${u.email}" data-role="${u.role}" data-allowed='${JSON.stringify(u.allowed_branches || [])}' title="Edit Access" style="padding: 4px 8px; color: #2271b1; border-color: transparent;"><i class="fa-solid fa-edit"></i></button>
                                    ${isDeleted ? `<button class="btn btn-sm btn-ghost btn-restore-user" data-id="${u.id}" title="Restore" style="padding: 4px 8px; color: #2271b1; border-color: transparent;"><i class="fa-solid fa-trash-arrow-up"></i></button>`
                        : `<button class="btn btn-sm btn-ghost btn-delete-user" data-id="${u.id}" data-name="${u.name}" title="Trash" style="padding: 4px 8px; color: #d63638; border-color: transparent;"><i class="fa-solid fa-trash"></i></button>`}
                                </div>
                            ` : '<span class="text-muted italic text-xs">You</span>'}
                        </td>
                    </tr>
                    `;
                }).join('');

                this.attachRowEvents();
            } else {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error p-lg">Failed to load users</td></tr>`;
        }
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

    // Generates a grid of checkboxes for multi-select branches
    getBranchCheckboxes(selected = []) {
        if (!Array.isArray(selected)) {
            try { selected = JSON.parse(selected || '[]'); } catch (e) { selected = []; }
        }
        if (this.locationsCache.length === 0) return '<p class="text-sm text-muted">No branches available</p>';

        return `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${this.locationsCache.map(l => `
                <label class="flex items-center gap-sm cursor-pointer border border-neutral-200 p-sm rounded hover:bg-neutral-50 transition-colors" style="margin:0;">
                    <input type="checkbox" class="branch-checkbox" value="${l.id}" ${selected.includes(l.id) || selected.includes(String(l.id)) ? 'checked' : ''}>
                    <span class="text-sm font-semibold text-neutral-700">${l.name}</span>
                </label>
            `).join('')}
        </div>`;
    }

    attachEvents() {
        document.getElementById('addUserBtn').addEventListener('click', () => this.showAddUserModal());
        document.getElementById('showTrashCheck')?.addEventListener('change', () => this.loadUsers());
        document.getElementById('userSearch')?.addEventListener('input', () => this.loadUsers());
    }

    attachRowEvents() {
        document.querySelectorAll('.btn-approve-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res = await API.approveUser(btn.dataset.id);
                if (res.status === 'success') { Toast.success("User activated"); this.loadUsers(); }
            });
        });


        document.querySelectorAll('.btn-reset-pass').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;

                Modal.open({
                    title: `Reset Password: ${name}`,
                    size: 'sm',
                    body: `
                        <div class="form-group">
                            <label class="form-label">New Password</label>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="newPassInput" class="form-input" placeholder="Enter new password" style="flex: 1;">
                                <button class="btn btn-ghost" id="genPassBtn" title="Generate Random">
                                    <i class="fa-solid fa-wand-sparkles"></i>
                                </button>
                            </div>
                        </div>
                        <p class="text-xs text-muted mt-md">This will instantly change the user's password. They must use the new one to log in immediately.</p>
                    `,
                    confirmText: "Change Password",
                    onConfirm: async () => {
                        const newPass = document.getElementById('newPassInput').value.trim();
                        if (!newPass || newPass.length < 4) {
                            Toast.error("Password must be at least 4 characters");
                            throw new Error("Validation");
                        }

                        const res = await API.regeneratePassword(id, newPass);
                        if (res.status === 'success') {
                            Toast.success(`Password for ${name} has been updated.`);
                        } else {
                            Toast.error(res.message);
                            throw new Error(res.message);
                        }
                    }
                });

                // Helper to generate a random password
                document.getElementById('genPassBtn').addEventListener('click', () => {
                    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
                    let pass = "";
                    for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                    document.getElementById('newPassInput').value = pass;
                });
            });
        });

        document.querySelectorAll('.btn-deactivate-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                Modal.open({
                    title: "Deactivate User",
                    body: `<p>Are you sure you want to deactivate this user?</p>`,
                    confirmText: "Deactivate",
                    onConfirm: async () => {
                        const res = await API.deactivateUser(btn.dataset.id);
                        if (res.status === 'success') { Toast.success("User deactivated"); this.loadUsers(); }
                    }
                });
            });
        });

        document.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const currentName = btn.dataset.name;
                const currentEmail = btn.dataset.email;
                const currentRole = btn.dataset.role;
                const allowed = JSON.parse(btn.dataset.allowed || '[]');

                Modal.open({
                    title: "Edit User Account",
                    size: 'md',
                    body: `
                        <div class="form-group mb-md">
                            <label class="form-label">Full Name</label>
                            <input type="text" id="editUserName" class="form-input" value="${currentName}">
                        </div>
                        <div class="form-group mb-md">
                            <label class="form-label">Email Address</label>
                            <input type="email" id="editUserEmail" class="form-input" value="${currentEmail}">
                        </div>
                        <div class="form-group mb-md">
                            <label class="form-label">System Role</label>
                            <select id="editUserRole" class="form-select">
                                <option value="cashier" ${currentRole === 'cashier' ? 'selected' : ''}>Cashier</option>
                                <option value="manager" ${currentRole === 'manager' ? 'selected' : ''}>Manager</option>
                                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label mb-sm block">Permitted Branches</label>
                            <div class="bg-neutral-50 p-sm rounded border border-neutral-200">
                                ${this.getBranchCheckboxes(allowed)}
                            </div>
                        </div>
                    `,
                    confirmText: "Save Changes",
                    onConfirm: async () => {
                        const newName = document.getElementById('editUserName').value.trim();
                        const newEmail = document.getElementById('editUserEmail').value.trim();
                        const newRole = document.getElementById('editUserRole').value;
                        const newBranches = Array.from(document.querySelectorAll('.branch-checkbox:checked')).map(cb => cb.value);

                        if (!newName || !newEmail) {
                            Toast.error("Name and Email are required");
                            throw new Error("Validation Failed");
                        }

                        const res = await API.updateUserRole(id, newRole, newBranches, newName, newEmail);
                        if (res.status === 'success') {
                            Toast.success("User updated successfully");
                            this.loadUsers();
                        } else {
                            Toast.error(res.message);
                            throw new Error(res.message);
                        }
                    }
                });
            });
        });

        document.querySelectorAll('.btn-restore-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res = await API.restoreUser(btn.dataset.id);
                if (res.status === 'success') { Toast.success("User restored"); this.loadUsers(); }
            });
        });

        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                Modal.open({
                    title: "Delete User",
                    body: `<p>Are you sure you want to delete <b>${btn.dataset.name}</b>?</p>`,
                    confirmText: "Delete",
                    onConfirm: async () => {
                        const res = await API.deleteUser(btn.dataset.id);
                        if (res.status === 'success') { Toast.success("User deleted"); this.loadUsers(); }
                    }
                });
            });
        });
    }

    showAddUserModal() {
        Modal.open({
            title: "Add New User",
            size: 'md',
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
                    <label class="form-label mb-sm block">Permitted Branches</label>
                    <div class="bg-neutral-50 p-sm rounded border border-neutral-200" style="max-height: 200px; overflow-y: auto;">
                        ${this.getBranchCheckboxes([])}
                    </div>
                </div>
            `,
            confirmText: "Create User",
            onConfirm: async () => {
                const name = document.getElementById('addName').value.trim();
                const email = document.getElementById('addEmail').value.trim();
                const pass = document.getElementById('addPass').value;
                const role = document.getElementById('addRole').value;
                const newBranches = Array.from(document.querySelectorAll('.branch-checkbox:checked')).map(cb => cb.value);

                // --- DATA VALIDATION ---

                if (!name) {
                    Toast.error("Please enter the user's full name.");
                    throw new Error("Validation Failed");
                }

                if (!email) {
                    Toast.error("Email address is required.");
                    throw new Error("Validation Failed");
                }

                // Email format validation (Regex)
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    Toast.error("Please enter a valid email address.");
                    throw new Error("Validation Failed");
                }

                if (!pass || pass.length < 4) {
                    Toast.error("Password must be at least 4 characters long.");
                    throw new Error("Validation Failed");
                }

                if (role !== 'admin' && newBranches.length === 0) {
                    Toast.warning("Don't forget to assign at least one branch to this user.");
                    // We don't throw an error here, just a warning, unless you want it strictly required.
                }

                // --- API SUBMISSION ---
                try {
                    const res = await API.registerUser({
                        full_name: name,
                        email,
                        password: pass,
                        role,
                        allowed_branches: newBranches
                    });

                    if (res.status === 'success') {
                        Toast.success("User created successfully!");
                        this.loadUsers();
                    } else {
                        Toast.error(res.message || "Failed to create user");
                        throw new Error(res.message);
                    }
                } catch (err) {
                    if (err.message !== "Validation Failed") {
                        console.error(err);
                        Toast.error("An unexpected error occurred.");
                    }
                    throw err; // Keep modal open on failure
                }
            }
        });
    }
}

module.exports = UsersView;