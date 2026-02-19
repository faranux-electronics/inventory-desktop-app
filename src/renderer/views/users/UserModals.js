const Toast = require('../../components/Toast.js');
const Modal = require('../../components/Modal.js');
const API = require('../../services/api.js');

class UserModals {
    constructor(parentView) {
        this.parent = parentView; // Reference to main view to call this.parent.loadUsers()
    }

    // Helper to generate branch checkboxes for Add/Edit modals
    getBranchCheckboxes(selected = []) {
        if (!Array.isArray(selected)) {
            try { selected = JSON.parse(selected || '[]'); } catch (e) { selected = []; }
        }
        if (this.parent.locationsCache.length === 0) return '<p class="text-sm text-muted">No branches available</p>';

        return `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${this.parent.locationsCache.map(l => `
                <label class="flex items-center gap-sm cursor-pointer border border-neutral-200 p-sm rounded hover:bg-neutral-50 transition-colors" style="margin:0;">
                    <input type="checkbox" class="branch-checkbox" value="${l.id}" ${selected.includes(l.id) || selected.includes(String(l.id)) ? 'checked' : ''}>
                    <span class="text-sm font-semibold text-neutral-700">${l.name}</span>
                </label>
            `).join('')}
        </div>`;
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

                if (!name) { Toast.error("Please enter the user's full name."); throw new Error("Validation Failed"); }
                if (!email) { Toast.error("Email address is required."); throw new Error("Validation Failed"); }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) { Toast.error("Please enter a valid email address."); throw new Error("Validation Failed"); }

                if (!pass || pass.length < 4) { Toast.error("Password must be at least 4 characters long."); throw new Error("Validation Failed"); }

                if (role !== 'admin' && newBranches.length === 0) {
                    Toast.warning("Don't forget to assign at least one branch to this user.");
                }

                try {
                    const res = await API.registerUser({
                        full_name: name, email, password: pass, role, allowed_branches: newBranches
                    });

                    if (res.status === 'success') {
                        Toast.success("User created successfully!");
                        this.parent.loadUsers();
                    } else {
                        Toast.error(res.message || "Failed to create user");
                        throw new Error(res.message);
                    }
                } catch (err) {
                    if (err.message !== "Validation Failed") { Toast.error("An unexpected error occurred."); }
                    throw err;
                }
            }
        });
    }

    showEditUserModal(id, currentName, currentEmail, currentRole, allowed) {
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
                    this.parent.loadUsers();
                } else {
                    Toast.error(res.message);
                    throw new Error(res.message);
                }
            }
        });
    }

    showResetPasswordModal(id, name) {
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
    }

    async handleApprove(id) {
        const res = await API.approveUser(id);
        if (res.status === 'success') { Toast.success("User activated"); this.parent.loadUsers(); }
    }

    async handleDeactivate(id) {
        Modal.open({
            title: "Deactivate User",
            body: `<p>Are you sure you want to deactivate this user?</p>`,
            confirmText: "Deactivate",
            onConfirm: async () => {
                const res = await API.deactivateUser(id);
                if (res.status === 'success') { Toast.success("User deactivated"); this.parent.loadUsers(); }
            }
        });
    }

    async handleRestore(id) {
        const res = await API.restoreUser(id);
        if (res.status === 'success') { Toast.success("User restored"); this.parent.loadUsers(); }
    }

    async handleDelete(id, name) {
        Modal.open({
            title: "Delete User",
            body: `<p>Are you sure you want to delete <b>${name}</b>?</p>`,
            confirmText: "Delete",
            onConfirm: async () => {
                const res = await API.deleteUser(id);
                if (res.status === 'success') { Toast.success("User deleted"); this.parent.loadUsers(); }
            }
        });
    }
}

module.exports = UserModals;