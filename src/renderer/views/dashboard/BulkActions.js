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

        const products = Array.from(this.dashboard.selectedProducts.values());

        if (products.length === 0) {
            Toast.error("No products selected");
            return;
        }

        // Build Location Options for both To and From
        const locationOptions = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

        // Render Modal Body
        Modal.open({
            title: "Transfer Selected Products",
            body: `
                <div class="flex gap-md mb-md">
                    <div class="form-group flex-1">
                        <label class="form-label">Transfer From:</label>
                        <select id="transferFromBranch" class="form-select">
                            <option value="">-- Select Source --</option>
                            ${locationOptions}
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

                if (!fromId) {
                    Toast.error("Please select a source branch");
                    throw new Error("Validation failed");
                }

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

                // Call standard Transfer API
                const res = await API.initiateTransfer(items, fromId, toBranchId);

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
            const source = fromSelect.value; // branch ID

            tbody.innerHTML = products.map(p => {
                let available = 0;

                if (source) {
                    if (p.stock_breakdown) {
                        const pairs = p.stock_breakdown.toString().split(',');
                        // FIXED: Exact string matching using split, eliminating the 'startsWith' overlap bug
                        const match = pairs.find(pair => pair.split(':')[0] === String(source));
                        if (match) {
                            available = parseInt(match.split(':')[1], 10);
                        }
                    }
                    // The buggy fallback logic has been completely removed.
                    // If the branch isn't in the breakdown, available stays 0.
                }

                return `
                    <tr>
                        <td class="text-sm">
                            <div class="font-semibold">${p.name}</div>
                            <div class="text-xs text-muted">${p.sku || ''}</div>
                        </td>
                        <td class="font-semibold text-right ${available < 1 ? 'text-error' : 'text-success'}">
                            ${source ? available : '-'}
                        </td>
                        <td>
                            <input type="number" class="form-input form-input-sm transfer-qty text-right" 
                                data-id="${p.id}" min="0" max="${available}" value="${source ? Math.min(1, available) : 0}" 
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