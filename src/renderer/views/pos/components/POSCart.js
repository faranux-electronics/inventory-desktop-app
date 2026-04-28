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

    updateQty(productId, delta) {
        const idx  = this._items.findIndex(i => i.id === productId);
        if (idx === -1) return;
        const item = this._items[idx];
        const next = item.qty + delta;
        if (next <= 0)            this._items.splice(idx, 1);
        else if (next > item.maxStock) return 'max';
        else                       item.qty = next;
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
            el.innerHTML = `<div class="pos-cart-empty" style="padding: 20px 10px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="rgba(36, 59, 83, 0.3)" stroke-width="1.5" width="30" style="margin-bottom:4px;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                <div style="font-size:12px;">Cart is empty</div>
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
                ? `<span style="font-size:9px;color:#2689C4;"> (+${this._taxRate}%)</span>`
                : '';

            return `
<div class="pos-cart-row" data-id="${item.id}" style="padding: 6px 8px; margin-bottom: 2px;">
    <div style="flex:1;min-width:0;padding-right:4px;">
        <div style="font-size:12px;font-weight:600;color:#243B53;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">
            ${item.name}
        </div>
        <div style="font-size:10px;color:rgba(36, 59, 83, 0.6);margin-top:2px;">
            ${item.sku ? `SKU: ${item.sku} &nbsp;|&nbsp; ` : ''}<strong>${item.price.toLocaleString()} Frw</strong>${taxLabel}
            &nbsp;|&nbsp; <span title="Branch stock available">Branch: ${item.maxStock}</span>
        </div>
    </div>

    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <div class="pos-qty-ctrl" style="height:22px;">
            <button class="pos-qty-btn pos-qty-minus" data-id="${item.id}" style="width:22px;height:22px;font-size:12px;">−</button>
            <input type="number" class="pos-qty-input" data-id="${item.id}" value="${item.qty}" min="1" max="${item.maxStock}" style="min-width:36px;height:22px;font-size:11.5px;text-align:center;border:1px solid #d1d5db;border-radius:2px;padding:0 2px;">
            <button class="pos-qty-btn pos-qty-plus" data-id="${item.id}" style="width:22px;height:22px;font-size:12px;">+</button>
        </div>
        <div style="width:65px;text-align:right;flex-shrink:0;">
            <div style="font-weight:700;color:#2689C4;font-size:12.5px;">${lineTotal.toLocaleString()}</div>
        </div>
        <button class="pos-del-btn" data-id="${item.id}" title="Remove" style="font-size:16px; margin-left: 2px;">×</button>
    </div>
</div>`;
        }).join('');

        el.querySelectorAll('.pos-qty-minus').forEach(b => b.addEventListener('click', () => this.updateQty(+b.dataset.id, -1)));
        el.querySelectorAll('.pos-qty-plus').forEach(b  => b.addEventListener('click', () => this.updateQty(+b.dataset.id, +1)));
        el.querySelectorAll('.pos-qty-input').forEach(input => {
            input.addEventListener('input', () => {
                const newQty = parseInt(input.value) || 0;
                const itemId = +input.dataset.id;
                const item = this._items.find(i => i.id === itemId);
                if (!item) return;

                if (newQty > item.maxStock) {
                    input.value = item.maxStock;
                    return;
                }

                const delta = newQty - item.qty;
                if (delta !== 0) this.updateQty(itemId, delta);
            });
        });
        el.querySelectorAll('.pos-del-btn').forEach(b   => b.addEventListener('click', () => this.updateQty(+b.dataset.id, -9999)));
    }
}

module.exports = POSCart;