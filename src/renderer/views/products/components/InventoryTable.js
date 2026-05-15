const Toast = require('../../../components/Toast.js');
const Modal = require('../../../components/Modal.js');
const API = require('../../../services/api.js');

class InventoryTable {
    constructor(products) {
        this.products = products;
        this.state = products.state;
    }

    async render(products) {
        this.currentProducts = products;

        // Sync the persistent Map with fresh database data on every page load.
        // Normalize all IDs to strings to prevent integer/string type-mismatch across pagination.
        let mapUpdated = false;
        products.forEach(p => {
            const key = String(p.id);
            if (this.products.selectedProducts.has(key)) {
                this.products.selectedProducts.set(key, {...p, id: key});
                mapUpdated = true;
            }
        });
        if (mapUpdated) this.products.saveState();

        const mainContent = document.getElementById('mainContent');

        if (products.length === 0) {
            mainContent.innerHTML = '<div class="card p-lg text-center text-muted" style="background: white; border: 1px solid #c3c4c7;">No products found</div>';
            return;
        }

        // 1. Load Locations to map IDs to Names for the Distribution Badges
        const locations = await this.state.loadLocations();
        const locationMap = {};
        locations.forEach(l => locationMap[l.id] = l.name);

        const f = this.state.getFilters();
        const sortIcon = (field) => {
            if (f.sortBy !== field) return '';
            return f.sortOrder === 'ASC'
                ? '<i class="fa-solid fa-sort-up" style="color: #2271b1; margin-left: 4px;"></i>'
                : '<i class="fa-solid fa-sort-down" style="color: #2271b1; margin-left: 4px;"></i>';
        };

        const allCheckedOnPage = products.length > 0 && products.every(p => this.products.selectedProducts.has(p.id));

        const html = `
            <div class="wp-list-table-wrapper" style="background: white; border: 1px solid #c3c4c7; box-shadow: 0 1px 1px rgba(0,0,0,.04);">
                <table class="wp-list-table widefat fixed striped posts" style="width: 100%; border-collapse: collapse; table-layout: fixed; text-align: left;">
                    <thead>
                        <tr style="background: white; border-bottom: 1px solid #c3c4c7;">
                            <th style="width: 40px; padding: 8px 10px; font-weight: 600; color: #2c3338;">
                                <input type="checkbox" id="selectAllCheckbox" class="form-checkbox" ${allCheckedOnPage ? 'checked' : ''}>
                            </th>
                            <th style="width: 60px; padding: 8px 10px; font-weight: 600; color: #2c3338;">Image</th>
                            <th class="sortable" data-field="name" style="padding: 8px 10px; font-weight: 600; color: #2c3338;">
                                Name ${sortIcon('name')}
                            </th>
                            <th class="sortable" data-field="sku" style="width: 13%; padding: 8px 10px; font-weight: 600; color: #2c3338;">
                                SKU ${sortIcon('sku')}
                            </th>
                            <th class="sortable" data-field="stock_quantity" style="width: 20%; padding: 8px 10px; font-weight: 600; color: #2c3338; cursor: pointer;" title="Sort by Stock">
                                Stock Details ${sortIcon('stock_quantity')}
                            </th>
                            <th class="sortable" data-field="mismatch" style="width: 10%; padding: 8px 10px; font-weight: 600; color: #2c3338; text-align: center;" title="Difference between WC and Local">
                                Mismatch ${sortIcon('mismatch')}
                            </th>
                            <th class="sortable" data-field="category" style="width: 13%; padding: 8px 10px; font-weight: 600; color: #2c3338;">
                                Category ${sortIcon('category')}
                            </th>
                            <th class="sortable" data-field="price" style="width: 12%; padding: 8px 10px; font-weight: 600; color: #2c3338;">
                                Price ${sortIcon('price')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(p => this.renderProductRow(p, locationMap)).join('')}
                    </tbody>
                </table>
            </div>

            <style>
                .wp-list-table tr:nth-child(odd) { background-color: #f6f7f7; }
                .wp-list-table tr:hover { background-color: #f0f0f1; }
                .row-actions { visibility: hidden; padding: 4px 0 0; font-size: 13px; color: #a7aaad; }
                .wp-list-table tr:hover .row-actions { visibility: visible; }
                .row-actions span a { text-decoration: none; color: #2271b1; cursor: pointer; }
                .row-actions span a:hover { color: #135e96; }
                .stock-distribution-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
                .stock-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; border: 1px solid #c3c4c7; background: #f8f9fa; color: #3c434a; }
                .stock-badge.high { background: #edfaef; border-color: #68de7c; color: #007017; }
                .stock-badge.low { background: #fae1e3; border-color: #f49c9a; color: #d31e20; }
                .stock-badge.oos { background: #fae1e3; border-color: #f49c9a; color: #da2527; }
            </style>
        `;

        mainContent.innerHTML = html;
        this.attachTableEvents();
    }

