const Toast = require('../../../components/Toast.js');

// FIX: Escape helper prevents XSS from server-supplied strings inserted into innerHTML.
function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class TransferStagingPanel {
    constructor({onTransfer, onBranchChange}) {
        this.onTransfer = onTransfer;  // async (payload) => void
        this.onBranchChange = onBranchChange; // (fromId) => void — tells parent to refresh stock context

        this._items = [];   // [{ id, name, sku, price, qty, maxStock, imageUrl }]
        this._branches = [];
        this._fromId = '';
        this._toId = '';
        this._branchInventory = {}; // { branch_id: { product_id: qty } }
        this._el = null;
        this._loading = false;
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    setBranches(branches, userBranchId) {
        this._branches = branches || [];
        // Default source to user's branch
        if (!this._fromId && userBranchId) this._fromId = String(userBranchId);
        this._renderBranchSelectors();
        this._renderItems();
    }

    setBranchInventory(inventory) {
        this._branchInventory = inventory || {};
        this._items.forEach(item => {
            item.maxStock = this._getSourceQty(item.id, item);
            if (item.qty > item.maxStock) item.qty = Math.max(1, item.maxStock);
        });
        // Remove items that became completely unavailable in the new source branch
        this._items = this._items.filter(i => i.maxStock > 0);
        this._renderItems();
    }

    addProduct(product) {
        // _getSourceQty uses the live inventory map when available.
        // Fall back to product.stock_quantity — getInventory already returns
        // the branch-filtered qty when location_id is set, so it's always correct.
        const sourceQty = this._getSourceQty(product.id, product);
        if (sourceQty <= 0) return 'nostock';

        const ex = this._items.find(i => i.id === product.id);
        if (ex) {
            if (ex.qty >= ex.maxStock) return 'max';
            ex.qty = Math.min(ex.qty + 1, ex.maxStock);
        } else {
            this._items.push({
                id: product.id,
                name: product.name,
                sku: product.sku || '',
                price: parseInt(product.price || 0),
                qty: 1,
                maxStock: sourceQty,
                imageUrl: product.images?.[0]?.src || product.image_url || '',
            });
        }
        this._renderItems();
        return true;
    }

    isEmpty() {
        return this._items.length === 0;
    }

    getItems() {
        return [...this._items];
    }

    /** Restore a previously-captured item list (e.g. after view re-render). */
    setItems(items) {
        if (!Array.isArray(items) || !items.length) return;
        this._items = items.map(i => ({...i}));
        this._renderItems();
    }

    clear() {
        this._items = [];
        this._renderItems();
    }

    setLoading(on) {
        this._loading = on;
        const btn = this._el?.querySelector('#tspSubmitBtn');
        if (!btn) return;
        btn.disabled = on || this._items.length === 0;
        btn.innerHTML = on
            ? `<svg class="tsp-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Processing…`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Initiate Transfer`;
    }

    render(container) {
        container.innerHTML = `
            <div class="tsp-root" id="tspRoot">
                <!-- Branch selectors -->
                <div class="tsp-branches" id="tspBranches">
                    <div class="tsp-branch-loading">Loading branches…</div>
                </div>

                <!-- Staged items -->
                <div class="tsp-items-wrap">
                    <div class="tsp-items-header">
                        <span id="tspItemCount" class="tsp-item-label">Transfer Queue</span>
                        <button class="tsp-clear-btn" id="tspClearBtn" title="Clear all">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            Clear
                        </button>
                    </div>
                    <div class="tsp-items-list" id="tspItemsList"></div>
                </div>

                <!-- Reason + Submit -->
                <div class="tsp-footer" id="tspFooter">
                    <textarea id="tspReason" class="tsp-reason" rows="2"
                        placeholder="Reason for transfer (optional)…"></textarea>
                    <button class="tsp-submit-btn" id="tspSubmitBtn" disabled>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        Initiate Transfer
                    </button>
                </div>
            </div>`;

        this._el = container.querySelector('#tspRoot');
        this._attachFooterEvents();
        this._renderBranchSelectors();
        this._renderItems();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    _getSourceQty(productId, productFallback = null) {
        // 1. Prefer the live per-branch map if we have it (most accurate)
        if (this._fromId && this._branchInventory[this._fromId]) {
            const qty = this._branchInventory[this._fromId][productId];
            if (qty !== undefined) return parseInt(qty || 0);
        }

        // 2. FALLBACK TO THE STOCK THAT CAME FROM THE GRID
        //    (this is the value that already passed the location_id filter)
        if (productFallback && productFallback.stock_quantity !== undefined) {
            return parseInt(productFallback.stock_quantity || 0);
        }

        return 0;
    }

    _renderBranchSelectors() {
        const el = this._el?.querySelector('#tspBranches');
        if (!el) return;

        if (!this._branches.length) {
            el.innerHTML = `<div class="tsp-branch-loading">Loading branches…</div>`;
            return;
        }

        const opts = (excludeId) => this._branches.map(b => `
            <option value="${esc(b.id)}" ${String(b.id) === excludeId ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

        el.innerHTML = `
            <div class="tsp-branch-row">
                <div class="tsp-branch-block">
                    <label class="tsp-branch-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 8 16 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>
                        FROM
                    </label>
                    <select class="tsp-branch-sel" id="tspFromBranch">${opts(this._fromId)}</select>
                </div>
                <div class="tsp-branch-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
                <div class="tsp-branch-block">
                    <label class="tsp-branch-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                        TO
                    </label>
                    <select class="tsp-branch-sel" id="tspToBranch">${opts(this._toId)}</select>
                </div>
            </div>`;

        const fromSel = el.querySelector('#tspFromBranch');
        const toSel = el.querySelector('#tspToBranch');

        const syncHighlight = () => {
            const sameEl = el.querySelector('.tsp-branch-same-warn');
            if (fromSel.value === toSel.value) {
                if (!sameEl) {
                    const w = document.createElement('div');
                    w.className = 'tsp-branch-same-warn';
                    w.textContent = '⚠ Source and destination must differ';
                    el.appendChild(w);
                }
            } else {
                sameEl?.remove();
            }
        };

        fromSel.addEventListener('change', () => {
            this._fromId = fromSel.value;
            syncHighlight();
            // Re-calc maxStock for all staged items from new source
            this._items.forEach(item => {
                item.maxStock = this._getSourceQty(item.id, item);
                if (item.qty > item.maxStock) item.qty = Math.max(0, item.maxStock);
            });
            // Remove items with 0 available in new source
            this._items = this._items.filter(i => i.maxStock > 0);
            this._renderItems();
            this.onBranchChange?.(this._fromId);
        });

        toSel.addEventListener('change', () => {
            this._toId = toSel.value;
            syncHighlight();
        });

        syncHighlight();
    }

    _renderItems() {
        const el = this._el?.querySelector('#tspItemsList');
        const countEl = this._el?.querySelector('#tspItemCount');
        const submitBtn = this._el?.querySelector('#tspSubmitBtn');
        if (!el) return;

        const totalQty = this._items.reduce((s, i) => s + i.qty, 0);
        if (countEl) {
            countEl.textContent = this._items.length
                ? `${this._items.length} item${this._items.length !== 1 ? 's' : ''} · ${totalQty} units`
                : 'Transfer Queue';
        }
        if (submitBtn && !this._loading) {
            submitBtn.disabled = this._items.length === 0;
        }

        if (!this._items.length) {
            el.innerHTML = `
                <div class="tsp-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(36,59,83,0.25)" stroke-width="1.5" width="32"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <div>Click products on the left to stage them for transfer</div>
                </div>`;
            return;
        }

        // FIX: Capture focused input's item ID before re-render so we can restore
        // focus afterwards, preventing keyboard-navigation breakage on qty change.
        const focusedId = document.activeElement?.dataset?.id;
        const focusedType = document.activeElement?.classList?.contains('tsp-qty-input') ? 'input' : null;

        el.innerHTML = this._items.map(item => {
            // FIX: staging items carry {maxStock} set at add-time, not stock_quantity.
            // _getSourceQty's stock_quantity fallback is undefined on staging items,
            // returning 0 for products loaded on scroll page 2+ (not in the
            // page-1 _branchInventory map).  Prefer the live map; fall back to maxStock.
            const invQty = this._fromId && this._branchInventory[this._fromId]?.[item.id] !== undefined
                ? parseInt(this._branchInventory[this._fromId][item.id])
                : null;
            const stockLeft = invQty !== null ? invQty : item.maxStock;
            const stockLabel = this._fromId
                ? `<span class="tsp-stock-avail ${stockLeft < 5 ? 'low' : ''}">${stockLeft} avail.</span>`
                : '';

            return `
<div class="tsp-item-row" data-id="${esc(item.id)}">
    <div class="tsp-item-thumb">
        ${item.imageUrl
                ? `<img src="${esc(item.imageUrl)}" alt="" loading="lazy">`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" width="16"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`}
    </div>
    <div class="tsp-item-info">
        <div class="tsp-item-name">${esc(item.name)}</div>
        <div class="tsp-item-meta">
            ${item.sku ? `<span class="tsp-item-sku">${esc(item.sku)}</span>` : ''}
            ${stockLabel}
        </div>
    </div>
    <div class="tsp-item-ctrl">
        <button class="tsp-qty-btn tsp-minus" data-id="${esc(item.id)}">−</button>
        <input class="tsp-qty-input" type="number" data-id="${esc(item.id)}"
               value="${item.qty}" min="1" max="${item.maxStock}">
        <button class="tsp-qty-btn tsp-plus" data-id="${esc(item.id)}">+</button>
    </div>
    <button class="tsp-del-btn" data-id="${esc(item.id)}" title="Remove">×</button>
</div>`;
        }).join('');

        // FIX: Restore focus to the previously-active qty input so keyboard
        // navigation continues uninterrupted after the DOM replacement.
        if (focusedId && focusedType === 'input') {
            const restored = el.querySelector(`.tsp-qty-input[data-id="${focusedId}"]`);
            if (restored) {
                restored.focus();
                restored.select();
            }
        }

        // Events
        el.querySelectorAll('.tsp-minus').forEach(b => b.addEventListener('click', () => this._changeQty(+b.dataset.id, -1)));
        el.querySelectorAll('.tsp-plus').forEach(b => b.addEventListener('click', () => this._changeQty(+b.dataset.id, +1)));
        el.querySelectorAll('.tsp-del-btn').forEach(b => b.addEventListener('click', () => this._removeItem(+b.dataset.id)));
        el.querySelectorAll('.tsp-qty-input').forEach(input => {
            input.addEventListener('change', () => {
                const id = +input.dataset.id;
                const item = this._items.find(i => i.id === id);
                if (!item) return;
                const val = Math.max(1, Math.min(parseInt(input.value) || 1, item.maxStock));
                input.value = val;
                item.qty = val;
                this._renderItems();
            });
        });
    }

    _changeQty(id, delta) {
        const item = this._items.find(i => i.id === id);
        if (!item) return;
        const next = item.qty + delta;
        if (next <= 0) {
            this._removeItem(id);
        } else if (next > item.maxStock) {
            // silently clamp
        } else {
            item.qty = next;
            this._renderItems();
        }
    }

    _removeItem(id) {
        this._items = this._items.filter(i => i.id !== id);
        this._renderItems();
    }

    _attachFooterEvents() {
        const clearBtn = this._el?.querySelector('#tspClearBtn');
        const submitBtn = this._el?.querySelector('#tspSubmitBtn');

        clearBtn?.addEventListener('click', () => {
            this._items = [];
            this._renderItems();
        });

        submitBtn?.addEventListener('click', () => this._handleSubmit());
    }

    _handleSubmit() {
        const fromId = this._el?.querySelector('#tspFromBranch')?.value || this._fromId;
        const toId = this._el?.querySelector('#tspToBranch')?.value || this._toId;
        const reason = (this._el?.querySelector('#tspReason')?.value || '').trim();

        if (!fromId) return this._toast('Please select a source branch');
        if (!toId) return this._toast('Please select a destination branch');
        if (fromId === toId) return this._toast('Source and destination must be different');
        if (!this._items.length) return this._toast('No items staged for transfer');

        const items = this._items
            .filter(i => i.qty > 0)
            .map(i => ({product_id: i.id, qty: i.qty}));

        if (!items.length) return this._toast('All quantities are zero');

        this.onTransfer({fromBranchId: fromId, toBranchId: toId, reason, items});
    }

    _toast(msg) {
        Toast.error(msg);
    }
}

module.exports = TransferStagingPanel;