const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const ProductsFilters = require('./components/ProductsFilters.js');
const InventoryTable = require('./components/InventoryTable.js');
const Pagination = require('./components/Pagination.js');
const BulkActions = require('./components/BulkActions.js');
const BackgroundSyncManager = require('../../services/BackgroundSyncManager.js');

class ProductsView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.selectedProducts = new Map();
        this.syncInProgress = false;

        // Restore previous state
        const savedState = this.state.getTabState('products');
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

        // Background auto-sync — shared across re-renders via app-level singleton
        if (!app._bgSync) {
            app._bgSync = new BackgroundSyncManager(API, this.state);
            app._bgSync.start();
        }
        this._bgSync = app._bgSync;

        // Tracks whether the table has been successfully rendered at least once
        // this session. Cleared when invalidateCache() is called so the next
        // visit forces a fresh fetch.
        this._dataLoaded = false;

        // Initialize sub-components
        this.filters = new ProductsFilters(this);
        this.inventoryTable = new InventoryTable(this);
        this.pagination = new Pagination(this);
        this.bulkActions = new BulkActions(this);
    }

    saveState() {
        this.state.saveTabState('products', {
            // Save the array of actual product objects to state
            selectedProducts: Array.from(this.selectedProducts.values())
        });
    }

    render() {
        const content = document.getElementById('content');

        // Capture any existing table/pagination HTML so we can restore it
        // immediately after rebuilding the page chrome — the user should never
        // see a blank flash when switching tabs back to Products.
        const existingMain = document.getElementById('mainContent')?.innerHTML || '';
        const existingPagination = document.getElementById('paginationContainer')?.innerHTML || '';

        content.innerHTML = `
<div class="page-header mb-md">
                <div class="header-row mb-sm" style="display: flex; justify-content: flex-start; align-items: center; gap: 15px;">
                    <h1 class="page-title text-neutral-800 font-normal" style="font-size: 23px; margin: 0;">Products</h1>
                    <button class="btn btn-sm" id="syncBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1; font-weight: 500;">
                                <i class="fa-solid fa-cloud-arrow-down"></i> Sync Now
                            </button>
                            <button class="btn btn-sm" id="exportBtn" style="background: white; border: 1px solid #c3c4c7; color: #2c3338;">
                                <i class="fa-solid fa-download"></i> Export
                            </button>
                             <button class="btn btn-sm btn-ghost" id="refreshBtn" title="Refresh Data">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                        <!-- Background sync status — updated automatically, no spinner blocking the UI -->
                        <span id="bgSyncBadge" style="
                            display:none; align-items:center; gap:5px;
                            font-size:11px; font-weight:600; color:#2271b1;
                            background:rgba(34,113,177,0.08); border:1px solid rgba(34,113,177,0.2);
                            border-radius:12px; padding:3px 10px; white-space:nowrap;
                        "></span>
                </div>
                 <div style="background: #f0f0f1; padding: 10px; border-bottom: 1px solid #c3c4c7;">
                    <div id="statusFilterContainer"></div>
                    <div id="filtersContainer"></div>
                    <div id="bulkActionsContainer"></div>
                </div>
            </div>
            <div class="wrap" style="max-width: 100%; position: relative;">
             <div id="mainContent">${existingMain}</div>
             <div id="paginationContainer" style="margin-top: 15px;">${existingPagination}</div>
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

        // Subscribe to background sync status updates for this render cycle.
        // Unsubscribe stored so re-render doesn't accumulate stale listeners.
        if (this._bgSyncUnsub) this._bgSyncUnsub();
        this._bgSyncUnsub = this._bgSync.onStatusChange(s => this._updateSyncBadge(s));

        // Show last-sync time immediately on mount — prefer server-side state
        // so the badge is accurate even if this is a fresh browser session.
        API.getSyncState?.().then(res => {
            const t = res?.data?.last_sync_at || this._bgSync.lastSyncTime;
            if (t) {
                this._updateSyncBadge({
                    status: 'idle',
                    message: `Last sync: ${this._timeAgo(new Date(t))}`
                });
            }
        }).catch(() => {
            const t = this._bgSync.lastSyncTime;
            if (t) {
                this._updateSyncBadge({
                    status: 'idle',
                    message: `Last sync: ${this._timeAgo(new Date(t))}`
                });
            }
        });

        await this.loadData();
    }

    /** Update the compact badge in the header with bg sync progress. */
    _updateSyncBadge({status, message}) {
        const badge = document.getElementById('bgSyncBadge');
        if (!badge) return;

        if (status === 'idle' || !message) {
            badge.style.display = 'none';
            return;
        }

        badge.style.display = 'inline-flex';

        const icons = {
            running: '<i class="fa-solid fa-arrows-rotate fa-spin" style="font-size:10px;"></i>',
            paused: '<i class="fa-solid fa-pause" style="font-size:10px;"></i>',
            done: '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:10px;"></i>',
            error: '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626;font-size:10px;"></i>',
        };

        const colors = {
            running: 'rgba(34,113,177,0.08)',
            paused: 'rgba(34,113,177,0.05)',
            done: 'rgba(22,163,74,0.08)',
            error: 'rgba(220,38,38,0.08)',
        };

        badge.style.background = colors[status] || colors.running;
        badge.innerHTML = `${icons[status] || ''} ${message}`;

        // Auto-hide the 'done' badge after 5 s
        if (status === 'done') {
            clearTimeout(this._badgeHideTimer);
            this._badgeHideTimer = setTimeout(() => {
                if (badge) {
                    badge.style.display = 'none';
                }
            }, 5000);
        }
    }

    _timeAgo(date) {
        const s = Math.floor((Date.now() - date) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    }

    attachEvents() {
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this._invalidateCache();
            this.loadData();
        });

        document.getElementById('syncBtn')?.addEventListener('click', () => this.startManualSync());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportData());
    }

    async startManualSync() {
        if (this._bgSync.isRunning) {
            Toast.info("Sync already in progress");
            return;
        }

        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Syncing…';
        }

        // Subscribe a one-shot listener that restores the button and reloads
        // data when the SSE stream finishes. The badge is updated by the
        // persistent onStatusChange listener already wired in init().
        const unsub = this._bgSync.onStatusChange(({status, message}) => {
            if (status === 'done' || status === 'error') {
                unsub();   // remove this one-shot listener
                this.syncInProgress = false;
                if (syncBtn) {
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Sync Now';
                }
                if (status === 'done') {
                    Toast.success(message);
                    this._invalidateCache();
                    this.loadData();
                } else {
                    Toast.error(message);
                }
            }
        });

        this.syncInProgress = true;
        // force=true → full sync (all products, ignores delta timestamp)
        this._bgSync.runNow(true);
    }

    async loadData() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        mainContent.innerHTML = '<div class="text-center p-xl"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        // Pause background sync while the inventory query runs — both hit the
        // same server and competing requests slow down both.
        this._bgSync.pause('loading');

        const f = this.state.getFilters();

        try {
            const res = await API.getInventory(
                f.page, f.search, f.location_id, f.status,
                f.sortBy, f.sortOrder, f.category, f.stockFilter || 'all'
            );

            if (res.status === 'success') {
                this.state.setInventoryData(res.data || [], res.pagination?.pages || 1, res.pagination?.total || 0);

                // Cache the data locally so we can restore it instantly on tab switch
                this._cachedData = res.data || [];
                this._cachedPagination = res.pagination || {};

                await this.inventoryTable.render(this._cachedData);
                this.pagination.render(this._cachedPagination);
                this._dataLoaded = true;
            } else {
                mainContent.innerHTML = `<div class="card p-lg text-center text-error">${res.message}</div>`;
            }
        } catch (e) {
            console.error(e);
            mainContent.innerHTML = '<div class="card p-lg text-center text-error">Failed to load inventory</div>';
        } finally {
            // Always resume — sync will pick up on the next poll cycle
            this._bgSync.resume('loading');
        }
    }

    /** Invalidate the cache and force a fresh loadData() on the next visit. */
    _invalidateCache() {
        this._dataLoaded = false;
        this.state.invalidateInventoryCache();
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

module.exports = ProductsView;