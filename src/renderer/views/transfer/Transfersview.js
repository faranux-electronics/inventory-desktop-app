const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const Modal = require('../../components/Modal.js');
const POSFilterBar = require('../pos/components/POSFilterBar.js');
const LocalProductGrid = require('./components/LocalProductGrid.js');
const TransferStagingPanel = require('./components/TransferStagingPanel.js');
const TransferTable = require('./components/TransferTable.js');
const BranchBalancePanel = require('./components/BranchBalancePanel.js');

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class TransfersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        this._query = '';
        this._category = '';
        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;
        this._syncSession = 0;
        this._lastProductFilterFrom = null;

        this._branchInventory = {};
        this._userBranchId = null;

        this.currentTab = 'new_transfer';
        this.filters = {search: '', start: '', end: '', page: 1};

        this.filterBar = null;
        this.productGrid = null;
        this.stagingPanel = null;
        this.tableComponent = null;
        this.balancePanel = null;

        // Balance tab has its own pagination/session state, separate from the
        // New Transfer grid's, since both can have independently loaded pages.
        this._balancePage = 1;
        this._balanceAllLoaded = false;
        this._balanceLoading = false;
        this._balanceSession = 0;

        this._resizerAbort = null;
        // FIX: persist staged items across re-renders (e.g. navigating away and back)
        this._savedStagingItems = [];

        const saved = this.state.getTabState('transfers');
        if (saved) {
            this.currentTab = saved.currentTab || 'new_transfer';
            this.filters = saved.filters || this.filters;
        }
    }

    destroy() {
        this._resizerAbort?.abort();
        this._resizerAbort = null;
    }

    render() {
        // FIX: capture any staged items before blowing away the DOM, so they
        // survive navigation away and back to the Transfers view.
        this._savedStagingItems = this.stagingPanel?.getItems() || [];
        this.destroy();

        // FIX: reset per-render loading state so a previous abandoned mid-flight
        // fetch (e.g. user navigated away during a request) never leaves
        // _loadingPage stuck at true or _syncSession mismatched.
        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;
        this._lastProductFilterFrom = null;

        document.getElementById('content').innerHTML = this._layoutHTML();
        this._initComponents();
        this._initResizer();
        this.productGrid.showLoading(false);
        this._bootstrap();
    }

    _layoutHTML() {
        const user = this.state.getUser();
        let canViewBalance = false;
        
        try {
            const role = user?.role?.toLowerCase();
            // Balance stock is an internal tab within transfers view, not a top-level nav item
            // It's controlled by role-based permissions only (admin/manager)
            canViewBalance = ['admin', 'manager'].includes(role);
            
            // DEBUG: Log the permission check result
            console.log('Balance stock permission check:', { role, canViewBalance });
        } catch (e) {
            console.error("Permission check failed, reverting to default role check", e);
            canViewBalance = ['admin', 'manager'].includes(user?.role?.toLowerCase());
        }

        // Failsafe: If a cashier somehow had "balance" saved as their last tab state, reset it
        if (this.currentTab === 'balance' && !canViewBalance) {
            this.currentTab = 'new_transfer';
        }

        const isNew = this.currentTab === 'new_transfer';
        const isBalance = this.currentTab === 'balance';
        const isTable = !isNew && !isBalance;
        
        return `
        <div class="trv-root" id="trvRoot">
            <div class="trv-nav-bar" id="trvTabBar">
                <button class="trv-nav-tab ${isNew ? 'active' : ''}" data-tab="new_transfer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Transfer
                </button>
                <div class="trv-nav-sep"></div>
                <button class="trv-nav-tab ${this.currentTab === 'pending_incoming' ? 'active' : ''}" data-tab="pending_incoming">Incoming</button>
                <button class="trv-nav-tab ${this.currentTab === 'pending_outgoing' ? 'active' : ''}" data-tab="pending_outgoing">Outgoing</button>
                <button class="trv-nav-tab ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
                
                ${canViewBalance ? `
                <div class="trv-nav-sep"></div>
                <button class="trv-nav-tab ${isBalance ? 'active' : ''}" data-tab="balance">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><path d="M3 3v18h18"/><path d="M7 15l4-4 4 4 5-6"/></svg>
                    Balance Stock
                </button>
                ` : ''}
            </div>

            <div class="trv-panel" id="trvPanelNew" style="${isNew ? '' : 'display:none;'};">
                <div class="trv-split" id="trvSplit">
                    <div class="trv-left" id="trvLeft">
                        <div class="trv-left-header" style="display: flex; gap: 8px; align-items: center;">
                            <div id="trvFilterBarMount" style="flex: 1;"></div>
                            <select id="trvStockSort" class="trv-filter-input" style="max-width: 140px;" title="Sort by local stock">
                                <option value="">Default Sort</option>
                                <option value="desc">Highest Stock</option>
                                <option value="asc">Lowest Stock</option>
                            </select>
                        </div>
                        <div class="trv-left-body" id="trvGridMount"></div>
                    </div>
                    <div class="trv-divider" id="trvDivider"><div class="trv-divider-grip"><span></span><span></span><span></span></div></div>
                    <div class="trv-right" id="trvRight">
                        <div id="trvStagingMount" style="height:100%;overflow:hidden;"></div>
                    </div>
                </div>
            </div>

            <div class="trv-panel trv-panel--table" id="trvPanelTable" style="${isTable ? '' : 'display:none;'}">
                <div class="trv-table-toolbar">
                    <div class="trv-search-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" class="trv-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="trvSearch" class="trv-filter-input trv-search-input" placeholder="Search batch or product…" value="${esc(this.filters.search)}">
                    </div>
                    <input type="date" id="trvDateStart" class="trv-filter-input" value="${esc(this.filters.start)}">
                    <span class="trv-date-sep">—</span>
                    <input type="date" id="trvDateEnd" class="trv-filter-input" value="${esc(this.filters.end)}">
                    <div class="trv-toolbar-spacer"></div>
                    <button class="trv-btn" id="trvRefreshBtn">Refresh</button>
                    <button class="trv-btn trv-btn-ghost" id="trvExportBtn">Export</button>
                </div>
                <div class="trv-table-card">
                    <div class="trv-col-header">
                        <div class="trv-ch"></div><div class="trv-ch">Batch ID</div><div class="trv-ch">Date</div>
                        <div class="trv-ch trv-ch--center"></div><div class="trv-ch">From</div><div class="trv-ch">To</div>
                        <div class="trv-ch">Items</div><div class="trv-ch trv-ch--center">Discrepancy</div>
                        <div class="trv-ch">Status</div><div class="trv-ch">Actions</div>
                    </div>
                    <div id="transfersTableBody"></div>
                    <div id="paginationControls" class="trv-pagination"></div>
                </div>
            </div>

            <div class="trv-panel" id="trvPanelBalance" style="${isBalance ? '' : 'display:none;'}">
                <div id="trvBalanceMount" style="height:100%;"></div>
            </div>
        </div>`;
    }

    _initComponents() {
        const user = this.state.getUser();
        this._userBranchId = user?.branch_id ? String(user.branch_id) : null;

        this.filterBar = new POSFilterBar({
            initialQuery: this._query,
            initialCategory: this._category,
            minimal: true,   // transfer view only needs search + category
            onFilter: f => {
                this._query = f.query;
                this._category = f.category;
                this._reloadProducts();
            }
        });
        this.filterBar.render(document.getElementById('trvFilterBarMount'));

        this.productGrid = new LocalProductGrid({
            onSelect: p => this._handleAddToStaging(p),
            onScrollEnd: () => this._loadMoreProducts()
        });
        this.productGrid.render(document.getElementById('trvGridMount'));

        this.stagingPanel = new TransferStagingPanel({
            onTransfer: payload => this._handleTransfer(payload),
            onBranchChange: fromId => this._onSourceBranchChange(fromId)
        });
        this.stagingPanel.render(document.getElementById('trvStagingMount'));

        this.tableComponent = new TransferTable(this);

        this.balancePanel = new BranchBalancePanel({
            onScrollEnd: () => this._loadMoreBalanceProducts(),
            onLoadAll: () => this._loadAllBalanceProducts()
        });
        this.balancePanel.render(document.getElementById('trvBalanceMount'));

        this._attachHistoryEvents();

        // ── Attach Sorting Listener ──────────────────────────────────────────
        document.getElementById('trvStockSort')?.addEventListener('change', (e) => {
            const dir = e.target.value;
            if (dir && this.productGrid.sortByStock) {
                this.productGrid.sortByStock(dir);
            } else if (!dir) {
                // Restore default API sorting if cleared
                this._reloadProducts();
            }
        });
    }

    async _bootstrap() {
        const locations = await this.state.loadLocations() || [];
        const locationMap = {};
        locations.forEach(l => locationMap[l.id] = l.name);

        this.productGrid.setLocationMap(locationMap);
        if (this._userBranchId) this.productGrid.setFocusBranch(this._userBranchId);

        // setBranches renders tspFromBranch into the DOM — must come before
        // _fetchProductsAsync so the correct fromId is readable from the select.
        this.stagingPanel.setBranches(locations, this._userBranchId);
        this.balancePanel.setBranches(locations, this._userBranchId);

        // FIX: restore any items that were staged before this re-render
        if (this._savedStagingItems.length) {
            this.stagingPanel.setItems(this._savedStagingItems);
            this._savedStagingItems = [];
        }

        // FIX: fetch categories WITHOUT awaiting before the product fetch.
        // Previously: await getCategories() → populateCategories → then
        // _fetchProductsAsync. The problem was that any intermediate _syncSession
        // bump (e.g. from _reloadProducts called by a change event) would cause
        // the in-flight session check inside _fetchProductsAsync to silently bail,
        // leaving the grid empty until the user typed something.
        // Solution: fire categories in parallel and load products immediately.
        const catPromise = API.getCategories().then(res => {
            if (res?.status === 'success') this.filterBar.populateCategories(res.data || []);
        });

        // Await products first — this is what the user sees immediately.
        await this._fetchProductsAsync();

        // Categories and branch inventory can resolve after products are visible.
        await catPromise;
        if (this._userBranchId) await this._loadBranchInventory(this._userBranchId);
        await this.loadTransfers();

        if (this.currentTab === 'balance') await this._loadBalanceData(true);
    }

    // Promisified wrapper so _bootstrap can await the initial fetch completion.
    _fetchProductsAsync() {
        return new Promise(resolve => {
            // FIX: do NOT increment _syncSession here — render() already reset it
            // to a fresh value. A double-increment here means any in-flight fetch
            // started by _reloadProducts (e.g. from a filter change event) would
            // invalidate this session check and leave the grid blank.
            this._currentPage = 1;
            this._allLoaded = false;
            const session = this._syncSession;

            this.productGrid.showLoading(false);
            const fromId = document.getElementById('tspFromBranch')?.value || this._userBranchId || '';

            API.getInventory(1, this._query, fromId, 'publish', 'name', 'ASC', this._category)
                .then(res => {
                    if (session !== this._syncSession) return;

                    this.productGrid.update(res?.data || [], false);

                    // Auto-apply local sorting if selected
                    const sortDir = document.getElementById('trvStockSort')?.value;
                    if (sortDir && this.productGrid.sortByStock) {
                        this.productGrid.sortByStock(sortDir);
                    }

                    this._currentPage = 1;
                    if (1 >= (res?.pagination?.pages || 1)) this._allLoaded = true;
                    this._lastProductFilterFrom = fromId;
                })
                .catch(e => {
                    if (session === this._syncSession) this.productGrid.showError(`Error: ${esc(e.message)}`);
                })
                .finally(() => {
                    if (session === this._syncSession) this._loadingPage = false;
                    resolve();
                });
        });
    }

    _reloadProducts() {
        if (this.currentTab === 'balance') {
            this._loadBalanceData(true);
            return;
        }
        this._currentPage = 1;
        this._allLoaded = false;
        this._syncSession++;
        this._fetchProducts(1, false);
    }

    _loadMoreProducts() {
        if (!this._loadingPage && !this._allLoaded) this._fetchProducts(this._currentPage + 1, true);
    }

    async _fetchProducts(page, append) {
        this._loadingPage = true;
        const session = this._syncSession;

        // FIX: was `showLoading(!append)` — completely inverted.
        // First-page load (append=false) needs the full loading overlay.
        // Scroll-triggered loads (append=true) should show the lightweight
        // "Syncing…" badge so existing products stay visible.
        if (append) {
            this.productGrid.setSyncStatus('syncing');
        } else {
            this.productGrid.showLoading(false);
        }

        const fromId = document.getElementById('tspFromBranch')?.value || this._userBranchId || '';

        try {
            const res = await API.getInventory(page, this._query, fromId, 'publish', 'name', 'ASC', this._category);
            if (session !== this._syncSession) return;

            this.productGrid.update(res?.data || [], append);

            // Auto-apply local sorting to the newly merged data if selected
            const sortDir = document.getElementById('trvStockSort')?.value;
            if (sortDir && this.productGrid.sortByStock) {
                this.productGrid.sortByStock(sortDir);
            }

            this._currentPage = page;
            if (page >= (res?.pagination?.pages || 1)) this._allLoaded = true;
            this._lastProductFilterFrom = fromId;

            // Show "N items cached" badge briefly after a scroll-append
            if (append) this.productGrid.setSyncStatus('done', res?.data?.length || 0);
        } catch (e) {
            if (session === this._syncSession) this.productGrid.showError(`Error: ${esc(e.message)}`);
        } finally {
            if (session === this._syncSession) this._loadingPage = false;
        }
    }

    _onSourceBranchChange(fromId) {
        this.productGrid.setFocusBranch(fromId);
        if (fromId !== this._lastProductFilterFrom) this._reloadProducts();
        this._loadBranchInventory(fromId);
    }

    async _loadBranchInventory(branchId) {
        if (!branchId) return;
        const res = await API.getInventory(1, '', branchId, 'publish', 'name', 'ASC', '');
        if (res?.status !== 'success') return;

        const inv = {};
        (res.data || []).forEach(p => {
            if (p.stock_breakdown) {
                p.stock_breakdown.toString().split(',').forEach(pair => {
                    const colonIdx = pair.lastIndexOf(':');
                    if (colonIdx === -1) return;
                    const lid = pair.substring(0, colonIdx).trim();
                    const qty = parseInt(pair.substring(colonIdx + 1).trim() || 0);
                    if (!inv[lid]) inv[lid] = {};
                    inv[lid][p.id] = qty;
                });
            }
        });
        this._branchInventory = inv;
        this.stagingPanel.setBranchInventory(inv);
        this.productGrid.refreshCards();
    }

    _handleAddToStaging(product) {
        const fromId = document.getElementById('tspFromBranch')?.value || this._userBranchId;

        // Use the stock that the grid already knows (most reliable)
        let localQty = parseInt(product.stock_quantity || 0);

        // If we have the map, double-check (extra safety)
        if (fromId && this._branchInventory[fromId]) {
            const mapQty = parseInt(this._branchInventory[fromId][product.id] ?? 0);
            if (mapQty > 0) localQty = mapQty;   // trust map if higher
        }

        const enriched = {...product, stock_quantity: localQty};
        const result = this.stagingPanel.addProduct(enriched);

        if (result === 'nostock') return Toast.error('No local stock in source branch');
        if (result === 'max') return Toast.error('Maximum available quantity already staged');

        this.productGrid.flash(product.id);
    }

    async _handleTransfer({fromBranchId, toBranchId, reason, items}) {
        if (fromBranchId === toBranchId) return Toast.error('Source and destination must differ');
        this.stagingPanel.setLoading(true);
        const res = await API.initiateTransfer(items, fromBranchId, toBranchId, reason);
        this.stagingPanel.setLoading(false);
        if (res.status === 'success') {
            Toast.success('Transfer initiated!');
            this.stagingPanel.clear();
            this.state.invalidateInventoryCache();
            await this._loadBranchInventory(fromBranchId);
            await this.loadTransfers();
        } else Toast.error(res.message || 'Failed');
    }

    // ─── Balance Stock tab ──────────────────────────────────────────────────
    // Own pagination/session state (see constructor) so it never collides with
    // the New Transfer grid's paging while both tabs hold cached data.
    async _loadBalanceData(reset) {
        if (reset) {
            this._balancePage = 1;
            this._balanceAllLoaded = false;
            this._balanceSession++;
            this.balancePanel?.showLoading();
        }
        if (this._balanceLoading || this._balanceAllLoaded) return;
        this._balanceLoading = true;
        const session = this._balanceSession;

        try {
            // No location filter — we need the full stock_breakdown per product,
            // not a single branch's qty.
            const res = await API.getInventory(this._balancePage, this._query, '', 'publish', 'name', 'ASC', this._category);
            if (session !== this._balanceSession) return;

            this.balancePanel?.setProducts(res?.data || [], reset && this._balancePage === 1);
            if (this._balancePage >= (res?.pagination?.pages || 1)) this._balanceAllLoaded = true;
            // Let the panel know if it should hide the "Load All" button
            this.balancePanel?.setAllLoaded(this._balanceAllLoaded);
        } catch (e) {
            if (session === this._balanceSession) Toast.error(`Failed to load stock data: ${e.message}`);
        } finally {
            if (session === this._balanceSession) this._balanceLoading = false;
        }
    }

    _loadMoreBalanceProducts() {
        if (this._balanceLoading || this._balanceAllLoaded) return;
        this._balancePage++;
        this._loadBalanceData(false);
    }

    async _loadAllBalanceProducts() {
        if (this._balanceLoading || this._balanceAllLoaded) return;
        
        const session = this._balanceSession;
        this._balanceLoading = true;
        let accumulatedData = []; // Store pages to render them all at once (better performance)
        
        try {
            while (!this._balanceAllLoaded && session === this._balanceSession) {
                this._balancePage++;
                const res = await API.getInventory(this._balancePage, this._query, '', 'publish', 'name', 'ASC', this._category);
                
                if (session !== this._balanceSession) return; // User changed filters or left tab
                
                accumulatedData = accumulatedData.concat(res?.data || []);
                
                if (this._balancePage >= (res?.pagination?.pages || 1)) {
                    this._balanceAllLoaded = true;
                }
            }
            
            if (session === this._balanceSession) {
                if (accumulatedData.length > 0) {
                    this.balancePanel?.setProducts(accumulatedData, false);
                }
                this.balancePanel?.setAllLoaded(true); // Hides the button
                Toast.success('Entire catalog loaded into memory!');
            }
        } catch (e) {
            if (session === this._balanceSession) {
                Toast.error(`Failed to load full catalog: ${e.message}`);
                this.balancePanel?._renderControls(); // Reset button UI if it failed
            }
        } finally {
            if (session === this._balanceSession) this._balanceLoading = false;
        }
    }

    async loadTransfers() {
        const tbody = document.getElementById('transfersTableBody');
        // FIX: was `<svg ...>` (literal "...") — not valid markup; replaced with full spinner SVG.
        tbody.innerHTML = `<div class="trv-empty-row">
            <svg class="lpg-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/>
            </svg>
            Loading\u2026
        </div>`;

        let type = 'all', dir = 'all';
        if (this.currentTab === 'pending_incoming') {
            type = 'pending';
            dir = 'incoming';
        } else if (this.currentTab === 'pending_outgoing') {
            type = 'pending';
            dir = 'outgoing';
        } else if (this.currentTab === 'history') {
            type = 'history';
        }

        const res = await API.getTransfers(type, dir, this.filters.page, this.filters.search, '', this.filters.start, this.filters.end, '');
        if (res.status === 'success') {
            let transfers = res.data || [];

            // FIX: enforce directional filtering client-side so a user never sees
            // their own outgoing transfer in Incoming (or vice versa), regardless
            // of what the server returns.  Admins have no branch and skip the filter.
            if (this._userBranchId) {
                if (this.currentTab === 'pending_incoming') {
                    // Only transfers arriving AT the user's branch
                    transfers = transfers.filter(t => String(t.to_loc_id) === this._userBranchId);
                } else if (this.currentTab === 'pending_outgoing') {
                    // Only transfers sent FROM the user's branch
                    transfers = transfers.filter(t => String(t.from_loc_id) === this._userBranchId);
                }
            }

            this.tableComponent.render(transfers);
            this._renderPagination(res.pagination || {total: 0, page: 1, pages: 1});
        } else {
            tbody.innerHTML = `<div class="trv-empty-row" style="color:var(--error-500);">${esc(res.message)}</div>`;
        }
    }

    _renderPagination(pag) {
        const el = document.getElementById('paginationControls');
        if (!el || pag.pages <= 1) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `
            <button class="trv-pg-btn" id="trvPrev" ${pag.page === 1 ? 'disabled' : ''}>← Prev</button>
            <span>Page ${pag.page} of ${pag.pages}</span>
            <button class="trv-pg-btn" id="trvNext" ${pag.page === pag.pages ? 'disabled' : ''}>Next →</button>`;
        el.querySelector('#trvPrev').onclick = () => {
            if (this.filters.page > 1) {
                this.filters.page--;
                this.loadTransfers();
            }
        };
        el.querySelector('#trvNext').onclick = () => {
            if (this.filters.page < pag.pages) {
                this.filters.page++;
                this.loadTransfers();
            }
        };
    }

    _attachHistoryEvents() {
        document.querySelectorAll('.trv-nav-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.trv-nav-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.filters.page = 1;
                this.saveState();

                const isNew = this.currentTab === 'new_transfer';
                const isBalance = this.currentTab === 'balance';
                const isTable = !isNew && !isBalance;
                document.getElementById('trvPanelNew').style.display = isNew ? '' : 'none';
                document.getElementById('trvPanelTable').style.display = isTable ? '' : 'none';
                document.getElementById('trvPanelBalance').style.display = isBalance ? '' : 'none';

                if (isNew) this._reloadProducts();
                else if (isBalance) this._loadBalanceData(true);
                else this.loadTransfers();
            });
        });

        const apply = () => {
            this.filters.search = document.getElementById('trvSearch').value.trim();
            this.filters.start = document.getElementById('trvDateStart').value;
            this.filters.end = document.getElementById('trvDateEnd').value;
            this.filters.page = 1;
            this.loadTransfers();
        };
        document.getElementById('trvSearch').addEventListener('input', apply);
        document.getElementById('trvDateStart').addEventListener('change', apply);
        document.getElementById('trvDateEnd').addEventListener('change', apply);
        document.getElementById('trvRefreshBtn').addEventListener('click', () => this.loadTransfers());
        document.getElementById('trvExportBtn').addEventListener('click', () => {
            let type = 'all', dir = 'all';
            if (this.currentTab === 'pending_incoming') {
                type = 'pending';
                dir = 'incoming';
            } else if (this.currentTab === 'pending_outgoing') {
                type = 'pending';
                dir = 'outgoing';
            } else if (this.currentTab === 'history') type = 'history';
            API.exportTransfersCsv(type, dir, this.filters.search, this.filters.start, this.filters.end);
        });
    }

    saveState() {
        this.state.saveTabState('transfers', {currentTab: this.currentTab, filters: this.filters});
    }

    _initResizer() {
        const divider = document.getElementById('trvDivider');
        const right = document.getElementById('trvRight');
        const split = document.getElementById('trvSplit');
        if (!divider || !right || !split) return;

        // FIX: default to 50% so the staging queue gets enough room; CSS max-width raised to 700px.
        const splitW = split.getBoundingClientRect().width;
        const halfW = Math.max(360, Math.min(700, Math.round(splitW * 0.50)));
        right.style.flex = `0 0 ${halfW}px`;

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
            const newW = Math.max(360, Math.min(700, startW + delta));
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