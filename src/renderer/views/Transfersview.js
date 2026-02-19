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
            <div class="page-header mb-md">
                <div class="header-row">
                    <h1 class="page-title text-neutral-800 font-normal">Transfer Management</h1>
                </div>

                <div class="tabs mt-md" style="border-bottom: 1px solid #c3c4c7;">
                    <button class="tab-btn ${this.currentTab === 'pending_incoming' ? 'active' : ''}" data-tab="pending_incoming">Incoming (To Receive)</button>
                    <button class="tab-btn ${this.currentTab === 'pending_outgoing' ? 'active' : ''}" data-tab="pending_outgoing">Outgoing (Sent by Me)</button>
                    <button class="tab-btn ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
                </div>
            </div>

            <div class="flex items-center gap-sm mb-md p-sm" style="background: #f8f9fa; border: 1px solid #c3c4c7; border-radius: 4px; flex-wrap: wrap;">
                
                <div class="flex items-center">
                    <input type="date" id="dateStart" class="form-input form-input-sm" style="width: 140px; background: white; border-color: #8c8f94;" value="${this.filters.start}" title="From Date">
                </div>
                
                <div class="flex items-center">
                    <input type="date" id="dateEnd" class="form-input form-input-sm" style="width: 140px; background: white; border-color: #8c8f94;" value="${this.filters.end}" title="To Date">
                </div>

                <div class="search-box flex-1" style="min-width: 250px;">
                    <i class="fa-solid fa-search" style="font-size: 13px; color: #8c8f94; left: 10px;"></i>
                    <input type="text" id="transferSearch" class="search-input form-input-sm w-full" 
                           style="background: white; padding-left: 32px; border-color: #8c8f94;" 
                           placeholder="Filter by registered Batch ID or Product..." 
                           value="${this.filters.search}">
                </div>

                <button class="btn btn-sm" id="refreshBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1;">
                    Filter
                </button>
                
                <button class="btn btn-sm btn-ghost" id="exportCsvBtn" style="border: 1px solid #8c8f94; color: #2c3338; background: white;">
                    <i class="fa-solid fa-file-csv"></i> Export
                </button>
            </div>

            <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: white; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="width: 40px; padding: 10px; border-bottom: 1px solid #c3c4c7;"></th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Batch ID <i class="fa-solid fa-sort text-muted text-xs"></i></th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Date <i class="fa-solid fa-sort text-muted text-xs"></i></th>
                                <th class="text-center" style="padding: 10px; border-bottom: 1px solid #c3c4c7;"><i class="fa-solid fa-arrows-turn-to-dots" style="color: #a7aaad;"></i></th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">From</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">To</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Items (Sent)</th>
                                <th class="text-center" style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Discrepancy</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Status</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="transfersTableBody">
                            <tr><td colspan="10" class="text-center p-lg text-muted">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="pagination" id="paginationControls" style="border-top: 1px solid #c3c4c7; background: #f8f9fa;"></div>
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
            tbody.innerHTML = '<tr><td colspan="10" class="text-center p-lg text-muted" style="background: #f9f9f9;">No transfers found matching your filters.</td></tr>';
            return;
        }

        tbody.innerHTML = transfers.map(t => {
            let actions = '';

            // Clean action buttons mirroring the WP/WC style
            if (t.status === 'pending') {
                if (isAdmin || userBranch == t.to_loc_id) {
                    actions += `<button class="btn btn-sm btn-primary btn-review" data-id="${t.batch_id}" style="padding: 4px 10px; font-weight: normal; font-size: 13px;">Review</button> `;
                }
                if (isAdmin || userBranch == t.from_loc_id) {
                    actions += `<button class="btn btn-sm btn-ghost btn-cancel" data-id="${t.batch_id}" style="padding: 4px 10px; color: #b32d2e; border-color: transparent; font-weight: normal; font-size: 13px;">Cancel</button> `;
                }
            } else {
                actions += `<button class="btn btn-sm btn-ghost btn-view" data-id="${t.batch_id}" title="View Details" style="padding: 4px 8px; border-color: transparent;"><i class="fa-solid fa-eye" style="color: #2271b1; font-size: 14px;"></i></button> `;
                actions += `<button class="btn btn-sm btn-ghost btn-print" data-id="${t.batch_id}" title="Print PDF" style="padding: 4px 8px; border-color: transparent;"><i class="fa-solid fa-print" style="color: #50575e; font-size: 14px;"></i></button> `;
            }

            // Use the current tab to reliably determine the direction icon intent
            let dirIcon = '<i class="fa-solid fa-minus" style="color: #a7aaad;"></i>';

            if (this.currentTab === 'pending_incoming') {
                dirIcon = '<i class="fa-solid fa-arrow-down" style="color: #00a32a;" title="Incoming"></i>';
            } else if (this.currentTab === 'pending_outgoing') {
                dirIcon = '<i class="fa-solid fa-arrow-up" style="color: #d63638;" title="Outgoing"></i>';
            } else if (userBranch) {
                // Fallback for the History tab
                if (userBranch === t.to_loc_id) {
                    dirIcon = '<i class="fa-solid fa-arrow-down" style="color: #00a32a;" title="Incoming"></i>';
                } else if (userBranch === t.from_loc_id) {
                    dirIcon = '<i class="fa-solid fa-arrow-up" style="color: #d63638;" title="Outgoing"></i>';
                }
            }

            // Discrepancy logic
            let discHtml = '<span style="color: #a7aaad;">-</span>';
            if (t.status === 'completed' || t.status === 'rejected') {
                const diff = (parseInt(t.total_received_qty) || 0) - (parseInt(t.total_qty) || 0);
                if (diff < 0) discHtml = `<span style="color: #d63638; font-weight: 600;">${diff}</span>`;
                else if (diff > 0) discHtml = `<span style="color: #dba617; font-weight: 600;">+${diff}</span>`;
                else discHtml = `<span style="color: #00a32a;"><i class="fa-solid fa-check"></i></span>`;
            }

            // Flat Status Badges
            let statusStyle = '';
            const st = t.status.toLowerCase();
            if (st === 'completed') {
                statusStyle = 'background: #e2e8f0; color: #334155; padding: 4px 12px; border-radius: 4px; font-weight: 500; font-size: 13px;';
            } else if (st === 'pending') {
                statusStyle = 'background: #fef3c7; color: #b45309; padding: 4px 12px; border-radius: 4px; font-weight: 500; font-size: 13px;';
            } else if (st === 'rejected' || st === 'canceled') {
                statusStyle = 'background: #fee2e2; color: #b91c1c; padding: 4px 12px; border-radius: 4px; font-weight: 500; font-size: 13px;';
            }

            // Standardize Date
            const dateStr = new Date(t.created_at);
            const timeAgo = this.timeSince(dateStr);

            return `
                <tr class="hover:bg-neutral-50 transition-colors" style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                    <td class="text-center text-muted cursor-pointer expand-toggle" data-batch="${t.batch_id}" style="padding: 12px;">
                        <i class="fa-solid fa-chevron-right" id="icon-${t.batch_id}" style="transition: transform 0.2s; color: #a7aaad;"></i>
                    </td>
                    <td style="padding: 12px;">
                        <span class="btn-view cursor-pointer" data-id="${t.batch_id}" style="color: #2271b1; font-weight: 600;">#${t.batch_id}</span>
                    </td>
                    <td style="padding: 12px; color: #50575e;">${timeAgo}</td>
                    <td class="text-center" style="padding: 12px;">${dirIcon}</td>
                    <td style="padding: 12px; color: #50575e;">${t.from_location}</td>
                    <td style="padding: 12px; color: #50575e;">${t.to_location}</td>
                    <td style="padding: 12px; color: #50575e;">${t.item_count} items <span style="color: #a7aaad;">(${t.total_qty} qty)</span></td>
                    <td class="text-center" style="padding: 12px;">${discHtml}</td>
                    <td style="padding: 12px;">
                        <span style="${statusStyle}">${t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
                    </td>
                    <td style="padding: 12px;">
                        <div class="flex gap-xs items-center">
                            ${actions}
                        </div>
                    </td>
                </tr>
                <tr class="hidden" id="expanded-${t.batch_id}">
                    <td colspan="10" class="p-0 border-b border-neutral-300" style="background: #f8f9fa;">
                        <div id="expanded-content-${t.batch_id}" 
                             style="margin: 0.5rem 1rem 1rem 3rem; border-left: 3px solid #2271b1; background: white; border-radius: 0 4px 4px 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" 
                             class="p-md">
                            <div class="text-center py-sm" style="color: #8c8f94;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching transfer items...</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach Expand Listeners
        document.querySelectorAll('.expand-toggle').forEach(td => {
            td.addEventListener('click', () => this.toggleExpand(td.dataset.batch));
        });

        // Re-attach view details to the Batch ID link as well
        document.querySelectorAll('.btn-view').forEach(btn => btn.addEventListener('click', () => this.showDetailsModal(btn.dataset.id)));
        document.querySelectorAll('.btn-review').forEach(btn => btn.addEventListener('click', () => this.showReviewModal(btn.dataset.id)));
        document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => this.handleCancel(btn.dataset.id)));
        document.querySelectorAll('.btn-print').forEach(btn => btn.addEventListener('click', () => this.printTransfer(btn.dataset.id)));
    }

    // Helper function to create the "15 hours ago" look
    timeSince(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    }

    async showReviewModal(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error(res.message);
        const data = res.data;

        const initiatedAtStr = new Date(data.created_at).toLocaleString();

        const itemsHtml = data.items.map(i => `
            <tr class="border-b border-neutral-200">
                <td class="py-sm">
                    <div class="font-semibold text-sm">${i.product_name}</div>
                    <div class="text-xs text-muted font-mono">${i.product_sku || ''}</div>
                </td>
                <td class="text-center font-bold" style="color: #2271b1;">${i.qty}</td>
                <td style="width: 100px;">
                    <input type="number" class="form-input form-input-sm recv-qty text-center font-bold" 
                           data-id="${i.id}" value="${i.qty}" min="0">
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
                <div class="mb-md flex gap-md p-md bg-neutral-50 rounded border border-neutral-200 relative">
                    <div class="flex-1"><span class="text-muted text-xs">SENDER</span><br><strong>${data.from_location}</strong></div>
                    <div class="flex-1"><span class="text-muted text-xs">DESTINATION</span><br><strong>${data.to_location}</strong></div>
                    <div class="text-right">
                        <span class="text-xs text-muted">Sent by: <strong>${data.initiated_by}</strong></span><br>
                        <span class="text-xs text-neutral-500"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</span>
                    </div>
                </div>
                
                <div class="alert bg-info-50 mb-md text-sm border border-info-200 p-sm rounded" style="color: #004085;">
                    <i class="fa-solid fa-circle-info" style="color: #004085;"></i>
                    Verify the quantities received. If the numbers mismatch, adjust them up or down. Inventory for both branches will balance automatically.
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

                    // Removed the val > max check
                    if (val < 0 || isNaN(val)) {
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

    async showDetailsModal(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error(res.message);

        const data = res.data;
        const items = data.items;
        const firstItem = items[0] || {};

        const initiatedAtStr = new Date(data.created_at).toLocaleString();
        const approvedAtStr = firstItem.approved_at ? new Date(firstItem.approved_at).toLocaleString() : '';

        const itemsHtml = items.map(i => {
            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
            // Orange/Warning color if excess items, Red/Error if missing items
            const qtyClass = diff < 0 ? 'text-error' : (diff > 0 ? 'text-warning' : 'text-success');

            return `
                <tr class="border-b border-neutral-100">
                    <td class="py-sm">
                        <div class="font-semibold text-sm">${i.product_name}</div>
                        <div class="text-xs text-muted font-mono">${i.product_sku || ''}</div>
                    </td>
                    <td class="text-center">${i.qty}</td>
                    <td class="text-center font-bold ${qtyClass}">
                        ${i.received_qty !== null ? i.received_qty : '-'}
                    </td>
                    <td class="text-sm text-muted">${i.note || '-'}</td>
                </tr>
            `;
        }).join('');

        let actionVerb = 'Handled';
        if (data.status === 'completed') actionVerb = 'Approved';
        if (data.status === 'rejected') actionVerb = 'Rejected';
        if (data.status === 'canceled') actionVerb = 'Canceled';

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
                        <div class="mb-sm">
                            <span class="text-muted">Sent by:</span> <strong>${data.initiated_by}</strong>
                            <div class="text-xs text-muted mt-xs"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</div>
                        </div>
                        ${data.status !== 'pending' ? `
                        <div>
                            <span class="text-muted">${actionVerb} by:</span> <strong>${data.approved_by || 'System'}</strong>
                            <div class="text-xs text-muted mt-xs"><i class="fa-regular fa-clock"></i> ${approvedAtStr}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="table-container">
                    <table class="w-full text-left">
                        <thead>
                            <tr>
                                <th class="pb-sm text-xs text-muted uppercase">Product</th>
                                <th class="text-center pb-sm text-xs text-muted uppercase">Sent</th>
                                <th class="text-center pb-sm text-xs text-muted uppercase">Received</th>
                                <th class="pb-sm text-xs text-muted uppercase">Notes</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
            `,
            confirmText: "Close",
            onConfirm: () => {}
        });
    }

    async toggleExpand(batchId) {
        const row = document.getElementById(`expanded-${batchId}`);
        const icon = document.getElementById(`icon-${batchId}`);
        const content = document.getElementById(`expanded-content-${batchId}`);

        if (row.classList.contains('hidden')) {
            row.classList.remove('hidden');
            icon.style.transform = 'rotate(90deg)';
            icon.style.color = '#2271b1';

            if (content.dataset.loaded !== 'true') {
                try {
                    const res = await API.getTransferDetails(batchId);
                    if (res.status === 'success') {
                        const data = res.data;
                        const items = data.items;

                        const itemsHtml = items.map(i => {
                            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
                            // Orange/Warning color if excess items, Red/Error if missing items
                            const qtyClass = diff < 0 ? 'text-error' : (diff > 0 ? 'text-warning' : 'text-neutral-700');

                            return `
                                <tr class="hover:bg-neutral-50 transition-colors" style="border-bottom: 1px solid #f0f0f1;">
                                    <td class="text-xs font-mono text-muted pl-md py-sm">${i.product_sku || '-'}</td>
                                    <td class="text-sm font-semibold text-neutral-800 py-sm">${i.product_name}</td>
                                    <td class="text-center text-sm font-bold py-sm" style="color: #2271b1;">${i.qty}</td>
                                    <td class="text-center text-sm font-bold ${qtyClass} py-sm">${i.received_qty !== null ? i.received_qty : '-'}</td>
                                    <td class="text-sm text-muted italic py-sm">${i.note || '-'}</td>
                                </tr>
                            `;
                        }).join('');

                        const firstItem = items[0] || {};
                        const initiatedAtStr = new Date(data.created_at).toLocaleString();
                        const approvedAtStr = firstItem.approved_at ? new Date(firstItem.approved_at).toLocaleString() : '';

                        let metaHtml = `
                            <div class="flex gap-lg text-sm mb-md" style="padding-bottom: 10px; border-bottom: 1px dashed #dcdcde;">
                                <div>
                                    <span style="color: #8c8f94;">Initiated By:</span> 
                                    <span style="font-weight: 600; color: #2c3338;">${data.initiated_by}</span> 
                                    <span style="color: #8c8f94; font-size: 12px; margin-left: 4px;"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</span>
                                </div>
                        `;

                        if (data.status !== 'pending') {
                            const actionVerb = data.status === 'completed' ? 'Approved' : 'Handled';
                            metaHtml += `
                                <div>
                                    <span style="color: #8c8f94;">${actionVerb} By:</span> 
                                    <span style="font-weight: 600; color: #2c3338;">${data.approved_by || 'System'}</span> 
                                    <span style="color: #8c8f94; font-size: 12px; margin-left: 4px;"><i class="fa-regular fa-clock"></i> ${approvedAtStr}</span>
                                </div>
                            `;
                        }
                        metaHtml += `</div>`;

                        content.innerHTML = `
                            <div class="mb-sm flex justify-between items-center">
                                <h4 class="text-sm font-bold uppercase tracking-wider" style="color: #50575e;">
                                    <i class="fa-solid fa-box-open mr-xs" style="color: #a7aaad;"></i> Transfer Details
                                </h4>
                                <span style="background: #f0f0f1; color: #3c434a; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                                    ${items.length} Product${items.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            
                            ${metaHtml}

                            <div style="border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                    <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                                        <tr>
                                            <th class="text-xs uppercase pl-md py-sm text-left" style="color: #646970; font-weight: 600;">SKU</th>
                                            <th class="text-xs uppercase py-sm text-left" style="color: #646970; font-weight: 600;">Product Name</th>
                                            <th class="text-xs uppercase text-center py-sm" style="color: #646970; font-weight: 600;">Sent Qty</th>
                                            <th class="text-xs uppercase text-center py-sm" style="color: #646970; font-weight: 600;">Received</th>
                                            <th class="text-xs uppercase py-sm text-left" style="color: #646970; font-weight: 600;">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody style="background: white;">${itemsHtml}</tbody>
                                </table>
                            </div>
                        `;
                        content.dataset.loaded = 'true';
                    } else {
                        content.innerHTML = `<div class="text-error text-center p-sm"><i class="fa-solid fa-circle-exclamation"></i> ${res.message}</div>`;
                    }
                } catch (e) {
                    content.innerHTML = `<div class="text-error text-center p-sm"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load transfer items.</div>`;
                }
            }
        } else {
            row.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
            icon.style.color = '#a7aaad';
        }
    }

    getBadgeColor(status) {
        const map = { completed: 'success', pending: 'warning', rejected: 'error', canceled: 'neutral' };
        return map[status] || 'neutral';
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