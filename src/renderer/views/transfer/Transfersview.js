const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const POSFilterBar = require('../pos/components/POSFilterBar.js');
const LocalProductGrid = require('./components/LocalProductGrid.js');
const TransferStagingPanel = require('./components/TransferStagingPanel.js');
const TransferTable = require('./components/TransferTable.js');

// FIX: Escape helper used for any server-supplied string inserted into innerHTML.
function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class TransfersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        // Product browser state (mirrors POSView)
        this._query = '';
        this._category = '';
        this._stockFilter = 'instock';  // Default to instock — makes sense for transfers
        this._onSale = false;
        this._featured = false;
        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;
        this._syncSession = 0;

        // Branch data
        this._branchInventory = {};  // { branch_id: { product_id: qty } }
        this._userBranchId = null;

        // Tab state — 'new_transfer' | 'pending_incoming' | 'pending_outgoing' | 'history'
        this.currentTab = 'new_transfer';
        this.filters = {search: '', start: '', end: '', page: 1};

        // Sub-components (init in render)
        this.filterBar = null;
        this.productGrid = null;
        this.stagingPanel = null;
        this.tableComponent = null;

        // FIX: AbortController used to cleanly remove document-level resizer listeners
        // when the view is destroyed, preventing listener accumulation on re-renders.
        this._resizerAbort = null;

        // Restore saved state
        const saved = this.state.getTabState('transfers');
        if (saved) {
            this.currentTab = saved.currentTab || 'new_transfer';
            this.filters = saved.filters || this.filters;
        }
    }

    saveState() {
        this.state.saveTabState('transfers', {
            currentTab: this.currentTab,
            filters: this.filters
        });
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    /** Call when navigating away from this view to clean up global listeners. */
    destroy() {
        this._resizerAbort?.abort();
        this._resizerAbort = null;
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    render() {
        // Clean up any previous resizer listeners before re-rendering.
        this.destroy();

        const content = document.getElementById('content');
        content.innerHTML = this._layoutHTML();

        this._initComponents();
        this._initResizer();
        this._bootstrap();
    }


    _layoutHTML() {
        const isNew = this.currentTab === 'new_transfer';
        const isIncoming = this.currentTab === 'pending_incoming';
        const isOutgoing = this.currentTab === 'pending_outgoing';
        const isHistory = this.currentTab === 'history';

        return `
        <div class="trv-root" id="trvRoot">

            <!-- ── Top-level tab bar ── -->
            <div class="trv-nav-bar" id="trvTabBar">
                <button class="trv-nav-tab ${isNew ? 'active' : ''}" data-tab="new_transfer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Transfer
                </button>
                <div class="trv-nav-sep"></div>
                <button class="trv-nav-tab ${isIncoming ? 'active' : ''}" data-tab="pending_incoming">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><path d="M12 19V5M5 12l7 7 7-7"/></svg>
                    Incoming
                </button>
                <button class="trv-nav-tab ${isOutgoing ? 'active' : ''}" data-tab="pending_outgoing">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><path d="M12 5v14M19 12l-7-7-7 7"/></svg>
                    Outgoing
                </button>
                <button class="trv-nav-tab ${isHistory ? 'active' : ''}" data-tab="history">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    History
                </button>
            </div>

            <!-- ── Panel A: New Transfer (split panel) ── -->
            <div class="trv-panel" id="trvPanelNew" style="${isNew ? '' : 'display:none;'}">
                <div class="trv-split" id="trvSplit">
                    <div class="trv-left" id="trvLeft">
                        <div class="trv-left-header" id="trvFilterBarMount"></div>
                        <div class="trv-left-body"   id="trvGridMount"></div>
                    </div>
                    <div class="trv-divider" id="trvDivider" title="Drag to resize">
                        <div class="trv-divider-grip"><span></span><span></span><span></span></div>
                    </div>
                    <div class="trv-right" id="trvRight">
                        <div id="trvStagingMount" style="height:100%;overflow:hidden;"></div>
                    </div>
                </div>
            </div>

            <!-- ── Panel B: Transfer table (incoming / outgoing / history) ── -->
            <div class="trv-panel trv-panel--table" id="trvPanelTable" style="${isNew ? 'display:none;' : ''}">

                <!-- Sticky filter toolbar -->
                <div class="trv-table-toolbar">
                    <div class="trv-search-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" class="trv-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="trvSearch" class="trv-filter-input trv-search-input"
                               placeholder="Search batch or product…" value="${esc(this.filters.search)}">
                    </div>
                    <input type="date" id="trvDateStart" class="trv-filter-input" value="${esc(this.filters.start)}" title="From date">
                    <span class="trv-date-sep">—</span>
                    <input type="date" id="trvDateEnd" class="trv-filter-input" value="${esc(this.filters.end)}" title="To date">
                    <div class="trv-toolbar-spacer"></div>
                    <button class="trv-btn" id="trvRefreshBtn" title="Refresh">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.22-7.7"/></svg>
                        Refresh
                    </button>
                    <button class="trv-btn trv-btn-ghost" id="trvExportBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export
                    </button>
                </div>
                <div class="trv-table-card">
                    <div class="trv-col-header">
                        <div class="trv-ch"></div>
                        <div class="trv-ch">Batch ID</div>
                        <div class="trv-ch">Date</div>
                        <div class="trv-ch trv-ch--center"></div>
                        <div class="trv-ch">From</div>
                        <div class="trv-ch">To</div>
                        <div class="trv-ch">Items</div>
                        <div class="trv-ch trv-ch--center">Discrepancy</div>
                        <div class="trv-ch">Status</div>
                        <div class="trv-ch">Actions</div>
                    </div>
                    <div id="transfersTableBody">
                        <div class="trv-empty-row" style="padding:32px;">
                            <svg class="lpg-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg>
                            <span>Loading…</span>
                        </div>
                    </div>
                    <div id="paginationControls" class="trv-pagination"></div>
                </div>
            </div>

        </div>`;
    }

    // ─── Component init ───────────────────────────────────────────────────────

    _initComponents() {
        const user = this.state.getUser();
        this._userBranchId = user?.branch_id ? String(user.branch_id) : null;

        // ── Filter bar (reused from POS) ──────────────────────────────────────
        this.filterBar = new POSFilterBar({
            initialQuery: this._query,
            initialCategory: this._category,
            initialStockFilter: this._stockFilter,
            initialOnSale: this._onSale,
            initialFeatured: this._featured,
            onFilter: f => {
                this._query = f.query;
                this._category = f.category;
                this._stockFilter = f.stockFilter;
                this._onSale = f.onSale;
                this._featured = f.featured;
                this._reloadProducts();
            }
        });
        this.filterBar.render(document.getElementById('trvFilterBarMount'));

        // ── Local product grid ────────────────────────────────────────────────
        this.productGrid = new LocalProductGrid({
            onSelect: product => this._handleAddToStaging(product),
            onScrollEnd: () => this._loadMoreProducts()
        });
        this.productGrid.render(document.getElementById('trvGridMount'));

        // ── Staging panel (new, transfer-specific) ────────────────────────────
        this.stagingPanel = new TransferStagingPanel({
            onTransfer: payload => this._handleTransfer(payload),
            onBranchChange: fromId => this._onSourceBranchChange(fromId)
        });
        this.stagingPanel.render(document.getElementById('trvStagingMount'));

        // ── History table (existing component) ───────────────────────────────
        this.tableComponent = new TransferTable(this);

        // ── History tab & filter events ───────────────────────────────────────
        this._attachHistoryEvents();
    }

    // ─── Bootstrap: load branches, inventory, products ────────────────────────

    async _bootstrap() {
        const locations = await this.state.loadLocations() || [];

        // Build locationMap for the grid's breakdown badges
        const locationMap = {};
        locations.forEach(l => {
            locationMap[l.id] = l.name;
        });
        this._locationMap = locationMap;
        this.productGrid.setLocationMap(locationMap);

        this.stagingPanel.setBranches(locations, this._userBranchId);

        // Set focus branch so the user's branch is highlighted in breakdown badges
        if (this._userBranchId) {
            this.productGrid.setFocusBranch(this._userBranchId);
        }

        try {
            const res = await API.getCategories();
            if (res?.status === 'success') this.filterBar.populateCategories(res.data || []);
        } catch (_) {
        }

        this._reloadProducts();
        if (this._userBranchId) await this._loadBranchInventory(this._userBranchId);
        await this.loadTransfers();
    }

    /**
     * Load per-branch local stock via getInventory.
     * Parses stock_breakdown to populate _branchInventory[branchId][productId] = qty.
     *
     * FIX: stock_breakdown pairs are split on the LAST colon only (lastIndexOf),
     * making the parser resilient to location names that contain colons.
     * Previously a naive split(':') would mis-parse such names and produce wrong
     * stock caps in the staging panel (potentially allowing over-transfers).
     */
    async _loadBranchInventory(branchId) {
        if (!branchId) return;
        try {
            const res = await API.getInventory(1, '', '', 'publish', 'name', 'ASC', '');
            if (res?.status !== 'success') return;

            const products = res.data || [];

            products.forEach(p => {
                if (p.stock_breakdown) {
                    p.stock_breakdown.toString().split(',').forEach(pair => {
                        // FIX: Split on last colon so location names with colons parse correctly.
                        const colonIdx = pair.lastIndexOf(':');
                        if (colonIdx === -1) return;
                        const lid = pair.substring(0, colonIdx).trim();
                        const qty = pair.substring(colonIdx + 1).trim();
                        if (!lid) return;
                        if (!this._branchInventory[lid]) this._branchInventory[lid] = {};
                        this._branchInventory[lid][p.id] = parseInt(qty || 0);
                    });
                }
            });

            this.stagingPanel.setBranchInventory(this._branchInventory);

            // Refresh breakdown badges in the grid without a full reload
            this.productGrid.setLocationMap(this._locationMap || {});
            this.productGrid.setFocusBranch(branchId);
            this.productGrid.refreshCards();
        } catch (e) {
            console.warn('Failed to load branch inventory', e);
        }
    }

    _onSourceBranchChange(fromId) {
        // Update the grid focus badge to highlight the new source branch
        this.productGrid.setFocusBranch(fromId);
        // Reload products filtered to the new source branch so stock quantities are correct
        this._reloadProducts();
        this._loadBranchInventory(fromId);
    }

    // ─── Product loading ──────────────────────────────────────────────────────

    _reloadProducts() {
        this._currentPage = 1;
        this._allLoaded = false;
        this._syncSession++;
        this._fetchProducts(1, false);
    }

    _loadMoreProducts() {
        if (this._loadingPage || this._allLoaded) return;
        this._fetchProducts(this._currentPage + 1, true);
    }

    async _fetchProducts(page, append) {
        if (this._loadingPage && page !== 1) return;
        this._loadingPage = true;

        const session = this._syncSession;

        this.productGrid.showLoading(!append);

        const fromId = document.getElementById('tspFromBranch')?.value || this._userBranchId || '';

        try {
            const res = await API.getInventory(
                page,
                this._query,
                fromId,
                'publish',
                this._sortBy || 'name',
                this._sortOrder || 'ASC',
                this._category
            );

            if (session !== this._syncSession) return;

            const products = res?.data || [];

            if (!append && products.length === 0) {
                this.productGrid.showEmpty('No products found in this branch.');
                this._allLoaded = true;
                return;
            }

            this.productGrid.update(products, append);
            this._currentPage = page;

            const totalPages = res?.pagination?.pages || 1;
            if (page >= totalPages) this._allLoaded = true;

            this.productGrid.setSyncStatus('done', res?.pagination?.total || products.length);

        } catch (e) {
            if (session !== this._syncSession) return;
            // FIX: pass only safe static text; e.message goes via esc to prevent
            // any server-crafted error text from injecting markup.
            if (!append) this.productGrid.showError(`Error: ${esc(e.message)}`);
        } finally {
            if (session === this._syncSession) this._loadingPage = false;
        }
    }

    // ─── Staging ──────────────────────────────────────────────────────────────

    _handleAddToStaging(product) {
        const fromId = document.getElementById('tspFromBranch')?.value || this._userBranchId;
        const localQty = fromId && this._branchInventory[fromId]
            ? parseInt(this._branchInventory[fromId][product.id] ?? 0)
            : parseInt(product.stock_quantity || 0);

        const enriched = {...product, stock_quantity: localQty};
        const result = this.stagingPanel.addProduct(enriched);

        if (result === 'nostock') return Toast.error('No local stock in source branch for this item');
        if (result === 'max') return Toast.error('Max available quantity already staged');
        this.productGrid.flash(product.id);
    }

    // ─── Transfer submit ──────────────────────────────────────────────────────

    async _handleTransfer({fromBranchId, toBranchId, reason, items}) {
        if (fromBranchId === toBranchId) return Toast.error('Source and destination must differ');

        this.stagingPanel.setLoading(true);
        try {
            const res = await API.initiateTransfer(items, fromBranchId, toBranchId, reason);
            if (res.status === 'success') {
                Toast.success('Transfer initiated successfully!');
                this.stagingPanel.clear();
                this.stagingPanel.setLoading(false);
                this.state.invalidateInventoryCache();
                await this._loadBranchInventory(fromBranchId);
                await this.loadTransfers();
            } else {
                Toast.error(res.message || 'Transfer failed');
                this.stagingPanel.setLoading(false);
            }
        } catch (e) {
            Toast.error('Network error: ' + e.message);
            this.stagingPanel.setLoading(false);
        }
    }

    // ─── History table helpers (called by TransferTable) ─────────────────────

    async loadTransfers() {
        const tbody = document.getElementById('transfersTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<div class="trv-empty-row"><svg class="lpg-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg><span>Loading…</span></div>';

        let apiType = 'all', apiDir = 'all';
        if (this.currentTab === 'pending_incoming') {
            apiType = 'pending';
            apiDir = 'incoming';
        } else if (this.currentTab === 'pending_outgoing') {
            apiType = 'pending';
            apiDir = 'outgoing';
        } else if (this.currentTab === 'history') {
            apiType = 'history';
            apiDir = 'all';
        }

        try {
            const res = await API.getTransfers(apiType, apiDir,
                this.filters.page, this.filters.search, '',
                this.filters.start, this.filters.end, '');

            if (res.status === 'success') {
                this.tableComponent.render(res.data || []);
            } else {
                // FIX: escape server error message before injection into innerHTML
                tbody.innerHTML = `<div class="trv-empty-row" style="color:var(--error-500);">${esc(res.message)}</div>`;
            }
        } catch (_) {
            tbody.innerHTML = `<div class="trv-empty-row" style="color:var(--error-500);">Connection failed</div>`;
        }
    }

    // getUserBranchId and getUser — required by TransferTable
    getUserBranchId() {
        return this._userBranchId;
    }

    getUser() {
        return this.state.getUser();
    }

    // ─── Navigation events ────────────────────────────────────────────────────

    _attachHistoryEvents() {
        const panelNew = document.getElementById('trvPanelNew');
        const panelTable = document.getElementById('trvPanelTable');
        const filtersBar = document.getElementById('trvFilters');

        document.getElementById('trvTabBar')?.querySelectorAll('.trv-nav-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.trv-nav-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.filters.page = 1;
                this.saveState();

                const isNew = this.currentTab === 'new_transfer';
                panelNew.style.display = isNew ? '' : 'none';
                panelTable.style.display = isNew ? 'none' : '';
                if (filtersBar) {
                    filtersBar.style.visibility = isNew ? 'hidden' : '';
                    filtersBar.style.pointerEvents = isNew ? 'none' : '';
                }
                if (!isNew) this.loadTransfers();
            });
        });

        const applyFilters = () => {
            this.filters.search = document.getElementById('trvSearch')?.value.trim() || '';
            this.filters.start = document.getElementById('trvDateStart')?.value || '';
            this.filters.end = document.getElementById('trvDateEnd')?.value || '';
            this.filters.page = 1;
            this.saveState();
            this.loadTransfers();
        };

        document.getElementById('trvSearch')?.addEventListener('input', applyFilters);
        document.getElementById('trvDateStart')?.addEventListener('change', applyFilters);
        document.getElementById('trvDateEnd')?.addEventListener('change', applyFilters);
        document.getElementById('trvRefreshBtn')?.addEventListener('click', () => this.loadTransfers());

        document.getElementById('trvExportBtn')?.addEventListener('click', () => {
            let apiType = 'all', apiDir = 'all';
            if (this.currentTab === 'pending_incoming') {
                apiType = 'pending';
                apiDir = 'incoming';
            } else if (this.currentTab === 'pending_outgoing') {
                apiType = 'pending';
                apiDir = 'outgoing';
            } else if (this.currentTab === 'history') {
                apiType = 'history';
                apiDir = 'all';
            }
            API.exportTransfersCsv(apiType, apiDir, this.filters.search, this.filters.start, this.filters.end);
        });
    }

    // ─── Resizer ──────────────────────────────────────────────────────────────

    _initResizer() {
        const divider = document.getElementById('trvDivider');
        const right = document.getElementById('trvRight');
        const split = document.getElementById('trvSplit');
        if (!divider || !right || !split) return;

        right.style.flex = '0 0 360px';

        let dragging = false, startX, startW;

        // FIX: Use AbortController so document-level listeners are properly removed
        // when destroy() is called, preventing accumulation across re-renders.
        this._resizerAbort = new AbortController();
        const signal = this._resizerAbort.signal;

        divider.addEventListener('mousedown', e => {
            dragging = true;
            startX = e.clientX;
            startW = right.getBoundingClientRect().width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            divider.classList.add('trv-divider--active');
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const delta = startX - e.clientX;
            const newW = Math.max(260, Math.min(520, startW + delta));
            right.style.flex = `0 0 ${newW}px`;
        }, {signal});

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            divider.classList.remove('trv-divider--active');
        }, {signal});
    }
}

module.exports = TransfersView;