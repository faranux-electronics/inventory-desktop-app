const Toast = require('../components/Toast.js');
const API = require('../services/api.js');
const DashboardFilters = require('./dashboard/DashboardFilters.js');
const InventoryTable = require('./dashboard/InventoryTable.js');
const Pagination = require('./dashboard/Pagination.js');
const BulkActions = require('./dashboard/BulkActions.js');

class DashboardView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.selectedProducts = new Map();
        this.syncInProgress = false;

        // Restore previous state
        const savedState = this.state.getTabState('dashboard');
        if (savedState && savedState.selectedProducts) {
            savedState.selectedProducts.forEach(p => {
                if (typeof p === 'object' && p !== null) {
                    this.selectedProducts.set(p.id, p);
                } else if (typeof p === 'number') {
                    // Fallback for older cached data
                    this.selectedProducts.set(p, {id: p});
                }
            });
        }

        // Initialize sub-components
        this.filters = new DashboardFilters(this);
        this.inventoryTable = new InventoryTable(this);
        this.pagination = new Pagination(this);
        this.bulkActions = new BulkActions(this);
    }

    saveState() {
        this.state.saveTabState('dashboard', {
            // Save the array of actual product objects to state
            selectedProducts: Array.from(this.selectedProducts.values())
        });
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
<div class="page-header mb-md">
                <div class="header-row mb-sm" style="display: flex; justify-content: flex-start; align-items: center; gap: 15px;">
                    <h1 class="page-title text-neutral-800 font-normal" style="font-size: 23px; margin: 0;">Products</h1>
                    <button class="btn btn-sm" id="syncBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1; font-weight: 500;">
                                <i class="fa-solid fa-cloud-arrow-down"></i> Sync Web
                            </button>
                            <button class="btn btn-sm" id="exportBtn" style="background: white; border: 1px solid #c3c4c7; color: #2c3338;">
                                <i class="fa-solid fa-download"></i> Export
                            </button>
                             <button class="btn btn-sm btn-ghost" id="refreshBtn" title="Refresh Data">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                </div>
                 <div style="background: #f0f0f1; padding: 10px; border-bottom: 1px solid #c3c4c7;">
                                        <div id="syncProgress" class="sync-progress hidden" style="margin-bottom: 10px;">
                        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
                        <p id="syncStatus" style="font-size: 12px; margin-top: 4px;">Syncing products...</p>
                    </div>

                    <div id="statusFilterContainer"></div>

                    <div id="filtersContainer"></div>
                    
                    <div id="bulkActionsContainer"></div>
                </div>
            </div>
            <div class="wrap" style="max-width: 100%; position: relative;">
                             
             <div id="mainContent"></div>
             <div id="paginationContainer" style="margin-top: 15px;"></div>   
            </div>
        `;

        this.init();
    }

    async init() {
        // Default location filter to the user's active branch (branch-aware view)
        const f = this.state.getFilters();
        if (!f.location_id) {
            const user = this.state.getUser();
            if (user && user.branch_id) {
                if (user.role !== 'admin') {
                    this.state.setLocationFilter(String(user.branch_id));
                }
            }
        }

        this.filters.render();
        this.bulkActions.render();
        this.attachEvents();
        await this.loadData();
    }

    attachEvents() {
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
                mainContent.innerHTML = `<div class="card p-lg text-center text-error">${res.message}</div>`;
            }
        } catch (e) {
            console.error(e);
            mainContent.innerHTML = '<div class="card p-lg text-center text-error">Failed to load inventory</div>';
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

        if (syncBtn) syncBtn.disabled = true;
        if (progressDiv) progressDiv.classList.remove('hidden');

        let currentPage = 1;
        let totalSynced = 0;
        const BATCH_SIZE = 10;

        try {
            while (true) {
                if (syncStatus) syncStatus.textContent = `Syncing Page ${currentPage}... (Total: ${totalSynced})`;

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
            if (syncBtn) syncBtn.disabled = false;
            if (progressDiv) progressDiv.classList.add('hidden');
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

    toggleSelection(product, forceState = null) {
        if (!product || !product.id) return;

        const isSelected = this.selectedProducts.has(product.id);
        const newState = forceState !== null ? forceState : !isSelected;

        if (newState) {
            this.selectedProducts.set(product.id, product);
        } else {
            this.selectedProducts.delete(product.id);
        }

        this.saveState();
        this.updateSelectionUI();
    }

    clearSelection() {
        this.selectedProducts.clear();
        this.saveState();
        this.updateSelectionUI();
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.wp-list-table tr').forEach(tr => tr.style.removeProperty('background-color'));
    }
}

module.exports = DashboardView;