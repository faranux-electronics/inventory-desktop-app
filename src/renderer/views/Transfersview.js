const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');
const PdfGenerator = require('../utils/PdfGenerator.js');

class TransfersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        const savedState = this.state.getTabState('transfers');
        if (savedState) {
            this.currentTab = savedState.currentTab || 'pending_incoming';
            this.filters = savedState.filters || { search: '', start: '', end: '', page: 1, userId: '' };
        } else {
            this.currentTab = 'pending_incoming';
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
                        <button class="btn btn-secondary" id="exportCsvBtn" title="Export CSV">
                            <i class="fa-solid fa-file-csv"></i> Export CSV
                        </button>
                        <button class="btn btn-secondary" id="refreshBtn" title="Refresh">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                    </div>
                </div>

                <div class="tabs mb-md">
                    <button class="tab-btn ${this.currentTab === 'pending_incoming' ? 'active' : ''}" data-tab="pending_incoming">Incoming (To Receive)</button>
                    <button class="tab-btn ${this.currentTab === 'pending_outgoing' ? 'active' : ''}" data-tab="pending_outgoing">Outgoing (Sent by Me)</button>
                    <button class="tab-btn ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
                </div>

                <div class="card p-md mb-md">
                    <div class="flex items-center gap-md flex-wrap">
                        <div class="search-box flex-1" style="min-width: 200px;">
                            <i class="fa-solid fa-search"></i>
                            <input type="text" id="transferSearch" class="search-input w-full" placeholder="Search Batch ID or Product..." value="${this.filters.search}">
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
                                    <th class="text-center"><i class="fa-solid fa-arrows-turn-to-dots text-muted"></i></th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Items</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="transfersTableBody">
                                <tr><td colspan="8" class="text-center p-lg">Loading...</td></tr>
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

        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            let apiType = 'all', apiDir = 'all';
            if (this.currentTab === 'pending_incoming') { apiType = 'pending'; apiDir = 'incoming'; }
            else if (this.currentTab === 'pending_outgoing') { apiType = 'pending'; apiDir = 'outgoing'; }
            else if (this.currentTab === 'history') { apiType = 'history'; apiDir = 'all'; }
            API.exportTransfersCsv(apiType, apiDir, this.filters.search, this.filters.start, this.filters.end);
        });
    }

    async loadTransfers() {
        const tbody = document.getElementById('transfersTableBody');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center p-lg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

        let apiType = 'all', apiDir = 'all';
        if (this.currentTab === 'pending_incoming') { apiType = 'pending'; apiDir = 'incoming'; }
        else if (this.currentTab === 'pending_outgoing') { apiType = 'pending'; apiDir = 'outgoing'; }
        else if (this.currentTab === 'history') { apiType = 'history'; apiDir = 'all'; }

        try {
            const res = await API.getTransfers(apiType, apiDir, this.filters.page, this.filters.search, '', this.filters.start, this.filters.end, this.filters.userId);
            if (res.status === 'success') {
                this.renderTable(res.data || []);
            } else {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-error p-lg">Connection Failed</td></tr>`;
        }
    }

    renderTable(transfers) {
        const tbody = document.getElementById('transfersTableBody');
        const userBranch = this.state.getUserBranchId();
        const isAdmin = this.state.getUser()?.role === 'admin';

        if (transfers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-lg text-muted">No transfers found in this category.</td></tr>';
            return;
        }

        tbody.innerHTML = transfers.map(t => {
            let actions = '';

            if (t.status === 'pending') {
                if (isAdmin || userBranch == t.to_loc_id) {
                    actions += `<button class="btn btn-sm btn-primary btn-review" data-id="${t.batch_id}">Review & Receive</button> `;
                }
                if (isAdmin || userBranch == t.from_loc_id) {
                    actions += `<button class="btn btn-sm btn-error btn-cancel" data-id="${t.batch_id}">Cancel</button> `;
                }
            } else {
                actions += `<button class="btn btn-sm btn-secondary btn-view" data-id="${t.batch_id}">Details</button> `;
                actions += `<button class="btn btn-sm btn-secondary btn-print" data-id="${t.batch_id}" title="Print PDF"><i class="fa-solid fa-print"></i></button> `;
            }

            let dirIcon = '<i class="fa-solid fa-minus text-muted"></i>';
            if (userBranch) {
                if (userBranch == t.to_loc_id) dirIcon = '<i class="fa-solid fa-arrow-down text-success" title="Incoming"></i>';
                else if (userBranch == t.from_loc_id) dirIcon = '<i class="fa-solid fa-arrow-up text-warning" title="Outgoing"></i>';
            }

            return `
                <tr>
                    <td class="font-mono text-primary font-semibold">${t.batch_id}</td>
                    <td class="text-sm">${new Date(t.created_at).toLocaleDateString()}</td>
                    <td class="text-center">${dirIcon}</td>
                    <td>${t.from_location}</td>
                    <td>${t.to_location}</td>
                    <td class="text-sm">${t.item_count} items (${t.total_qty} qty)</td>
                    <td><span class="badge badge-${this.getBadgeColor(t.status)}">${t.status.toUpperCase()}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.btn-review').forEach(btn => btn.addEventListener('click', () => this.showReviewModal(btn.dataset.id)));
        document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => this.handleCancel(btn.dataset.id)));
        document.querySelectorAll('.btn-view').forEach(btn => btn.addEventListener('click', () => this.showDetailsModal(btn.dataset.id)));
        document.querySelectorAll('.btn-print').forEach(btn => btn.addEventListener('click', () => this.printTransfer(btn.dataset.id)));
    }

    getBadgeColor(status) {
        const map = { completed: 'success', pending: 'warning', rejected: 'error', canceled: 'neutral' };
        return map[status] || 'neutral';
    }

    async showReviewModal(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error(res.message);
        const data = res.data;

        const itemsHtml = data.items.map(i => `
            <tr class="border-b border-neutral-200">
                <td class="py-sm">
                    <div class="font-semibold text-sm">${i.product_name}</div>
                    <div class="text-xs text-muted font-mono">${i.product_sku || ''}</div>
                </td>
                <td class="text-center font-bold text-primary">${i.qty}</td>
                <td style="width: 100px;">
                    <input type="number" class="form-input form-input-sm recv-qty text-center font-bold" 
                           data-id="${i.id}" data-max="${i.qty}" value="${i.qty}" min="0" max="${i.qty}">
                </td>
                <td>
                    <input type="text" class="form-input form-input-sm" id="note-${i.id}" placeholder="Optional note if mismatched">
                </td>
            </tr>
        `).join('');

        Modal.open({
            title: `Confirm Receipt: ${batchId}`,
            size: 'lg',
            body: `
                <div class="mb-md flex gap-md p-md bg-neutral-50 rounded border border-neutral-200">
                    <div class="flex-1"><span class="text-muted text-xs">SENDER</span><br><strong>${data.from_location}</strong></div>
                    <div class="flex-1"><span class="text-muted text-xs">DESTINATION</span><br><strong>${data.to_location}</strong></div>
                </div>
                
                <div class="alert bg-info-50 mb-md text-sm border border-info-200">
                    <i class="fa-solid fa-circle-info text-info-600"></i>
                    Verify the quantities received. If you receive less than sent, lower the number. Missing items will be automatically returned to the sender's inventory.
                </div>

                <div class="table-container" style="max-height: 400px; overflow-y:auto;">
                    <table class="w-full text-left">
                        <thead>
                            <tr>
                                <th class="pb-sm">Product</th>
                                <th class="text-center pb-sm">Sent</th>
                                <th class="text-center pb-sm">Received</th>
                                <th class="pb-sm">Issue Note</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
            `,
            confirmText: "Save & Complete",
            cancelText: "Close",
            onConfirm: async () => {
                const itemsData = [];
                let hasError = false;

                document.querySelectorAll('.recv-qty').forEach(inp => {
                    const id = inp.dataset.id;
                    const val = parseInt(inp.value);
                    const max = parseInt(inp.dataset.max);

                    if (val < 0 || val > max || isNaN(val)) {
                        Toast.error("Invalid quantity entered");
                        inp.classList.add('border-error');
                        hasError = true;
                    } else {
                        inp.classList.remove('border-error');
                    }

                    itemsData.push({
                        id: id,
                        received_qty: val,
                        note: document.getElementById(`note-${id}`).value.trim()
                    });
                });

                if (hasError) throw new Error("Validation Error");

                const result = await API.approveTransfer(batchId, 'approve', itemsData);
                if (result.status === 'success') {
                    Toast.success("Transfer confirmed and inventory updated!");
                    this.loadTransfers();
                } else {
                    Toast.error(result.message);
                    throw new Error();
                }
            }
        });
    }

    async handleCancel(batchId) {
        Modal.open({
            title: "Cancel Transfer",
            body: `
                <p class="mb-sm text-neutral-700">Are you sure you want to cancel this outgoing transfer? The reserved stock will be returned to your inventory.</p>
                <div class="form-group">
                    <label class="form-label">Reason (Optional)</label>
                    <textarea id="cancelReason" class="form-input" rows="2"></textarea>
                </div>
            `,
            confirmText: "Yes, Cancel",
            onConfirm: async () => {
                const reason = document.getElementById('cancelReason').value;
                const res = await API.cancelTransfer(batchId, reason);
                if (res.status === 'success') {
                    Toast.success("Transfer canceled successfully");
                    this.loadTransfers();
                } else {
                    Toast.error(res.message);
                    throw new Error();
                }
            }
        });
    }

    async showDetailsModal(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error(res.message);
        const data = res.data;

        const itemsHtml = data.items.map(i => `
            <tr class="border-b border-neutral-100">
                <td class="py-sm">
                    <div class="font-semibold text-sm">${i.product_name}</div>
                    <div class="text-xs text-muted font-mono">${i.product_sku || ''}</div>
                </td>
                <td class="text-center">${i.qty}</td>
                <td class="text-center font-bold ${i.received_qty < i.qty ? 'text-error' : 'text-success'}">
                    ${i.received_qty !== null ? i.received_qty : '-'}
                </td>
                <td class="text-sm text-muted">${i.note || '-'}</td>
            </tr>
        `).join('');

        Modal.open({
            title: `Details: ${batchId}`,
            size: 'lg',
            body: `
                <div class="mb-md flex justify-between p-md bg-neutral-50 rounded border border-neutral-200">
                    <div>
                        <p class="mb-xs"><strong>From:</strong> ${data.from_location}</p>
                        <p class="mb-xs"><strong>To:</strong> ${data.to_location}</p>
                        <p><strong>Status:</strong> <span class="badge badge-${this.getBadgeColor(data.status)}">${data.status.toUpperCase()}</span></p>
                    </div>
                    <div class="text-right text-sm text-neutral-700">
                        <p class="mb-xs"><strong>Date:</strong> ${new Date(data.created_at).toLocaleString()}</p>
                        <p class="mb-xs"><strong>Sent by:</strong> ${data.initiated_by}</p>
                        <p><strong>Handled by:</strong> ${data.approved_by || 'Pending'}</p>
                    </div>
                </div>
                <div class="table-container">
                    <table class="w-full text-left">
                        <thead><tr><th class="pb-sm">Product</th><th class="text-center pb-sm">Sent</th><th class="text-center pb-sm">Received</th><th class="pb-sm">Notes</th></tr></thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
            `,
            confirmText: "Close",
            onConfirm: () => {}
        });
    }

    async printTransfer(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error("Failed to load details for PDF");

        try {
            // Call the reusable utility
            await PdfGenerator.generateTransferPDF(batchId, res.data);
            Toast.success("PDF generated successfully");
        } catch (e) {
            Toast.error(e.message);
            console.error(e);
        }
    }
}

module.exports = TransfersView;