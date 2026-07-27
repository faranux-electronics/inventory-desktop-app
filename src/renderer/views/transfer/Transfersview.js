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
        this._currentMode = 'request';

        this._branchInventory = {};
        this._userBranchId = null;

        this.currentTab = 'new_transfer';
        this.filters = { search: '', start: '', end: '', page: 1, recordType: 'all', discrepancyFilter: 'all' };

        this.filterBar = null;
        this.productGrid = null;
        this.stagingPanel = null;
        this.tableComponent = null;
        this.balancePanel = null;

        this._balancePage = 1;
        this._balanceAllLoaded = false;
        this._balanceLoading = false;
        this._balanceSession = 0;

        this._resizerAbort = null;
        this._savedStagingItems = [];

        const saved = this.state.getTabState('transfers');
        if (saved) {
            this.currentTab = saved.currentTab || 'new_transfer';
            this.filters = { ...this.filters, ...(saved.filters || {}) };
        }
    }

    destroy() {
        this._resizerAbort?.abort();
        this._resizerAbort = null;
    }

    render() {
        this._savedStagingItems = this.stagingPanel?.getItems() || [];
        this.destroy();

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
            // It's controlled by role-based permissions only (admin/manager)
            canViewBalance = ['admin', 'manager'].includes(role);
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
                    <select id="trvTypeFilter" class="trv-filter-input" style="max-width:130px;" title="Filter by record type">
                        <option value="all" ${this.filters.recordType === 'all' ? 'selected' : ''}>All</option>
                        <option value="transfer" ${this.filters.recordType === 'transfer' ? 'selected' : ''}>Transfers only</option>
                        <option value="request" ${this.filters.recordType === 'request' ? 'selected' : ''}>Requests only</option>
                    </select>
                    <select id="trvDiscrepancyFilter" class="trv-filter-input" style="max-width:130px;" title="Filter by discrepancy">
                        <option value="all" ${this.filters.discrepancyFilter === 'all' ? 'selected' : ''}>All Status</option>
                        <option value="any" ${this.filters.discrepancyFilter === 'any' ? 'selected' : ''}>Any Discrepancy</option>
                        <option value="surplus" ${this.filters.discrepancyFilter === 'surplus' ? 'selected' : ''}>Surplus Only</option>
                        <option value="shortage" ${this.filters.discrepancyFilter === 'shortage' ? 'selected' : ''}>Shortage Only</option>
                    </select>
                    <div class="trv-toolbar-spacer"></div>
                    <button class="trv-btn" id="trvRefreshBtn">Refresh</button>
                    <button class="trv-btn trv-btn-ghost" id="trvExportBtn">Export</button>
                </div>
                <div id="trvSurplusBanner" class="trv-surplus-banner" style="display:none; padding: 0 0 0 12px; margin: 10px 20px 0 20px; align-items: stretch; justify-content: space-between; border-radius: 6px; overflow: hidden;">
                    <div style="display: flex; align-items: center; gap: 6px; padding: 6px 0;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span style="font-size: 13px;"><strong id="trvSurplusBannerCount">0</strong> transfers with discrepancies detected.</span>
                    </div>
                    <button class="trv-btn trv-btn-primary" id="trvCheckDiscrepanciesBtn" style="white-space: nowrap; padding: 6px 16px; font-size: 12px; border-radius: 0; border: none; height: auto; display: flex; align-items: center; justify-content: center; margin: 0;">Check Discrepancies</button>
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
            onRequest: payload => this._handleRequest(payload),
            onFulfillRequest: payload => this._handleFulfillRequest(payload),
            onBranchChange: (fromId, mode) => this._onSourceBranchChange(fromId, mode)
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
        locations.forEach(l => {
            // Store both string and numeric keys to handle type mismatches
            locationMap[l.id] = l.name;
            locationMap[String(l.id)] = l.name;
            locationMap[Number(l.id)] = l.name;
        });

        this.productGrid.setLocationMap(locationMap);
        if (this._userBranchId) this.productGrid.setFocusBranch(this._userBranchId);

        this.stagingPanel.setBranches(locations, this._userBranchId);
        this.balancePanel.setBranches(locations, this._userBranchId);

        if (this._savedStagingItems.length) {
            this.stagingPanel.setItems(this._savedStagingItems);
            this._savedStagingItems = [];
        }

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
            this._currentPage = 1;
            this._allLoaded = false;
            const session = this._syncSession;

            this.productGrid.showLoading(false);
            const fromId = this._getProductQueryBranchId();

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

        if (append) {
            this.productGrid.setSyncStatus('syncing');
        } else {
            this.productGrid.showLoading(false);
        }

        const fromId = this._getProductQueryBranchId();

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

    _onSourceBranchChange(fromId, mode = 'send') {
        this._currentMode = mode;
        this._loadBranchInventory(fromId);

        if (mode !== 'request') {
            if (!fromId) {
                this.productGrid.clearFocusBranch();
                return;
            }
            this.productGrid.setFocusBranch(fromId);
            if (fromId !== this._lastProductFilterFrom) this._reloadProducts();
        }
    }

    _getProductQueryBranchId() {
        if (this._currentMode === 'request') {
            return this._userBranchId || '';
        }
        return document.getElementById('tspFromBranch')?.value || this._userBranchId || '';
    }

    async _loadBranchInventory(branchId) {
        if (!branchId) return;

        this._loadingInventoryFor = branchId;

        const res = await API.getBranchStockDictionary(branchId);

        if (this._loadingInventoryFor === branchId) this._loadingInventoryFor = null;

        if (res?.status !== 'success' || !res.data) return;

        const branchDict = {};
        Object.entries(res.data).forEach(([productId, qty]) => {
            branchDict[productId] = parseInt(qty || 0);
        });

        // Merge in (don't replace) so previously-loaded branches stay cached.
        this._branchInventory = { ...this._branchInventory, [branchId]: branchDict };
        this.stagingPanel.setBranchInventory(this._branchInventory);
        this.productGrid.refreshCards();
    }

    /**
     * Pull a specific branch's qty out of a product's `stock_breakdown` string
     * (e.g. "3:78,5:0"). This is per-product data returned on every product
     * regardless of which page it was loaded on, so — unlike `_branchInventory`
     * (built from a single page-1 fetch) — it's never stale due to pagination.
     */
    _getBreakdownQty(product, branchId) {
        if (!product?.stock_breakdown || !branchId) return null;
        let found = null;
        product.stock_breakdown.toString().split(',').some(pair => {
            const colonIdx = pair.lastIndexOf(':');
            if (colonIdx === -1) return false;
            const lid = pair.substring(0, colonIdx).trim();
            if (String(lid) === String(branchId)) {
                found = parseInt(pair.substring(colonIdx + 1).trim() || 0) || 0;
                return true;
            }
            return false;
        });
        return found;
    }

    _handleAddToStaging(product) {
        const fromId = document.getElementById('tspFromBranch')?.value || this._userBranchId;
        const isRequestMode = this.stagingPanel?._mode === 'request';

        if (fromId && this._loadingInventoryFor === fromId && this._branchInventory[fromId] === undefined) {
            return Toast.error('Still loading that branch\'s stock — try again in a moment');
        }

        let sourceQty = null;

        if (fromId && this._branchInventory[fromId]?.[product.id] !== undefined) {
            sourceQty = parseInt(this._branchInventory[fromId][product.id]) || 0;
        }
        if (sourceQty === null) {
            sourceQty = this._getBreakdownQty(product, fromId);
        }
        if (sourceQty === null) {
            sourceQty = isRequestMode ? 0 : parseInt(product.stock_quantity || 0);
        }

        const enriched = { ...product, stock_quantity: sourceQty };
        const result = this.stagingPanel.addProduct(enriched);

        if (result === 'nostock') return Toast.error(isRequestMode ? 'That branch has no stock of this item' : 'No local stock in source branch');
        if (result === 'max') return Toast.error('Maximum available quantity already staged');

        this.productGrid.flash(product.id);
    }

    async _handleTransfer({ fromBranchId, toBranchId, reason, items }) {
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

    async _handleRequest({ fromBranchId, toBranchId, reason, items }) {
        if (fromBranchId === toBranchId) return Toast.error('Source and destination must differ');
        this.stagingPanel.setLoading(true);
        const res = await API.requestTransfer(items, fromBranchId, toBranchId, reason);
        this.stagingPanel.setLoading(false);
        if (res.status === 'success') {
            Toast.success('Request sent!');
            this.stagingPanel.clear();
            await this.loadTransfers();
        } else Toast.error(res.message || 'Failed');
    }

    async _handleFulfillRequest({ requestBatchId, itemsData, note }) {
        this.stagingPanel.setLoading(true);
        const res = await API.respondTransferRequest(requestBatchId, 'fulfill', itemsData, note);
        this.stagingPanel.setLoading(false);
        if (res.status === 'success') {
            Toast.success(res.message || 'Request fulfilled!');
            this.stagingPanel.clearFulfillContext();
            this.state.invalidateInventoryCache();
            this.currentTab = 'pending_outgoing';
            this.saveState();
            document.getElementById('trvPanelNew').style.display = 'none';
            document.getElementById('trvPanelTable').style.display = '';
            document.querySelectorAll('.trv-nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this.currentTab));
            await this.loadTransfers();
        } else Toast.error(res.message || 'Failed');
    }

    /** Entry point for "Fulfill" clicked on a pending incoming request row. */
    async startFulfillFromRequest(requestBatchId) {
        const res = await API.getTransferRequestDetails(requestBatchId);
        if (res.status !== 'success') return Toast.error(res.message);
        const data = res.data;

        // Switch to the New Transfer tab
        this.currentTab = 'new_transfer';
        this.saveState();
        document.querySelectorAll('.trv-nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'new_transfer'));
        document.getElementById('trvPanelNew').style.display = '';
        document.getElementById('trvPanelTable').style.display = 'none';
        document.getElementById('trvPanelBalance').style.display = 'none';

        // Ensure we have current stock at my branch to cap quantities against
        if (this._userBranchId) await this._loadBranchInventory(this._userBranchId);

        const items = (data.items || [])
            .filter(i => i.status === 'pending')
            .map(i => {
                // We rely on i.current_stock returned directly by get_transfer_request_details.
                // This guarantees accurate live stock regardless of pagination.
                const localStock = parseInt(i.current_stock) || 0;
                return {
                    product_id: i.product_id,
                    request_line_id: i.id,
                    name: i.product_name,
                    sku: i.product_sku,
                    imageUrl: i.product_image || '',
                    qty: Math.min(parseInt(i.requested_qty) || 0, localStock),
                    maxStock: localStock,
                };
            });

        this.stagingPanel.setFulfillContext(requestBatchId, data.items[0]?.to_loc_id, data.to_location, items);

        const zeroStock = items.filter(i => i.maxStock <= 0);
        if (zeroStock.length) {
            Toast.error(`${zeroStock.length} item(s) have no stock at your branch — adjust or remove before sending`);
        }
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

        const recordType = this.filters.recordType || 'all';
        const wantTransfers = recordType !== 'request';
        const wantRequests = recordType !== 'transfer';

        const [res, reqRes] = await Promise.all([
            wantTransfers
                ? API.getTransfers(type, dir, this.filters.page, this.filters.search, '', this.filters.start, this.filters.end, '')
                : Promise.resolve({ status: 'success', data: [], pagination: { total: 0, page: 1, pages: 1 } }),
            (wantRequests && this.filters.page === 1)
                ? API.getTransferRequests(type, dir, 1, this.filters.search, '', this.filters.start, this.filters.end)
                : Promise.resolve({ status: 'success', data: [] })
        ]);

        if (res.status === 'success') {
            let transfers = wantTransfers ? (res.data || []) : [];
            let requests = wantRequests ? (reqRes.status === 'success' ? reqRes.data : []).map(r => ({ ...r, is_request: true })) : [];

            if (this._userBranchId) {
                if (this.currentTab === 'pending_incoming') {
                    // Only transfers arriving AT the user's branch
                    transfers = transfers.filter(t => String(t.to_loc_id) === this._userBranchId);
                    // Requests I made (I am asking for stock to come IN to my branch)
                    requests = requests.filter(r => String(r.to_loc_id) === this._userBranchId);
                } else if (this.currentTab === 'pending_outgoing') {
                    // Only transfers sent FROM the user's branch
                    transfers = transfers.filter(t => String(t.from_loc_id) === this._userBranchId);
                    // Requests asking ME to send (I am expected to send stock OUT of my branch)
                    requests = requests.filter(r => String(r.from_loc_id) === this._userBranchId);
                }
            }

            let merged = [...requests, ...transfers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const discrepancyCount = merged.filter(t => {
                if (t.is_request) return false;
                if (t.status !== 'completed' && t.status !== 'rejected') return false;
                if (parseInt(t.discrepancy_resolved) === 1) return false;
                const surplus = parseInt(t.total_surplus_qty) || 0;
                const diff = (parseInt(t.total_received_qty) || 0) - (parseInt(t.total_qty) || 0);
                const shortage = diff < 0 ? Math.abs(diff) : 0;
                return surplus > 0 || shortage > 0;
            }).length;

            const banner = document.getElementById('trvSurplusBanner');
            const countEl = document.getElementById('trvSurplusBannerCount');
            if (banner && countEl) {
                countEl.textContent = discrepancyCount;
                banner.style.display = discrepancyCount > 0 ? 'flex' : 'none';

                // Clone to replace listeners
                const newBanner = banner.cloneNode(true);
                banner.parentNode.replaceChild(newBanner, banner);
                
                const btn = newBanner.querySelector('#trvCheckDiscrepanciesBtn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sel = document.getElementById('trvDiscrepancyFilter');
                        if (sel) {
                            sel.value = 'any';
                            sel.dispatchEvent(new Event('change'));
                        }
                    });
                }
            }

            if (this.filters.discrepancyFilter === 'surplus') {
                merged = merged.filter(t => !t.is_request && (t.status === 'completed' || t.status === 'rejected') && parseInt(t.total_surplus_qty) > 0);
            } else if (this.filters.discrepancyFilter === 'shortage') {
                merged = merged.filter(t => !t.is_request && (t.status === 'completed' || t.status === 'rejected') && parseInt(t.total_received_qty) < parseInt(t.total_qty));
            } else if (this.filters.discrepancyFilter === 'any') {
                merged = merged.filter(t => {
                    if (t.is_request) return false;
                    if (t.status !== 'completed' && t.status !== 'rejected') return false;
                    const surplus = parseInt(t.total_surplus_qty) || 0;
                    const diff = (parseInt(t.total_received_qty) || 0) - (parseInt(t.total_qty) || 0);
                    return surplus > 0 || diff < 0;
                });
            }

            this.tableComponent.render(merged);

            const paginationSource = recordType === 'request'
                ? (reqRes.pagination || { total: requests.length, page: 1, pages: 1 })
                : (res.pagination || { total: 0, page: 1, pages: 1 });
            this._renderPagination(paginationSource);
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
            this.filters.recordType = document.getElementById('trvTypeFilter')?.value || 'all';
            this.filters.discrepancyFilter = document.getElementById('trvDiscrepancyFilter')?.value || 'all';
            this.filters.page = 1;
            this.saveState();
            this._syncExportAvailability();
            this.loadTransfers();
        };
        document.getElementById('trvSearch').addEventListener('input', apply);
        document.getElementById('trvDateStart').addEventListener('change', apply);
        document.getElementById('trvDateEnd').addEventListener('change', apply);
        document.getElementById('trvTypeFilter')?.addEventListener('change', apply);
        document.getElementById('trvDiscrepancyFilter')?.addEventListener('change', apply);
        this._syncExportAvailability();
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

    _syncExportAvailability() {
        const btn = document.getElementById('trvExportBtn');
        if (!btn) return;
        const isRequestsOnly = (this.filters.recordType || 'all') === 'request';
        btn.disabled = isRequestsOnly;
        btn.title = isRequestsOnly ? 'CSV export isn\'t available for requests yet — switch to "All" or "Transfers only"' : '';
    }

    saveState() {
        this.state.saveTabState('transfers', { currentTab: this.currentTab, filters: this.filters });
    }

    _initResizer() {
        const divider = document.getElementById('trvDivider');
        const right = document.getElementById('trvRight');
        const split = document.getElementById('trvSplit');
        if (!divider || !right || !split) return;

        const splitW = split.getBoundingClientRect().width;
        const halfW = Math.max(360, Math.min(700, Math.round(splitW * 0.50)));
        right.style.flex = `0 0 ${halfW}px`;

        let dragging = false, startX, startW;

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
        }, { signal });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            divider.classList.remove('trv-divider--active');
        }, { signal });
    }
}

module.exports = TransfersView;