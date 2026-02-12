const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class TransfersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        const savedState = this.state.getTabState('transfers');
        if (savedState) {
            this.currentTab = savedState.currentTab || 'pending';
            this.filters = savedState.filters || { search: '', start: '', end: '', page: 1, userId: '' };
        } else {
            this.currentTab = 'pending';
            this.filters = { search: '', start: '', end: '', page: 1, userId: '' };
        }
    }

    saveState() {
        this.state.saveTabState('transfers', {
            currentTab: this.currentTab,
            filters: this.filters
        });
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header">
                <div class="header-row">
                    <h1 class="page-title">Transfer Management</h1>
                    <div class="header-actions">
                        <button class="btn btn-secondary" id="refreshBtn" title="Refresh">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                    </div>
                </div>

                <div class="tabs mb-md">
                    <button class="tab-btn ${this.currentTab === 'pending' ? 'active' : ''}" data-tab="pending">Incoming / Pending</button>
                    <button class="tab-btn ${this.currentTab === 'completed' ? 'active' : ''}" data-tab="completed">Completed</button>
                    <button class="tab-btn ${this.currentTab === 'rejected' ? 'active' : ''}" data-tab="rejected">Rejected</button>
                </div>

                <div class="card p-md mb-md">
                    <div class="flex items-center gap-md flex-wrap">
                        <div class="search-box flex-1">
                            <i class="fa-solid fa-search"></i>
                            <input type="text" id="transferSearch" class="search-input w-full" placeholder="Search Batch ID..." value="${this.filters.search}">
                        </div>
                        <input type="date" id="dateStart" class="form-input" value="${this.filters.start}">
                        <input type="date" id="dateEnd" class="form-input" value="${this.filters.end}">
                    </div>
                </div>

                <div class="card">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Batch ID</th>
                                    <th>Date</th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Items</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="transfersTableBody">
                                <tr><td colspan="7" class="text-center p-lg">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="pagination" id="paginationControls"></div>
                </div>
            </div>
        `;

        this.attachEvents();
        this.loadTransfers();
    }

    attachEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.filters.page = 1;
                this.saveState();
                this.loadTransfers();
            });
        });

        const applyFilters = () => {
            this.filters.search = document.getElementById('transferSearch').value.trim();
            this.filters.start = document.getElementById('dateStart').value;
            this.filters.end = document.getElementById('dateEnd').value;
            this.filters.page = 1;
            this.saveState();
            this.loadTransfers();
        };

        document.getElementById('transferSearch').addEventListener('input', applyFilters);
        document.getElementById('dateStart').addEventListener('change', applyFilters);
        document.getElementById('dateEnd').addEventListener('change', applyFilters);
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadTransfers());
    }

    async loadTransfers() {
        const tbody = document.getElementById('transfersTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-lg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

        try {
            const res = await API.getTransfers(
                this.currentTab,
                this.filters.page,
                this.filters.search,
                '',
                this.filters.start,
                this.filters.end,
                this.filters.userId
            );

            if (res.status === 'success') {
                this.renderTable(res.data || []);
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-error p-lg">Connection Failed</td></tr>`;
        }
    }

    renderTable(transfers) {
        const tbody = document.getElementById('transfersTableBody');
        const userBranch = this.state.getUserBranchId();

        if (transfers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-lg text-muted">No transfers found.</td></tr>';
            return;
        }

        tbody.innerHTML = transfers.map(t => {
            const isPendingToMe = t.status === 'pending' && (!userBranch || userBranch == t.to_loc_id);

            return `
                <tr>
                    <td class="font-mono text-primary">${t.batch_id}</td>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td>${t.from_location}</td>
                    <td>${t.to_location}</td>
                    <td>${t.item_count} items (${t.total_qty} qty)</td>
                    <td><span class="badge badge-${this.getBadgeColor(t.status)}">${t.status.toUpperCase()}</span></td>
                    <td>
                        ${isPendingToMe ? `
                            <button class="btn btn-sm btn-success btn-approve" data-id="${t.batch_id}">
                                <i class="fa-solid fa-check"></i> Approve
                            </button>
                            <button class="btn btn-sm btn-error btn-reject" data-id="${t.batch_id}">
                                <i class="fa-solid fa-xmark"></i> Reject
                            </button>
                        ` : '<span class="text-muted">—</span>'}
                    </td>
                </tr>
            `;
        }).join('');

        // Attach action buttons
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', () => this.handleTransferAction(btn.dataset.id, 'approve'));
        });
        document.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', () => this.handleTransferAction(btn.dataset.id, 'reject'));
        });
    }

    getBadgeColor(status) {
        const map = { completed: 'success', pending: 'warning', rejected: 'error', canceled: 'neutral' };
        return map[status] || 'neutral';
    }

    async handleTransferAction(batchId, action) {
        const isReject = action === 'reject';
        const title = isReject ? "Reject Transfer" : "Approve Transfer";
        const confirmText = isReject ? "Reject" : "Approve";

        Modal.open({
            title,
            body: isReject ? `
                <div class="form-group">
                    <label class="form-label">Reason (optional)</label>
                    <textarea id="rejectReason" class="form-input" rows="3"></textarea>
                </div>
            ` : `<p>Confirm ${action} of this transfer?</p>`,
            confirmText,
            onConfirm: async () => {
                const res = await API.approveTransfer(batchId, action);
                if (res.status === 'success') {
                    Toast.success(`Transfer ${action}ed`);
                    this.loadTransfers();
                } else {
                    Toast.error(res.message || "Operation failed");
                    throw new Error();
                }
            }
        });
    }
}

module.exports = TransfersView;