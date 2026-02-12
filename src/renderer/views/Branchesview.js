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
            <div class="page-header">
                <div class="header-row">
                    <h1 class="page-title">Branch Management</h1>
                    <button class="btn btn-primary" id="addBranchBtn">
                        <i class="fa-solid fa-plus"></i> Add Branch
                    </button>
                </div>

                <div class="tabs mb-md">
                    <button class="tab-btn ${this.currentTab === 'active' ? 'active' : ''}" data-tab="active">
                        <i class="fa-solid fa-store"></i> Active Branches
                    </button>
                    <button class="tab-btn ${this.currentTab === 'trash' ? 'active' : ''}" data-tab="trash">
                        <i class="fa-solid fa-trash"></i> Trash
                    </button>
                </div>
            </div>

            <div id="branchesContent"></div>
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

        container.innerHTML = '<div class="card p-lg text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        try {
            if (this.currentTab === 'active') {
                await this.loadActiveBranches();
            } else {
                await this.loadTrashedBranches();
            }
        } catch (e) {
            console.error(e);
            container.innerHTML = '<div class="card p-lg text-center text-error">Failed to load branches</div>';
        }
    }

    async loadActiveBranches() {
        const container = document.getElementById('branchesContent');
        const res = await API.getLocations();

        if (res.status === 'success') {
            const branches = res.data || [];

            if (branches.length === 0) {
                container.innerHTML = '<div class="card p-lg text-center text-muted">No branches found</div>';
                return;
            }

            const html = `
                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Branch Name</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${branches.map(b => `
                                    <tr>
                                        <td class="font-mono text-sm">#${b.id}</td>
                                        <td class="font-semibold">${b.name}</td>
                                        <td>
                                            <div class="flex gap-sm">
                                                <button class="btn btn-sm btn-secondary btn-edit" 
                                                        data-id="${b.id}" 
                                                        data-name="${b.name.replace(/"/g, '&quot;')}"
                                                        title="Edit Branch">
                                                    <i class="fa-solid fa-pen"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger btn-delete" 
                                                        data-id="${b.id}" 
                                                        data-name="${b.name.replace(/"/g, '&quot;')}"
                                                        title="Move to Trash">
                                                    <i class="fa-solid fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            container.innerHTML = html;
            this.attachItemEvents();
        } else {
            container.innerHTML = `<div class="card p-lg text-center text-error">${res.message}</div>`;
        }
    }

    async loadTrashedBranches() {
        const container = document.getElementById('branchesContent');
        const res = await API.getTrashedLocations();

        if (res.status === 'success') {
            const branches = res.data || [];

            if (branches.length === 0) {
                container.innerHTML = '<div class="card p-lg text-center text-muted">Trash is empty</div>';
                return;
            }

            const html = `
                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Branch Name</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${branches.map(b => `
                                    <tr class="bg-neutral-50">
                                        <td class="font-mono text-sm text-muted">#${b.id}</td>
                                        <td class="font-semibold text-muted">${b.name}</td>
                                        <td>
                                            <div class="flex gap-sm">
                                                <button class="btn btn-sm btn-success btn-restore" 
                                                        data-id="${b.id}" 
                                                        data-name="${b.name.replace(/"/g, '&quot;')}"
                                                        title="Restore Branch">
                                                    <i class="fa-solid fa-rotate-left"></i> Restore
                                                </button>
                                                <button class="btn btn-sm btn-danger btn-permanent-delete" 
                                                        data-id="${b.id}" 
                                                        data-name="${b.name.replace(/"/g, '&quot;')}"
                                                        title="Delete Permanently">
                                                    <i class="fa-solid fa-trash"></i> Delete Forever
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            container.innerHTML = html;
            this.attachTrashEvents();
        } else {
            container.innerHTML = `<div class="card p-lg text-center text-error">${res.message}</div>`;
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