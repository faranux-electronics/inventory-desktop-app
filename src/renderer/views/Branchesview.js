const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class BranchesView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        // Restore previous tab state if exists
        const savedState = this.state.getTabState('branches');
        if (savedState) {
            this.currentTab = savedState.currentTab || 'active';
        } else {
            this.currentTab = 'active';
        }
    }

    saveState() {
        this.state.saveTabState('branches', {
            currentTab: this.currentTab
        });
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row mb-sm" style="display: flex; justify-content: flex-start; align-items: center; gap: 15px;">
                    <h1 class="page-title text-neutral-800 font-normal" style="font-size: 23px; margin: 0;">Branches</h1>
                    <button class="btn btn-sm" id="addBranchBtn" style="border: 1px solid #2271b1; color: #2271b1; background: white; padding: 4px 12px; font-weight: 500; border-radius: 3px;">
                        Add New
                    </button>
                </div>

                <div class="tabs" style="border-bottom: 1px solid #c3c4c7;">
                    <button class="tab-btn ${this.currentTab === 'active' ? 'active' : ''}" data-tab="active" style="padding: 8px 16px; font-weight: 500; font-size: 13px;">
                        Active
                    </button>
                    <button class="tab-btn ${this.currentTab === 'trash' ? 'active' : ''}" data-tab="trash" style="padding: 8px 16px; font-weight: 500; font-size: 13px;">
                        Trash
                    </button>
                </div>
            </div>

            <div id="branchesContent" style="margin-top: 15px;"></div>
        `;

        this.attachEvents();
        this.loadBranches();
    }

    attachEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.saveState();
                this.loadBranches();
            });
        });

        document.getElementById('addBranchBtn')?.addEventListener('click', () => {
            this.showAddBranchModal();
        });
    }

    async loadBranches() {
        const container = document.getElementById('branchesContent');
        if (!container) return;

        container.innerHTML = '<div style="padding: 40px; text-align: center; color: #646970;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        try {
            if (this.currentTab === 'active') {
                await this.loadActiveBranches();
            } else {
                await this.loadTrashedBranches();
            }
        } catch (e) {
            console.error(e);
            container.innerHTML = '<div style="padding: 40px; text-align: center; color: #d63638;">Failed to load branches</div>';
        }
    }

    async loadActiveBranches() {
        const container = document.getElementById('branchesContent');
        const res = await API.getLocations();

        if (res.status === 'success') {
            const branches = res.data || [];

            if (branches.length === 0) {
                container.innerHTML = '<div style="padding: 40px; text-align: center; background: white; border: 1px solid #c3c4c7; color: #646970;">No branches found</div>';
                return;
            }

            const html = `
                <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                        <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600; width: 80px;">ID</th>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600;">Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${branches.map(b => `
                                <tr class="hover:bg-neutral-50" style="border-bottom: 1px solid #f0f0f1;">
                                    <td style="padding: 12px 16px; color: #50575e; font-family: monospace;">#${b.id}</td>
                                    <td style="padding: 12px 16px; vertical-align: top;">
                                        <div style="font-weight: 600; color: #2271b1; font-size: 14px; margin-bottom: 4px;">
                                            ${b.name}
                                        </div>
                                        <div class="row-actions" style="font-size: 12px;">
                                            <button class="btn-edit" style="background: none; border: none; padding: 0; color: #2271b1; cursor: pointer; text-decoration: none;" data-id="${b.id}" data-name="${b.name.replace(/"/g, '&quot;')}">Edit</button>
                                            <span style="color: #a7aaad; margin: 0 4px;">|</span>
                                            <button class="btn-delete" style="background: none; border: none; padding: 0; color: #b32d2e; cursor: pointer; text-decoration: none;" data-id="${b.id}" data-name="${b.name.replace(/"/g, '&quot;')}">Trash</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            container.innerHTML = html;
            this.attachItemEvents();
        } else {
            container.innerHTML = `<div style="padding: 40px; text-align: center; color: #d63638;">${res.message}</div>`;
        }
    }

    async loadTrashedBranches() {
        const container = document.getElementById('branchesContent');
        const res = await API.getTrashedLocations();

        if (res.status === 'success') {
            const branches = res.data || [];

            if (branches.length === 0) {
                container.innerHTML = '<div style="padding: 40px; text-align: center; background: white; border: 1px solid #c3c4c7; color: #646970;">Trash is empty</div>';
                return;
            }

            const html = `
                <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                        <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600; width: 80px;">ID</th>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600;">Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${branches.map(b => `
                                <tr style="border-bottom: 1px solid #f0f0f1; background: #fafafa;">
                                    <td style="padding: 12px 16px; color: #a7aaad; font-family: monospace;">#${b.id}</td>
                                    <td style="padding: 12px 16px; vertical-align: top;">
                                        <div style="font-weight: 600; color: #50575e; font-size: 14px; margin-bottom: 4px; text-decoration: line-through;">
                                            ${b.name}
                                        </div>
                                        <div class="row-actions" style="font-size: 12px;">
                                            <button class="btn-restore" style="background: none; border: none; padding: 0; color: #2271b1; cursor: pointer; text-decoration: none;" data-id="${b.id}" data-name="${b.name.replace(/"/g, '&quot;')}">Restore</button>
                                            <span style="color: #a7aaad; margin: 0 4px;">|</span>
                                            <button class="btn-permanent-delete" style="background: none; border: none; padding: 0; color: #b32d2e; cursor: pointer; text-decoration: none;" data-id="${b.id}" data-name="${b.name.replace(/"/g, '&quot;')}">Delete Permanently</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            container.innerHTML = html;
            this.attachTrashEvents();
        } else {
            container.innerHTML = `<div style="padding: 40px; text-align: center; color: #d63638;">${res.message}</div>`;
        }
    }

    attachItemEvents() {
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showEditBranchModal(btn.dataset.id, btn.dataset.name);
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                this.deleteBranch(btn.dataset.id, btn.dataset.name);
            });
        });
    }

    attachTrashEvents() {
        document.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', () => {
                this.restoreBranch(btn.dataset.id, btn.dataset.name);
            });
        });

        document.querySelectorAll('.btn-permanent-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                this.permanentlyDeleteBranch(btn.dataset.id, btn.dataset.name);
            });
        });
    }

    showAddBranchModal() {
        Modal.open({
            title: "Add New Branch",
            body: `
                <div class="form-group">
                    <label class="form-label">Branch Name</label>
                    <input type="text" id="newBranchName" class="form-input" placeholder="e.g., Downtown Store">
                </div>
            `,
            confirmText: "Create Branch",
            onConfirm: async () => {
                const name = document.getElementById('newBranchName').value.trim();

                if (!name) {
                    Toast.error("Branch name is required");
                    throw new Error("Validation failed");
                }

                const res = await API.addLocation(name);
                if (res.status === 'success') {
                    Toast.success("Branch created successfully");
                    this.state.setLocations(null); // Force reload
                    this.loadBranches();
                } else {
                    Toast.error(res.message || "Failed to create branch");
                    throw new Error(res.message);
                }
            }
        });
    }

    showEditBranchModal(id, currentName) {
        Modal.open({
            title: "Edit Branch",
            body: `
                <div class="form-group">
                    <label class="form-label">Branch Name</label>
                    <input type="text" id="editBranchName" class="form-input" value="${currentName}">
                </div>
            `,
            confirmText: "Update Branch",
            onConfirm: async () => {
                const name = document.getElementById('editBranchName').value.trim();

                if (!name) {
                    Toast.error("Branch name is required");
                    throw new Error("Validation failed");
                }

                const res = await API.updateLocation(id, name);
                if (res.status === 'success') {
                    Toast.success("Branch updated successfully");
                    this.state.setLocations(null); // Force reload
                    this.loadBranches();
                } else {
                    Toast.error(res.message || "Failed to update branch");
                    throw new Error(res.message);
                }
            }
        });
    }

    async deleteBranch(id, name) {
        Modal.open({
            title: "Move to Trash",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-trash text-warning-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="text-neutral-700 mb-sm">Move <b>${name}</b> to trash?</p>
                    <p class="text-xs text-muted">You can restore it later from the Trash tab.</p>
                </div>
            `,
            confirmText: "Move to Trash",
            onConfirm: async () => {
                const res = await API.deleteLocation(id);
                if (res.status === 'success') {
                    Toast.success("Branch moved to trash");
                    this.state.setLocations(null); // Force reload
                    this.loadBranches();
                } else {
                    Toast.error(res.message || "Failed to delete branch");
                    throw new Error(res.message);
                }
            }
        });
    }

    async restoreBranch(id, name) {
        const res = await API.restoreLocation(id);
        if (res.status === 'success') {
            Toast.success(`${name} restored successfully`);
            this.state.setLocations(null); // Force reload
            this.loadBranches();
        } else {
            Toast.error(res.message || "Failed to restore branch");
        }
    }

    async permanentlyDeleteBranch(id, name) {
        Modal.open({
            title: "Delete Permanently",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-triangle-exclamation text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="text-neutral-700 mb-sm">Permanently delete <b>${name}</b>?</p>
                    <p class="text-xs text-error-600 font-semibold">This action cannot be undone!</p>
                </div>
            `,
            confirmText: "Delete Forever",
            onConfirm: async () => {
                const res = await API.permanentlyDeleteLocation(id);
                if (res.status === 'success') {
                    Toast.success("Branch permanently deleted");
                    this.loadBranches();
                } else {
                    Toast.error(res.message || "Failed to delete branch");
                    throw new Error(res.message);
                }
            }
        });
    }
}

module.exports = BranchesView;