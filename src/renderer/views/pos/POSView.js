const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const POSFilterBar = require('./components/POSFilterBar.js');
const LocalProductGrid = require('../transfer/components/LocalProductGrid.js');
const POSCart = require('./components/POSCart.js');
const POSPaymentPanel = require('./components/POSPaymentPanel.js');
const POSConfirmModal = require('./components/POSConfirmModal.js');
const POSReceipt = require('./components/POSReceipt.js');
const POSMiscModal = require('./components/POSMiscModal.js');
const Modal = require('../../components/Modal.js');
const PdfGenerator = require('../../utils/PdfGenerator.js');

const DEFAULT_LEFT_PCT = 50;
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

        this._productCache = [];
        this._cacheParams = null;

        this._carts = [];
        this._activeCartIdx = 0;

        this.filterBar = null;
        this.productGrid = null;
        this.paymentPanel = null;
        this.confirmModal = null;
        this.receipt = null;
        this.miscModal = null;

        this._branches = [];
        this._liveCartDebounceTimer = null;
        this._liveCartGen = 0;
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

        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;

        if (this.productGrid) {
            this.productGrid.showLoading(false);
        }

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
                        <span>New Cart</span>
                    </button>
                </div>
                <div id="posCartMount" class="pos-right-cart"></div>
                <div id="posPaymentMount" class="pos-right-payment">
                    <div class="pos-payment-resize-handle" id="posPaymentResizeHandle"></div>
                </div>
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
            },
            onAddMisc: () => this._showMiscModal()
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
            },
            onVoidCart: () => this._voidActiveCart(),
            onPrintQuote: () => this._handlePrintQuote(),
            onLiveCartToggle: (enabled) => {
                this._liveCartEnabled = enabled;
                if (!enabled) {
                    this._liveCartIndex = -1;
                    localStorage.setItem('pos_live_cart_index', '-1');
                    this._reportLiveCartResult(API.clearLiveCart(this._liveCartRegisterId), 'clear (toggle off)');
                    this._renderTabs();
                }
                this.paymentPanel.setLiveCartStatus(enabled && this._liveCartIndex >= 0);
                this._updateLiveCart();
            },
            onLiveCartRegisterChange: (registerId) => {
                this._liveCartRegisterId = registerId;
                this._updateLiveCart();
            }
        });
        this.paymentPanel.render(document.getElementById('posPaymentMount'));

        this.confirmModal = new POSConfirmModal({
            onConfirm: data => this._handleConfirmedCheckout(data), onCancel: () => {
            }
        });
        this.receipt = new POSReceipt({ onNewSale: () => this._startNewSale() });

        this.miscModal = new POSMiscModal({
            onConfirm: (data) => this._handleAddMiscItem(data),
            onCancel: () => { }
        });

        this._initCartTabs();
        document.getElementById('posTabAdd').addEventListener('click', () => this._addCart());
        const paymentResizeHandle = document.getElementById('posPaymentResizeHandle');
        if (paymentResizeHandle) {
            paymentResizeHandle.addEventListener('pointerdown', (e) => this._startResize(e));
        }

        const user = this.state.getUser();
        if (user) {
            window._posUser = user;
        }

        this._liveCartRegisterId = localStorage.getItem('pos_live_cart_register_id') || 'till-1';
        this._liveCartEnabled = localStorage.getItem('pos_live_cart_enabled') === 'true';
        this._liveCartIndex = parseInt(localStorage.getItem('pos_live_cart_index') || '-1');

        setTimeout(() => {
            this.paymentPanel.setLiveCartStatus(this._liveCartEnabled && this._liveCartIndex >= 0);
        }, 100);
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

        if (!snapshots || snapshots.length === 0) {
            this._setDefaultCustomerToCashier();
        }
    }

    _setDefaultCustomerToCashier() {
        try {
            const cashierSel = document.querySelector('#posCashier');
            if (cashierSel && cashierSel.options.length > 0) {
                const selectedCashierName = cashierSel.options[cashierSel.selectedIndex]?.text || '';
                const customerSearch = document.querySelector('#posCustomerSearch');
                if (customerSearch) {
                    customerSearch.value = selectedCashierName;
                }
            }
        } catch (e) {
            console.error('Failed to set default customer to cashier:', e);
        }
    }

    _startResize(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        const paymentMount = document.getElementById('posPaymentMount');
        if (!paymentMount) return;

        const handle = e.currentTarget;
        const pointerId = e.pointerId;
        const startY = e.clientY;
        const startHeight = paymentMount.offsetHeight;

        const onPointerMove = (moveEvent) => {
            const delta = startY - moveEvent.clientY;
            const newHeight = Math.max(150, Math.min(window.innerHeight * 0.5, startHeight + delta));
            paymentMount.style.height = newHeight + 'px';
        };

        const onPointerUp = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            if (handle && handle.releasePointerCapture) {
                handle.releasePointerCapture(pointerId);
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        if (handle && handle.setPointerCapture) {
            handle.setPointerCapture(pointerId);
        }

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    }

    _createCartEntry(name, id = null) {
        const cartId = id || ('cart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
        const cart = new POSCart({
            onChange: items => {
                this._onCartChange(items);
                this._saveViewState();
            }
        });
        return { id: cartId, name, cart };
    }

    // FIX: Compute next available cart number
    _addCart() {
        if (this._carts.length >= MAX_CARTS) return Toast.info(`Maximum ${MAX_CARTS} carts open at once`);

        const usedNumbers = this._carts
            .map(c => parseInt(c.name.replace('Sale ', ''), 10))
            .filter(n => !isNaN(n));
        let nextNumber = 1;
        while (usedNumbers.includes(nextNumber)) nextNumber++;

        const newCart = this._createCartEntry(`Sale ${nextNumber}`);
        this._carts.push(newCart);
        this._activeCartIdx = this._carts.length - 1;
        this._renderTabs();
        this._activateCart(this._activeCartIdx);
        this._saveViewState();
    }

    _removeCart(idx) {
        const cartId = this._carts[idx]?.id;
        if (cartId) {
            localStorage.removeItem(`pos_cart_settings_${cartId}`);
        }

        if (this._liveCartIndex === idx) {
            this._liveCartIndex = -1;
            localStorage.setItem('pos_live_cart_index', '-1');
            this._reportLiveCartResult(API.clearLiveCart(this._liveCartRegisterId), 'clear (cart removed)');
        } else if (this._liveCartIndex > idx) {
            this._liveCartIndex--;
            localStorage.setItem('pos_live_cart_index', this._liveCartIndex);
        }

        if (this._carts.length === 1) {
            this._carts[0].cart.clear();
            this._carts[0].name = 'Sale 1';
            this.paymentPanel.resetForm();
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
            const isLiveCart = this._liveCartEnabled && i === this._liveCartIndex;
            return `
            <div class="pos-tab ${i === this._activeCartIdx ? 'pos-tab--active' : ''}" data-idx="${i}">
                <span class="pos-tab-name">${c.name}</span>
                ${count > 0 ? `<span class="pos-tab-badge">${count}</span>` : ''}
                <button class="pos-tab-live" data-idx="${i}" title="${isLiveCart ? 'Hide from display' : 'Show on display'}">
                    ${isLiveCart ? '👁️' : '👁️‍🗨️'}
                </button>
                <button class="pos-tab-close" data-idx="${i}" title="Close">×</button>
            </div>`;
        }).join('');

        list.querySelectorAll('.pos-tab').forEach(tab => {
            tab.addEventListener('click', e => {
                if (e.target.closest('.pos-tab-close') || e.target.closest('.pos-tab-live')) return;
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
                if (this._carts[idx].cart.isEmpty()) {
                    this._removeCart(idx);
                    return;
                }
                Modal.open({
                    title: 'Close Cart',
                    body: `<p>Clear "${this._carts[idx].name}" and close this cart?</p>`,
                    confirmText: 'Close Cart',
                    cancelText: 'Keep Cart',
                    confirmClass: 'btn-danger',
                    onConfirm: () => this._removeCart(idx)
                });
            });
        });

        list.querySelectorAll('.pos-tab-live').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const idx = +btn.dataset.idx;
                this._toggleLiveCart(idx);
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
        this.paymentPanel.setCurrentCartId(entry.id);
    }

    get _activeCart() {
        return this._carts[this._activeCartIdx]?.cart;
    }

    async _bootstrap() {
        await this._loadBranches();

        if (this._isCacheValid() && this._productCache.length > 0) {
            this.productGrid.update(this._productCache, false);
            this._currentPage = 1;
            this._allLoaded = true;
        } else {
            this._showBootSpinner();
        }

        const catPromise = API.getCategories().then(res => {
            if (res?.status === 'success') this.filterBar.populateCategories(res.data || []);
        });

        this.paymentPanel.setTaxRates();

        if (!this._isCacheValid() || this._productCache.length === 0) {
            await this._fetchProductsAsync();
        }

        await catPromise;
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
                this._branches.forEach(l => {
                    locationMap[l.id] = l.name;
                    locationMap[String(l.id)] = l.name;
                    locationMap[Number(l.id)] = l.name;
                });
                this.productGrid.setLocationMap(locationMap);

                const user = this.state.getUser();
                if (user?.branch_id) {
                    this.productGrid.setFocusBranch(user.branch_id);

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
        this._productCache = [];
        this._cacheParams = null;
        clearTimeout(this._reloadDebounce);
        this._reloadDebounce = setTimeout(() => this._loadProducts(1, false), 220);
    }

    _isCacheValid() {
        if (!this._cacheParams) return false;
        const user = this.state.getUser();
        const branchId = user?.branch_id || '';
        return (
            this._cacheParams.query === this._query &&
            this._cacheParams.category === this._category &&
            this._cacheParams.stockFilter === this._stockFilter &&
            this._cacheParams.featured === this._featured &&
            this._cacheParams.branchId === branchId
        );
    }

    _updateCacheParams() {
        const user = this.state.getUser();
        const branchId = user?.branch_id || '';
        this._cacheParams = {
            query: this._query,
            category: this._category,
            stockFilter: this._stockFilter,
            featured: this._featured,
            branchId: branchId
        };
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

                    this._productCache = res?.data || [];
                    this._updateCacheParams();
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

        if (!append && page === 1 && this._isCacheValid() && this._productCache.length > 0) {
            this.productGrid.update(this._productCache, false);
            this._currentPage = 1;
            this._allLoaded = true;
            return;
        }

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

            if (!append && page === 1) {
                this._productCache = products;
                this._updateCacheParams();
            } else if (append) {
                this._productCache = [...this._productCache, ...products];
            }

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

    _showMiscModal() {
        if (this.miscModal) {
            this.miscModal.show();
        }
    }

    _handleAddMiscItem(data) {
        const cart = this._activeCart;
        if (!cart) return;

        const result = cart.addMiscItem(data);
        if (result) {
            Toast.success(`Added "${data.name}" to cart`);
            this.paymentPanel.updateTotals(cart.getSubtotal(), cart.isEmpty());
            this._saveViewState();
        } else {
            Toast.error('Failed to add item to cart');
        }
    }

    _voidActiveCart() {
        const cart = this._activeCart;
        if (!cart || cart.isEmpty()) return;

        Modal.open({
            title: 'Void Cart',
            body: '<p>Are you sure you want to void the current cart? This cannot be undone.</p>',
            confirmText: 'Void Cart',
            cancelText: 'Cancel',
            confirmClass: 'btn-danger',
            onConfirm: () => {
                clearTimeout(this._liveCartDebounceTimer);
                this._liveCartGen++;

                cart.clear();
                this.paymentPanel.resetForm();
                this.paymentPanel.updateTotals(0, true);
                this._renderTabs();
                this._saveViewState();

                if (this._liveCartEnabled && this._activeCartIdx === this._liveCartIndex) {
                    this._reportLiveCartResult(API.clearLiveCart(this._liveCartRegisterId), 'clear (void)');
                }
            }
        });
    }

    async _handlePrintQuote() {
        const cart = this._activeCart;
        if (!cart || cart.isEmpty()) {
            return Toast.error('Cart is empty. Add items to generate a quotation.');
        }

        try {
            const items = cart.getItems();
            const modalData = this.paymentPanel.modal.getData();
            const user = this.state.getUser();

            const subtotal = cart.getSubtotal();
            const discountRaw = modalData.discountRaw;
            const discountType = modalData.discountType;
            const shipping = modalData.shipping;
            const fees = modalData.fees;
            const taxOn = modalData.taxOn;
            const taxRate = modalData.taxRate;
            const taxInclusive = modalData.taxInclusive;
            const taxOnItems = modalData.taxOnItems;

            const discountVal = parseFloat(discountRaw) || 0;
            const discount = discountType === 'percent'
                ? Math.round(subtotal * discountVal / 100)
                : discountVal;

            const shippingCost = parseFloat(shipping) || 0;
            const feesTotal = fees.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);

            const afterDisc = Math.max(0, subtotal - discount);
            const preTax = afterDisc + shippingCost + feesTotal;

            let taxAmt = 0;
            if (taxOn && taxRate > 0) {
                const base = taxOnItems ? afterDisc : preTax;
                if (taxInclusive) {
                    taxAmt = base - (base / (1 + taxRate / 100));
                } else {
                    taxAmt = base * (taxRate / 100);
                }
            }

            const total = taxInclusive ? Math.round(preTax) : Math.round(preTax + taxAmt);

            const quoteData = {
                items: items.map(i => ({
                    sku: i.sku || '',
                    name: i.name,
                    qty: i.qty,
                    price: i.price
                })),
                subtotal: subtotal,
                discount: discount,
                discountType: discountType,
                shipping: shippingCost,
                fees: fees,
                taxAmount: Math.round(taxAmt),
                taxRate: taxRate,
                taxName: modalData.taxName || 'Tax',
                taxInclusive: taxInclusive,
                taxOnItems: taxOnItems,
                total: total,
                notes: modalData.notes,
                customerName: modalData.customer.name,
                customerEmail: modalData.customer.email,
                cashierName: modalData.cashier.name,
                branchName: user?.branch_name || 'Faranux Electronics'
            };

            await PdfGenerator.generateQuotationPDF(quoteData);
            Toast.success('Quotation generated successfully');
        } catch (error) {
            console.error('Error generating quotation:', error);
            Toast.error('Failed to generate quotation');
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
        this._scheduleLiveCartUpdate();
    }

    _scheduleLiveCartUpdate() {
        clearTimeout(this._liveCartDebounceTimer);
        this._liveCartDebounceTimer = setTimeout(() => this._updateLiveCart(), 300);
    }

    _toggleLiveCart(idx) {
        if (this._liveCartIndex === idx) {
            this._liveCartIndex = -1;
            localStorage.setItem('pos_live_cart_index', '-1');
            this._reportLiveCartResult(API.clearLiveCart(this._liveCartRegisterId), 'clear (toggle off cart)');
            this.paymentPanel.setLiveCartStatus(false);
        } else {
            this._liveCartIndex = idx;
            localStorage.setItem('pos_live_cart_index', idx);
            if (!this._liveCartEnabled) {
                this._liveCartEnabled = true;
                localStorage.setItem('pos_live_cart_enabled', 'true');
                this.paymentPanel.setLiveCartEnabledUi(true);
            }
            this._updateLiveCartForCart(idx);
            this.paymentPanel.setLiveCartStatus(true);
        }
        this._renderTabs();
    }

    async _reportLiveCartResult(resultPromise, label) {
        const res = await resultPromise;
        if (!res || res.status === 'error') {
            console.error(`Live cart ${label} failed:`, res?.message || 'unknown error');
        }
        return res;
    }

    async _updateLiveCart() {
        if (this._liveCartEnabled && this._activeCartIdx === this._liveCartIndex) {
            await this._updateLiveCartForCart(this._activeCartIdx);
        }
    }

    async _updateLiveCartForCart(idx) {
        const cartEntry = this._carts[idx];
        if (!cartEntry) return;

        const myGen = ++this._liveCartGen;

        const cart = cartEntry.cart;
        const items = cart.getItems();

        const modalData = this.paymentPanel.modal.getData();

        const subtotal = cart.getSubtotal();
        const discountRaw = modalData.discountRaw;
        const discountType = modalData.discountType;
        const discount = discountType === 'percent'
            ? Math.round(subtotal * (parseFloat(discountRaw) || 0) / 100)
            : parseFloat(discountRaw) || 0;
        const shipping = parseFloat(modalData.shipping) || 0;
        const fees = modalData.fees || [];
        const feesTotal = fees.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
        const taxOn = modalData.taxOn;
        const taxRate = parseFloat(modalData.taxRate) || 0;
        const taxInclusive = modalData.taxInclusive;
        const taxOnItems = modalData.taxOnItems;

        const afterDisc = Math.max(0, subtotal - discount);
        const preTax = afterDisc + shipping + feesTotal;

        let taxAmt = 0;
        if (taxOn && taxRate > 0) {
            const base = taxOnItems ? afterDisc : preTax;
            if (taxInclusive) {
                taxAmt = base - (base / (1 + taxRate / 100));
            } else {
                taxAmt = base * (taxRate / 100);
            }
        }

        const total = taxInclusive ? Math.round(preTax) : Math.round(preTax + taxAmt);

        const cartData = {
            status: items.length > 0 ? 'active' : 'idle',
            cartName: cartEntry.name,
            items: items.map(i => ({
                name: i.name,
                qty: i.qty,
                price: i.price,
                total: i.price * i.qty
            })),
            subtotal: subtotal,
            discount: discount,
            shipping: shipping,
            fees: fees.map(f => ({
                label: f.label || 'Fee',
                amount: parseFloat(f.amount) || 0
            })),
            tax: Math.round(taxAmt),
            total: total,
            currency: 'RWF'
        };

        const res = await API.updateLiveCart(this._liveCartRegisterId, cartData);

        if (myGen !== this._liveCartGen) return;

        if (!res || res.status === 'error') {
            console.error('Failed to update live cart:', res?.message || 'unknown error');
            this.paymentPanel.setLiveCartStatus(false);
        } else {
            this.paymentPanel.setLiveCartStatus(true);
        }
    }

    async _handleRequestCheckout(params) {
        const cart = this._activeCart;
        if (!cart || cart.isEmpty()) return;
        const user = this.state.getUser();
        if (!user?.branch_id) return Toast.error('You must be assigned to a branch to process sales.');

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

        this.confirmModal.show({ ...params, items });
    }

    async _handleConfirmedCheckout(data) {
        const {
            paymentMethod, discount, discountType, notes, subtotal, total,
            cashierId, cashierName, cashierEmail, customerId, customerName, customerEmail,
            taxRate, taxName, taxInclusive, taxOnItems, taxAmount, fees, shipping
        } = data;

        const user = this.state.getUser();
        const cart = this._activeCart;
        this.paymentPanel.setLoading(true);

        const saleItems = cart.getItems();
        const payload = {
            branch_id: user.branch_id, payment_method: paymentMethod, discount,
            discount_type: discountType, notes, total,
            tax_rate: taxAmount > 0 ? taxRate : 0,
            tax_name: taxName, tax_inclusive: taxInclusive, tax_on_items: !!taxOnItems,
            tax_amount: taxAmount || 0,
            fees: fees || [], shipping: shipping || 0,
            items: saleItems.map(i => ({ id: i.id, qty: i.qty, price: i.price, name: i.name, branch_id: i.branchId })),
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

                this._reportLiveCartResult(API.clearLiveCart(this._liveCartRegisterId), 'clear (checkout complete)');

                this.receipt.show({
                    items: saleItems, subtotal, discount, discountType, total, paymentMethod, notes,
                    taxRate, taxName, taxInclusive, taxOnItems, taxAmount: taxAmount || 0, fees, shipping,
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
        const divider = document.getElementById('posDivider');
        const left = document.getElementById('posLeft');
        const root = document.getElementById('posRoot');
        if (!divider || !left || !root) return;
        if (this._resizerInitialized && this._dividerNode === divider) return;

        this._resizerInitialized = true;
        this._dividerNode = divider;

        let dragging = false, startX = 0, startW = 0, rootW = 0, activePointerId = null;

        const onPointerMove = (moveEvent) => {
            if (!dragging) return;
            const newW = Math.min(Math.max(startW + moveEvent.clientX - startX, MIN_LEFT_PX), rootW - divider.offsetWidth - MIN_RIGHT_PX);
            left.style.flex = `0 0 ${newW}px`;
        };

        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            divider.classList.remove('pos-divider--active');
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            if (activePointerId !== null && divider.releasePointerCapture) {
                divider.releasePointerCapture(activePointerId);
            }
            activePointerId = null;
        };

        divider.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            dragging = true;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startW = left.getBoundingClientRect().width;
            rootW = root.getBoundingClientRect().width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            divider.classList.add('pos-divider--active');
            if (divider.setPointerCapture) {
                divider.setPointerCapture(activePointerId);
            }
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        }, { passive: false });

        divider.addEventListener('dblclick', () => {
            left.style.flex = `1 1 ${DEFAULT_LEFT_PCT}%`;
        });
    }
}

module.exports = POSView;