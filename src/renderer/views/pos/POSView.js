const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const POSFilterBar = require('./components/POSFilterBar.js');
const LocalProductGrid = require('../transfer/components/LocalProductGrid.js');
const POSCart = require('./components/POSCart.js');
const POSPaymentPanel = require('./components/POSPaymentPanel.js');
const POSConfirmModal = require('./components/POSConfirmModal.js');
const POSReceipt = require('./components/POSReceipt.js');

const DEFAULT_LEFT_PCT = 0;
const MIN_LEFT_PX = 340;
const MIN_RIGHT_PX = 320;
const MAX_CARTS = 6;

class POSView {
    constructor(app) {
        this.app = app;
        this.state = app.state;

        this._query = '';
        this._category = '';
        this._stockFilter = 'all';
        this._featured = false;
        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;

        this._carts = [];
        this._activeCartIdx = 0;

        this.filterBar = null;
        this.productGrid = null;
        this.paymentPanel = null;
        this.confirmModal = null;
        this.receipt = null;

        this._branches = [];
        this._loadViewState();
    }

    _loadViewState() {
        try {
            const saved = this.state.getTabState?.('pos');
            if (saved) {
                this._query = saved.query || '';
                this._category = saved.category || '';
                this._stockFilter = saved.stockFilter || 'all';
                this._featured = saved.featured || false;
                if (saved.carts && saved.carts.length) {
                    this._restoredCartSnapshots = saved.carts;
                    this._restoredActiveIdx = saved.activeIdx || 0;
                }
            }
        } catch (e) {
        }
    }