    renderProductRow(product, locationMap) {
        const key = String(product.id);
        const isSelected = this.products.selectedProducts.has(key);
        const branchStock = product.stock_quantity || 0;
        const wcStock = product.wc_stock_quantity || 0;

        // --- MISMATCH CALCULATION & STYLING ---
        const mismatch = wcStock - branchStock;
        let mismatchHtml = '';
        if (mismatch === 0) {
            // Perfect match: Subdued green check
            mismatchHtml = `<span style="color: #00a32a; font-weight: 600; font-size: 12px;"><i class="fa-solid fa-check"></i></span>`;
        } else {
            // Mismatch: Bright red badge showing the difference
            const sign = mismatch > 0 ? '+' : '';
            mismatchHtml = `<span style="background: #fcf0f1; color: #d63638; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; border: 1px solid #f1acaa;">
                ${sign}${mismatch}
            </span>`;
        }

        const imageHtml = product.image_url
            ? `<img src="${product.image_url}" alt="${product.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #c3c4c7;" onerror="this.style.display='none'">`
            : `<div style="width: 40px; height: 40px; background: #f0f0f1; border: 1px solid #c3c4c7; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #a7aaad; font-size: 10px;">None</div>`;

        // --- UPDATED BADGE LOGIC ---
        // 1. Convert the stock_breakdown string into a searchable object (e.g., { "1": 14, "2": 0 })
        const breakdownMap = {};
        if (product.stock_breakdown) {
            product.stock_breakdown.toString().split(',').forEach(pair => {
                const [lid, qty] = pair.split(':');
                breakdownMap[lid] = parseInt(qty) || 0;
            });
        }

        // 2. Loop through ALL branches to guarantee they always show up
        const badges = Object.keys(locationMap).map(lid => {
            const name = locationMap[lid] || `Loc #${lid}`;
            // If the branch isn't in the breakdown yet, default to 0
            const q = breakdownMap[lid] || 0;

            let badgeClass = '';
            if (q === 0) badgeClass = 'oos'; // Assigning an 'oos' class for 0 stock
            else if (q > 50) badgeClass = 'high';
            else if (q < 5) badgeClass = 'low';

            return `<span class="stock-badge ${badgeClass}">${name}: ${q}</span>`;
        }).join('');

        const distributionHtml = `<div class="stock-distribution-badges">${badges}</div>`;
        // ---------------------------

        return `
        <tr style="border-bottom: 1px solid #f0f0f1; ${isSelected ? 'background-color: #f0f6fb !important;' : ''}">
            <td style="padding: 10px; vertical-align: top;">
                <input type="checkbox" class="form-checkbox product-checkbox" 
                       data-id="${product.id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td style="padding: 10px; vertical-align: top;">${imageHtml}</td>
            <td style="padding: 10px; vertical-align: top;">
                <strong style="color: #2271b1; font-size: 14px;">${product.name}</strong>
                ${product.status !== 'publish' ? `<span style="background: #fcf0f1; color: #d63638; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px; border: 1px solid #f1acaa;">${product.status}</span>` : ''}
                
                <div class="row-actions">
                    <span class="edit"><a class="btn-adjust" data-id="${product.id}" data-name="${product.name.replace(/"/g, '&quot;')}" data-breakdown="${product.stock_breakdown || ''}">Adjust Stock</a></span>
                    <span> | </span><span class="history"><a class="btn-history" data-id="${product.id}" data-name="${product.name.replace(/"/g, '&quot;')}">History</a></span>
                    ${product.product_url ? ` | <span class="view"><a href="${product.product_url}" target="_blank">View on Web</a></span>` : ''}
                </div>
            </td>
            <td style="padding: 10px; vertical-align: top; font-family: monospace; color: #50575e; font-size: 13px;">
                ${product.sku || '-'}
            </td>
            <td style="padding: 10px; vertical-align: top;">
                <div style="font-size: 12px; color: #50575e; margin-bottom: 2px;">
                    <span style="display: inline-block; width: 65px;">WC Pool:</span>
                    <strong style="color: #1d2327;">${wcStock}</strong>
                </div>
                <div style="font-size: 12px; color: #50575e; margin-bottom: 6px;">
                    <span style="display: inline-block; width: 65px;">Total Local:</span>
                    <strong style="color: #1d2327;">${branchStock}</strong>
                </div>
                ${distributionHtml}
            </td>
            <td style="padding: 10px; vertical-align: middle; text-align: center;">
                ${mismatchHtml}
            </td>
            <td style="padding: 10px; vertical-align: top; color: #50575e; font-size: 13px;">
                ${product.category || '-'}
            </td>
            <td style="padding: 10px; vertical-align: top; color: #50575e; font-size: 13px;">
                ${parseInt(product.price || 0).toLocaleString()} Frw
            </td>
        </tr>
    `;
    }

