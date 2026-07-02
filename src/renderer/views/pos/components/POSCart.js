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
        this._items.push({ ...item });
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
        
        this._items.push({
            id: miscId,
            wc_product_id: miscId,
            name: name,
            price: parseInt(price || 0),
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
        const idx  = this._items.findIndex(i => i.id === productId);
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

    /**
     * Strict Live Validation:
     * Scans the cart against the exact stock dictionary of the assigned branch.
     * Decreases quantities or removes items if stock is missing or the branch changed.
     */
    validateAgainstDictionary(stockDict) {
        let modified = false;

        for (let i = this._items.length - 1; i >= 0; i--) {
            const item = this._items[i];
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

        if (!this._items.length) {
            el.innerHTML = `<div class="pos-cart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="rgba(36, 59, 83, 0.3)" stroke-width="1.5" width="36" style="margin-bottom:8px;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                <div style="font-size:13px;">Cart is empty</div>
                <div style="font-size:11px;color:rgba(36, 59, 83, 0.5);margin-top:2px;">Add products to get started</div>
            </div>`;
            return;
        }

        el.innerHTML = this._items.map(item => {
            const showTax   = this._taxOn && this._taxOnItems && this._taxRate > 0;
            const taxedPrice = showTax
                ? (this._taxInclusive
                    ? item.price
                    : Math.round(item.price * (1 + this._taxRate / 100)))
                : item.price;
            const lineTotal  = taxedPrice * item.qty;
            const taxLabel   = showTax && !this._taxInclusive
                ? `<span style="font-size:9px;color:#932013;"> (+${this._taxRate}%)</span>`
                : '';

            const isMisc = item.isMisc;
            const stockLabel = isMisc ? 'Unlimited' : item.maxStock;
            const skuLabel = isMisc ? 'Custom' : (item.sku || 'N/A');
            const miscBadge = isMisc ? `<span class="pos-misc-badge">Custom</span>` : '';
            const notesDisplay = item.notes ? `<div class="pos-cart-row-notes">${item.notes}</div>` : '';

            return `
<div class="pos-cart-row ${isMisc ? 'pos-cart-row--misc' : ''}" data-id="${item.id}">
    <div class="pos-cart-row-info">
        <div class="pos-cart-row-name-line">
            <span class="pos-cart-row-name" title="${item.name}">${item.name}</span>
            ${miscBadge}
        </div>
        <div class="pos-cart-row-meta">
            ${isMisc ? '' : `${item.sku ? `SKU: ${item.sku} · ` : ''}`}${item.price.toLocaleString()} Frw${taxLabel}
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

        el.querySelectorAll('.pos-qty-minus').forEach(b => b.addEventListener('click', () => this.updateQty(+b.dataset.id, -1)));
        el.querySelectorAll('.pos-qty-plus').forEach(b  => b.addEventListener('click', () => this.updateQty(+b.dataset.id, +1)));
        el.querySelectorAll('.pos-qty-input').forEach(input => {
            input.addEventListener('input', () => {
                const newQty = parseInt(input.value);
                const itemId = +input.dataset.id;
                const item = this._items.find(i => i.id === itemId);
                if (!item) return;

                // If empty or invalid, reset to current quantity
                if (isNaN(newQty) || input.value === '') {
                    input.value = item.qty;
                    return;
                }

                // Only enforce maxStock for non-misc items
                if (!item.isMisc && newQty > item.maxStock) {
                    input.value = item.maxStock;
                    return;
                }

                // Prevent clearing to 0 - minimum is 1
                if (newQty < 1) {
                    input.value = 1;
                    return;
                }

                const delta = newQty - item.qty;
                if (delta !== 0) this.updateQty(itemId, delta);
            });
            
            // Also handle blur event to ensure valid value
            input.addEventListener('blur', () => {
                const newQty = parseInt(input.value);
                const itemId = +input.dataset.id;
                const item = this._items.find(i => i.id === itemId);
                if (!item) return;

                if (isNaN(newQty) || newQty < 1) {
                    input.value = item.qty;
                } else if (!item.isMisc && newQty > item.maxStock) {
                    input.value = item.maxStock;
                    const delta = item.maxStock - item.qty;
                    if (delta !== 0) this.updateQty(itemId, delta);
                }
            });
        });
        el.querySelectorAll('.pos-del-btn').forEach(b   => b.addEventListener('click', () => this.updateQty(+b.dataset.id, -9999)));
    }
}

module.exports = POSCart;