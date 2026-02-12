class StockComparison {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.state = dashboard.state;
    }

    async render(products) {
        const mainContent = document.getElementById('mainContent');

        if (products.length === 0) {
            mainContent.innerHTML = '<div class="card p-lg text-center text-muted">No products found</div>';
            return;
        }

        // 1. Load Locations to map IDs to Names
        const locations = await this.state.loadLocations();
        const locationMap = {};
        locations.forEach(l => locationMap[l.id] = l.name);

        const f = this.state.getFilters();

        const sortIcon = (field) => {
            if (f.sortBy !== field) return '<i class="fa-solid fa-sort text-muted"></i>';
            return f.sortOrder === 'ASC'
                ? '<i class="fa-solid fa-sort-up text-primary"></i>'
                : '<i class="fa-solid fa-sort-down text-primary"></i>';
        };

        const rows = products.map(p => {
            const wcStock = p.wc_stock || 0;
            const localStock = p.local_stock || 0;
            const difference = p.difference || 0;

            const diffClass = difference > 0 ? 'text-warning' : difference < 0 ? 'text-error' : 'text-success';
            const diffIcon = difference > 0 ? '↑' : difference < 0 ? '↓' : '✓';

            const imageHtml = p.image_url
                ? `<img src="${p.image_url}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'">`
                : '';

            // --- BUILD DISTRIBUTION BADGES ---
            let distributionHtml = '<span class="text-muted text-xs italic">No local stock</span>';

            if (p.stock_breakdown) {
                const badges = p.stock_breakdown.toString().split(',').map(pair => {
                    const [lid, qty] = pair.split(':');
                    const name = locationMap[lid] || `Loc #${lid}`;
                    const q = parseInt(qty);

                    if (q === 0) return ''; // Skip empty branches to save space

                    // Color code badges based on stock level
                    let badgeClass = 'bg-neutral-100 text-neutral-700 border-neutral-200'; // Default
                    if (q > 50) badgeClass = 'bg-success-50 text-success-700 border-success-200';
                    else if (q < 5) badgeClass = 'bg-warning-50 text-warning-700 border-warning-200';

                    return `
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badgeClass} mr-1 mb-1">
                            ${name}: <strong>${q}</strong>
                        </span>
                    `;
                }).join('');

                if (badges) distributionHtml = `<div class="flex flex-wrap" style="max-width: 300px;">${badges}</div>`;
            }

            return `
                <tr class="${Math.abs(difference) > 10 ? 'bg-warning-50' : ''}">
                    <td style="width: 50px;">${imageHtml}</td>
                    <td>
                        <div class="font-semibold text-sm">${p.name}</div>
                        <div class="text-xs text-muted">${p.category || '-'}</div>
                    </td>
                    <td class="font-mono text-xs">${p.sku || '-'}</td>
                    
                    <td class="text-right font-bold text-primary">${wcStock}</td>
                    <td class="text-right font-bold border-l border-neutral-200">${localStock}</td>
                    
                    <td class="py-sm">${distributionHtml}</td>

                    <td class="text-right font-bold ${diffClass}">
                        ${diffIcon} ${Math.abs(difference)}
                    </td>
                    <td class="text-right">
                        ${difference > 0 ? `
                        <button class="btn btn-sm btn-secondary btn-sync-stock" 
                                data-id="${p.id}"
                                data-name="${p.name.replace(/"/g, '&quot;')}"
                                data-wc="${wcStock}"
                                data-local="${localStock}"
                                data-diff="${difference}"
                                title="Transfer from WC to Branch">
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        mainContent.innerHTML = `
            <div class="card">
                <div class="card-header p-md border-b border-neutral-200">
                    <div class="flex justify-between items-center">
                        <h3 class="font-bold">Stock Comparison</h3>
                        <div class="text-xs text-muted">
                            Comparing WooCommerce Pool vs Branch Totals
                        </div>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px;"></th>
                                <th class="sortable" data-field="name">Product ${sortIcon('name')}</th>
                                <th class="sortable" data-field="sku">SKU ${sortIcon('sku')}</th>
                                
                                <th class="sortable text-right" data-field="wc_stock">WC Pool ${sortIcon('wc_stock')}</th>
                                <th class="sortable text-right border-l border-neutral-200" data-field="local_stock">Total Local ${sortIcon('local_stock')}</th>
                                
                                <th>Stock Distribution</th> <th class="sortable text-right" data-field="difference">Diff ${sortIcon('difference')}</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    attachEvents() {
        document.querySelectorAll('.btn-sync-stock').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const name = btn.dataset.name;
                const wcStock = parseInt(btn.dataset.wc);
                const localStock = parseInt(btn.dataset.local);
                const difference = parseInt(btn.dataset.diff);
                this.showSyncModal(id, name, wcStock, localStock, difference);
            });
        });

        document.querySelectorAll('.sortable').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.field;
                this.state.toggleSort(field);
                this.dashboard.loadData();
            });
        });
    }

    async showSyncModal(productId, productName, wcStock, localStock, difference) {
        const locations = await this.state.loadLocations();
        const Modal = require('../../components/Modal.js');
        const Toast = require('../../components/Toast.js');
        const API = require('../../services/api.js');

        const locationOptions = locations
            .map(l => `<option value="${l.id}">${l.name}</option>`)
            .join('');

        Modal.open({
            title: `Transfer Stock: ${productName}`,
            body: `
                <div class="mb-md p-md bg-neutral-100 rounded">
                    <div class="flex justify-between mb-sm">
                        <span class="text-sm text-neutral-700">WooCommerce Pool:</span>
                        <span class="font-bold text-primary">${wcStock}</span>
                    </div>
                    <div class="flex justify-between mb-sm">
                        <span class="text-sm text-neutral-700">Total in Branches:</span>
                        <span class="font-bold">${localStock}</span>
                    </div>
                    <div class="flex justify-between pt-sm border-t border-neutral-300">
                        <span class="text-sm font-semibold">Unallocated Stock:</span>
                        <span class="font-bold text-success">
                            ${difference}
                        </span>
                    </div>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Transfer to Branch</label>
                    <select id="syncToBranch" class="form-select">
                        <option value="">-- Select Branch --</option>
                        ${locationOptions}
                    </select>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Quantity to Transfer</label>
                    <input type="number" id="syncQty" class="form-input" 
                           value="${Math.min(difference, wcStock)}" min="1" max="${difference}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Reason</label>
                    <textarea id="syncReason" class="form-input" rows="2">Stock synchronization</textarea>
                </div>
            `,
            confirmText: "Transfer Stock",
            onConfirm: async () => {
                const branchId = document.getElementById('syncToBranch').value;
                const qty = parseInt(document.getElementById('syncQty').value);
                const reason = document.getElementById('syncReason').value;

                if (!branchId) {
                    Toast.error("Please select a branch");
                    throw new Error("Validation failed");
                }
                if (isNaN(qty) || qty <= 0) {
                    Toast.error("Invalid quantity");
                    throw new Error("Validation failed");
                }

                const res = await API.adjustStock(productId, branchId, qty, reason);
                if (res.status === 'success') {
                    Toast.success("Stock transferred successfully");
                    this.state.invalidateInventoryCache();
                    this.dashboard.loadData();
                } else {
                    Toast.error(res.message);
                    throw new Error(res.message);
                }
            }
        });
    }
}

module.exports = StockComparison;