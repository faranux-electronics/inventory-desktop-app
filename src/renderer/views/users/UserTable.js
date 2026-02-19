const UserModals = require('./UserModals.js');

class UserTable {
    constructor(parentView) {
        this.parent = parentView;
        this.modals = new UserModals(parentView);
    }

    render(users, currentUser) {
        const tbody = document.getElementById('usersTableBody');

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center p-lg text-muted" style="background: #f9f9f9;">No users found.</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            let branchNames = '<span class="text-muted italic">Global / None</span>';
            if (u.allowed_branches && u.allowed_branches.length > 0) {
                branchNames = u.allowed_branches.map(id => {
                    return this.parent.locationsCache.find(l => String(l.id) === String(id))?.name || `Branch #${id}`;
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
                            <button class="btn btn-sm btn-ghost btn-edit-user" data-id="${u.id}" data-name="${u.name}" data-email="${u.email}" data-role="${u.role}" data-allowed='${JSON.stringify(u.allowed_branches || [])}' title="Edit Access" style="padding: 4px 8px; color: #2271b1; border-color: transparent;">
                                <i class="fa-solid fa-edit"></i>
                            </button>
                            ${isDeleted ? `<button class="btn btn-sm btn-ghost btn-restore-user" data-id="${u.id}" title="Restore" style="padding: 4px 8px; color: #2271b1; border-color: transparent;"><i class="fa-solid fa-trash-arrow-up"></i></button>`
                : `<button class="btn btn-sm btn-ghost btn-delete-user" data-id="${u.id}" data-name="${u.name}" title="Trash" style="padding: 4px 8px; color: #d63638; border-color: transparent;"><i class="fa-solid fa-trash"></i></button>`}
                        </div>
                    ` : '<span class="text-muted italic text-xs">You</span>'}
                </td>
            </tr>
            `;
        }).join('');

        this.attachRowEvents();
    }

    attachRowEvents() {
        document.querySelectorAll('.btn-approve-user').forEach(btn => btn.addEventListener('click', () => this.modals.handleApprove(btn.dataset.id)));
        document.querySelectorAll('.btn-deactivate-user').forEach(btn => btn.addEventListener('click', () => this.modals.handleDeactivate(btn.dataset.id)));
        document.querySelectorAll('.btn-restore-user').forEach(btn => btn.addEventListener('click', () => this.modals.handleRestore(btn.dataset.id)));
        document.querySelectorAll('.btn-delete-user').forEach(btn => btn.addEventListener('click', () => this.modals.handleDelete(btn.dataset.id, btn.dataset.name)));

        document.querySelectorAll('.btn-reset-pass').forEach(btn => {
            btn.addEventListener('click', () => this.modals.showResetPasswordModal(btn.dataset.id, btn.dataset.name));
        });

        document.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const allowed = JSON.parse(btn.dataset.allowed || '[]');
                this.modals.showEditUserModal(btn.dataset.id, btn.dataset.name, btn.dataset.email, btn.dataset.role, allowed);
            });
        });
    }
}

module.exports = UserTable;