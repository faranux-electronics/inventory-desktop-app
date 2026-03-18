const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const POSFilterBar = require('./components/POSFilterBar.js');
const POSProductGrid = require('./components/POSProductGrid.js');
const POSCart = require('./components/POSCart.js');
const POSPaymentPanel = require('./components/POSPaymentPanel.js');
const POSConfirmModal = require('./components/POSConfirmModal.js');
const POSReceipt = require('./components/POSReceipt.js');

const DEFAULT_LEFT_PCT = 0;
const MIN_LEFT_PX = 340;
const MIN_RIGHT_PX = 320;
const ITEMS_PER_PAGE = 80;
const MAX_CARTS = 6;

class POSView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        // Product filters
        this._query = '';
        this._category = '';
        this._stockFilter = 'all';   // all | instock | lowstock | outofstock
        this._onSale = false;
        this._featured = false;
        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;

        // Multi-cart state
        this._carts = [];   // Array of { id, name, cart, snapshot }
        this._activeCartIdx = 0;

        this.filterBar = null;
        this.productGrid = null;
        this.paymentPanel = null;
        this.confirmModal = null;
        this.receipt = null;

        // WC payment gateways cache
        this._gatewaysCache = null;
        this._taxRatesCache = null;

        // Branch data for source selection
        this._branches = [];
        this._branchInventory = {};

        // Restore persisted view state
        this._loadViewState();
    }

    // ─── State persistence ─────────────────────────────────────────────────────

    _loadViewState() {
        try {
            const saved = this.state.getTabState?.('pos');
            if (saved) {
                this._query = saved.query || '';
                this._category = saved.category || '';
                this._stockFilter = saved.stockFilter || 'all';
                this._onSale = saved.onSale || false;
                this._featured = saved.featured || false;
                if (saved.carts && saved.carts.length) {
                    // Snapshots only — carts will be rebuilt on render
                    this._restoredCartSnapshots = saved.carts;
                    this._restoredActiveIdx = saved.activeIdx || 0;
                }
            }
        } catch (e) {
        }
    }

    _saveViewState() {
        const cartSnaps = this._carts.map(c => ({
            id: c.id,
            name: c.name,
            items: c.cart.getItems()
        }));
        this.state.saveTabState?.('pos', {
            query: this._query,
            category: this._category,
            stockFilter: this._stockFilter,
            onSale: this._onSale,
            featured: this._featured,
            carts: cartSnaps,
            activeIdx: this._activeCartIdx
        });
    }

    // ─── Render ────────────────────────────────────────────────────────────────

    render() {
        const content = document.getElementById('content');
        content.innerHTML = this._layoutHTML();
        this._initComponents();
        this._initResizer();
        this._bootstrap();
    }

    _layoutHTML() {
        return `
        <div class="pos-root" id="posRoot">
            <!-- LEFT: product browser -->
            <div class="pos-left" id="posLeft" style="flex-basis:${DEFAULT_LEFT_PCT}%;">
                <div id="posFilterBarMount" class="pos-left-header"></div>
                <div id="posGridMount" class="pos-left-body"></div>
            </div>

            <div class="pos-divider" id="posDivider" title="Drag to resize">
                <div class="pos-divider-grip"><span></span><span></span><span></span></div>
            </div>

            <!-- RIGHT: carts + payment -->
            <aside class="pos-right" id="posRight">
                <!-- Cart tabs row -->
                <div class="pos-cart-tabs" id="posCartTabs">
                    <div class="pos-tab-list" id="posTabList"></div>
                    <button class="pos-tab-add" id="posTabAdd" title="New cart (max ${MAX_CARTS})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
                    </button>
                </div>

                <!-- Active cart area -->
                <div id="posCartMount" class="pos-right-cart"></div>

                <!-- Payment panel -->
                <div id="posPaymentMount" class="pos-right-payment"></div>
            </aside>
        </div>`;
    }

    // ─── Component init ────────────────────────────────────────────────────────

    _initComponents() {
        // Filter bar (replaces old search bar)
        this.filterBar = new POSFilterBar({
            initialQuery: this._query,
            initialCategory: this._category,
            initialStockFilter: this._stockFilter,
            initialOnSale: this._onSale,
            initialFeatured: this._featured,
            onFilter: (f) => {
                this._query = f.query;
                this._category = f.category;
                this._stockFilter = f.stockFilter;
                this._onSale = f.onSale;
                this._featured = f.featured;
                this._reloadProducts();
                this._saveViewState();
            }
        });
        this.filterBar.render(document.getElementById('posFilterBarMount'));

        // Product grid
        this.productGrid = new POSProductGrid({
            onAddToCart: product => this._handleAddToCart(product),
            onScrollEnd: () => this._loadMoreProducts()
        });
        this.productGrid.render(document.getElementById('posGridMount'));

        // Payment panel (shared across carts)
        this.paymentPanel = new POSPaymentPanel({
            onRequestCheckout: params => this._handleRequestCheckout(params),
            onTaxModeChange: mode => {
                const cart = this._activeCart;
                if (cart) cart.setTaxMode(mode);
            }
        });
        this.paymentPanel.render(document.getElementById('posPaymentMount'));

        // Modals
        this.confirmModal = new POSConfirmModal({
            onConfirm: data => this._handleConfirmedCheckout(data),
            onCancel: () => {
            }
        });
        this.receipt = new POSReceipt({
            onNewSale: () => this._startNewSale()
        });

        // Multi-cart tabs
        this._initCartTabs();

        // Tab add button
        document.getElementById('posTabAdd').addEventListener('click', () => this._addCart());
    }

    // ─── Multi-cart logic ──────────────────────────────────────────────────────

    _initCartTabs() {
        // FIX: If the view is re-rendering and carts already exist in memory,
        // just re-attach them to the DOM instead of duplicating them.
        if (this._carts && this._carts.length > 0) {
            this._renderTabs();
            this._activateCart(this._activeCartIdx);
            return;
        }

        const snapshots = this._restoredCartSnapshots;
        if (snapshots && snapshots.length) {
            snapshots.forEach(snap => {
                const c = this._createCartEntry(snap.name, snap.id);
                snap.items.forEach(item => c.cart.restoreItem(item));
                this._carts.push(c);
            });
            this._activeCartIdx = Math.min(this._restoredActiveIdx, this._carts.length - 1);
        } else {
            this._carts.push(this._createCartEntry('Sale 1'));
            this._activeCartIdx = 0;
        }

        // Clear the snapshot reference so it doesn't cause stale restorations later
        this._restoredCartSnapshots = null;

        this._renderTabs();
        this._activateCart(this._activeCartIdx);
    }

    _createCartEntry(name, id = null) {
        const cartId = id || ('cart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
        const cart = new POSCart({
            onChange: items => {
                this._onCartChange(items);
                this._saveViewState();
            }
        });
        // Set branch info if available
        if (this._branches && this._branches.length) {
            const user = this.state.getUser();
            cart.setBranches(this._branches, user?.branch_id);
            if (this._branchInventory && Object.keys(this._branchInventory).length > 0) {
                cart.setBranchInventory(this._branchInventory);
            }
        }
        return {id: cartId, name, cart};
    }

    _addCart() {
        if (this._carts.length >= MAX_CARTS) {
            Toast.info(`Maximum ${MAX_CARTS} carts open at once`);
            return;
        }
        const name = `Sale ${this._carts.length + 1}`;
        this._carts.push(this._createCartEntry(name));
        this._activeCartIdx = this._carts.length - 1;
        this._renderTabs();
        this._activateCart(this._activeCartIdx);
        this._saveViewState();
    }

    _removeCart(idx) {
        if (this._carts.length === 1) {
            this._carts[0].cart.clear();
            this._carts[0].name = 'Sale 1';
            this._renderTabs();
            this._activateCart(0);
            return;
        }
        this._carts.splice(idx, 1);
        this._activeCartIdx = Math.min(this._activeCartIdx, this._carts.length - 1);
        this._renderTabs();
        this._activateCart(this._activeCartIdx);
        this._saveViewState();
    }

    _renderTabs() {
        const list = document.getElementById('posTabList');
        if (!list) return;
        list.innerHTML = this._carts.map((c, i) => {
            const count = c.cart.getItemCount();
            const isActive = i === this._activeCartIdx;
            return `
            <div class="pos-tab ${isActive ? 'pos-tab--active' : ''}" data-idx="${i}">
                <span class="pos-tab-name">${c.name}</span>
                ${count > 0 ? `<span class="pos-tab-badge">${count}</span>` : ''}
                <button class="pos-tab-close" data-idx="${i}" title="Close">×</button>
            </div>`;
        }).join('');

        list.querySelectorAll('.pos-tab').forEach(tab => {
            tab.addEventListener('click', e => {
                if (e.target.closest('.pos-tab-close')) return;
                this._activeCartIdx = +tab.dataset.idx;
                this._renderTabs();
                this._activateCart(this._activeCartIdx);
                this._saveViewState();
            });
        });

        list.querySelectorAll('.pos-tab-close').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const idx = +btn.dataset.idx;
                if (!this._carts[idx].cart.isEmpty()) {
                    if (!confirm(`Clear "${this._carts[idx].name}" and close this cart?`)) return;
                }
                this._removeCart(idx);
            });
        });

        // Update add button state
        const addBtn = document.getElementById('posTabAdd');
        if (addBtn) addBtn.disabled = this._carts.length >= MAX_CARTS;
    }

    _activateCart(idx) {
        const entry = this._carts[idx];
        if (!entry) return;
        const mount = document.getElementById('posCartMount');
        if (!mount) return;
        mount.innerHTML = '';
        entry.cart.render(mount);
        this.paymentPanel.updateTotals(entry.cart.getSubtotal(), entry.cart.isEmpty());
        this._updateCartBadge(entry.cart.getItemCount());
    }

    get _activeCart() {
        return this._carts[this._activeCartIdx]?.cart;
    }

    // ─── Product loading ───────────────────────────────────────────────────────

    async _bootstrap() {
        this._showBootSpinner();

        // Run meta (categories, gateways, tax), branches, and first product page IN PARALLEL.
        await Promise.all([
            this._loadMeta(),
            this._loadBranches(),
            this._loadProducts(1, false)
        ]);

        // After first paint, silently warm the offline catalog in the background
        // so that future searches are instant even without a network connection.
        this._warmCatalogInBackground();
    }

    _showBootSpinner() {
        const left = document.getElementById('posLeft');
        if (!left || document.getElementById('posBootSpinner')) return;
        left.style.position = 'relative';

        const el = document.createElement('div');
        el.id = 'posBootSpinner';
        el.style.cssText = [
            'position:absolute', 'inset:0', 'z-index:50',
            'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
            'background:rgba(255,255,255,0.93)', 'backdrop-filter:blur(2px)',
            'gap:14px', 'transition:opacity 0.3s ease', 'pointer-events:none'
        ].join(';');
        el.innerHTML = `
            <svg viewBox="0 0 50 50" width="40" height="40" style="animation:pos-spin 0.9s linear infinite;">
                <circle cx="25" cy="25" r="20" fill="none" stroke="#2689C4" stroke-width="4"
                    stroke-dasharray="90 35" stroke-linecap="round"/>
            </svg>
            <span style="font-size:13px;color:#4b5563;font-weight:500;letter-spacing:0.01em;">
                Preparing catalog…
            </span>`;

        // Inject the keyframe once if not already present
        if (!document.getElementById('posSpinStyle')) {
            const style = document.createElement('style');
            style.id = 'posSpinStyle';
            style.textContent = '@keyframes pos-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }

        left.appendChild(el);
    }

    _hideBootSpinner() {
        const el = document.getElementById('posBootSpinner');
        if (!el) return;
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 320);
    }

    /**
     * Silently walks all catalog pages via syncBatch and indexes every product
     * into the offline catalog so instant local search works on future visits.
     * Runs at low priority — waits 1.5s before starting to not compete with
     * the initial product render, then paginates with a small inter-page delay.
     */
    async _warmCatalogInBackground() {
        if (this._catalogWarming) return;

        const existing = this.state.getCatalogCount?.() || 0;
        // Catalog already looks healthy — skip the full re-crawl
        if (existing >= 200) return;

        this._catalogWarming = true;
        // Let the UI settle before hitting the server
        await new Promise(r => setTimeout(r, 1500));

        const perPage = 100;
        let page = 1;

        try {
            while (true) {
                const res = await API.syncBatch(page, perPage);
                if (res.status !== 'success' || !res.data?.length) break;

                this.state.syncCatalog(res.data);
                const total = this.state.getCatalogCount?.() || 0;
                this.productGrid.setSyncStatus('syncing');

                // Use server's hasMore flag — don't guess from data length
                if (!res.hasMore) {
                    this.productGrid.setSyncStatus('done', total);
                    break;
                }
                page++;
                // Gentle pacing — don't hammer the server
                await new Promise(r => setTimeout(r, 400));
            }
        } catch (e) {
            console.warn('POS: background catalog warm failed', e);
        } finally {
            this._catalogWarming = false;
        }
    }

    async _loadMeta() {
        // Load categories, payment gateways, tax rates in parallel
        try {
            const [catRes, gwRes, taxRes] = await Promise.all([
                API.wcGetCategories().catch(() => null),
                API.getWCPaymentGateways?.().catch(() => null),
                API.getWCTaxRates?.().catch(() => null)
            ]);

            if (catRes?.status === 'success') {
                this.filterBar.populateCategories(catRes.data || []);
            }
            if (gwRes?.status === 'success') {
                this._gatewaysCache = gwRes.data;
                this.paymentPanel.setPaymentMethods(gwRes.data);
            }
            if (taxRes?.status === 'success') {
                this._taxRatesCache = taxRes.data;
                this.paymentPanel.setTaxRates(taxRes.data);
            }
        } catch (e) {
            console.warn('POS: meta load partial fail', e);
        }
    }

    async _loadBranches() {
        try {
            this._branches = await this.state.loadLocations(false);
            if (this._branches && this._branches.length > 0) {
                // Load branch inventory per branch
                await this._loadBranchInventory();

                // Update all existing carts with branch info
                this._carts.forEach(c => {
                    const user = this.state.getUser();
                    c.cart.setBranches(this._branches, user?.branch_id);
                    if (this._branchInventory && Object.keys(this._branchInventory).length > 0) {
                        c.cart.setBranchInventory(this._branchInventory);
                    }
                });
            }
        } catch (e) {
            console.warn('POS: branch load failed', e);
            this._branches = [];
        }
    }

    async _loadBranchInventory() {
        try {
            // Format: { branch_id: { product_id: qty, ... } }
            this._branchInventory = {};

            // For each branch, load its inventory
            for (const branch of this._branches) {
                try {
                    const res = await API.getBranchInventory(branch.id);
                    if (res?.status === 'success' && res.data) {
                        // Convert array of {id, qty} to map
                        this._branchInventory[branch.id] = res.data.reduce((acc, item) => {
                            acc[item.id] = parseInt(item.qty || 0);
                            return acc;
                        }, {});
                    }
                } catch (e) {
                    console.warn(`Failed to load inventory for branch ${branch.id}`, e);
                }
            }
        } catch (e) {
            console.warn('POS: branch inventory load failed', e);
            this._branchInventory = {};
        }
    }

    _buildCacheKey(page) {
        return `pos_${page}_${ITEMS_PER_PAGE}_q=${this._query}_cat=${this._category}_stock=${this._stockFilter}_sale=${this._onSale}_feat=${this._featured}`;
    }

    _reloadProducts() {
        this._allLoaded = false;
        this._currentPage = 1;

        // Debounce: cancel any pending reload timer so rapid filter changes
        // (e.g. typing) only fire one network request after the user pauses.
        clearTimeout(this._reloadDebounce);
        this._reloadDebounce = setTimeout(() => this._loadProducts(1, false), 220);
    }

    async _loadMoreProducts() {
        if (this._loadingPage || this._allLoaded) return;
        await this._loadProducts(this._currentPage + 1, true);
    }

    async _loadProducts(page, append) {
        // FIX 1: Only block if we are infinite-scrolling (append).
        // NEVER block fresh searches (page === 1), let them interrupt ongoing syncs!
        if (this._loadingPage && append) return;

        // FIX 2: Create a unique session ID for this specific search keystroke.
        // If the user types again while the network is pending, we will abort rendering this old data.
        this._syncSession = (this._syncSession || 0) + 1;
        const currentSession = this._syncSession;

        const cacheKey = this._buildCacheKey(page);
        let hasLocalData = false;

        // 1. INSTANT LOCAL SEARCH (Runs instantly, never blocked by network)
        if (page === 1) {
            const localResults = this.state.searchLocalCatalog({
                query: this._query,
                category: this._category,
                // FIX: Translate 'backordered' for the local search just like the API!
                stockFilter: this._stockFilter === 'backordered' ? 'onbackorder' : this._stockFilter,
                onSale: this._onSale,
                featured: this._featured
            });

            if (localResults.length > 0) {
                // Instantly paint the screen using local data
                this.productGrid.update(localResults.slice(0, ITEMS_PER_PAGE), false);
                this._hideBootSpinner();
                hasLocalData = true;

                // If local results fit in one page, mark done so infinite scroll
                // doesn't fire a pointless "page 2" network request.
                if (localResults.length < ITEMS_PER_PAGE) {
                    this._allLoaded = true;
                }
            }
        }

        if (!hasLocalData) {
            this.productGrid.showLoading(append);
        } else {
            this.productGrid.setSyncStatus('syncing');
        }

        // 2. BACKGROUND SYNC (Non-blocking)
        this._loadingPage = true;
        try {
            let products = this.state.getWCCachedProducts?.(cacheKey);
            let fromNetwork = false;

            if (!products) {
                const res = await API.wcGetProducts(
                    page, ITEMS_PER_PAGE,
                    this._query, this._category,
                    // WC REST API uses 'onbackorder', but our UI uses 'backordered'
                    this._stockFilter === 'backordered' ? 'onbackorder' : this._stockFilter,
                    this._onSale, this._featured
                );

                // ABORT CHECK: If user typed something else while we were waiting, discard this data!
                if (currentSession !== this._syncSession) return;

                if (res.status !== 'success') {
                    if (!append && !hasLocalData) this.productGrid.showError(res.message || 'Failed to load products.');
                    return;
                }

                // Strip massive WooCommerce HTML descriptions to avoid Quota errors
                // Strip massive WooCommerce HTML descriptions to avoid Quota errors
                products = (res.data || []).map(p => {
                    // Extract to variables first to evaluate
                    const stockQty = parseInt(p.stock_quantity || 0);
                    let stockStatus = p.stock_status || (stockQty > 0 ? 'instock' : 'outofstock');

                    // FIX: Sanitize bad WooCommerce data from network payload
                    if (stockQty <= 0 && stockStatus === 'instock') {
                        stockStatus = 'outofstock';
                    }

                    return {
                        id: p.id,
                        wc_product_id: p.wc_product_id || p.id,
                        name: p.name,
                        price: p.price,
                        regular_price: p.regular_price,
                        stock_quantity: p.stock_quantity,
                        stock_status: stockStatus, // Use the sanitized status
                        on_sale: p.on_sale,
                        featured: p.featured,
                        sku: p.sku,
                        barcode: p.barcode,
                        status: p.status || 'publish',
                        categories: p.categories?.length ? [{name: p.categories[0].name}] : [],
                        images: p.images?.length ? [{src: p.images[0].src}] : [],
                        image_url: p.image_url || ''
                    };
                });

                fromNetwork = true;
                this.state.setWCCachedProducts?.(cacheKey, products);
            }

            // ABORT CHECK: Final check before touching the UI
            if (currentSession !== this._syncSession) return;

            // Index fresh data into the offline catalog silently
            this.state.syncCatalog?.(products);

            if (!append && products.length === 0 && !hasLocalData) {
                this.productGrid.showEmpty();
                this._allLoaded = true;
                return;
            }

            // Only overwrite the UI if we actually pulled fresh data from the network
            if (!hasLocalData || fromNetwork) {
                this.productGrid.update(products, append);
            }

            this._currentPage = page;
            if (products.length < ITEMS_PER_PAGE) {
                this._allLoaded = true;
            }
        } catch (e) {
            if (currentSession !== this._syncSession) return;
            if (!append && !hasLocalData) this.productGrid.showError(`Error: ${e.message}`);

        } finally {
            // The finally block is guaranteed to execute even if the code hits an early "return;"
            if (page === 1) this._hideBootSpinner();

            // Only unlock and show "Done" if this was the most recent search
            if (currentSession === this._syncSession) {
                this._loadingPage = false;
                const totalCached = this.state.getCatalogCount ? this.state.getCatalogCount() : 0;
                this.productGrid.setSyncStatus('done', totalCached);
            }
        }
    }

    _handleAddToCart(product) {
        const result = this._activeCart?.addProduct(product);
        if (result === false) return Toast.error('Item is out of stock');
        if (result === 'max') return Toast.error(`Max stock reached`);
        this.productGrid.flash(product.id);
    }

    _onCartChange(items) {
        const entry = this._carts[this._activeCartIdx];
        if (!entry) return;
        this.paymentPanel.updateTotals(entry.cart.getSubtotal(), items.length === 0);
        this._updateCartBadge(entry.cart.getItemCount());
        this._renderTabs(); // update tab badge
    }

    _updateCartBadge(count) {
        // No separate badge needed — shown in tabs
    }

    // ─── Checkout flow ─────────────────────────────────────────────────────────

    _handleRequestCheckout(params) {
        const cart = this._activeCart;
        if (!cart || cart.isEmpty()) return;
        const user = this.state.getUser();
        if (!user?.branch_id) return Toast.error('You must be assigned to a branch to process sales.');

        // Validate that all items have qty <= maxStock
        const items = cart.getItems();
        const invalidItems = items.filter(item => item.qty > item.maxStock);
        if (invalidItems.length > 0) {
            const itemNames = invalidItems.map(i => `${i.name} (qty: ${i.qty}, available: ${i.maxStock})`).join(', ');
            return Toast.error(`Insufficient stock: ${itemNames}`);
        }

        // Validate branch-specific inventory (if available)
        if (this._branchInventory && Object.keys(this._branchInventory).length > 0) {
            const branchErrors = [];
            items.forEach(item => {
                const branchId = item.branchId;
                const branchStock = this._branchInventory[branchId]?.[item.id] || 0;
                if (item.qty > branchStock) {
                    branchErrors.push(`${item.name} (requested: ${item.qty}, available in branch: ${branchStock})`);
                }
            });
            if (branchErrors.length > 0) {
                return Toast.error(`Insufficient branch stock:\n${branchErrors.join('\n')}`);
            }
        }

        this.confirmModal.show({...params, items});
    }

    async _handleConfirmedCheckout(data) {
        const {
            paymentMethod, discount, discountType, notes, subtotal, total,
            cashierId, cashierName, cashierEmail, customerId, customerName, customerEmail,
            taxRate, taxName, taxInclusive, taxAmount, fees, shipping
        } = data;

        const user = this.state.getUser();
        const cart = this._activeCart;
        this.paymentPanel.setLoading(true);

        const saleItems = cart.getItems();
        const payload = {
            branch_id: user.branch_id,
            payment_method: paymentMethod,
            discount,
            discount_type: discountType,
            notes,
            total,
            tax_rate: taxRate,
            tax_name: taxName,
            tax_inclusive: taxInclusive,
            tax_amount: taxAmount || 0,
            fees: fees || [],
            shipping: shipping || 0,
            items: saleItems.map(i => ({id: i.id, qty: i.qty, price: i.price, name: i.name, branch_id: i.branchId})),
            cashier_id: cashierId,
            cashier_name: cashierName,
            cashier_email: cashierEmail || '',
            customer_id: customerId,
            customer_name: customerName,
            customer_email: customerEmail,
        };

        try {
            const res = await API.processPOSCheckout(payload);
            if (res.status === 'success') {
                const wcOrderId = res.wc_order_id || null;
                cart.clear();
                this.paymentPanel.resetForm();
                this.state.clearWCCache?.();
                this._reloadProducts();

                // Remove cart or rename if last one
                const cartName = this._carts[this._activeCartIdx]?.name || '';

                this.receipt.show({
                    items: saleItems, subtotal, discount, discountType,
                    total, paymentMethod, notes,
                    taxRate, taxName, taxInclusive, taxAmount: taxAmount || 0,
                    fees, shipping,
                    branchName: user.branch_name || '',
                    wcOrderId,
                    cashierName,
                    cashierEmail: cashierEmail || '',
                    customerName,
                    customerEmail,
                    cartName
                });
            } else {
                Toast.error(res.message || 'Failed to process sale');
            }
        } catch (e) {
            Toast.error('Network error during checkout');
        } finally {
            this.paymentPanel.setLoading(false);
        }
    }

    _startNewSale() {
        this.filterBar.focus();
        this._saveViewState();
    }

    _initResizer() {
        // FIX: Prevent attaching multiple global document listeners on re-render
        if (this._resizerInitialized) return;
        this._resizerInitialized = true;

        const divider = document.getElementById('posDivider');
        const left = document.getElementById('posLeft');
        const root = document.getElementById('posRoot');
        if (!divider || !left || !root) return;
        let dragging = false, startX, startW, rootW;

        divider.addEventListener('mousedown', e => {
            dragging = true;
            startX = e.clientX;
            startW = left.getBoundingClientRect().width;
            rootW = root.getBoundingClientRect().width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            divider.classList.add('pos-divider--active');
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const newW = Math.min(Math.max(startW + e.clientX - startX, MIN_LEFT_PX), rootW - divider.offsetWidth - MIN_RIGHT_PX);
            left.style.flex = `0 0 ${newW}px`;
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            divider.classList.remove('pos-divider--active');
        });
        divider.addEventListener('dblclick', () => {
            left.style.flex = `1 1 ${DEFAULT_LEFT_PCT}%`;
        });
    }
}

module.exports = POSView;