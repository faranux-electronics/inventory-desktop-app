/**
 * POSCart — cart state + item list rendering
 * Enhanced: Economized space, compact rows, tighter flex layout
 * Fixed: qty input now accepts multi-digit numbers (no on‑input re‑render)
 */
const Modal = require('../../../components/Modal.js');

class POSCart {
    constructor({ onChange, onRequestTransfer }) {
        this.onChange = onChange;
        this.onRequestTransfer = onRequestTransfer;
        this._items = [];
        this._taxOn = false;
        this._taxOnItems = false;
        this._taxRate = 0;
        this._taxInclusive = false;
    }

    setTaxMode({ taxOn, taxOnItems, taxRate, taxInclusive }) {
        this._taxOn = taxOn;
        this._taxOnItems = taxOnItems;
        this._taxRate = taxRate;
        this._taxInclusive = taxInclusive;
        this._renderItems();
    }

    render(container) {
        container.innerHTML = `<div id="posCartItems" class="pos-cart-items" style="gap:2px;"></div>`;
        this._el = container.querySelector('#posCartItems');
        this._renderItems();
    }

    getItems() { return [...this._items]; }
    getTransferableItems() { return this._items.filter(i => i.isTransferable); }
    getBlockingItems() { return this._items.filter(i => i.isTransferable || i.isOOS); }
    isEmpty() { return this._items.length === 0; }
    getItemCount() { return this._items.reduce((s, i) => s + i.qty, 0); }
    getSubtotal() { return this._items.reduce((s, i) => s + i.price * i.qty, 0); }

    clear() {
        this._items = [];
        this._renderItems();
        this.onChange(this._items);
    }

    restoreItem(item) {
        const restoredItem = { ...item };
        if (!restoredItem.originalPrice) {
            restoredItem.originalPrice = item.price;
        }
        this._items.push(restoredItem);
    }

    addProduct(product, qty = 1) {
        const localStock = parseInt(product.stock_quantity || 0);
        const poolStock = parseInt(product.transferable_pool || 0);

        // Items may be added to the cart regardless of stock level so they can be
        // included on a quotation. maxStock/isTransferable/isOOS are still tracked
        // and are enforced only when the cashier actually charges the sale.
        const isTransferable = localStock <= 0 && poolStock > 0; // local is 0, but pool has stock — sellable pending transfer
        const isOOS = localStock <= 0 && poolStock <= 0; // nothing available anywhere
        const cap = isTransferable ? poolStock : localStock;

        const ex = this._items.find(i => i.id === product.id);
        if (ex) {
            ex.qty = ex.qty + qty;
            ex.isTransferable = isTransferable;
            ex.isOOS = isOOS;
            ex.maxStock = cap;
            if (isTransferable) ex.stockBreakdown = product.stock_breakdown || '';
        } else {
            this._items.push({
                id: product.id,
                wc_product_id: product.wc_product_id || product.id,
                name: product.name,
                price: parseInt(product.price || 0),
                originalPrice: parseInt(product.price || 0),
                qty,
                maxStock: cap,
                sku: product.sku || '',
                isTransferable,
                isOOS,
                stockBreakdown: isTransferable ? (product.stock_breakdown || '') : '',
            });
        }
        this._renderItems();
        this.onChange(this._items);
        return true;
    }

    addMiscItem({ name, price, qty, notes }) {
        const miscId = 'misc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const itemPrice = parseInt(price || 0);

        this._items.push({
            id: miscId,
            wc_product_id: miscId,
            name: name,
            price: itemPrice,
            originalPrice: itemPrice,
            qty: qty || 1,
            maxStock: 999999,
            sku: '',
            isMisc: true,
            notes: notes || ''
        });

        this._renderItems();
        this.onChange(this._items);
        return true;
    }

