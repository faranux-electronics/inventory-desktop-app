const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class TransfersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.currentTab = 'incoming';
        // Added userId to filters state
        this.filters = { search: '', start: '', end: '', page: 1, userId: '' };
        this.notificationInterval = null;
        this.lastFetchedData = [];
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
                        <button class="btn btn-primary" id="newTransferBtn">
                            <i class="fa-solid fa-plus"></i> New Transfer
                        </button>
                    </div>
                </div>

                <div class="card p-md mb-md">
                    <div class="flex items-center gap-md flex-wrap">
                        <div class="search-box flex-1" style="min-width: 200px;">
                            <i class="fa-solid fa-search"></i>
                            <input type="text" id="searchInput" class="search-input" placeholder="Search products...">
                        </div>
                        
                        <select id="userFilter" class="form-select" style="width: auto; max-width: 180px;">
                            <option value="">All Users</option>
                            <option disabled>Loading...</option>
                        </select>

                        <input type="date" id="startDate" class="form-input" style="width: auto;">
                        <span class="text-muted">to</span>
                        <input type="date" id="endDate" class="form-input" style="width: auto;">
                        
                        <button class="btn btn-sm btn-primary" id="applyFilters">Apply</button>
                        
                        <button class="btn btn-sm btn-secondary" id="exportAllBtn" title="Download Report">
                            <i class="fa-solid fa-file-csv"></i> Export CSV
                        </button>
                    </div>
                </div>

                <div class="tabs">
                    <button class="tab-btn active" data-tab="incoming">
                        <i class="fa-solid fa-inbox"></i> Incoming
                        <span class="notification-badge hidden" id="incomingBadge">0</span>
                    </button>
                    <button class="tab-btn" data-tab="outgoing">
                        <i class="fa-solid fa-paper-plane"></i> Sent
                    </button>
                    <button class="tab-btn" data-tab="history">
                        <i class="fa-solid fa-clock-rotate-left"></i> History
                    </button>
                </div>
            </div>

            <div id="transferContent"></div>

            <div class="flex items-center justify-between p-md" id="paginationContainer" style="display: none;">
                <span id="pageInfo" class="text-muted text-sm"></span>
                <div class="flex gap-sm">
                    <button id="prevBtn" class="btn btn-sm btn-secondary">Previous</button>
                    <button id="nextBtn" class="btn btn-sm btn-secondary">Next</button>
                </div>
            </div>
        `;

        this.attachEvents();
        this.loadUserFilterOptions(); // Fetch users to populate dropdown
        this.loadTransfers();
        this.startNotificationPolling();
    }

    // New helper to populate the User dropdown
    async loadUserFilterOptions() {
        try {
            const currentUser = this.state.getUser();
            const res = await API.getUsers(currentUser.role);

            if (res.status === 'success') {
                const select = document.getElementById('userFilter');
                if (select) {
                    const currentVal = this.filters.userId;
                    // Filter out users if needed, or just show all
                    const options = res.data.map(u =>
                        `<option value="${u.id}" ${u.id == currentVal ? 'selected' : ''}>${u.name || u.email}</option>`
                    ).join('');
                    select.innerHTML = `<option value="">All Users</option>${options}`;
                }
            }
        } catch (e) {
            console.error("Failed to load users for filter", e);
            // Optionally remove the "Loading..." placeholder or leave "All Users"
            const select = document.getElementById('userFilter');
            if(select) select.innerHTML = `<option value="">All Users</option>`;
        }
    }

    attachEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentTab = tab;
                this.filters.page = 1;
                this.loadTransfers();
            });
        });

        document.getElementById('refreshBtn').addEventListener('click', () => this.loadTransfers());
        document.getElementById('newTransferBtn').addEventListener('click', () => this.showNewTransferModal());

        document.getElementById('applyFilters').addEventListener('click', () => {
            this.filters.search = document.getElementById('searchInput').value;
            this.filters.userId = document.getElementById('userFilter').value; // Capture selected user
            this.filters.start = document.getElementById('startDate').value;
            this.filters.end = document.getElementById('endDate').value;
            this.filters.page = 1;
            this.loadTransfers();
        });

        document.getElementById('exportAllBtn').addEventListener('click', () => {
            if (!this.lastFetchedData || this.lastFetchedData.length === 0) {
                Toast.info("No data to export");
                return;
            }
            this.generateCSV(this.lastFetchedData, `transfers_report_${this.currentTab}.csv`);
        });

        document.getElementById('prevBtn')?.addEventListener('click', () => {
            if (this.filters.page > 1) {
                this.filters.page--;
                this.loadTransfers();
            }
        });

        document.getElementById('nextBtn')?.addEventListener('click', () => {
            this.filters.page++;
            this.loadTransfers();
        });
    }

    async loadTransfers() {
        const content = document.getElementById('transferContent');
        const user = this.state.getUser();

        content.innerHTML = '<div class="text-center p-xl text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        try {
            // Include user_id in the API request
            const res = await API.getTransfers({
                type: this.currentTab,
                branch_id: user.branch_id,
                user_id: this.filters.userId, // Pass the selected user filter
                search: this.filters.search,
                start: this.filters.start,
                end: this.filters.end,
                page: this.filters.page
            });

            if (res.status === 'success') {
                this.lastFetchedData = res.data;
                this.renderTransfers(res.data);

                if (this.currentTab === 'incoming') {
                    const pending = res.data.filter(t => t.status === 'pending');
                    const badge = document.getElementById('incomingBadge');
                    if (pending.length > 0) {
                        badge.textContent = pending.length;
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            } else {
                content.innerHTML = `<div class="text-center p-xl text-error">${res.message}</div>`;
            }
        } catch (e) {
            console.error(e);
            content.innerHTML = '<div class="text-center p-xl text-error">Network Error</div>';
        }
    }

    renderTransfers(transfers) {
        const content = document.getElementById('transferContent');

        if (!transfers || transfers.length === 0) {
            content.innerHTML = '<div class="text-center p-xl text-muted">No transfers found.</div>';
            return;
        }

        const batches = {};
        transfers.forEach(t => {
            if (!batches[t.batch_id]) {
                batches[t.batch_id] = {
                    batch_id: t.batch_id,
                    created_at: t.created_at,
                    status: t.status,
                    from_loc_name: t.from_loc_name,
                    from_branch_id: t.from_loc_id,
                    to_loc_name: t.to_loc_name,
                    to_branch_id: t.to_loc_id,
                    user_name: t.user_name,
                    reviewer_name: t.reviewer_name,
                    items: []
                };
            }
            batches[t.batch_id].items.push(t);
        });

        content.innerHTML = Object.values(batches).map(batch =>
            this.renderBatchCard(batch)
        ).join('');

        this.attachBatchEvents(batches);
    }

    renderBatchCard(batch) {
        const statusBadge = this.getStatusBadge(batch.status);
        const date = new Date(batch.created_at).toLocaleString();
        const itemCount = batch.items.length;

        let roleBadge = '';
        if (this.currentTab === 'incoming') {
            roleBadge = `<span class="badge badge-info text-xs"><i class="fa-solid fa-arrow-down"></i> Receiver</span>`;
        } else if (this.currentTab === 'outgoing') {
            roleBadge = `<span class="badge badge-neutral text-xs"><i class="fa-solid fa-arrow-up"></i> Sender</span>`;
        }

        return `
            <div class="card mb-md">
                <div class="p-md flex items-center gap-md cursor-pointer batch-header" data-batch="${batch.batch_id}">
                    
                    <div class="flex-none" style="width: 200px;">
                        <div class="flex items-center gap-sm mb-xs">
                            <span class="font-bold text-sm">${batch.batch_id}</span>
                        </div>
                        <div class="text-xs text-muted">
                             <i class="fa-solid fa-calendar"></i> ${date}
                        </div>
                         <div class="text-xs text-muted mt-xs">
                             <i class="fa-solid fa-user"></i> ${batch.user_name || 'Unknown'}
                        </div>
                    </div>

                    <div class="flex-1 flex flex-col items-center justify-center text-center px-md border-l border-r border-neutral-100">
                        <div class="flex items-center gap-md text-sm font-semibold text-neutral-800">
                            <span class="text-right flex-1">${batch.from_loc_name}</span>
                            <i class="fa-solid fa-arrow-right-long text-neutral-400"></i>
                            <span class="text-left flex-1">${batch.to_loc_name}</span>
                        </div>
                        <div class="mt-xs">
                            ${roleBadge} <span class="badge badge-neutral text-xs ml-sm">${itemCount} items</span>
                        </div>
                    </div>

                    <div class="flex-none flex items-center justify-end gap-md" style="min-width: 180px;">
                        ${statusBadge}
                        <button class="btn btn-sm btn-ghost btn-download-batch" data-batch="${batch.batch_id}" title="Download CSV">
                            <i class="fa-solid fa-file-csv fa-lg"></i>
                        </button>
                        <div class="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-50 hover:bg-neutral-100 transition-colors">
                            <i class="fa-solid fa-chevron-down text-muted transition-transform chevron-icon"></i>
                        </div>
                    </div>

                </div>
                
                <div class="batch-body hidden border-t border-neutral-200">
                    ${this.renderBatchBody(batch)}
                </div>
            </div>
        `;
    }

    renderBatchBody(batch) {
        const isPending = batch.status === 'pending';
        const isIncoming = this.currentTab === 'incoming';
        const canApprove = isPending && isIncoming;

        const itemsTable = `
            <table class="w-full text-sm">
                <thead class="bg-neutral-50">
                    <tr>
                        ${canApprove ? '<th class="p-sm"><input type="checkbox" class="select-all-items" data-batch="${batch.batch_id}"></th>' : ''}
                        <th class="p-sm text-left">Product</th>
                        <th class="p-sm text-left">SKU</th>
                        <th class="p-sm text-center">Sent Qty</th>
                        ${canApprove ? '<th class="p-sm text-center">Received Qty</th>' : ''}
                        ${canApprove ? '<th class="p-sm text-left">Notes</th>' : ''}
                        ${batch.status !== 'pending' ? '<th class="p-sm text-left">Status</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${batch.items.map(item => this.renderItem(item, canApprove)).join('')}
                </tbody>
            </table>
        `;

        const actions = canApprove ? `
            <div class="flex justify-end gap-sm mt-md">
                <button class="btn btn-secondary btn-reject-batch" data-batch="${batch.batch_id}">
                    <i class="fa-solid fa-xmark"></i> Reject
                </button>
                <button class="btn btn-primary btn-approve-batch" data-batch="${batch.batch_id}">
                    <i class="fa-solid fa-check"></i> Approve
                </button>
            </div>
        ` : '';

        return `<div class="p-md">${itemsTable}${actions}</div>`;
    }

    renderItem(item, canApprove) {
        const checkbox = canApprove ? `<input type="checkbox" class="item-checkbox" data-id="${item.id}" data-sent="${item.qty}" checked>` : '';
        const receivedInput = canApprove ? `<input type="number" class="form-input form-input-sm received-qty" data-id="${item.id}" value="${item.qty}" min="0" max="${item.qty}" style="width: 80px;">` : '';
        const notesInput = canApprove ? `<input type="text" class="form-input form-input-sm notes-input" data-id="${item.id}" placeholder="Optional notes..." style="width: 200px;">` : '';
        const statusCol = item.status !== 'pending' ? `<td class="p-sm">${this.getStatusBadge(item.status)}</td>` : '';

        return `
            <tr class="${item.status === 'discrepancy' ? 'bg-error-50' : ''}">
                ${canApprove ? `<td class="p-sm text-center">${checkbox}</td>` : ''}
                <td class="p-sm">${item.product_name}</td>
                <td class="p-sm text-muted">${item.sku || '-'}</td>
                <td class="p-sm text-center font-semibold">${item.qty}</td>
                ${canApprove ? `<td class="p-sm text-center">${receivedInput}</td>` : ''}
                ${canApprove ? `<td class="p-sm">${notesInput}</td>` : ''}
                ${statusCol}
            </tr>
        `;
    }

    attachBatchEvents(batchesData) {
        document.querySelectorAll('.batch-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-download-batch')) return;

                const body = header.nextElementSibling;
                const icon = header.querySelector('.chevron-icon');
                body.classList.toggle('hidden');
                icon.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
            });
        });

        document.querySelectorAll('.btn-download-batch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const batchId = btn.dataset.batch;
                const batch = batchesData[batchId];
                if (batch) {
                    this.generateCSV(batch.items, `transfer_${batchId}.csv`);
                }
            });
        });

        document.querySelectorAll('.select-all-items').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const container = e.target.closest('table');
                container.querySelectorAll('.item-checkbox').forEach(item => item.checked = e.target.checked);
            });
        });

        document.querySelectorAll('.btn-approve-batch').forEach(btn => {
            btn.addEventListener('click', () => this.approveBatch(btn.dataset.batch));
        });

        document.querySelectorAll('.btn-reject-batch').forEach(btn => {
            btn.addEventListener('click', () => this.rejectBatch(btn.dataset.batch));
        });
    }

    generateCSV(data, filename) {
        if (!data || data.length === 0) return;

        const headers = ['Batch ID', 'Date', 'Status', 'From Branch', 'To Branch', 'User', 'Product', 'SKU', 'Sent Qty'];

        const rows = data.map(row => [
            row.batch_id,
            new Date(row.created_at).toLocaleDateString(),
            row.status,
            row.from_loc_name,
            row.to_loc_name,
            row.user_name,
            row.product_name,
            row.sku || '',
            row.qty
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(e => e.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async approveBatch(batchId) {
        const user = this.state.getUser();
        const batchBody = document.querySelector(`.btn-approve-batch[data-batch="${batchId}"]`).closest('.batch-body');
        const checkboxes = batchBody.querySelectorAll('.item-checkbox:checked');

        if (checkboxes.length === 0) {
            Toast.error("No items selected");
            return;
        }

        const approvals = [];
        let hasError = false;

        checkboxes.forEach(cb => {
            const id = cb.dataset.id;
            const sent = parseInt(cb.dataset.sent);
            const receivedInput = batchBody.querySelector(`.received-qty[data-id="${id}"]`);
            const notesInput = batchBody.querySelector(`.notes-input[data-id="${id}"]`);

            const received = parseInt(receivedInput.value);
            const notes = notesInput.value;

            if (received > sent) {
                Toast.error(`Received quantity cannot exceed sent quantity for item ${id}`);
                hasError = true;
                return;
            }

            approvals.push({
                log_id: id,
                received_qty: received,
                notes: notes
            });
        });

        if (hasError) return;

        Modal.open({
            title: "Confirm Approval",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-check-circle text-success-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="mb-md">Approve ${approvals.length} items from batch <b>${batchId}</b>?</p>
                    <p class="text-xs text-muted">This will update stock and notify the sender.</p>
                </div>
            `,
            confirmText: "Approve Transfer",
            onConfirm: async () => {
                const res = await API.approveTransfer(batchId, approvals, user.id);
                if (res.status === 'success') {
                    Toast.success("Transfer approved");
                    this.loadTransfers();
                } else {
                    Toast.error(res.message);
                    throw new Error(res.message);
                }
            }
        });
    }

    async rejectBatch(batchId) {
        Modal.open({
            title: "Reject Transfer",
            body: `
                <div class="text-center">
                    <i class="fa-solid fa-xmark-circle text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <p class="mb-md">Reject batch <b>${batchId}</b>?</p>
                    <p class="text-xs text-muted">Items will be returned to sender's inventory.</p>
                </div>
            `,
            confirmText: "Reject",
            onConfirm: async () => {
                Toast.info("Reject feature coming soon");
            }
        });
    }

    async showNewTransferModal() {
        const user = this.state.getUser();
        const inventory = this.state.getInventory();

        if (!inventory || inventory.length === 0) {
            Toast.error("No inventory loaded. Go to Dashboard first.");
            return;
        }

        const branchesRes = await API.getBranchesWithCashiers(user.branch_id);
        if (branchesRes.status !== 'success' || branchesRes.data.length === 0) {
            Toast.error("No destination branches available");
            return;
        }

        const productOptions = inventory.map(p =>
            `<option value="${p.id}">${p.name} (${p.sku || 'No SKU'})</option>`
        ).join('');

        const branchOptions = branchesRes.data.map(b =>
            `<option value="${b.id}">${b.name}</option>`
        ).join('');

        Modal.open({
            title: "New Transfer",
            size: 'lg',
            body: `
                <div class="form-group mb-md">
                    <label class="form-label">Destination Branch</label>
                    <select id="destBranch" class="form-select">
                        <option value="">Select destination...</option>
                        ${branchOptions}
                    </select>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Add Products</label>
                    <div class="flex gap-sm mb-sm">
                        <select id="productSelect" class="form-select flex-1">
                            <option value="">Select product...</option>
                            ${productOptions}
                        </select>
                        <input type="number" id="productQty" class="form-input" placeholder="Qty" min="1" value="1" style="width: 100px;">
                        <button class="btn btn-secondary" id="addProductBtn">Add</button>
                    </div>
                </div>

                <div id="selectedProducts" class="border border-neutral-200 rounded p-sm" style="min-height: 100px; max-height: 300px; overflow-y: auto;">
                    <p class="text-muted text-sm text-center p-md">No products added yet</p>
                </div>
            `,
            confirmText: "Initiate Transfer",
            onConfirm: async () => {
                const destBranch = document.getElementById('destBranch').value;
                const items = this.getSelectedTransferItems();

                if (!destBranch) {
                    Toast.error("Select destination branch");
                    throw new Error("Validation failed");
                }

                if (items.length === 0) {
                    Toast.error("Add at least one product");
                    throw new Error("Validation failed");
                }

                const res = await API.initiateTransfer(items, user.id, destBranch);
                if (res.status === 'success') {
                    Toast.success("Transfer initiated");
                    this.loadTransfers();
                } else {
                    Toast.error(res.message);
                    throw new Error(res.message);
                }
            }
        });

        this.attachTransferModalEvents();
    }

    attachTransferModalEvents() {
        const selectedMap = new Map();

        document.getElementById('addProductBtn').addEventListener('click', () => {
            const select = document.getElementById('productSelect');
            const qtyInput = document.getElementById('productQty');
            const productId = select.value;
            const qty = parseInt(qtyInput.value);

            if (!productId) {
                Toast.error("Select a product");
                return;
            }

            if (!qty || qty < 1) {
                Toast.error("Enter valid quantity");
                return;
            }

            const productName = select.options[select.selectedIndex].text;
            selectedMap.set(productId, { product_id: productId, qty, name: productName });
            this.renderSelectedProducts(selectedMap);

            select.value = '';
            qtyInput.value = 1;
        });

        this.selectedProductsMap = selectedMap;
    }

    renderSelectedProducts(map) {
        const container = document.getElementById('selectedProducts');

        if (map.size === 0) {
            container.innerHTML = '<p class="text-muted text-sm text-center p-md">No products added yet</p>';
            return;
        }

        container.innerHTML = Array.from(map.values()).map(item => `
            <div class="flex items-center justify-between p-sm border-b border-neutral-200">
                <span class="text-sm flex-1">${item.name}</span>
                <span class="badge badge-neutral mx-sm">${item.qty}x</span>
                <button class="btn btn-sm btn-danger" onclick="this.closest('.flex').remove()">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    getSelectedTransferItems() {
        return this.selectedProductsMap ? Array.from(this.selectedProductsMap.values()) : [];
    }

    getStatusBadge(status) {
        const badges = {
            pending: '<span class="badge badge-warning">Pending</span>',
            completed: '<span class="badge badge-success">Completed</span>',
            discrepancy: '<span class="badge badge-error">Discrepancy</span>',
            rejected: '<span class="badge badge-neutral">Rejected</span>'
        };
        return badges[status] || '<span class="badge badge-neutral">Unknown</span>';
    }

    startNotificationPolling() {
        if (this.notificationInterval) clearInterval(this.notificationInterval);

        this.notificationInterval = setInterval(() => {
            if (this.currentTab === 'incoming') {
                this.loadTransfers();
            }
        }, 30000); // Every 30 seconds
    }

    cleanup() {
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
        }
    }
}

module.exports = TransfersView;