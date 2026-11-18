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
        if (!mainContent) return;

        if (products.length === 0) {
            mainContent.innerHTML = '<div class="card p-lg text-center text-muted" style="background: var(--theme-surface); border: 1px solid var(--theme-border);">No products found</div>';
            return;
        }

        // 1. Load Locations to map IDs to Names for the Distribution Badges
        const locations = await this.state.loadLocations();
        if (this.products.app?.currentView !== this.products) return;
        const liveMainContent = document.getElementById('mainContent');
        if (!liveMainContent) return;
        const locationMap = {};
        locations.forEach(l => locationMap[l.id] = l.name);

        const f = this.state.getFilters();
        const isSingleBranch = !!(f.location_id && f.location_id !== '' && f.location_id !== 'all');
        const sortIcon = (field) => {
            const isMatch = f.sortBy === field || (field === 'created_at' && f.sortBy === 'date_created');
            if (!isMatch) return '';
            return f.sortOrder === 'ASC'
                ? '<i class="fa-solid fa-sort-up" style="color: var(--palette-hex-2271b1); margin-left: 4px;"></i>'
                : '<i class="fa-solid fa-sort-down" style="color: var(--palette-hex-2271b1); margin-left: 4px;"></i>';
        };

        const allCheckedOnPage = products.length > 0 && products.every(p => this.products.selectedProducts.has(p.id));

        const html = `
            <div class="wp-list-table-wrapper" style="background: var(--theme-surface); border: 1px solid var(--theme-border); box-shadow: 0 1px 1px var(--palette-rgb-0-0-0-0p04);">
                <table class="wp-list-table widefat fixed striped posts" style="width: 100%; border-collapse: collapse; table-layout: fixed; text-align: left;">
                    <thead>
                        <tr style="background: var(--theme-surface); border-bottom: 1px solid var(--theme-border);">
                            <th style="width: 40px; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">
                                <input type="checkbox" id="selectAllCheckbox" class="form-checkbox" ${allCheckedOnPage ? 'checked' : ''}>
                            </th>
                            <th style="width: 60px; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">Image</th>
                            <th class="sortable" data-field="name" style="padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">
                                Name ${sortIcon('name')}
                            </th>
                            <th class="sortable" data-field="sku" style="width: 11%; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">
                                SKU ${sortIcon('sku')}
                            </th>
                            <th class="sortable" data-field="stock_quantity" style="width: 18%; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary); cursor: pointer;" title="Sort by Stock">
                                Stock Details ${sortIcon('stock_quantity')}
                            </th>
                            <th class="sortable" data-field="mismatch" style="width: 14%; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary); text-align: center;" title="Shows pending transfers or WC/Local stock difference">
                                Status ${sortIcon('mismatch')}
                            </th>
                            <th class="sortable" data-field="category" style="width: 11%; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">
                                Category ${sortIcon('category')}
                            </th>
                            <th class="sortable" data-field="price" style="width: 10%; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">
                                Price ${sortIcon('price')}
                            </th>
                            <th class="sortable" data-field="created_at" style="width: 10%; padding: 8px 10px; font-weight: 600; color: var(--theme-text-primary);">
                                Created ${sortIcon('created_at')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(p => this.renderProductRow(p, locationMap, isSingleBranch)).join('')}
                    </tbody>
                </table>
            </div>

            <style>
                .wp-list-table tr:nth-child(odd) { background-color: var(--theme-surface-muted); }
                .wp-list-table tr:hover { background-color: var(--theme-surface-muted); }
                .row-actions { visibility: hidden; padding: 4px 0 0; font-size: 13px; color: var(--palette-hex-a7aaad); }
                .wp-list-table tr:hover .row-actions { visibility: visible; }
                .row-actions span a { text-decoration: none; color: var(--palette-hex-2271b1); cursor: pointer; }
                .row-actions span a:hover { color: var(--palette-hex-135e96); }
                .stock-distribution-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
                .stock-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; border: 1px solid var(--theme-border); background: var(--theme-surface-alt); color: var(--palette-hex-3c434a); }
                .stock-badge.high { background: var(--palette-hex-edfaef); border-color: var(--palette-hex-68de7c); color: var(--palette-hex-007017); }
                .stock-badge.low { background: var(--palette-hex-fae1e3); border-color: var(--palette-hex-f49c9a); color: var(--palette-hex-d31e20); }
                .stock-badge.oos { background: var(--palette-hex-fae1e3); border-color: var(--palette-hex-f49c9a); color: var(--palette-hex-da2527); }
            </style>
        `;

        liveMainContent.innerHTML = html;
        this.attachTableEvents();
    }

    renderProductRow(product, locationMap, isSingleBranch = false) {
        const key = String(product.id);
        const isSelected = this.products.selectedProducts.has(key);
        const branchStock = parseInt(product.stock_quantity || 0);
        const wcStock = parseInt(product.wc_stock_quantity || 0);
        const pendingTransferCount = parseInt(product.pending_transfer_count || 0);
        const pendingTransferQty = parseInt(product.pending_transfer_qty || 0);


        // --- STATUS COLUMN: PERCENTAGE (SINGLE BRANCH) OR MISMATCH (ALL LOCATIONS) ---
        let mismatchHtml = '';

        if (isSingleBranch) {
            // When a single branch is selected, show branch stock percentage of total stock
            const totalStock = parseInt(product.transferable_pool || 0) || wcStock;
            let formattedPct = '0%';
            if (totalStock > 0 && branchStock > 0) {
                const rawPct = (branchStock / totalStock) * 100;
                if (rawPct < 0.1) {
                    formattedPct = '<0.1%';
                } else if (rawPct < 1) {
                    formattedPct = rawPct.toFixed(1) + '%';
                } else if (rawPct % 1 === 0) {
                    formattedPct = rawPct.toFixed(0) + '%';
                } else {
                    formattedPct = rawPct.toFixed(1) + '%';
                }
            }

            const pctBadgeHtml = `
                <span class="stock-percentage-badge" style="
                    background: ${branchStock > 0 ? 'var(--palette-hex-f0f6fc)' : 'var(--palette-hex-f6f7f7)'};
                    color: ${branchStock > 0 ? 'var(--palette-hex-2271b1)' : 'var(--palette-hex-646970)'};
                    border: 1px solid ${branchStock > 0 ? 'var(--palette-hex-c8e1ff)' : 'var(--palette-hex-dcdcde)'};
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 700;
                    display: inline-block;
                " title="${branchStock.toLocaleString()} of ${totalStock.toLocaleString()} total units in this branch (${formattedPct})">
                    ${formattedPct}
                </span>
            `;

            if (pendingTransferCount > 0 || pendingTransferQty > 0) {
                mismatchHtml = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
                        <span class="btn-in-transit" data-product-id="${product.id}" style="background: var(--palette-hex-e7f3ff); color: var(--palette-hex-2271b1); padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; border: 1px solid var(--palette-hex-b8daff); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="Click to view unapproved transfers">
                            <i class="fa-solid fa-truck-fast"></i> (${pendingTransferQty} in transit)
                        </span>
                        ${pctBadgeHtml}
                    </div>
                `;
            } else {
                mismatchHtml = pctBadgeHtml;
            }
        } else {
            // ALL LOCATIONS: Calculate effective stock (local + in-transit) and show mismatch
            const effectiveStock = branchStock + pendingTransferQty;
            const mismatch = wcStock - branchStock;
            const effectiveMismatch = wcStock - effectiveStock;

            if (pendingTransferCount > 0 || pendingTransferQty > 0) {
                const hasEffectiveMismatch = effectiveMismatch !== 0;
                const sign = effectiveMismatch > 0 ? '+' : '';

                mismatchHtml = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
                        <span class="btn-in-transit" data-product-id="${product.id}" style="background: var(--palette-hex-e7f3ff); color: var(--palette-hex-2271b1); padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; border: 1px solid var(--palette-hex-b8daff); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="Click to view unapproved transfers">
                            <i class="fa-solid fa-truck-fast"></i> (${pendingTransferQty} in transit)
                        </span>
                        ${hasEffectiveMismatch ? `
                            <span style="background: var(--theme-danger-surface); color: var(--palette-hex-d63638); padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 700; border: 1px solid var(--palette-hex-f1acaa);" title="Effective mismatch after in-transit stock">
                                ${sign}${effectiveMismatch}
                            </span>
                        ` : ''}
                    </div>
                `;
            } else if (mismatch === 0) {
                // Perfect match: Subdued green check
                mismatchHtml = `<span style="color: var(--palette-hex-00a32a); font-weight: 600; font-size: 12px;"><i class="fa-solid fa-check"></i></span>`;
            } else {
                // Mismatch: Bright red badge showing the difference
                const sign = mismatch > 0 ? '+' : '';
                mismatchHtml = `<span style="background: var(--theme-danger-surface); color: var(--palette-hex-d63638); padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; border: 1px solid var(--palette-hex-f1acaa);">
                    ${sign}${mismatch}
                </span>`;
            }
        }

        const imageHtml = product.image_url
            ? `<img src="${product.image_url}" alt="${product.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--theme-border);" onerror="this.style.display='none'">`
            : `<div style="width: 40px; height: 40px; background: var(--theme-surface-muted); border: 1px solid var(--theme-border); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--palette-hex-a7aaad); font-size: 10px;">None</div>`;

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
        <tr class="${product.status === 'deleted' ? 'deleted-on-site' : ''}" ${product.status === 'deleted' ? 'data-website-deleted="true"' : ''} style="border-bottom: 1px solid var(--palette-hex-f0f0f1); ${isSelected ? 'background-color: var(--theme-info-surface) !important;' : ''}">
            <td style="padding: 10px; vertical-align: top;">
                <input type="checkbox" class="form-checkbox product-checkbox"
                       data-id="${product.id}" ${isSelected ? 'checked' : ''}>
            </td>
            <td style="padding: 10px; vertical-align: top;">${imageHtml}</td>
            <td style="padding: 10px; vertical-align: top;">
                <strong style="color: var(--palette-hex-2271b1); font-size: 14px;">${product.name}</strong>
                ${product.status === 'deleted' ? `<span style="background: var(--palette-hex-fff4e5); color: var(--palette-hex-8a4b08); padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px; border: 1px solid var(--palette-hex-f4c27a);" title="Deleted from WooCommerce; this local product and its branch stock remain available">Deleted on website · local only</span>` : product.status !== 'publish' ? `<span style="background: var(--theme-danger-surface); color: var(--palette-hex-d63638); padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-left: 8px; border: 1px solid var(--palette-hex-f1acaa);">${product.status}</span>` : ''}

                <div class="row-actions">
                    <span class="edit"><a class="btn-adjust" data-id="${product.id}" data-name="${product.name.replace(/"/g, '&quot;')}" data-breakdown="${product.stock_breakdown || ''}">Adjust Stock</a></span>
                    <span> | </span><span class="history"><a class="btn-history" data-id="${product.id}" data-name="${product.name.replace(/"/g, '&quot;')}">History</a></span>
                    ${product.product_url ? ` | <span class="view"><a href="${product.product_url}" target="_blank">View on Web</a></span>` : ''}
                </div>
            </td>
            <td style="padding: 10px; vertical-align: top; font-family: monospace; color: var(--theme-text-secondary); font-size: 13px;">
                ${product.sku || '-'}
            </td>
            <td style="padding: 10px; vertical-align: top;">
                <div style="font-size: 12px; color: var(--theme-text-secondary); margin-bottom: 2px;">
                    <span style="display: inline-block; width: 75px;">WC Pool:</span>
                    <strong style="color: var(--theme-text-primary);">${parseInt(product.wc_stock_quantity || 0).toLocaleString()}</strong>
                </div>
                <div style="font-size: 12px; color: var(--theme-text-secondary); margin-bottom: 2px;">
                    <span style="display: inline-block; width: 75px;">Total Local:</span>
                    <strong style="color: var(--theme-text-primary);">${parseInt((isSingleBranch ? product.transferable_pool : branchStock) || 0).toLocaleString()}</strong>
                </div>
                ${isSingleBranch ? `
                <div style="font-size: 12px; color: var(--theme-text-secondary); margin-bottom: 6px;">
                    <span style="display: inline-block; width: 75px;">This Branch:</span>
                    <strong style="color: var(--palette-hex-2271b1);">${branchStock.toLocaleString()}</strong>
                </div>
                ` : `
                <div style="margin-bottom: 4px;"></div>
                `}
                ${distributionHtml}
            </td>
            <td style="padding: 10px; vertical-align: middle; text-align: center;">
                ${mismatchHtml}
            </td>
            <td style="padding: 10px; vertical-align: top; color: var(--theme-text-secondary); font-size: 13px;">
                ${product.category || '-'}
            </td>
            <td style="padding: 10px; vertical-align: top; color: var(--theme-text-secondary); font-size: 13px;">
                ${parseInt(product.price || 0).toLocaleString()} Frw
            </td>
            <td style="padding: 10px; vertical-align: top; color: var(--theme-text-secondary); font-size: 13px;">
                ${product.date_created ? new Date(product.date_created).toLocaleDateString() : '-'}
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
                if (cb.checked) tr.style.setProperty('background-color', 'var(--palette-hex-f0f6fb)', 'important');
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

        // In-transit buttons - show transfer details popover
        document.querySelectorAll('.btn-in-transit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const productId = parseInt(btn.dataset.productId);
                this.showTransferDetailsPopover(productId, btn);
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
                <div class="mb-md p-sm bg-neutral-100 rounded" style="border: 1px solid var(--theme-border); font-size: 13px; color: var(--theme-text-secondary);">
                    <i class="fa-solid fa-circle-info" style="color: var(--palette-hex-2271b1); margin-right: 4px;"></i>
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

                <div class="mb-md p-md rounded" style="background: var(--theme-surface-alt); border: 1px dashed var(--theme-border);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--theme-text-secondary); font-size: 13px;">Current Branch Stock:</span>
                        <strong id="previewCurrentStock" style="color: var(--theme-text-primary); font-size: 14px;">0</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--theme-border-subtle); padding-top: 8px;">
                        <span style="color: var(--theme-text-secondary); font-size: 13px; font-weight: 600;">Stock After Adjustment:</span>
                        <strong id="previewNewStock" style="color: var(--palette-hex-2271b1); font-size: 16px;">0</strong>
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
                newDisplay.style.color = 'var(--palette-hex-d63638)'; // Red warning
            } else if (change > 0) {
                newDisplay.style.color = 'var(--palette-hex-00a32a)'; // Green increase
            } else if (change < 0) {
                newDisplay.style.color = 'var(--palette-hex-b32d2e)'; // Dark red decrease
            } else {
                newDisplay.style.color = 'var(--palette-hex-2271b1)'; // Default blue
            }
        };

        // Listen for user changes
        locSelect.addEventListener('change', updatePreview);
        qtyInput.addEventListener('input', updatePreview);

        // Trigger calculation once on load to populate the initial state
        updatePreview();
    }
    async showHistoryModal(productId, productName, page = 1) {
        const locations = await this.state.loadLocations();
        const locationMap = {};
        locations.forEach(l => locationMap[l.id] = l.name);

        // We create an empty array to store the raw database records for the CSV exporter
        let rawExportData = [];
        let historyPage = page;
        let historyPages = 1;
        let historyTotal = 0;

        Modal.open({
            title: `Stock History: ${productName}`,
            body: `<div id="historyModalBody" style="min-height: 120px; display: flex; align-items: center; justify-content: center;">
                   <i class="fa-solid fa-spinner fa-spin" style="color: var(--palette-hex-2271b1); font-size: 20px;"></i>
               </div>`,
            confirmText: 'Export CSV',
            cancelText: 'Close',
            size: 'xl',

            onConfirm: async () => {
                // Instead of scraping the HTML, we check if our raw data array has records
                if (!rawExportData || rawExportData.length === 0) {
                    Toast.error("No data to export.");
                    return false;
                }

                const completeHistory = [];
                for (let exportPage = 1; exportPage <= historyPages; exportPage++) {
                    const pageResult = await API.getStockAdjustments(productId, exportPage, 50);
                    if (pageResult.status !== 'success') {
                        Toast.error('Could not load the complete stock history for export.');
                        return false;
                    }
                    completeHistory.push(...(pageResult.data || []));
                }
                rawExportData = completeHistory;

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
        document.querySelector('#modal-overlay .modal-xl')?.classList.add('stock-history-modal');

        try {
            const res = await API.getStockAdjustments(productId, historyPage);
            const body = document.getElementById('historyModalBody');
            if (!body) return;

            if (res.status !== 'success' || !res.data || res.data.length === 0) {
                body.innerHTML = '<p style="color: var(--theme-text-muted); font-size: 13px; text-align: center; padding: 20px;">No adjustment history found for this product.</p>';
                return;
            }

            // ✅ Save the raw database data to our variable so the CSV exporter can use it
            rawExportData = res.data;
            historyPages = res.pagination?.pages || 1;
            historyTotal = res.pagination?.total || res.data.length;

            // Helper to make database ENUMs look nice in the UI
            const formatReason = (reason) => {
                if (!reason) return '—';
                return reason.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            };

            const rowsHtml = res.data.map(row => {
                const locName = row.location_name || locationMap[row.location_id] || `Branch #${row.location_id}`;
                const sign = row.qty_change > 0 ? '+' : '';
                const qtyColor = row.qty_change > 0 ? 'var(--palette-hex-00a32a)' : (row.qty_change < 0 ? 'var(--palette-hex-d63638)' : 'var(--palette-hex-50575e)');
                const date = new Date(row.created_at).toLocaleString();
                const performedBy = row.performed_by_name ? row.performed_by_name : (row.performed_by ? `User #${row.performed_by}` : '<span style="color:var(--palette-hex-d63638); font-style:italic;">System</span>');

                return `
                <tr style="border-bottom: 1px solid var(--palette-hex-f0f0f1); font-size: 13px;">
                    <td style="padding: 8px 10px; color: var(--theme-text-secondary); white-space: nowrap;">${date}</td>
                    <td style="padding: 8px 10px; color: var(--theme-text-primary); font-weight: 500;">${locName}</td>
                    <td style="padding: 8px 10px; color: var(--theme-text-muted); text-align: right;">${row.qty_before}</td>
                    <td style="padding: 8px 10px; font-weight: 700; color: ${qtyColor}; text-align: center; background: var(--theme-surface-alt);">${sign}${row.qty_change}</td>
                    <td style="padding: 8px 10px; color: var(--theme-text-primary); text-align: left; font-weight: 500;">${row.qty_after}</td>
                    <td style="padding: 8px 10px; color: var(--theme-text-primary); text-align: right; font-weight: 600;">${row.total_branch_stock ?? '—'}</td>
                    <td style="padding: 8px 10px; color: var(--theme-text-secondary);">${formatReason(row.reason)}</td>
                    <td style="padding: 8px 10px; color: var(--palette-hex-8c8f94); font-family: monospace; font-size: 12px;">${row.reference_id || '—'}</td>
                    <td style="padding: 8px 10px; color: var(--theme-text-secondary);">${performedBy}</td>
                </tr>
            `;
            }).join('');

            body.removeAttribute('style');
            body.classList.add('stock-history-modal-content');
            body.innerHTML = `
            <div class="stock-history-table-scroll">
                <table class="stock-history-table">
                    <thead>
                        <tr>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary);">Date</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary);">Branch</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary); text-align: right;">Before</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary); text-align: center;">Change</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary); text-align: left;">After</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary); text-align: right; white-space: nowrap;">Total Branch Stock</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary);">Reason</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary);">Reference</th>
                            <th style="padding: 10px; font-weight: 600; color: var(--theme-text-primary);">Performed By</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <div class="stock-history-pagination">
                <p>Showing page ${historyPage} of ${historyPages} · ${historyTotal} immutable ledger records</p>
                <div class="stock-history-pagination-controls"><button id="historyPrevPage" class="btn btn-sm btn-secondary" ${historyPage <= 1 ? 'disabled' : ''}>Previous</button>
                <button id="historyNextPage" class="btn btn-sm btn-secondary" ${historyPage >= historyPages ? 'disabled' : ''}>Next</button></div>
            </div>
        `;
            const modalBody = document.getElementById('historyModalBody');
            modalBody?.querySelector('#historyPrevPage')?.addEventListener('click', () => {
                if (historyPage > 1) this.showHistoryModal(productId, productName, historyPage - 1);
            });
            modalBody?.querySelector('#historyNextPage')?.addEventListener('click', () => {
                if (historyPage < historyPages) this.showHistoryModal(productId, productName, historyPage + 1);
            });
        } catch (e) {
            const body = document.getElementById('historyModalBody');
            if (body) body.innerHTML = '<p style="color: var(--palette-hex-d63638); text-align: center; padding: 20px;">Failed to load history.</p>';
        }
    }

    async showTransferDetailsPopover(productId, triggerElement) {
        // Remove any open transfer popovers first
        document.querySelectorAll('.transfer-popover-box').forEach(p => p.remove());

        const res = await API.getProductPendingTransfers(productId);

        if (res.status !== 'success' || !res.data || res.data.length === 0) {
            Toast.error('No pending transfers found');
            return;
        }

        const transfers = res.data;
        const totalQty = transfers.reduce((sum, t) => sum + (parseInt(t.qty) || 0), 0);

        const popoverId = 'transfer-popover-' + Date.now();
        const popoverHtml = `
            <div id="${popoverId}" class="transfer-popover-box" style="
                position: fixed;
                background: var(--theme-surface);
                border: 1px solid var(--theme-border);
                border-radius: 8px;
                box-shadow: 0 4px 16px var(--palette-rgb-0-0-0-0p18);
                z-index: 10000;
                width: 360px;
                max-height: 420px;
                overflow-y: auto;
                padding: 14px;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--theme-border-subtle);">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-truck-fast" style="color: var(--palette-hex-2271b1);"></i>
                        <strong style="color: var(--theme-text-primary); font-size: 13px;">Unapproved Transfers (${transfers.length})</strong>
                    </div>
                    <button class="close-popover" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--theme-text-muted); padding: 0 4px; line-height: 1;">&times;</button>
                </div>
                <div style="margin-bottom: 10px; padding: 8px 10px; background: var(--palette-hex-f0f6fc); border-radius: 6px; border: 1px solid var(--palette-hex-c8e1ff); display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: var(--palette-hex-555); font-size: 12px;">Total in Transit:</span>
                    <strong style="font-size: 14px; color: var(--palette-hex-2271b1);">${totalQty} units</strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${transfers.map(t => `
                        <div style="padding: 10px; background: var(--theme-surface-alt); border-radius: 6px; border: 1px solid var(--theme-border-subtle);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <strong style="color: var(--palette-hex-2271b1); font-family: monospace; font-size: 12px;">${t.batch_id}</strong>
                                    <button class="btn-copy-single-batch" data-batch="${t.batch_id}" title="Copy Batch ID" style="background: var(--theme-surface); border: 1px solid var(--theme-border); border-radius: 3px; padding: 2px 6px; font-size: 11px; cursor: pointer; color: var(--palette-hex-2271b1); display: inline-flex; align-items: center; gap: 3px;">
                                        <i class="fa-regular fa-copy"></i>
                                    </button>
                                </div>
                                <span style="font-size: 11px; color: var(--theme-text-muted);">${new Date(t.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style="color: var(--theme-text-secondary); font-size: 12px; margin-bottom: 4px;">
                                <span>${t.from_location}</span>
                                <i class="fa-solid fa-arrow-right" style="color: var(--palette-hex-8c8f94); margin: 0 4px; font-size: 10px;"></i>
                                <span>${t.to_location}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--theme-text-muted);">
                                <span style="font-weight: 600; color: var(--theme-text-primary);">Qty: ${t.qty}</span>
                                <span>By: ${t.initiated_by || 'System'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Insert popover into DOM
        document.body.insertAdjacentHTML('beforeend', popoverHtml);
        const popover = document.getElementById(popoverId);

        // Position popover safely within viewport
        const rect = triggerElement.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left - 160;

        // Prevent overflow outside viewport
        if (left < 10) left = 10;
        if (left + 360 > window.innerWidth) left = window.innerWidth - 370;
        if (top + 400 > window.innerHeight) top = Math.max(10, rect.top - 410);

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;

        // Close button handler
        popover.querySelector('.close-popover').addEventListener('click', () => {
            popover.remove();
        });

        // Copy batch ID for each transfer card
        popover.querySelectorAll('.btn-copy-single-batch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const batchId = btn.dataset.batch;
                navigator.clipboard.writeText(batchId).then(() => {
                    const icon = btn.querySelector('i');
                    if (icon) {
                        icon.className = 'fa-solid fa-check';
                        setTimeout(() => { icon.className = 'fa-regular fa-copy'; }, 1500);
                    }
                    Toast.success(`Batch ID copied: ${batchId}`);
                }).catch(() => {
                    Toast.error('Failed to copy batch ID');
                });
            });
        });

        // Close on outside click
        const closeOnOutsideClick = (e) => {
            if (!popover.contains(e.target) && e.target !== triggerElement) {
                popover.remove();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
        }, 100);
    }
}

module.exports = InventoryTable;
