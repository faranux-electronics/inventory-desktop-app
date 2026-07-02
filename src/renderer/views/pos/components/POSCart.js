/**
 * POSCart — cart state + item list rendering
 * Enhanced: Economized space, compact rows, tighter flex layout
 */
class POSCart {
    constructor({ onChange }) {
        this.onChange = onChange;
        this._items   = [];
        this._taxOn      = false;
        this._taxOnItems = false;
        this._taxRate    = 0;
        this._taxInclusive = false;
    }

    setTaxMode({ taxOn, taxOnItems, taxRate, taxInclusive }) {
        this._taxOn       = taxOn;
        this._taxOnItems  = taxOnItems;
        this._taxRate     = taxRate;
        this._taxInclusive = taxInclusive;
        this._renderItems();
    }

    render(container) {
        container.innerHTML = `<div id="posCartItems" class="pos-cart-items" style="gap:2px;"></div>`;
        this._el = container.querySelector('#posCartItems');
        this._renderItems();
    }

    getItems()     { return [...this._items]; }
    isEmpty()      { return this._items.length === 0; }
    getItemCount() { return this._items.reduce((s, i) => s + i.qty, 0); }
    getSubtotal()  { return this._items.reduce((s, i) => s + i.price * i.qty, 0); }

    clear() {
        this._items = [];
        this._renderItems();
        this.onChange(this._items);
    }

    restoreItem(item) {
        const restoredItem = { ...item };
        // Ensure originalPrice is set if not present (for backwards compatibility)
        if (!restoredItem.originalPrice) {
            restoredItem.originalPrice = item.price;
        }
        this._items.push(restoredItem);
    }

    addProduct(product, qty = 1) {
        const localStock = parseInt(product.stock_quantity || 0);

        if (localStock <= 0) return false;

        const ex = this._items.find(i => i.id === product.id);
        if (ex) {
            const next = ex.qty + qty;
            if (next > ex.maxStock) return 'max';
            ex.qty = next;
        } else {
            this._items.push({
                id: product.id,
                wc_product_id: product.wc_product_id || product.id,
                name: product.name,
                price: parseInt(product.price || 0),
                originalPrice: parseInt(product.price || 0),
                qty,
                maxStock: localStock,
                sku: product.sku || '',
            });
        }
        this._renderItems();
        this.onChange(this._items);
        return true;
    }

    addMiscItem({ name, price, qty, notes }) {
        // Generate a unique ID for miscellaneous items
        const miscId = 'misc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

        const itemPrice = parseInt(price || 0);

        this._items.push({
            id: miscId,
            wc_product_id: miscId,
            name: name,
            price: itemPrice,
            originalPrice: itemPrice,
            qty: qty || 1,
            maxStock: 999999, // No stock limit for misc items
            sku: '',
            isMisc: true,
            notes: notes || ''
        });

        this._renderItems();
        this.onChange(this._items);
        return true;
    }

