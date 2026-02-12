const Toast = require('../components/Toast.js');
const API = require('../services/api.js');
const DashboardFilters = require('./dashboard/DashboardFilters.js');
const InventoryTable = require('./dashboard/InventoryTable.js');
const StockComparison = require('./dashboard/StockComparison.js');
const Pagination = require('./dashboard/Pagination.js');
const BulkActions = require('./dashboard/BulkActions.js');

class DashboardView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.selectedProducts = new Set();
        this.syncInProgress = false;

        // Restore previous state
        const savedState = this.state.getTabState('dashboard');
        if (savedState) {
            this.currentView = savedState.currentView || 'inventory';
            this.selectedProducts = new Set(savedState.selectedProducts || []);
        } else {
            this.currentView = 'inventory';
        }

        // Initialize sub-components
        this.filters = new DashboardFilters(this);
        this.inventoryTable = new InventoryTable(this);
        this.stockComparison = new StockComparison(this);
        this.pagination = new Pagination(this);
        this.bulkActions = new BulkActions(this);
    }

    saveState() {
        this.state.saveTabState('dashboard', {
            currentView: this.currentView,
            selectedProducts: Array.from(this.selectedProducts)
        });
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header sticky-header">
                <div class="header-row">
                    <h1 class="page-title">Inventory Dashboard</h1>
                    <div class="header-actions">
                        <button class="btn btn-secondary" id="exportBtn">
                            <i class="fa-solid fa-download"></i> Export CSV
                        </button>
                        <button class="btn btn-secondary" id="refreshBtn">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                        <button class="btn btn-primary" id="syncBtn">
                            <i class="fa-solid fa-cloud-arrow-down"></i> Sync Web
                        </button>
                    </div>
                </div>

                <!-- Sync Progress -->
                <div id="syncProgress" class="sync-progress hidden">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <p id="syncStatus">Syncing products...</p>
                </div>

                <!-- Bulk Actions Bar -->
                <div id="bulkActionsContainer"></div>

                <!-- Filters -->
                <div id="filtersContainer"></div>

                <!-- View Tabs -->
                <div class="tabs mb-md">
                    <button class="tab-btn ${this.currentView === 'inventory' ? 'active' : ''}" data-view="inventory">
                        <i class="fa-solid fa-boxes-stacked"></i> Inventory
                    </button>
                    <button class="tab-btn ${this.currentView === 'comparison' ? 'active' : ''}" data-view="comparison">
                        <i class="fa-solid fa-scale-balanced"></i> Stock Comparison
                    </button>
                </div>
            </div>

            <div id="mainContent"></div>
            <div id="paginationContainer"></div>
        `;

        this.init();
    }

    async init() {
        this.filters.render();
        this.bulkActions.render();
        this.attachEvents();
        await this.loadData();
        this.setupScrollPreservation();
    }

    setupScrollPreservation() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        const savedScroll = localStorage.getItem('view_scroll_dashboard');
        if (savedScroll !== null) {
            setTimeout(() => {
                const container = document.querySelector('.table-container');
                if (container) container.scrollTop = parseInt(savedScroll, 10);
            }, 100);
        }

        mainContent.addEventListener('scroll', () => {
            const container = document.querySelector('.table-container');
            if (container) {
                localStorage.setItem('view_scroll_dashboard', container.scrollTop);
            }
        }, true);
    }

    attachEvents() {
        // View tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentView = btn.dataset.view;
                this.saveState();
                this.loadData();
            });
        });

        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.state.invalidateInventoryCache();
            this.loadData();
        });

        document.getElementById('syncBtn')?.addEventListener('click', () => this.startBackgroundSync());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportData());
    }

    async loadData() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        mainContent.innerHTML = '<div class="text-center p-xl"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        if (this.currentView === 'inventory') {
            await this.loadInventoryView();
        } else if (this.currentView === 'comparison') {
            await this.loadComparisonView();
        }
    }

    async loadInventoryView() {
        const f = this.state.getFilters();

        try {
            const res = await API.getInventory(
                f.page, f.search, f.location_id, f.status,
                f.sortBy, f.sortOrder, f.category
            );

            if (res.status === 'success') {
                this.state.setInventoryData(res.data || [], res.pagination?.pages || 1, res.pagination?.total || 0);
                this.inventoryTable.render(res.data || []);
                this.pagination.render(res.pagination || {});
            } else {
                document.getElementById('mainContent').innerHTML =
                    `<div class="card p-lg text-center text-error">${res.message}</div>`;
            }
        } catch (e) {
            console.error(e);
            document.getElementById('mainContent').innerHTML =
                '<div class="card p-lg text-center text-error">Failed to load inventory</div>';
        }
    }

    async loadComparisonView() {
        const f = this.state.getFilters();

        try {
            // Pass all filters: location_id AND status
            const res = await API.getStockComparison(
                f.page,
                f.search,
                f.category,
                f.location_id,
                f.status, // <--- Added this
                f.sortBy,
                f.sortOrder
            );

            if (res.status === 'success') {
                this.stockComparison.render(res.data || []);
                this.pagination.render(res.pagination || {});
            } else {
                document.getElementById('mainContent').innerHTML =
                    `<div class="card p-lg text-center text-error">${res.message}</div>`;
            }
        } catch (e) {
            console.error(e);
            document.getElementById('mainContent').innerHTML =
                '<div class="card p-lg text-center text-error">Failed to load comparison</div>';
        }
    }

    async startBackgroundSync() {
        if (this.syncInProgress) {
            Toast.info("Sync already in progress");
            return;
        }

        this.syncInProgress = true;
        const syncBtn = document.getElementById('syncBtn');
        const progressDiv = document.getElementById('syncProgress');
        const syncStatus = document.getElementById('syncStatus');

        if(syncBtn) syncBtn.disabled = true;
        if(progressDiv) progressDiv.classList.remove('hidden');

        let currentPage = 1;
        let totalSynced = 0;
        const BATCH_SIZE = 10;

        try {
            while (true) {
                if(syncStatus) syncStatus.textContent = `Syncing Page ${currentPage}... (Total: ${totalSynced})`;

                const res = await API.syncBatch(currentPage, BATCH_SIZE);

                if (res.status === 'error') {
                    Toast.error(res.message);
                    break;
                }

                totalSynced += (res.synced || 0);

                if (!res.hasMore || res.status === 'complete') {
                    Toast.success(`Sync complete! ${totalSynced} products updated.`);
                    this.state.invalidateInventoryCache();
                    this.loadData();
                    break;
                }

                currentPage = res.nextPage;
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } catch (e) {
            console.error(e);
            Toast.error("Sync failed: " + e.message);
        } finally {
            this.syncInProgress = false;
            if(syncBtn) syncBtn.disabled = false;
            if(progressDiv) progressDiv.classList.add('hidden');
        }
    }

    exportData() {
        const f = this.state.getFilters();
        API.exportInventory(f.status, f.location_id || '', f.category || '');
        Toast.success("Export started");
    }

    updateSelectionUI() {
        this.bulkActions.update(this.selectedProducts.size);
    }

    toggleSelection(id) {
        if (this.selectedProducts.has(id)) {
            this.selectedProducts.delete(id);
        } else {
            this.selectedProducts.add(id);
        }
        this.saveState();
        this.updateSelectionUI();
    }

    clearSelection() {
        this.selectedProducts.clear();
        this.saveState();
        this.updateSelectionUI();
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
    }
}

module.exports = DashboardView;