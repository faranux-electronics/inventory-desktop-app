const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class DashboardView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
    }

    async render() {
        const content = document.getElementById('content');
        const filterState = this.state.getFilters();

        content.innerHTML = `
      <div class="page-header">
        <div class="header-row">
          <h1 class="page-title">Inventory Dashboard</h1>
          <div class="header-actions">
            <button class="btn btn-secondary" id="refreshBtn" title="Refresh">
               <i class="fa-solid fa-rotate"></i>
            </button>
            <button class="btn btn-secondary" id="gotoOrdersBtn">
              <i class="fa-solid fa-cart-shopping"></i> Deduct Sales
            </button>
            <button class="btn btn-primary" id="syncBtn">
              <i class="fa-solid fa-cloud-arrow-down"></i> Sync Web
            </button>
          </div>
        </div>

        <div class="filter-bar card p-sm flex items-center gap-md">
          <div class="search-box flex-1">
            <i class="fa-solid fa-search"></i>
            <input type="text" id="searchInput" class="search-input w-full" placeholder="Search products by name or SKU..." value="${filterState.search}">
          </div>
          
          <div class="filter-group flex items-center gap-sm">
            <i class="fa-solid fa-filter text-muted"></i>
            <select id="locationFilter" class="form-select" style="min-width: 200px;">
                <option value="">All Locations</option>
            </select>
          </div>
        </div>

        <div class="tabs mt-md">
          <button class="tab-btn ${filterState.status === 'publish' ? 'active' : ''}" data-status="publish">Published</button>
          <button class="tab-btn ${filterState.status === 'draft' ? 'active' : ''}" data-status="draft">Drafts</button>
          <button class="tab-btn ${filterState.status === 'private' ? 'active' : ''}" data-status="private">Private</button>
        </div>
      </div>

      <div id="selectionBar" class="card hidden mb-md" style="background: var(--primary-500); border: none; color: white;">
        <div class="card-body flex items-center justify-between p-sm">
          <div class="flex items-center gap-md">
             <i class="fa-solid fa-check-circle"></i>
             <span id="selectCount" class="font-bold">0 selected</span>
          </div>
          <button class="btn" id="bulkTransferBtn" style="background: white; color: var(--primary-500); border: none; font-weight: 700;">
            <i class="fa-solid fa-truck-ramp-box"></i>
            Transfer Selected
          </button>
        </div>
      </div>

      <div class="card">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th width="5%">
                  <input type="checkbox" id="selectAll">
                </th>
                <th width="45%" class="sortable cursor-pointer" data-sort="name">
                  Product <i class="fa-solid fa-sort text-muted ml-sm"></i>
                </th>
                <th width="15%" class="sortable cursor-pointer" data-sort="sku">
                  SKU <i class="fa-solid fa-sort text-muted ml-sm"></i>
                </th>
                <th width="35%">Stock Locations</th>
              </tr>
            </thead>
            <tbody id="tableBody">
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between p-md border-t border-neutral-200">
          <span id="pageInfo" class="text-muted text-sm">Loading...</span>
          <div class="flex gap-sm">
            <button id="prevBtn" class="btn btn-secondary btn-sm">Previous</button>
            <button id="nextBtn" class="btn btn-secondary btn-sm">Next</button>
          </div>
        </div>
      </div>
    `;

        await this.loadLocationFilter();
        this.attachEvents();

        if (this.state.hasInventoryData()) {
            const products = this.state.getInventory();
            this.renderProducts(products, this.state.get().totalPages, this.state.get().totalItems);
        } else {
            this.loadData();
        }
    }

    async loadLocationFilter() {
        const select = document.getElementById('locationFilter');
        if (!select) return;
        const locations = await this.state.loadLocations();
        const currentFilter = this.state.getFilters().location_id;

        let html = '<option value="">All Locations</option>';
        // Manually add Main Warehouse for filtering if needed
        html += `<option value="0" ${currentFilter === '0' ? 'selected' : ''}>Main Warehouse</option>`;

        locations.forEach(loc => {
            const selected = loc.id == currentFilter ? 'selected' : '';
            html += `<option value="${loc.id}" ${selected}>${loc.name}</option>`;
        });
        select.innerHTML = html;
    }

    attachEvents() {
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.state.setSearch(e.target.value);
                this.loadData();
            }, 500);
        });

        document.getElementById('locationFilter').addEventListener('change', (e) => {
            this.state.setLocationFilter(e.target.value);
            this.loadData();
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const status = e.target.dataset.status;
                if (status !== this.state.getFilters().status) {
                    this.state.setStatus(status);
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    this.loadData();
                }
            });
        });

        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = checked;
                const id = parseInt(cb.dataset.id);
                if (checked) this.state.selectProduct(id);
                else this.state.deselectProduct(id);
            });
            this.updateSelectionBar();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.state.clearSelection();
            this.loadData(true);
        });

        document.getElementById('prevBtn').addEventListener('click', () => this.changePage(-1));
        document.getElementById('nextBtn').addEventListener('click', () => this.changePage(1));
        document.getElementById('syncBtn').addEventListener('click', () => this.syncProducts());
        document.getElementById('gotoOrdersBtn').addEventListener('click', () => this.app.navigate('orders'));
        document.getElementById('bulkTransferBtn').addEventListener('click', () => this.handleBulkTransfer());

        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                const field = e.currentTarget.dataset.sort;
                this.state.toggleSort(field);
                this.loadData();
            });
        });
    }

    async loadData(forceRefresh = false) {
        const filters = this.state.getFilters();
        const tbody = document.getElementById('tableBody');

        if (!this.state.hasInventoryData() || forceRefresh) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-lg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';
        }

        try {
            const res = await API.getInventory(
                filters.page,
                filters.search,
                filters.status,
                filters.sortBy,
                filters.sortOrder,
                filters.location_id
            );

            if (res.status === 'success') {
                const totalPages = (res.pagination && res.pagination.total_pages) ? res.pagination.total_pages : 1;
                const totalItems = (res.pagination && res.pagination.total_items) ? res.pagination.total_items : 0;
                this.state.setInventoryData(res.data, totalPages, totalItems);
                this.renderProducts(res.data, totalPages, totalItems);
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-error p-lg">${res.message}</td></tr>`;
                Toast.error(res.message);
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-error p-lg">Network Error</td></tr>';
            Toast.error("Failed to load inventory");
        }
    }

    renderProducts(products, totalPages, totalItems) {
        const tbody = document.getElementById('tableBody');

        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-lg text-muted">No products found.</td></tr>';
            this.updatePagination(0, 0);
            return;
        }

        tbody.innerHTML = products.map(p => this.renderProductRow(p)).join('');
        this.updatePagination(totalPages, totalItems);
        this.attachRowEvents();
    }

    attachRowEvents() {
        document.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.id);
                this.state.toggleSelect(id);
                this.updateSelectionBar();
            });
        });

        document.querySelectorAll('.btn-transfer-single').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.dataset.id);
                this.handleSingleTransfer(productId);
            });
        });
    }

    renderProductRow(product) {
        const selected = this.state.isSelected(product.id);
        const imgHtml = product.image
            ? `<img src="${product.image}" class="table-avatar" alt="${product.name}">`
            : `<div class="table-placeholder">${product.name.charAt(0).toUpperCase()}</div>`;

        let stockHtml = '';
        if (product.stock_breakdown) {
            product.stock_breakdown.forEach(loc => {
                let badgeClass = 'badge-info';
                if (loc.type === 'defect') badgeClass = 'badge-error';
                else if (loc.type === 'virtual') badgeClass = 'badge-warning';
                // Only show stock > 0 to keep UI clean
                if (loc.quantity > 0) {
                    stockHtml += `<span class="badge ${badgeClass}" style="margin-right: 5px; margin-bottom: 2px;">${loc.location_name}: ${loc.quantity}</span>`;
                }
            });
        }

        return `
      <tr>
        <td class="text-center">
          <input type="checkbox" class="row-checkbox" data-id="${product.id}" ${selected ? 'checked' : ''}>
        </td>
        <td>
          <div class="flex items-center">
            ${imgHtml}
            <span class="font-semibold text-sm">${product.name}</span>
          </div>
        </td>
        <td><span class="text-muted text-sm">${product.sku || '-'}</span></td>
        <td>
          <div class="mb-sm flex flex-wrap gap-xs">${stockHtml}</div>
          <button class="btn btn-sm btn-secondary btn-transfer-single" data-id="${product.id}">
            <i class="fa-solid fa-arrow-right-arrow-left"></i> Move
          </button>
        </td>
      </tr>
    `;
    }

    updateSelectionBar() {
        const count = this.state.getSelectedCount();
        const bar = document.getElementById('selectionBar');
        const countEl = document.getElementById('selectCount');

        if (count > 0) {
            bar.classList.remove('hidden');
            countEl.textContent = `${count} selected`;
        } else {
            bar.classList.add('hidden');
        }
    }

    updatePagination(totalPages, totalItems) {
        const pages = totalPages || 1;
        const items = totalItems || 0;
        const filters = this.state.getFilters();

        document.getElementById('pageInfo').innerHTML = `
            Page <span class="font-bold">${filters.page}</span> of <span class="font-bold">${pages}</span> 
            <span class="text-muted ml-sm">(${items} Items)</span>
        `;

        document.getElementById('prevBtn').disabled = filters.page <= 1;
        document.getElementById('nextBtn').disabled = filters.page >= pages;
    }

    changePage(delta) {
        const filters = this.state.getFilters();
        this.state.setPage(filters.page + delta);
        this.loadData();
    }

    // --- TRANSFER LOGIC (SMART FILTERING) ---

    async handleSingleTransfer(productId) {
        const product = this.state.getProduct(productId);
        if (!product) return Toast.error("Product not found");
        const locations = await this.state.loadLocations();
        this.openTransferModal([product], locations, false);
    }

    async handleBulkTransfer() {
        const selectedIds = this.state.getSelectedIds();
        const products = this.state.getProducts(selectedIds);
        if (products.length === 0) return Toast.error("No products selected");
        const locations = await this.state.loadLocations();
        this.openTransferModal(products, locations, true);
    }

    async syncProducts() {
        const btn = document.getElementById('syncBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
        try {
            const res = await API.syncProducts(1);
            if (res.status === 'success' || res.status === 'done') {
                Toast.success('Sync complete');
                this.loadData(true);
            } else {
                Toast.error(res.message || "Sync Failed");
            }
        } catch (e) {
            Toast.error("Sync Failed");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Sync Web';
        }
    }

    openTransferModal(products, locations, isBulk) {
        const title = isBulk ? `Transfer ${products.length} Items` : `Transfer: ${products[0].name}`;

        // --- SMART SOURCE FILTERING ---
        // 1. Build list of potential sources (DB locations + Virtual Main Warehouse)
        const allSources = [
            { id: 0, name: "Main Warehouse" },
            ...locations
        ];

        // 2. Filter: Valid source must have quantity > 0 for ALL selected products
        let sourceOptionsHtml = `<option value="" disabled selected>Select Source...</option>`;

        allSources.forEach(loc => {
            const hasStock = products.every(p => {
                // Find stock record for this location in this product
                const breakdown = p.stock_breakdown.find(b => b.location_id == loc.id);
                return breakdown && breakdown.quantity > 0;
            });

            if (hasStock) {
                sourceOptionsHtml += `<option value="${loc.id}">${loc.name}</option>`;
            } else {
                // Optional: Show disabled option for clarity
                sourceOptionsHtml += `<option value="${loc.id}" disabled>${loc.name} (Out of Stock)</option>`;
            }
        });

        // Destination Options (All locations except Main usually, or all)
        // You might want to flag locations that have cashiers here if API provided it
        const destOptionsHtml = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

        const body = `
            <div class="form-group mb-md">
                <label class="form-label font-semibold mb-sm">Source Location (From)</label>
                <select id="transferFrom" class="form-select">
                    ${sourceOptionsHtml}
                </select>
                <p class="text-xs text-muted mt-xs">Only locations with stock are enabled.</p>
            </div>
            
            <div class="form-group mb-md">
                <label class="form-label font-semibold mb-sm">Destination Branch (To)</label>
                <select id="transferTo" class="form-select">
                    <option value="" disabled selected>Select Destination...</option>
                    ${destOptionsHtml}
                </select>
            </div>

            <div class="form-group">
                <label class="form-label font-semibold mb-sm">Quantity to Transfer</label>
                <input type="number" id="transferQty" class="form-input" value="1" min="1">
                <p class="text-xs text-muted mt-xs">
                    ${isBulk ? 'This quantity will be applied to EACH selected item.' : 'Enter quantity to move.'}
                </p>
            </div>
        `;

        Modal.open({
            title: title,
            body: body,
            confirmText: "Initiate Transfer",
            onConfirm: async () => {
                const fromId = document.getElementById('transferFrom').value;
                const toId = document.getElementById('transferTo').value;
                const qty = parseInt(document.getElementById('transferQty').value);

                if (!fromId) return Toast.error("Please select a Source location");
                if (!toId) return Toast.error("Please select a Destination");
                if (fromId === toId) return Toast.error("Source and Destination cannot be same");
                if (!qty || qty < 1) return Toast.error("Invalid Quantity");

                const user = this.state.getUser();

                try {
                    const items = products.map(p => ({
                        product_id: p.id,
                        qty: qty
                    }));
                    const res = await API.initiateTransfer(items, user.id, toId);
                if (res.status === 'success') {
                    Toast.success("Transfer Initiated. Waiting for approval.");
                    this.state.clearSelection();
                    this.loadData(true);
                } else {
                    throw new Error(res.message);
                }
            } catch (e) {
                Toast.error(e.message || "Transfer Failed");
                throw e;
            }
        }
    });
}
}

module.exports = DashboardView;