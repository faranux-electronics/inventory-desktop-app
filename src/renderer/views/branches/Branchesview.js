const Toast = require('../../components/Toast.js');
const Modal = require('../../components/Modal.js');
const API = require('../../services/api.js');

class BranchesView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        const savedState = this.state.getTabState('branches');
        if (savedState) {
            this.currentTab = savedState.currentTab || 'active';
        } else {
            this.currentTab = 'active';
        }

        this.draggedRow = null;
        this.isOrderChanged = false;
    }

    saveState() {
        this.state.saveTabState('branches', {currentTab: this.currentTab});
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
                    <button class="btn btn-sm btn-primary hidden" id="savePriorityBtn" style="padding: 4px 12px; border-radius: 3px;">
                        <i class="fa-solid fa-floppy-disk"></i> Save Priority Order
                    </button>
                </div>

                <div class="tabs" style="border-bottom: 1px solid #c3c4c7;">
                    <button class="tab-btn ${this.currentTab === 'active' ? 'active' : ''}" data-tab="active" style="padding: 8px 16px; font-weight: 500; font-size: 13px;">
                        Active (Priority Ordered)
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

                // Hide save button if switching to trash
                const saveBtn = document.getElementById('savePriorityBtn');
                if (saveBtn) saveBtn.classList.add('hidden');
                this.isOrderChanged = false;
            });
        });

        document.getElementById('addBranchBtn')?.addEventListener('click', () => {
            this.showAddBranchModal();
        });

        document.getElementById('savePriorityBtn')?.addEventListener('click', () => {
            this.savePriorityOrder();
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
                    <div style="padding: 8px 16px; background: #fffbe5; border-bottom: 1px solid #c3c4c7; font-size: 12px; color: #666;">
                        <i class="fa-solid fa-circle-info text-info-500"></i> <b>Drag and drop</b> rows to reorder fulfillment priority. Top branch is fulfilled first.
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                        <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600; width: 60px;">Priority</th>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600; width: 80px;">ID</th>
                                <th style="padding: 10px 16px; color: #2c3338; font-weight: 600;">Name</th>
                            </tr>
                        </thead>
                        <tbody id="sortableBranchesList">
                            ${branches.map((b, index) => `
                                <tr class="hover:bg-neutral-50 branch-row" draggable="true" data-id="${b.id}" style="border-bottom: 1px solid #f0f0f1; cursor: grab;">
                                    <td style="padding: 12px 16px; color: #888; text-align: center;">
                                        <i class="fa-solid fa-grip-vertical" style="color: #ccc; margin-right: 5px;"></i>
                                        <span class="priority-badge" style="background: ${index === 0 ? '#d1fae5' : '#e2e8f0'}; color: ${index === 0 ? '#065f46' : '#475569'}; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">
                                            ${index + 1}
                                        </span>
                                    </td>
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
            this.attachDragAndDropEvents(); // Attach the D&D logic
        } else {
            container.innerHTML = `<div style="padding: 40px; text-align: center; color: #d63638;">${res.message}</div>`;
        }
    }

    // (Trashed Branches logic remains identical to your previous file, omitted here for brevity, keep your loadTrashedBranches() exactly as it was)
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

    /* --- HTML5 DRAG AND DROP LOGIC --- */
    attachDragAndDropEvents() {
        const tbody = document.getElementById('sortableBranchesList');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('.branch-row');

        rows.forEach(row => {
            row.addEventListener('dragstart', (e) => {
                this.draggedRow = row;
                e.dataTransfer.effectAllowed = 'move';
                row.style.opacity = '0.5';
            });

            row.addEventListener('dragend', () => {
                this.draggedRow.style.opacity = '1';
                this.draggedRow = null;
                this.recalculatePriorityBadges();
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault(); // Necessary to allow dropping
                e.dataTransfer.dropEffect = 'move';

                // Determine if we are hovering over the top or bottom half of the row
                const bounding = row.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);

                if (e.clientY - offset > 0) {
                    row.style.borderBottom = "2px solid #2271b1";
                    row.style.borderTop = "";
                } else {
                    row.style.borderTop = "2px solid #2271b1";
                    row.style.borderBottom = "";
                }
            });

            row.addEventListener('dragleave', () => {
                row.style.borderBottom = "1px solid #f0f0f1";
                row.style.borderTop = "";
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.style.borderBottom = "1px solid #f0f0f1";
                row.style.borderTop = "";

                if (this.draggedRow !== row) {
                    const bounding = row.getBoundingClientRect();
                    const offset = bounding.y + (bounding.height / 2);

                    if (e.clientY - offset > 0) {
                        row.after(this.draggedRow);
                    } else {
                        row.before(this.draggedRow);
                    }

                    // Reveal the save button because order changed
                    this.isOrderChanged = true;
                    document.getElementById('savePriorityBtn').classList.remove('hidden');
                }
            });
        });
    }

    recalculatePriorityBadges() {
        const rows = document.querySelectorAll('#sortableBranchesList .branch-row');
        rows.forEach((row, index) => {
            const badge = row.querySelector('.priority-badge');
            badge.textContent = index + 1;

            // Highlight the primary branch (index 0)
            if (index === 0) {
                badge.style.background = '#d1fae5';
                badge.style.color = '#065f46';
            } else {
                badge.style.background = '#e2e8f0';
                badge.style.color = '#475569';
            }
        });
    }

    async savePriorityOrder() {
        const rows = document.querySelectorAll('#sortableBranchesList .branch-row');
        const priorityArray = Array.from(rows).map(row => row.dataset.id);

        const btn = document.getElementById('savePriorityBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;

        try {
            const res = await API.updateBranchPriority(priorityArray);
            if (res.status === 'success') {
                Toast.success("Branch priority updated!");
                this.isOrderChanged = false;
                btn.classList.add('hidden');
            } else {
                Toast.error(res.message || "Failed to save priorities");
            }
        } catch (e) {
            Toast.error("Network error saving priorities");
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Priority Order';
            btn.disabled = false;
        }
    }

    /* Modal / Action logic remains exactly as is */
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
                    this.state.setLocations(null);
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
                    this.state.setLocations(null);
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
                    this.state.setLocations(null);
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
            this.state.setLocations(null);
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