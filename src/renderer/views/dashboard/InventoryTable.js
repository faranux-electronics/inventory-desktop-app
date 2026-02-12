const Toast = require('../../components/Toast.js');
const Modal = require('../../components/Modal.js');
const API = require('../../services/api.js');

class InventoryTable {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.state = dashboard.state;
    }

    render(products) {
        const mainContent = document.getElementById('mainContent');

        if (products.length === 0) {
            mainContent.innerHTML = '<div class="card p-lg text-center text-muted">No products found</div>';
            return;
        }

        const f = this.state.getFilters();
        const sortIcon = (field) => {
            if (f.sortBy !== field) return '<i class="fa-solid fa-sort text-muted"></i>';
            return f.sortOrder === 'ASC'
                ? '<i class="fa-solid fa-sort-up text-primary"></i>'
                : '<i class="fa-solid fa-sort-down text-primary"></i>';
        };

        const html = `
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px;">
                                    <input type="checkbox" id="selectAllCheckbox" class="form-checkbox">
                                </th>
                                <th style="width: 60px;">Image</th>
                                <th class="sortable" data-field="name">
                                    Product ${sortIcon('name')}
                                </th>
                                <th class="sortable" data-field="sku">
                                    SKU ${sortIcon('sku')}
                                </th>
                                <th class="sortable" data-field="category">
                                    Category ${sortIcon('category')}
                                </th>
                                <th class="sortable text-right" data-field="wc_stock">
                                    WC Stock ${sortIcon('wc_stock')}
                                </th>
                                <th class="sortable text-right" data-field="quantity">
                                    Branch Stock ${sortIcon('quantity')}
                                </th>
                                <th class="sortable text-right" data-field="price">
                                    Price ${sortIcon('price')}
                                </th>
                                <th class="sortable text-right" data-field="total_sales">
                                    Sales ${sortIcon('total_sales')}
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${products.map(p => this.renderProductRow(p)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        mainContent.innerHTML = html;
        this.attachTableEvents();
    }

    renderProductRow(product) {
        const isSelected = this.dashboard.selectedProducts.has(product.id);
        const branchStock = product.stock_quantity || 0;
        const wcStock = product.wc_stock_quantity || 0;

        const stockClass = branchStock < 10 ? 'text-error' :
            branchStock < 50 ? 'text-warning' : '';

        const imageHtml = product.image_url
            ? `<img src="${product.image_url}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect fill=%22%23ddd%22 width=%2250%22 height=%2250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2212%22%3ENo Image%3C/text%3E%3C/svg%3E'">`
            : `<div style="width: 50px; height: 50px; background: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 10px;">No Image</div>`;

        return `
            <tr class="${isSelected ? 'bg-primary-50' : ''}">
                <td>
                    <input type="checkbox" class="form-checkbox product-checkbox" 
                           data-id="${product.id}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>${imageHtml}</td>
                <td>
                    <div class="font-semibold">${product.name}</div>
                    ${product.status !== 'publish' ? `<span class="badge badge-warning badge-sm">${product.status}</span>` : ''}
                </td>
                <td class="font-mono text-sm">${product.sku || '-'}</td>
                <td>${product.category || '-'}</td>
                <td class="text-right font-semibold ${wcStock < 10 ? 'text-warning' : ''}">${wcStock}</td>
                <td class="text-right font-semibold ${stockClass}">${branchStock}</td>
                <td class="text-right">${parseInt(product.price || 0).toLocaleString()} Frw</td>
                <td class="text-right">${product.total_sales || 0}</td>
                <td>
                    <div class="flex gap-xs">
                        ${product.product_url ? `
                        <button class="btn btn-sm btn-secondary" 
                                onclick="window.open('${product.product_url}', '_blank')"
                                title="View on Web">
                            <i class="fa-solid fa-external-link"></i>
                        </button>
                        ` : ''}
                        <button class="btn btn-sm btn-secondary btn-adjust" 
                                data-id="${product.id}" 
                                data-name="${product.name.replace(/"/g, '&quot;')}"
                                data-wc-stock="${wcStock}"
                                title="Adjust Stock">
                            <i class="fa-solid fa-sliders"></i>
                        </button>
                    </div>
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
                const id = parseInt(cb.dataset.id);
                if (selectAll.checked) {
                    this.dashboard.selectedProducts.add(id);
                } else {
                    this.dashboard.selectedProducts.delete(id);
                }
            });
            this.dashboard.saveState();
            this.dashboard.updateSelectionUI();
        });

        // Individual checkboxes
        document.querySelectorAll('.product-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                this.dashboard.toggleSelection(parseInt(cb.dataset.id));
            });
        });

        // Sort headers
        document.querySelectorAll('.sortable').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const field = th.dataset.field;
                this.state.toggleSort(field);
                this.dashboard.saveState();
                this.dashboard.loadData();
            });
        });

        // Adjust stock buttons
        document.querySelectorAll('.btn-adjust').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const name = btn.dataset.name;
                const wcStock = parseInt(btn.dataset.wcStock || 0);
                this.showAdjustStockModal(id, name, wcStock);
            });
        });
    }

    async showAdjustStockModal(productId, productName, wcStock) {
        const locations = await this.state.loadLocations();
        const user = this.state.getUser();

        const locationOptions = locations
            .map(l => `<option value="${l.id}" ${l.id === user.branch_id ? 'selected' : ''}>${l.name}</option>`)
            .join('');

        Modal.open({
            title: `Adjust Stock: ${productName}`,
            body: `
                <div class="mb-md p-sm bg-neutral-100 rounded">
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-neutral-700">WooCommerce Stock:</span>
                        <span class="font-bold text-primary">${wcStock}</span>
                    </div>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Location</label>
                    <select id="adjustLocation" class="form-select">
                        ${locationOptions}
                    </select>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Quantity Change</label>
                    <input type="number" id="adjustQty" class="form-input" placeholder="Enter positive or negative number">
                    <small class="text-muted">Use negative numbers to decrease stock</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Reason</label>
                    <textarea id="adjustReason" class="form-input" rows="2" placeholder="e.g., Damaged, Recount, Transfer from WC, etc."></textarea>
                </div>
            `,
            confirmText: "Adjust Stock",
            onConfirm: async () => {
                const locationId = document.getElementById('adjustLocation').value;
                const qty = parseInt(document.getElementById('adjustQty').value);
                const reason = document.getElementById('adjustReason').value;

                if (isNaN(qty) || qty === 0) {
                    Toast.error("Please enter a valid quantity");
                    throw new Error("Validation failed");
                }

                if (!reason.trim()) {
                    Toast.error("Please provide a reason");
                    throw new Error("Validation failed");
                }

                const res = await API.adjustStock(productId, locationId, qty, reason);
                if (res.status === 'success') {
                    Toast.success("Stock adjusted successfully");
                    this.state.invalidateInventoryCache();
                    this.dashboard.loadData();
                } else {
                    Toast.error(res.message || "Adjustment failed");
                    throw new Error(res.message);
                }
            }
        });
    }
}

module.exports = InventoryTable;