    attachTableEvents() {
        // Select all checkbox
        const selectAll = document.getElementById('selectAllCheckbox');
        selectAll?.addEventListener('change', () => {
            const checkboxes = document.querySelectorAll('.product-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = selectAll.checked;
                const id = String(cb.dataset.id);
                const product = this.currentProducts.find(p => String(p.id) === id);
                if (product) {
                    this.products.toggleSelection({...product, id}, selectAll.checked);
                }
            });
            this.products.loadData();
        });

        // Individual checkboxes
        document.querySelectorAll('.product-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = String(cb.dataset.id);
                const product = this.currentProducts.find(p => String(p.id) === id);
                if (product) {
                    this.products.toggleSelection({...product, id});
                }

                // Update row highlight
                const tr = cb.closest('tr');
                if (cb.checked) tr.style.setProperty('background-color', '#f0f6fb', 'important');
                else tr.style.removeProperty('background-color');

                // Keep "Select All" checkbox visually accurate
                const selectAllCb = document.getElementById('selectAllCheckbox');
                if (selectAllCb) {
                    selectAllCb.checked = Array.from(document.querySelectorAll('.product-checkbox')).every(c => c.checked);
                }
            });
        });

        // Sort headers
        document.querySelectorAll('.sortable').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.field;
                this.state.toggleSort(field);
                this.products.saveState();
                this.products.loadData();
            });
        });

        // Adjust stock buttons
        document.querySelectorAll('.btn-adjust').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const id = parseInt(btn.dataset.id);
                const name = btn.dataset.name;
                const breakdown = btn.dataset.breakdown;

                this.showAdjustStockModal(id, name, breakdown);
            });
        });

        // History buttons
        document.querySelectorAll('.btn-history').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showHistoryModal(parseInt(btn.dataset.id), btn.dataset.name);
            });
        });
    }

    async showAdjustStockModal(productId, productName, breakdownString) {
        const locations = await this.state.loadLocations();
        const user = this.state.getUser();

        // 1. Parse the stock breakdown string into an easy lookup object (e.g., { "1": 10, "2": 5 })
        const stockMap = {};
        if (breakdownString) {
            breakdownString.split(',').forEach(pair => {
                const [locId, qty] = pair.split(':');
                stockMap[locId] = parseInt(qty, 10);
            });
        }

        const locationOptions = locations
            .map(l => `<option value="${l.id}" ${l.id === user.branch_id ? 'selected' : ''}>${l.name}</option>`)
            .join('');

        Modal.open({
            title: `Adjust Local Stock: ${productName}`,
            body: `
                <div class="mb-md p-sm bg-neutral-100 rounded" style="border: 1px solid #c3c4c7; font-size: 13px; color: #50575e;">
                    <i class="fa-solid fa-circle-info" style="color: #2271b1; margin-right: 4px;"></i> 
                    This tool adjusts physical stock at a specific local branch. <b>It does not affect WooCommerce.</b>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Location (Branch)</label>
                    <select id="adjustLocation" class="form-select">
                        ${locationOptions}
                    </select>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Quantity Change</label>
                    <input type="number" id="adjustQty" class="form-input" placeholder="e.g., 2 or -3">
                    <small class="text-muted" style="display: block; margin-top: 4px;">
                        Use negative numbers to decrease stock (e.g., -1 for a damaged item).
                    </small>
                </div>

                <div class="mb-md p-md rounded" style="background: #f8f9fa; border: 1px dashed #c3c4c7;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #50575e; font-size: 13px;">Current Branch Stock:</span>
                        <strong id="previewCurrentStock" style="color: #1d2327; font-size: 14px;">0</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 8px;">
                        <span style="color: #50575e; font-size: 13px; font-weight: 600;">Stock After Adjustment:</span>
                        <strong id="previewNewStock" style="color: #2271b1; font-size: 16px;">0</strong>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Reason for Adjustment</label>
                    <textarea id="adjustReason" class="form-input" rows="2" placeholder="e.g., Miscount correction, damaged item, etc."></textarea>
                </div>
            `,
            confirmText: "Adjust Local Stock",
            onConfirm: async () => {
                const locationId = document.getElementById('adjustLocation').value;
                const qty = parseInt(document.getElementById('adjustQty').value);
                const reason = document.getElementById('adjustReason').value;

                if (isNaN(qty) || qty === 0) {
                    Toast.error("Please enter a valid non-zero quantity");
                    throw new Error("Validation failed");
                }

                // Prevent negative resulting stock
                const currentStock = stockMap[locationId] || 0;
                if (currentStock + qty < 0) {
                    Toast.error("Resulting stock cannot be negative.");
                    throw new Error("Validation failed");
                }

                if (!reason.trim()) {
                    Toast.error("Please provide a reason for the audit log");
                    throw new Error("Validation failed");
                }

                const res = await API.adjustStock(productId, locationId, qty, reason);
                if (res.status === 'success') {
                    Toast.success("Local branch stock adjusted successfully");
                    this.state.invalidateInventoryCache();
                    this.products.loadData();
                } else {
                    Toast.error(res.message || "Adjustment failed");
                    throw new Error(res.message);
                }
            }
        });

        // 2. Attach Live Preview Event Listeners immediately after the Modal HTML is injected
        const locSelect = document.getElementById('adjustLocation');
        const qtyInput = document.getElementById('adjustQty');
        const currentDisplay = document.getElementById('previewCurrentStock');
        const newDisplay = document.getElementById('previewNewStock');

        const updatePreview = () => {
            const locId = locSelect.value;
            const currentStock = stockMap[locId] || 0;
            const change = parseInt(qtyInput.value) || 0;
            const newStock = currentStock + change;

            currentDisplay.textContent = currentStock;
            newDisplay.textContent = newStock;

            // Color code the final result (Green for increase, Red for negative/error)
            if (newStock < 0) {
                newDisplay.style.color = '#d63638'; // Red warning
            } else if (change > 0) {
                newDisplay.style.color = '#00a32a'; // Green increase
            } else if (change < 0) {
                newDisplay.style.color = '#b32d2e'; // Dark red decrease
            } else {
                newDisplay.style.color = '#2271b1'; // Default blue
            }
        };

        // Listen for user changes
        locSelect.addEventListener('change', updatePreview);
        qtyInput.addEventListener('input', updatePreview);

        // Trigger calculation once on load to populate the initial state
        updatePreview();
    }
    async showHistoryModal(productId, productName) {
        const locations = await this.state.loadLocations();
        const locationMap = {};
        locations.forEach(l => locationMap[l.id] = l.name);

        // We create an empty array to store the raw database records for the CSV exporter
        let rawExportData = [];

        Modal.open({
            title: `Stock History: ${productName}`,
            body: `<div id="historyModalBody" style="min-height: 120px; display: flex; align-items: center; justify-content: center;">
                   <i class="fa-solid fa-spinner fa-spin" style="color: #2271b1; font-size: 20px;"></i>
               </div>`,
            confirmText: 'Export CSV',
            cancelText: 'Close',
            size: 'lg',

            onConfirm: () => {
                // Instead of scraping the HTML, we check if our raw data array has records
                if (!rawExportData || rawExportData.length === 0) {
                    Toast.error("No data to export.");
                    return false;
                }

                // Define our comprehensive CSV Headers
                const headers = [
                    "Date",
                    "Product ID",
                    "SKU",
                    "Product Name",
                    "Branch",
                    "Before",
                    "Change",
                    "After",
                    "Reason",
                    "Reference ID",
                    "Performed By"
                ];

                // Helper to format the reason (e.g., "order_deduction" -> "Order Deduction")
                const formatReason = (reason) => {
                    if (!reason) return '—';
                    return reason.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                };

                // Generate CSV rows directly from the raw database JSON
                const rows = rawExportData.map(row => {
                    const locName = row.location_name || locationMap[row.location_id] || `Branch #${row.location_id}`;
                    const date = new Date(row.created_at).toLocaleString();
                    const performedBy = row.performed_by_name ? row.performed_by_name : (row.performed_by ? `User #${row.performed_by}` : 'System');

                    // Safely format the product name to prevent commas in the name from breaking the CSV
                    const safeProductName = productName.replace(/"/g, '""');

                    return [
                        `"${date}"`,
                        `"${productId}"`,
                        `"${row.sku || ''}"`,
                        `"${safeProductName}"`,
                        `"${locName}"`,
                        `"${row.qty_before}"`,
                        `"${row.qty_change}"`,
                        `"${row.qty_after}"`,
                        `"${formatReason(row.reason)}"`,
                        `"${row.reference_id || ''}"`,
                        `"${performedBy}"`
                    ].join(",");
                });

                // Combine headers and rows
                const csvContent = [headers.join(","), ...rows].join("\n");

                // Build the Blob and trigger the download
                const blob = new Blob(["\uFEFF" + csvContent], {type: 'text/csv;charset=utf-8;'});
                const url = URL.createObjectURL(blob);

                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `Stock_Ledger_${productId}_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);

                link.click();

                // Clean up
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                return false;
            }
        });

        try {
            const res = await API.getStockAdjustments(productId);
            const body = document.getElementById('historyModalBody');
            if (!body) return;

            if (res.status !== 'success' || !res.data || res.data.length === 0) {
                body.innerHTML = '<p style="color: #646970; font-size: 13px; text-align: center; padding: 20px;">No adjustment history found for this product.</p>';
                return;
            }

            // ✅ Save the raw database data to our variable so the CSV exporter can use it
            rawExportData = res.data;

            // Helper to make database ENUMs look nice in the UI
            const formatReason = (reason) => {
                if (!reason) return '—';
                return reason.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            };

            const rowsHtml = res.data.map(row => {
                const locName = row.location_name || locationMap[row.location_id] || `Branch #${row.location_id}`;
                const sign = row.qty_change > 0 ? '+' : '';
                const qtyColor = row.qty_change > 0 ? '#00a32a' : (row.qty_change < 0 ? '#d63638' : '#50575e');
                const date = new Date(row.created_at).toLocaleString();
                const performedBy = row.performed_by_name ? row.performed_by_name : (row.performed_by ? `User #${row.performed_by}` : '<span style="color:#d63638; font-style:italic;">System</span>');

                return `
                <tr style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                    <td style="padding: 8px 10px; color: #50575e; white-space: nowrap;">${date}</td>
                    <td style="padding: 8px 10px; color: #2c3338; font-weight: 500;">${locName}</td>
                    <td style="padding: 8px 10px; color: #646970; text-align: right;">${row.qty_before}</td>
                    <td style="padding: 8px 10px; font-weight: 700; color: ${qtyColor}; text-align: center; background: #f8f9fa;">${sign}${row.qty_change}</td>
                    <td style="padding: 8px 10px; color: #2c3338; text-align: left; font-weight: 500;">${row.qty_after}</td>
                    <td style="padding: 8px 10px; color: #50575e;">${formatReason(row.reason)}</td>
                    <td style="padding: 8px 10px; color: #8c8f94; font-family: monospace; font-size: 12px;">${row.reference_id || '—'}</td>
                    <td style="padding: 8px 10px; color: #50575e;">${performedBy}</td>
                </tr>
            `;
            }).join('');

            body.innerHTML = `
            <div style="overflow-x: auto; max-height: 500px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                    <thead style="background: #f0f0f1; position: sticky; top: 0; z-index: 1;">
                        <tr>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338;">Date</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338;">Branch</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338; text-align: right;">Before</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338; text-align: center;">Change</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338; text-align: left;">After</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338;">Reason</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338;">Reference</th>
                            <th style="padding: 10px; font-weight: 600; color: #2c3338;">Performed By</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <p style="color: #646970; font-size: 11px; margin: 12px 0 0; text-align: right; font-style: italic;">
                Showing ${res.data.length} record${res.data.length !== 1 ? 's' : ''} from the immutable ledger
            </p>
        `;
        } catch (e) {
            const body = document.getElementById('historyModalBody');
            if (body) body.innerHTML = '<p style="color: #d63638; text-align: center; padding: 20px;">Failed to load history.</p>';
        }
    }
}

module.exports = InventoryTable;