    _saveViewState() {
        const cartSnaps = this._carts.map(c => ({
            id: c.id, name: c.name, items: c.cart.getItems()
        }));
        this.state.saveTabState?.('pos', {
            query: this._query, category: this._category,
            stockFilter: this._stockFilter, featured: this._featured,
            carts: cartSnaps, activeIdx: this._activeCartIdx
        });
    }

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
            <div class="pos-left" id="posLeft" style="flex-basis:${DEFAULT_LEFT_PCT}%;">
                <div id="posFilterBarMount" class="pos-left-header"></div>
                <div id="posGridMount" class="pos-left-body"></div>
            </div>
            <div class="pos-divider" id="posDivider" title="Drag to resize">
                <div class="pos-divider-grip"><span></span><span></span><span></span></div>
            </div>
            <aside class="pos-right" id="posRight">
                <div class="pos-cart-tabs" id="posCartTabs">
                    <div class="pos-tab-list" id="posTabList"></div>
                    <button class="pos-tab-add" id="posTabAdd" title="New cart (max ${MAX_CARTS})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
                    </button>
                </div>
                <div id="posCartMount" class="pos-right-cart"></div>
                <div id="posPaymentMount" class="pos-right-payment"></div>
            </aside>
        </div>`;
    }

    _initComponents() {
        this.filterBar = new POSFilterBar({
            initialQuery: this._query, initialCategory: this._category,
            initialStockFilter: this._stockFilter, initialFeatured: this._featured,
            onFilter: (f) => {
                this._query = f.query;
                this._category = f.category;
                this._stockFilter = f.stockFilter;
                this._featured = f.featured;
                this._reloadProducts();
                this._saveViewState();
            }
        });
        this.filterBar.render(document.getElementById('posFilterBarMount'));

        this.productGrid = new LocalProductGrid({
            onSelect: product => this._handleAddToCart(product),
            onScrollEnd: () => this._loadMoreProducts()
        });
        this.productGrid.render(document.getElementById('posGridMount'));

        this.paymentPanel = new POSPaymentPanel({
            onRequestCheckout: params => this._handleRequestCheckout(params),
            onTaxModeChange: mode => {
                if (this._activeCart) this._activeCart.setTaxMode(mode);
            }
        });
        this.paymentPanel.render(document.getElementById('posPaymentMount'));

        this.confirmModal = new POSConfirmModal({
            onConfirm: data => this._handleConfirmedCheckout(data), onCancel: () => {
            }
        });
        this.receipt = new POSReceipt({onNewSale: () => this._startNewSale()});

        this._initCartTabs();
        document.getElementById('posTabAdd').addEventListener('click', () => this._addCart());
    }

    _initCartTabs() {
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
        return {id: cartId, name, cart};
    }

    _addCart() {
        if (this._carts.length >= MAX_CARTS) return Toast.info(`Maximum ${MAX_CARTS} carts open at once`);
        this._carts.push(this._createCartEntry(`Sale ${this._carts.length + 1}`));
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
            return `
            <div class="pos-tab ${i === this._activeCartIdx ? 'pos-tab--active' : ''}" data-idx="${i}">
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
                if (!this._carts[idx].cart.isEmpty() && !confirm(`Clear "${this._carts[idx].name}" and close this cart?`)) return;
                this._removeCart(idx);
            });
        });

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
    }

    get _activeCart() {
        return this._carts[this._activeCartIdx]?.cart;
    }

    async _bootstrap() {
        this._showBootSpinner();

        const catPromise = API.getCategories().then(res => {
            if (res?.status === 'success') this.filterBar.populateCategories(res.data || []);
        });

        const metaPromise = Promise.all([
            API.getWCPaymentGateways?.().catch(() => null),
            API.getWCTaxRates?.().catch(() => null)
        ]).then(([gwRes, taxRes]) => {
            if (gwRes?.status === 'success') this.paymentPanel.setPaymentMethods(gwRes.data);
            if (taxRes?.status === 'success') this.paymentPanel.setTaxRates(taxRes.data);
        });

        await this._loadBranches();
        await this._fetchProductsAsync();

        await Promise.all([catPromise, metaPromise]);
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
                Loading catalog…
            </span>`;

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

    async _loadBranches() {
        try {
            this._branches = await this.state.loadLocations(false);
            if (this._branches && this._branches.length > 0) {
                const locationMap = {};
                this._branches.forEach(l => locationMap[l.id] = l.name);
                this.productGrid.setLocationMap(locationMap);

                const user = this.state.getUser();
                if (user?.branch_id) {
                    this.productGrid.setFocusBranch(user.branch_id);

                    // --- ON-LOAD CART VALIDATION ---
                    // Instantly validate carts persisted from LocalStorage to match current branch stock limits
                    try {
                        const res = await API.getBranchStockDictionary(user.branch_id);
                        if (res?.status === 'success') {
                            const stockDict = res.data || {};
                            let cartModified = false;

                            this._carts.forEach(entry => {
                                if (entry.cart.validateAgainstDictionary(stockDict)) {
                                    cartModified = true;
                                }
                            });

                            if (cartModified) {
                                Toast.warning("Cart items were automatically adjusted to match your assigned branch stock.");
                                this._saveViewState();
                            }
                        }
                    } catch (err) {
                        console.warn('POS: Cart validation failed', err);
                    }
                }
            }
        } catch (e) {
            console.warn('POS: branch load failed', e);
            this._branches = [];
        }
    }

    _reloadProducts() {
        this._allLoaded = false;
        this._currentPage = 1;
        clearTimeout(this._reloadDebounce);
        this._reloadDebounce = setTimeout(() => this._loadProducts(1, false), 220);
    }

    async _loadMoreProducts() {
        if (this._loadingPage || this._allLoaded) return;
        await this._loadProducts(this._currentPage + 1, true);
    }

    _fetchProductsAsync() {
        return new Promise(resolve => {
            this._currentPage = 1;
            this._allLoaded = false;
            const session = this._syncSession = (this._syncSession || 0) + 1;
            this.productGrid.showLoading(false);

            const user = this.state.getUser();
            const branchId = user?.branch_id || '';

            API.posGetInventory(1, this._query, branchId, this._category, this._stockFilter, this._featured)
                .then(res => {
                    if (session !== this._syncSession) return;
                    this.productGrid.update(res?.data || [], false);
                    if (1 >= (res?.pagination?.pages || 1)) this._allLoaded = true;
                })
                .catch(e => {
                    if (session === this._syncSession) this.productGrid.showError(`Error: ${e.message}`);
                })
                .finally(() => {
                    if (session === this._syncSession) {
                        this._loadingPage = false;
                        this._hideBootSpinner();
                    }
                    resolve();
                });
        });
    }

    async _loadProducts(page, append) {
        if (this._loadingPage && append) return;
        this._syncSession = (this._syncSession || 0) + 1;
        const currentSession = this._syncSession;

        if (append) this.productGrid.setSyncStatus('syncing');
        else this.productGrid.showLoading(false);

        this._loadingPage = true;
        const user = this.state.getUser();
        const branchId = user?.branch_id || '';

        try {
            const res = await API.posGetInventory(page, this._query, branchId, this._category, this._stockFilter, this._featured);
            if (currentSession !== this._syncSession) return;

            if (res.status !== 'success') {
                if (!append) this.productGrid.showError(res.message || 'Failed to load products.');
                return;
            }

            const products = res.data || [];
            if (products.length === 0) {
                if (!append) this.productGrid.showEmpty();
                this._allLoaded = true;
                return;
            }

            this.productGrid.update(products, append);
            this._currentPage = page;
            if (page >= (res.pagination?.pages || 1)) this._allLoaded = true;
            if (append) this.productGrid.setSyncStatus('done', products.length);

        } catch (e) {
            if (currentSession === this._syncSession && !append) {
                this.productGrid.showError(`Error: ${e.message}`);
            }
        } finally {
            if (currentSession === this._syncSession) {
                this._loadingPage = false;
                if (page === 1) this._hideBootSpinner();
            }
        }
    }

    _handleAddToCart(product) {
        const cart = this._activeCart;
        if (!cart) return;

        const result = cart.addProduct(product);
        if (result === false) return Toast.error('No stock available in your branch for this item');
        if (result === 'max') return Toast.error(`Max branch stock reached`);

        this.productGrid.flash(product.id);
    }

    _onCartChange(items) {
        const entry = this._carts[this._activeCartIdx];
        if (!entry) return;
        this.paymentPanel.updateTotals(entry.cart.getSubtotal(), items.length === 0);
        this._renderTabs();
    }

    async _handleRequestCheckout(params) {
        const cart = this._activeCart;
        if (!cart || cart.isEmpty()) return;
        const user = this.state.getUser();
        if (!user?.branch_id) return Toast.error('You must be assigned to a branch to process sales.');

        // --- LIVE CHECKOUT VALIDATION ---
        // Instantly scans the current database inventory right before the money is processed
        this.paymentPanel.setLoading(true);
        try {
            const res = await API.getBranchStockDictionary(user.branch_id);
            if (res?.status === 'success') {
                const stockDict = res.data || {};
                const modified = cart.validateAgainstDictionary(stockDict);

                if (modified) {
                    this.paymentPanel.setLoading(false);
                    return Toast.error('Cart adjusted! Some items lacked sufficient branch stock.');
                }
            }
        } catch (e) {
            console.warn('Live validation failed', e);
        }
        this.paymentPanel.setLoading(false);

        const items = cart.getItems();
        const invalidItems = items.filter(item => item.qty > item.maxStock);
        if (invalidItems.length > 0) {
            const itemNames = invalidItems.map(i => `${i.name} (qty: ${i.qty}, branch stock: ${i.maxStock})`).join(', ');
            return Toast.error(`Insufficient branch stock: ${itemNames}`);
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
            branch_id: user.branch_id, payment_method: paymentMethod, discount,
            discount_type: discountType, notes, total, tax_rate: taxRate,
            tax_name: taxName, tax_inclusive: taxInclusive, tax_amount: taxAmount || 0,
            fees: fees || [], shipping: shipping || 0,
            items: saleItems.map(i => ({id: i.id, qty: i.qty, price: i.price, name: i.name, branch_id: i.branchId})),
            cashier_id: cashierId, cashier_name: cashierName, cashier_email: cashierEmail || '',
            customer_id: customerId, customer_name: customerName, customer_email: customerEmail,
        };

        try {
            const res = await API.processPOSCheckout(payload);
            if (res.status === 'success') {
                const wcOrderId = res.wc_order_id || null;
                cart.clear();
                this.paymentPanel.resetForm();
                this._reloadProducts();

                this.receipt.show({
                    items: saleItems, subtotal, discount, discountType, total, paymentMethod, notes,
                    taxRate, taxName, taxInclusive, taxAmount: taxAmount || 0, fees, shipping,
                    branchName: user.branch_name || '', wcOrderId, cashierName, cashierEmail: cashierEmail || '',
                    customerName, customerEmail, cartName: this._carts[this._activeCartIdx]?.name || ''
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