    updateQty(productId, delta) {
        const idx  = this._items.findIndex(i => String(i.id) === String(productId));
        if (idx === -1) return;
        const item = this._items[idx];
        const next = item.qty + delta;

        // Misc items have unlimited stock, regular items respect maxStock
        if (next <= 0) {
            this._items.splice(idx, 1);
        } else if (!item.isMisc && next > item.maxStock) {
            return 'max';
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
        // Remove existing modal if present
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
            overlay.classList.remove('pos-price-edit-overlay--in');
            setTimeout(() => overlay.remove(), 220);
        };

        overlay.querySelector('#posPriceEditClose').addEventListener('click', closeModal);
        overlay.querySelector('#posPriceEditCancel').addEventListener('click', closeModal);

        overlay.querySelector('#posPriceEditConfirm').addEventListener('click', () => {
            const newPrice = parseInt(input.value);
            if (isNaN(newPrice) || newPrice < 0) {
                alert('Please enter a valid price');
                return;
            }
            this.updatePrice(item.id, newPrice);
            closeModal();
        });

        // Enter key to confirm
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                overlay.querySelector('#posPriceEditConfirm').click();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });
    }

    /**
     * Strict Live Validation:
     * Scans the cart against the exact stock dictionary of the assigned branch.
     * Decreases quantities or removes items if stock is missing or the branch changed.
     */
    validateAgainstDictionary(stockDict) {
        let modified = false;

        for (let i = this._items.length - 1; i >= 0; i--) {
            const item = this._items[i];

            // Skip misc items - they don't exist in the stock dictionary
            if (item.isMisc) {
                continue;
            }

            const linkId = item.wc_product_id || item.id;
            const actualStock = parseInt(stockDict[linkId] || 0);

            if (item.maxStock !== actualStock) {
                item.maxStock = actualStock;
                modified = true;
            }

            if (item.qty > actualStock) {
                item.qty = actualStock;
                modified = true;
            }

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

        el.innerHTML = this._items.map(item => {
            // Show tax-inclusive price when tax is per item and exclusive
            // For "on total" mode or inclusive tax, always show base price
            const showTaxPrice = this._taxOn && this._taxOnItems && this._taxRate > 0 && !this._taxInclusive;
            const displayPrice = showTaxPrice
                ? Math.round(item.price * (1 + this._taxRate / 100))
                : item.price;
            // Line total uses display price to match the unit price shown
            const lineTotal = displayPrice * item.qty;

            // Show tax label based on tax mode
            const showTaxLabel = this._taxOn && this._taxRate > 0;
            const taxLabel = showTaxLabel
                ? (this._taxOnItems
                    ? `<span style="font-size:9px;color:#932013;"> (${this._taxRate}% on items, ${this._taxInclusive ? 'incl.' : 'excl.'})</span>`
                    : `<span style="font-size:9px;color:#932013;"> (${this._taxRate}% on total, ${this._taxInclusive ? 'incl.' : 'excl.'})</span>`)
                : '';

            const isMisc = item.isMisc;
            const stockLabel = isMisc ? 'Unlimited' : item.maxStock;
            const skuLabel = isMisc ? 'Custom' : (item.sku || 'N/A');
            const miscBadge = isMisc ? `<span class="pos-misc-badge">Custom</span>` : '';
            const notesDisplay = item.notes ? `<div class="pos-cart-row-notes">${item.notes}</div>` : '';

            // Show price change indicator
            const priceChanged = item.originalPrice && item.price !== item.originalPrice;
            const priceChangeIndicator = priceChanged
                ? `<span class="pos-price-changed" title="Original: ${item.originalPrice.toLocaleString()} Frw">★</span>`
                : '';

            const priceDisplay = `<span class="pos-price-editable" data-id="${item.id}" title="Click to edit price">${displayPrice.toLocaleString()} Frw</span>${priceChangeIndicator}`;

            return `
<div class="pos-cart-row ${isMisc ? 'pos-cart-row--misc' : ''}" data-id="${item.id}">
    <div class="pos-cart-row-info">
        <div class="pos-cart-row-name-line">
            <span class="pos-cart-row-name" title="${item.name}">${item.name}</span>
            ${miscBadge}
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
            <input type="number" class="pos-qty-input" data-id="${item.id}" value="${item.qty}" min="1" max="${isMisc ? 999999 : item.maxStock}">
            <button class="pos-qty-btn pos-qty-plus" data-id="${item.id}">+</button>
        </div>
        <div class="pos-cart-row-total">${lineTotal.toLocaleString()}</div>
        <button class="pos-del-btn" data-id="${item.id}" title="Remove item">×</button>
    </div>
</div>`;
        }).join('');

        el.querySelectorAll('.pos-qty-minus').forEach(b => b.addEventListener('click', () => this.updateQty(b.dataset.id, -1)));
        el.querySelectorAll('.pos-qty-plus').forEach(b  => b.addEventListener('click', () => this.updateQty(b.dataset.id, +1)));
        el.querySelectorAll('.pos-price-editable').forEach(span => {
            span.addEventListener('click', () => {
                const itemId = span.dataset.id;
                const item = this._items.find(i => String(i.id) === String(itemId));
                if (!item) return;

                this._showPriceEditModal(item);
            });
        });
        el.querySelectorAll('.pos-qty-input').forEach(input => {
            // Use 'input' event to update line total immediately as user types
            // Focus restoration ensures field stays focused during re-renders
            input.addEventListener('input', () => {
                const newQty = parseInt(input.value);
                const itemId = input.dataset.id;
                const item = this._items.find(i => String(i.id) === String(itemId));
                if (!item) return;

                // If empty or partial input, just keep the field as-is (don't force re-render yet)
                if (isNaN(newQty) || input.value === '') {
                    return;
                }

                // Only enforce maxStock for non-misc items
                if (!item.isMisc && newQty > item.maxStock) {
                    input.value = item.maxStock;
                    const delta = item.maxStock - item.qty;
                    if (delta !== 0) this.updateQty(itemId, delta);
                    return;
                }

                // Prevent clearing to 0 - minimum is 1
                if (newQty < 1) {
                    return;
                }

                const delta = newQty - item.qty;
                if (delta !== 0) this.updateQty(itemId, delta);
            });

            // Also handle blur/change to finalize the quantity if user leaves without pressing Enter
            input.addEventListener('blur', () => {
                const newQty = parseInt(input.value);
                const itemId = input.dataset.id;
                const item = this._items.find(i => String(i.id) === String(itemId));
                if (!item) return;

                if (isNaN(newQty) || input.value === '') {
                    input.value = item.qty;
                } else if (!item.isMisc && newQty > item.maxStock) {
                    input.value = item.maxStock;
                    const delta = item.maxStock - item.qty;
                    if (delta !== 0) this.updateQty(itemId, delta);
                } else if (newQty < 1) {
                    input.value = item.qty;
                } else {
                    const delta = newQty - item.qty;
                    if (delta !== 0) this.updateQty(itemId, delta);
                }
            });
        });
        el.querySelectorAll('.pos-del-btn').forEach(b   => b.addEventListener('click', () => this.updateQty(b.dataset.id, -9999)));

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