    updateQty(productId, delta) {
        const idx = this._items.findIndex(i => String(i.id) === String(productId));
        if (idx === -1) return;
        const item = this._items[idx];
        const next = item.qty + delta;

        if (next <= 0) {
            this._items.splice(idx, 1);
        } else {
            item.qty = next;
        }

        this._renderItems();
        this.onChange(this._items);
    }

    updatePrice(productId, newPrice) {
        const idx = this._items.findIndex(i => String(i.id) === String(productId));
        if (idx === -1) return;
        const item = this._items[idx];

        const price = parseInt(newPrice) || 0;
        if (price < 0) return;

        item.price = price;
        if (!item.originalPrice) {
            item.originalPrice = price;
        }

        this._renderItems();
        this.onChange(this._items);
    }

    _showPriceEditModal(item) {
        document.getElementById('posPriceEditModalOverlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'posPriceEditModalOverlay';
        overlay.className = 'pos-price-edit-overlay';
        overlay.innerHTML = `
            <div class="pos-price-edit-modal">
                <div class="pos-price-edit-header">
                    <span>Edit Price</span>
                    <button class="pos-price-edit-close" id="posPriceEditClose">×</button>
                </div>
                <div class="pos-price-edit-body">
                    <div class="pos-price-edit-product">
                        <strong>${item.name}</strong>
                        ${item.sku ? `<div style="font-size:11px;color:#6b7280;">SKU: ${item.sku}</div>` : ''}
                    </div>
                    <div class="pos-price-edit-info">
                        <div class="pos-price-edit-info-row">
                            <span>Current Price:</span>
                            <span>${item.price.toLocaleString()} Frw</span>
                        </div>
                        ${item.originalPrice && item.originalPrice !== item.price ? `
                        <div class="pos-price-edit-info-row">
                            <span>Original Price:</span>
                            <span>${item.originalPrice.toLocaleString()} Frw</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="pos-price-edit-input-group">
                        <label>New Price (Frw):</label>
                        <input type="number" id="posPriceEditInput" class="pos-price-edit-input" value="${item.price}" min="0" step="1">
                    </div>
                </div>
                <div class="pos-price-edit-footer">
                    <button class="pos-price-edit-btn pos-price-edit-btn--cancel" id="posPriceEditCancel">Cancel</button>
                    <button class="pos-price-edit-btn pos-price-edit-btn--confirm" id="posPriceEditConfirm">Update Price</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('pos-price-edit-overlay--in'));

        const input = overlay.querySelector('#posPriceEditInput');
        input.focus();
        input.select();

        const closeModal = () => {
            overlay.style.pointerEvents = 'none';
            overlay.classList.remove('pos-price-edit-overlay--in');
            setTimeout(() => overlay.remove(), 220);
        };

        overlay.querySelector('#posPriceEditClose').addEventListener('click', closeModal);
        overlay.querySelector('#posPriceEditCancel').addEventListener('click', closeModal);

        overlay.querySelector('#posPriceEditConfirm').addEventListener('click', () => {
            const newPrice = parseInt(input.value);
            if (isNaN(newPrice) || newPrice < 0) {
                Modal.open({
                    title: 'Invalid Price',
                    body: '<p>Please enter a valid price.</p>',
                    confirmText: 'OK',
                    cancelText: '',
                    onConfirm: () => input.focus()
                });
                return;
            }
            this.updatePrice(item.id, newPrice);
            closeModal();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                overlay.querySelector('#posPriceEditConfirm').click();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });
    }

