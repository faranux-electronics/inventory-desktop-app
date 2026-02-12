const Toast = require('../../components/Toast.js');
const Modal = require('../../components/Modal.js');
const API = require('../../services/api.js');

class BulkActions {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.state = dashboard.state;
    }

    render() {
        const container = document.getElementById('bulkActionsContainer');
        container.innerHTML = `
            <div id="selectionActions" class="selection-actions hidden">
                <span id="selectionCount">0 items selected</span>
                <button class="btn btn-sm btn-primary" id="transferSelectedBtn">
                    <i class="fa-solid fa-arrow-right-arrow-left"></i> Transfer Selected
                </button>
                <button class="btn btn-sm btn-secondary" id="clearSelectionBtn">Clear</button>
            </div>
        `;

        this.attachEvents();
    }

    update(count) {
        const actionsDiv = document.getElementById('selectionActions');
        const countSpan = document.getElementById('selectionCount');

        if (count > 0) {
            actionsDiv?.classList.remove('hidden');
            if (countSpan) countSpan.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        } else {
            actionsDiv?.classList.add('hidden');
        }
    }

    attachEvents() {
        document.getElementById('transferSelectedBtn')?.addEventListener('click', () => {
            this.showTransferModal();
        });

        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
            this.dashboard.clearSelection();
        });
    }

    async showTransferModal() {
        const locations = await this.state.loadLocations();
        const user = this.state.getUser();

        const selectedIds = Array.from(this.dashboard.selectedProducts);
        const products = this.state.getProducts(selectedIds);

        if (products.length === 0) {
            Toast.error("No products selected");
            return;
        }

        // Build Location Options
        const locationOptions = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

        // Build "From" Options (Includes WC)
        const fromOptions = `
            <option value="wc" selected>WooCommerce Pool</option>
            ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        `;

        // Render Modal Body
        Modal.open({
            title: "Transfer Selected Products",
            body: `
                <div class="flex gap-md mb-md">
                    <div class="form-group flex-1">
                        <label class="form-label">Transfer From:</label>
                        <select id="transferFromBranch" class="form-select">
                            ${fromOptions}
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label class="form-label">Transfer To:</label>
                        <select id="transferToBranch" class="form-select">
                            <option value="">-- Select Destination --</option>
                            ${locationOptions}
                        </select>
                    </div>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Reason for Transfer (Optional)</label>
                    <textarea id="transferReason" class="form-input" rows="2" 
                              placeholder="e.g., Stock rebalancing, new branch opening, etc."></textarea>
                </div>
                
                <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                    <table class="table-sm">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th class="text-right">Available</th>
                                <th class="text-right" style="width: 100px;">Transfer Qty</th>
                            </tr>
                        </thead>
                        <tbody id="transferItemsBody">
                            </tbody>
                    </table>
                </div>
            `,
            confirmText: "Initiate Transfer",
            onConfirm: async () => {
                const fromId = document.getElementById('transferFromBranch').value;
                const toBranchId = document.getElementById('transferToBranch').value;
                const reason = document.getElementById('transferReason').value.trim();

                if (!toBranchId) {
                    Toast.error("Please select a destination branch");
                    throw new Error("Validation failed");
                }

                if (fromId === toBranchId) {
                    Toast.error("Source and Destination cannot be the same");
                    throw new Error("Validation failed");
                }

                const items = [];
                let hasErrors = false;

                document.querySelectorAll('.transfer-qty').forEach(input => {
                    const qty = parseInt(input.value);
                    const max = parseInt(input.max);
                    const productId = parseInt(input.dataset.id);

                    if (qty > 0) {
                        if (qty > max) {
                            input.classList.add('border-error');
                            hasErrors = true;
                        } else {
                            input.classList.remove('border-error');
                            items.push({ product_id: productId, qty: qty });
                        }
                    }
                });

                if (hasErrors) {
                    Toast.error("Quantity exceeds available stock");
                    throw new Error("Validation failed");
                }

                if (items.length === 0) {
                    Toast.error("Please specify at least one quantity");
                    throw new Error("Validation failed");
                }

                // Call API
                let res;
                if (fromId === 'wc') {
                    // Loop adjustStock for WC transfer
                    let successCount = 0;
                    for (const item of items) {
                        const subRes = await API.adjustStock(item.product_id, toBranchId, item.qty, reason || "Transfer from WooCommerce");
                        if (subRes.status === 'success') successCount++;
                    }
                    res = { status: successCount > 0 ? 'success' : 'error', message: `${successCount} items transferred` };
                } else {
                    // Explicitly pass 'fromId' to the API
                    res = await API.initiateTransfer(items, fromId, toBranchId);
                }

                if (res.status === 'success') {
                    Toast.success("Transfer initiated successfully");
                    this.dashboard.clearSelection();
                    this.state.invalidateInventoryCache();
                    this.dashboard.loadData();
                } else {
                    Toast.error(res.message || "Transfer failed");
                    throw new Error(res.message);
                }
            }
        });

        // Initialize Rows and Event Listeners
        const tbody = document.getElementById('transferItemsBody');
        const fromSelect = document.getElementById('transferFromBranch');

        const updateRows = () => {
            const source = fromSelect.value; // 'wc' or branch ID

            tbody.innerHTML = products.map(p => {
                let available = 0;

                if (source === 'wc') {
                    available = p.wc_stock_quantity || 0;
                } else {
                    // Parse stock_breakdown (Format: "1:50,2:10")
                    if (p.stock_breakdown) {
                        const pairs = p.stock_breakdown.toString().split(',');
                        const match = pairs.find(pair => pair.startsWith(source + ':'));
                        if (match) {
                            available = parseInt(match.split(':')[1]);
                        }
                    }
                    // Fallback if breakdown missing but we are in specific view
                    if (available === 0 && this.state.filters.location_id == source) {
                        available = p.stock_quantity || 0;
                    }
                }

                return `
                    <tr>
                        <td class="text-sm">
                            <div class="font-semibold">${p.name}</div>
                            <div class="text-xs text-muted">${p.sku || ''}</div>
                        </td>
                        <td class="font-semibold text-right ${available < 1 ? 'text-error' : 'text-success'}">
                            ${available}
                        </td>
                        <td>
                            <input type="number" class="form-input form-input-sm transfer-qty text-right" 
                                data-id="${p.id}" min="0" max="${available}" value="${Math.min(1, available)}" 
                                ${available < 1 ? 'disabled' : ''}>
                        </td>
                    </tr>
                `;
            }).join('');
        };

        // Initial render
        updateRows();

        // Update on source change
        fromSelect.addEventListener('change', updateRows);
    }
}

module.exports = BulkActions;