const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class BranchesView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
    }

    render() {
        const content = document.getElementById('content');
        const user = this.state.get().user;
        const isAdmin = user.role === 'admin';
        const isAdminOrManager = isAdmin || user.role === 'manager';

        content.innerHTML = `
            <div class="page-header">
                <div class="header-row">
                    <h1 class="page-title">Manage Branches</h1>
                    <div class="header-actions">
                        <button class="btn btn-secondary" id="refreshBranchesBtn" title="Refresh Data">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                        <button class="btn btn-primary ${isAdminOrManager ? '' : 'hidden'}" id="addBranchBtn">
                            <i class="fa-solid fa-plus"></i> Add Branch
                        </button>
                    </div>
                </div>
                
                ${isAdmin ? `
                <div class="tabs">
                    <button class="tab-btn active" data-tab="active">
                        <i class="fa-solid fa-store"></i> Active Branches
                    </button>
                    <button class="tab-btn" data-tab="trash">
                        <i class="fa-solid fa-trash"></i> Trash
                    </button>
                </div>
                ` : ''}
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Branch Name</th>
                                <th>Status/Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="branchTableBody">
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.currentTab = 'active';
        this.attachEvents();
        this.loadBranches(false);
    }

    attachEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentTab = tab;
                this.loadBranches(true);
            });
        });

        document.getElementById('refreshBranchesBtn').addEventListener('click', () => {
            this.loadBranches(true);
        });

        const addBtn = document.getElementById('addBranchBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                Modal.open({
                    title: "Add New Branch",
                    body: `
                        <div class="form-group">
                            <label class="form-label">Branch Name</label>
                            <input type="text" id="newBranchName" class="form-input" placeholder="e.g. Kigali City Center">
                        </div>
                    `,
                    confirmText: "Create",
                    onConfirm: async () => {
                        const name = document.getElementById('newBranchName').value.trim();
                        if (!name) {
                            Toast.error("Name is required");
                            throw new Error("Validation failed");
                        }

                        const res = await API.addLocation(name);
                        if (res.status === 'success') {
                            this.loadBranches(true);
                            Toast.success("Branch Created");
                        } else {
                            Toast.error(res.message || "Failed to create branch");
                            throw new Error(res.message);
                        }
                    }
                });
            });
        }
    }

    async loadBranches(forceRefresh = false) {
        const tbody = document.getElementById('branchTableBody');
        if (!tbody) return;

        const isTrash = this.currentTab === 'trash';
        const user = this.state.get().user;

        if (!isTrash && !forceRefresh) {
            let locations = this.state.getLocations();
            if (locations.length > 0) {
                this.renderTable(locations, false);
                return;
            }
        }

        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-lg text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

        try {
            let res;
            if (isTrash) {
                // PASS ROLE HERE
                res = await API.getTrashedLocations(user.role);
            } else {
                await this.state.loadLocations(true);
                res = { status: 'success', data: this.state.getLocations() };
            }

            if (res.status === 'success') {
                this.renderTable(res.data, isTrash);
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            Toast.error("Failed to load branches");
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-error p-lg">Network Error</td></tr>`;
        }
    }

    renderTable(locations, isTrash = false) {
        const tbody = document.getElementById('branchTableBody');
        const user = this.state.get().user;

        if (locations.length === 0) {
            const msg = isTrash ? 'No branches in trash.' : 'No branches found.';
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-lg text-muted">${msg}</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        locations.forEach(loc => {
            const tr = document.createElement('tr');

            let actionsHtml;
            if (user.role === 'admin') {
                if (isTrash) {
                    actionsHtml = `
                        <div class="flex gap-sm">
                            <button class="btn btn-sm btn-secondary btn-restore-loc" data-id="${loc.id}" data-name="${loc.name}" title="Restore">
                                <i class="fa-solid fa-rotate-left"></i> Restore
                            </button>
                            <button class="btn btn-sm btn-danger btn-permanent-del-loc" data-id="${loc.id}" data-name="${loc.name}" title="Delete Forever">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    `;
                } else {
                    actionsHtml = `
                        <div class="flex gap-sm">
                            <button class="btn btn-sm btn-secondary btn-edit-loc" data-id="${loc.id}" data-name="${loc.name}" title="Edit">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-sm btn-danger btn-trash-loc" data-id="${loc.id}" data-name="${loc.name}" title="Move to Trash">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    `;
                }
            } else {
                actionsHtml = '<span class="text-muted text-sm">-</span>';
            }

            const dateLabel = isTrash ? 'Deleted: ' : 'Created: ';
            const dateValue = isTrash
                ? new Date(loc.deleted_at).toLocaleDateString()
                : new Date(loc.created_at).toLocaleDateString();

            tr.innerHTML = `
                <td><span class="badge badge-neutral">#${loc.id}</span></td>
                <td><span class="font-semibold">${loc.name}</span></td>
                <td class="text-muted text-sm">${dateLabel} ${dateValue}</td>
                <td>${actionsHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        // Attach listeners dynamically
        if (user.role === 'admin') {
            if (isTrash) {
                this.attachTrashActions();
            } else {
                this.attachActiveActions();
            }
        }
    }

    attachActiveActions() {
        document.querySelectorAll('.btn-edit-loc').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showEditModal(btn.dataset.id, btn.dataset.name);
            });
        });

        document.querySelectorAll('.btn-trash-loc').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showTrashModal(btn.dataset.id, btn.dataset.name);
            });
        });
    }

    attachTrashActions() {
        document.querySelectorAll('.btn-restore-loc').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showRestoreModal(btn.dataset.id, btn.dataset.name);
            });
        });

        document.querySelectorAll('.btn-permanent-del-loc').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showPermanentDeleteModal(btn.dataset.id, btn.dataset.name);
            });
        });
    }

    showEditModal(locId, currentName) {
        Modal.open({
            title: "Edit Branch",
            body: `
                <div class="form-group">
                    <label class="form-label">Branch Name</label>
                    <input type="text" id="editBranchName" class="form-input" value="${currentName}">
                </div>
            `,
            confirmText: "Save Changes",
            onConfirm: async () => {
                const newName = document.getElementById('editBranchName').value.trim();
                if (!newName) {
                    Toast.error("Name is required");
                    throw new Error("Validation failed");
                }

                if (newName === currentName) {
                    Toast.info("No changes made");
                    return;
                }

                const res = await API.updateLocation(locId, newName);
                if (res.status === 'success') {
                    this.loadBranches(true);
                    Toast.success("Branch updated");
                } else {
                    Toast.error(res.message || "Failed to update");
                    throw new Error(res.message);
                }
            }
        });
    }

    showTrashModal(locId, locName) {
        const user = this.state.get().user;
        Modal.open({
            title: "Move to Trash",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-trash text-warning-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="text-neutral-700 mb-sm">Move <b>${locName}</b> to trash?</p>
                    <p class="text-xs text-muted">
                        <i class="fa-solid fa-info-circle"></i>
                        You can restore this branch later.
                    </p>
                </div>
            `,
            confirmText: "Move to Trash",
            cancelText: "Cancel",
            onConfirm: async () => {
                // PASS ROLE HERE
                const res = await API.deleteLocation(locId, user.role);
                if (res.status === 'success') {
                    Toast.success("Branch moved to trash");
                    this.loadBranches(true);
                } else {
                    Toast.error(res.message || "Failed to move to trash");
                    throw new Error(res.message);
                }
            }
        });
    }

    showRestoreModal(locId, locName) {
        const user = this.state.get().user;
        Modal.open({
            title: "Restore Branch",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-rotate-left text-success-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="text-neutral-700 mb-sm">Restore <b>${locName}</b> to active branches?</p>
                </div>
            `,
            confirmText: "Restore",
            onConfirm: async () => {
                // PASS ROLE HERE
                const res = await API.restoreLocation(locId, user.role);
                if (res.status === 'success') {
                    Toast.success("Branch restored");
                    this.loadBranches(true);
                } else {
                    Toast.error(res.message || "Failed to restore");
                    throw new Error(res.message);
                }
            }
        });
    }

    showPermanentDeleteModal(locId, locName) {
        const user = this.state.get().user;
        Modal.open({
            title: "Permanently Delete",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-triangle-exclamation text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="text-error-700 font-bold mb-sm">⚠️ DANGER: This cannot be undone!</p>
                    <p class="text-neutral-700 mb-md">This will permanently delete <b>${locName}</b></p>
                    <p class="text-xs text-muted">
                        This action will fail if the branch has any transfer history.
                    </p>
                </div>
            `,
            confirmText: "Delete Forever",
            cancelText: "Cancel",
            onConfirm: async () => {
                // PASS ROLE HERE
                const res = await API.permanentlyDeleteLocation(locId, user.role);
                if (res.status === 'success') {
                    Toast.success("Branch permanently deleted");
                    this.loadBranches(true);
                } else {
                    Toast.error(res.message || "Failed to delete");
                    throw new Error(res.message);
                }
            }
        });
    }
}

module.exports = BranchesView;