    validateAgainstDictionary(stockDict) {
        let modified = false;

        for (let i = this._items.length - 1; i >= 0; i--) {
            const item = this._items[i];
            if (item.isMisc) continue;

            const linkId = item.wc_product_id || item.id;
            const actualStock = parseInt(stockDict[linkId] || 0);

            // Transfer has landed — item now has real local stock, no longer "pending"
            if (item.isTransferable && actualStock > 0) {
                // If enough local stock arrived to cover the requested quantity, graduate it fully
                if (actualStock >= item.qty) {
                    item.isTransferable = false;
                    modified = true;
                }
            }

            if (!item.isTransferable) {
                if (item.maxStock !== actualStock) {
                    item.maxStock = actualStock;
                    modified = true;
                }

                if (item.qty > actualStock) {
                    item.qty = actualStock;
                    modified = true;
                }
            }

            // Remove items that have been clamped to 0
            if (item.qty <= 0) {
                this._items.splice(i, 1);
                modified = true;
            }
        }

        if (modified) {
            this._renderItems();
            this.onChange(this._items);
        }
        return modified;
    }

    _renderItems() {
        const el = this._el || document.querySelector('#posCartItems');
        if (!el) return;

        // Save focused qty input ID so we can restore focus after DOM re-render
        let focusedQtyId = null;
        const focusedEl = document.activeElement;
        if (focusedEl && focusedEl.classList.contains('pos-qty-input')) {
            focusedQtyId = String(focusedEl.dataset.id);
        }

        if (!this._items.length) {
            el.innerHTML = `<div class="pos-cart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="rgba(36, 59, 83, 0.3)" stroke-width="1.5" width="36" style="margin-bottom:8px;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                <div style="font-size:13px;">Cart is empty</div>
                <div style="font-size:11px;color:rgba(36, 59, 83, 0.5);margin-top:2px;">Add products to get started</div>
            </div>`;
            return;
        }

        const pendingTransferItems = this._items.filter(i => i.isTransferable);
        const transferBanner = pendingTransferItems.length > 0 ? `
            <div class="pos-transfer-banner">
                <div class="pos-transfer-banner-text">
                    <strong>${pendingTransferItems.length}</strong> item${pendingTransferItems.length > 1 ? 's' : ''} awaiting transfer to your branch
                </div>
                <button class="pos-transfer-banner-btn" id="posRequestTransferBtn">Request Transfer</button>
            </div>` : '';

        el.innerHTML = transferBanner + this._items.map(item => {
            const showTaxPrice = this._taxOn && this._taxOnItems && this._taxRate > 0 && !this._taxInclusive;
            const displayPrice = showTaxPrice
                ? Math.round(item.price * (1 + this._taxRate / 100))
                : item.price;
            const lineTotal = displayPrice * item.qty;

            const showTaxLabel = this._taxOn && this._taxRate > 0;
            const taxLabel = showTaxLabel
                ? (this._taxOnItems
                    ? `<span style="font-size:9px;color:#932013;"> (${this._taxRate}% on items, ${this._taxInclusive ? 'incl.' : 'excl.'})</span>`
                    : `<span style="font-size:9px;color:#932013;"> (${this._taxRate}% on total, ${this._taxInclusive ? 'incl.' : 'excl.'})</span>`)
                : '';

            const isMisc = item.isMisc;
            const isPendingTransfer = !isMisc && item.isTransferable;
            const isOutOfStock = !isMisc && !isPendingTransfer && item.isOOS;
            const stockLabel = isMisc ? 'Unlimited' : (isPendingTransfer ? `${item.maxStock} (other branch)` : (isOutOfStock ? 'Out of stock' : item.maxStock));
            const skuLabel = isMisc ? 'Custom' : (item.sku || 'N/A');
            const miscBadge = isMisc ? `<span class="pos-misc-badge">Custom</span>` : '';
            const transferBadge = isPendingTransfer
                ? `<span class="pos-transfer-badge" title="Not yet in stock at your branch — pending incoming transfer">Pending Transfer</span>`
                : '';
            const oosBadge = isOutOfStock
                ? `<span class="pos-oos-badge" title="No stock at your branch or in the pool — can be quoted, not charged">Out of Stock</span>`
                : '';
            const notesDisplay = item.notes ? `<div class="pos-cart-row-notes">${item.notes}</div>` : '';

            const priceChanged = item.originalPrice && item.price !== item.originalPrice;
            const priceChangeIndicator = priceChanged
                ? `<span class="pos-price-changed" title="Original: ${item.originalPrice.toLocaleString()} Frw">★</span>`
                : '';

            const priceDisplay = `<span class="pos-price-editable" data-id="${item.id}" title="Click to edit price">${displayPrice.toLocaleString()} Frw</span>${priceChangeIndicator}`;

            return `
<div class="pos-cart-row ${isMisc ? 'pos-cart-row--misc' : ''} ${isPendingTransfer ? 'pos-cart-row--transfer' : ''} ${isOutOfStock ? 'pos-cart-row--oos' : ''}" data-id="${item.id}">
    <div class="pos-cart-row-info">
        <div class="pos-cart-row-name-line">
            <span class="pos-cart-row-name" title="${item.name}">${item.name}</span>
            ${miscBadge}
            ${transferBadge}
            ${oosBadge}
        </div>
        <div class="pos-cart-row-meta">
            ${isMisc ? '' : `${item.sku ? `SKU: ${item.sku} · ` : ''}`}${priceDisplay}${taxLabel}
            <span class="pos-cart-row-meta-dot">·</span> Stock: ${stockLabel}
        </div>
        ${notesDisplay}
    </div>

    <div class="pos-cart-row-controls">
        <div class="pos-qty-ctrl">
            <button class="pos-qty-btn pos-qty-minus" data-id="${item.id}">−</button>
            <input type="number" class="pos-qty-input" data-id="${item.id}" value="${item.qty}" min="1">
            <button class="pos-qty-btn pos-qty-plus" data-id="${item.id}">+</button>
        </div>
        <div class="pos-cart-row-total">${lineTotal.toLocaleString()}</div>
        <button class="pos-del-btn" data-id="${item.id}" title="Remove item">×</button>
    </div>
</div>`;
        }).join('');

        const requestTransferBtn = el.querySelector('#posRequestTransferBtn');
        if (requestTransferBtn && this.onRequestTransfer) {
            requestTransferBtn.addEventListener('click', () => this.onRequestTransfer(pendingTransferItems));
        }

        el.querySelectorAll('.pos-qty-minus').forEach(b => b.addEventListener('click', () => this.updateQty(b.dataset.id, -1)));
        el.querySelectorAll('.pos-qty-plus').forEach(b => b.addEventListener('click', () => this.updateQty(b.dataset.id, +1)));
        el.querySelectorAll('.pos-price-editable').forEach(span => {
            span.addEventListener('click', () => {
                const itemId = span.dataset.id;
                const item = this._items.find(i => String(i.id) === String(itemId));
                if (!item) return;
                this._showPriceEditModal(item);
            });
        });

        // FIX: Quantity input now only updates on blur or Enter; no on‑input re‑render
        el.querySelectorAll('.pos-qty-input').forEach(input => {
            // Enter key triggers blur to finalize
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                }
            });

            // Finalize on blur
            input.addEventListener('blur', () => {
                const newQty = parseInt(input.value);
                const itemId = input.dataset.id;
                const item = this._items.find(i => String(i.id) === String(itemId));
                if (!item) return;

                if (isNaN(newQty) || input.value === '') {
                    input.value = item.qty;
                } else if (newQty < 1) {
                    input.value = item.qty;
                } else {
                    const delta = newQty - item.qty;
                    if (delta !== 0) this.updateQty(itemId, delta);
                }
            });
        });

        el.querySelectorAll('.pos-del-btn').forEach(b => b.addEventListener('click', () => this.updateQty(b.dataset.id, -9999)));

        // Restore focus to the previously-active qty input so keyboard entry continues uninterrupted
        if (focusedQtyId) {
            const restored = el.querySelector(`.pos-qty-input[data-id="${focusedQtyId}"]`);
            if (restored) {
                restored.focus();
                restored.select();
            }
        }
    }
}

module.exports = POSCart;