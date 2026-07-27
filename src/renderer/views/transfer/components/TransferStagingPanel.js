const Toast = require('../../../components/Toast.js');
const Modal = require('../../../components/Modal.js');

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class TransferStagingPanel {
    constructor({ onTransfer, onRequest, onFulfillRequest, onBranchChange }) {
        this.onTransfer = onTransfer;             // async ({fromBranchId,toBranchId,reason,items}) => void  (push)
        this.onRequest = onRequest;                // async ({fromBranchId,toBranchId,reason,items}) => void  (pull — request items FROM fromBranchId)
        this.onFulfillRequest = onFulfillRequest;  // async ({requestBatchId,itemsData,note}) => void
        this.onBranchChange = onBranchChange; // (fromId) => void — tells parent to refresh stock context

        this._items = [];   // [{ id, name, sku, price, qty, maxStock, imageUrl, requestLineId? }]
        this._branches = [];
        this._fromId = '';
        this._toId = '';
        this._branchInventory = {}; // { branch_id: { product_id: qty } }
        this._el = null;
        this._loading = false;
        this._mode = 'request';

        this._fulfillContext = null; // { requestBatchId, toBranchId, toBranchName }
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    setMode(mode) {
        if (mode !== 'send' && mode !== 'request') return;
        if (this._fulfillContext) return; // locked while fulfilling a specific request
        if (this._mode === mode) return;

        this._mode = mode;

        // Swap from/to branches so the remote branch selection is preserved
        const temp = this._fromId;
        this._fromId = this._toId;
        this._toId = temp;

        // Ensure the "me" side is strictly enforced just in case
        if (mode === 'send') {
            this._fromId = this._userBranchId || '';
        } else {
            this._toId = this._userBranchId || '';
        }

        this._enforceDefaultBranch();

        this._renderModeToggle();
        this._renderBranchSelectors();
        this._renderItems();
        this.onBranchChange?.(this._fromId, this._mode);
    }

    /** Enter "fulfill this pending request" mode: pre-stage its items and lock both branches. */
    setFulfillContext(requestBatchId, toBranchId, toBranchName, items) {
        this._fulfillContext = { requestBatchId, toBranchId, toBranchName };
        this._mode = 'send';
        this._fromId = this._userBranchId || '';
        this._toId = String(toBranchId);
        this._items = (items || []).map(i => ({
            id: i.product_id,
            requestLineId: i.request_line_id,
            name: i.name,
            sku: i.sku || '',
            price: 0,
            qty: i.qty,
            maxStock: i.maxStock,
            imageUrl: i.imageUrl || '',
        }));
        this._renderModeToggle();
        this._renderBranchSelectors();
        this._renderItems();
        this.onBranchChange?.(this._fromId, this._mode);
    }

    clearFulfillContext() {
        this._fulfillContext = null;
        this._items = [];
        this._toId = '';
        this._renderModeToggle();
        this._renderBranchSelectors();
        this._renderItems();
    }

    setBranches(branches, userBranchId) {
        this._branches = branches || [];
        this._userBranchId = userBranchId ? String(userBranchId) : null;
        if (userBranchId && !this._fulfillContext) {
            // 'send' locks FROM to my branch; 'request' locks TO to my branch instead.
            if (this._mode === 'send') this._fromId = String(userBranchId);
            else this._toId = String(userBranchId);
        }
        
        this._enforceDefaultBranch();
        
        this._renderModeToggle();
        this._renderBranchSelectors();
        this._renderItems();
        // Fire initial event so the rest of the UI knows what we defaulted to
        if (!this._fulfillContext) {
            this.onBranchChange?.(this._fromId, this._mode);
        }
    }

    _enforceDefaultBranch() {
        if (!this._branches || !this._branches.length || !this._userBranchId) return;
        const otherBranches = this._branches.filter(b => String(b.id) !== this._userBranchId);
        if (!otherBranches.length) return;

        if (this._mode === 'send' && (!this._toId || this._toId === this._userBranchId)) {
            this._toId = String(otherBranches[0].id);
        } else if (this._mode === 'request' && (!this._fromId || this._fromId === this._userBranchId)) {
            this._fromId = String(otherBranches[0].id);
        }
    }

    setBranchInventory(inventory) {
        this._branchInventory = inventory || {};

        if (this._fulfillContext) {
            this._renderItems();
            return;
        }

        this._items.forEach(item => {
            item.maxStock = this._getSourceQty(item.id, item);
            if (item.qty > item.maxStock) item.qty = Math.max(1, item.maxStock);
        });
        // Remove items that became completely unavailable in the new source branch
        this._items = this._items.filter(i => i.maxStock > 0);
        this._renderItems();
    }

    addProduct(product) {
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
        this._items = items.map(i => ({ ...i }));
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
            : this._submitButtonLabel();
    }

    _submitButtonLabel() {
        if (this._fulfillContext) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Fulfill Request`;
        }
        if (this._mode === 'request') {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 19V5M19 12l-7-7-7 7"/></svg> Request Items`;
        }
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Initiate Transfer`;
    }

    render(container) {
        container.innerHTML = `
            <div class="tsp-root" id="tspRoot">
                <!-- Mode toggle: Send stock out vs. Request stock in -->
                <div class="tsp-mode-toggle" id="tspModeToggle"></div>

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
                        placeholder="Reason / note (optional)…"></textarea>
                    <button class="tsp-submit-btn" id="tspSubmitBtn" disabled></button>
                </div>
            </div>`;

        this._el = container.querySelector('#tspRoot');
        this._attachFooterEvents();
        this._renderModeToggle();
        this._renderBranchSelectors();
        this._renderItems();
        const btn = this._el.querySelector('#tspSubmitBtn');
        if (btn) btn.innerHTML = this._submitButtonLabel();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    _getSourceQty(productId, productFallback = null) {
        // 1. Prefer the live per-branch map if we have it (most accurate)
        if (this._fromId && this._branchInventory[this._fromId]) {
            const qty = this._branchInventory[this._fromId][productId];
            if (qty !== undefined) return parseInt(qty || 0);
        }

        if (productFallback) {
            if (productFallback.stock_quantity !== undefined) {
                return parseInt(productFallback.stock_quantity || 0);
            }
            if (productFallback.maxStock !== undefined) {
                return parseInt(productFallback.maxStock || 0);
            }
        }

        return 0;
    }

    _renderModeToggle() {
        const el = this._el?.querySelector('#tspModeToggle');
        if (!el) return;

        if (this._fulfillContext) {
            el.innerHTML = `
                <div class="tsp-fulfill-banner">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Fulfilling request <strong>${esc(this._fulfillContext.requestBatchId)}</strong>
                    <button class="tsp-fulfill-exit" id="tspExitFulfill" title="Cancel and go back">&times;</button>
                </div>`;
            el.querySelector('#tspExitFulfill')?.addEventListener('click', () => this.clearFulfillContext());
            return;
        }

        el.innerHTML = `
            <button class="tsp-mode-btn ${this._mode === 'send' ? 'active' : ''}" id="tspModeSend" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12"><path d="M12 19V5M19 12l-7-7-7 7"/></svg>
                Send Stock
            </button>
            <button class="tsp-mode-btn ${this._mode === 'request' ? 'active' : ''}" id="tspModeRequest" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                Request Stock
            </button>`;

        el.querySelector('#tspModeSend').addEventListener('click', () => this.setMode('send'));
        el.querySelector('#tspModeRequest').addEventListener('click', () => this.setMode('request'));
    }

    _renderBranchSelectors() {
        const el = this._el?.querySelector('#tspBranches');
        if (!el) return;

        if (!this._branches.length) {
            el.innerHTML = `<div class="tsp-branch-loading">Loading branches…</div>`;
            return;
        }

        // Which side is locked to my branch depends on mode (or is fully locked
        // both ways when fulfilling a specific request).
        const lockFrom = !!this._fulfillContext || this._mode === 'send';
        const lockTo = !!this._fulfillContext || this._mode === 'request';

        const myBranch = this._branches.find(b => String(b.id) === this._userBranchId);

        let fromOpts;
        if (lockFrom) {
            fromOpts = myBranch
                ? `<option value="${esc(myBranch.id)}" selected>${esc(myBranch.name)}</option>`
                : `<option value="">— No branch assigned —</option>`;
        } else {
            fromOpts = this._branches
                .filter(b => String(b.id) !== this._userBranchId)
                .map(b => `<option value="${esc(b.id)}" ${String(b.id) === this._fromId ? 'selected' : ''}>${esc(b.name)}</option>`)
                .join('');
        }

        let toOpts;
        if (this._fulfillContext) {
            toOpts = `<option value="${esc(this._fulfillContext.toBranchId)}" selected>${esc(this._fulfillContext.toBranchName)}</option>`;
        } else if (lockTo) {
            toOpts = myBranch
                ? `<option value="${esc(myBranch.id)}" selected>${esc(myBranch.name)}</option>`
                : `<option value="">— No branch assigned —</option>`;
        } else {
            toOpts = this._branches
                .filter(b => String(b.id) !== this._userBranchId)
                .map(b => `<option value="${esc(b.id)}" ${String(b.id) === this._toId ? 'selected' : ''}>${esc(b.name)}</option>`)
                .join('');
        }

        const fromLabel = this._mode === 'request' && !this._fulfillContext ? 'REQUEST FROM' : 'FROM';
        const toLabel = this._mode === 'request' && !this._fulfillContext ? 'INTO (ME)' : 'TO';

        el.innerHTML = `
            <div class="tsp-branch-row">
                <div class="tsp-branch-block">
                    <label class="tsp-branch-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 8 16 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>
                        ${fromLabel}
                    </label>
                    <select class="tsp-branch-sel" id="tspFromBranch" ${lockFrom ? 'disabled' : ''}>${fromOpts}</select>
                </div>
                <div class="tsp-branch-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
                <div class="tsp-branch-block">
                    <label class="tsp-branch-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                        ${toLabel}
                    </label>
                    <select class="tsp-branch-sel" id="tspToBranch" ${(lockTo || this._fulfillContext) ? 'disabled' : ''}>${toOpts}</select>
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

            this.onBranchChange?.(this._fromId, this._mode);
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
            submitBtn.innerHTML = this._submitButtonLabel();
        }

        if (!this._items.length) {
            const emptyMsg = this._fulfillContext
                ? 'No items in this request'
                : (this._mode === 'request'
                    ? 'Click products on the left to request them'
                    : 'Click products on the left to stage them for transfer');
            el.innerHTML = `
                <div class="tsp-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(36,59,83,0.25)" stroke-width="1.5" width="32"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <div>${esc(emptyMsg)}</div>
                </div>`;
            return;
        }

        const focusedId = document.activeElement?.dataset?.id;
        const focusedType = document.activeElement?.classList?.contains('tsp-qty-input') ? 'input' : null;

        el.innerHTML = this._items.map(item => {
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

        if (!fromId) return this._toast(this._mode === 'request' ? 'Please select who to request from' : 'Please select a source branch');
        if (!toId) return this._toast('Please select a destination branch');
        if (fromId === toId) return this._toast('Source and destination must be different');
        if (!this._items.length) return this._toast('No items staged');

        const items = this._items
            .filter(i => i.qty > 0)
            .map(i => ({ product_id: i.id, qty: i.qty }));

        if (!items.length) return this._toast('All quantities are zero');

        const fromName = this._branches.find(b => String(b.id) === String(fromId))?.name || '—';
        const toName = this._branches.find(b => String(b.id) === String(toId))?.name || '—';
        const totalQty = items.reduce((s, i) => s + i.qty, 0);

        // ── Fulfilling a specific pending request ──────────────────────────
        if (this._fulfillContext) {
            Modal.open({
                title: 'Confirm Fulfillment',
                body: `<p>Send <strong>${items.length} item${items.length !== 1 ? 's' : ''}</strong> (${totalQty} units) to <strong>${esc(toName)}</strong> to fulfill request <strong>${esc(this._fulfillContext.requestBatchId)}</strong>?</p>
                       <p class="text-muted text-sm">Stock will be deducted from your branch immediately.</p>`,
                confirmText: 'Confirm & Send',
                onConfirm: async () => {
                    const itemsData = this._items
                        .filter(i => i.qty > 0)
                        .map(i => ({ id: i.requestLineId, approved_qty: i.qty }));
                    await this.onFulfillRequest({ requestBatchId: this._fulfillContext.requestBatchId, itemsData, note: reason });
                }
            });
            return;
        }

        // ── Normal send vs. request ─────────────────────────────────────────
        if (this._mode === 'request') {
            Modal.open({
                title: 'Confirm Request',
                body: `<p>Request <strong>${items.length} item${items.length !== 1 ? 's' : ''}</strong> (${totalQty} units) from <strong>${esc(fromName)}</strong>?</p>
                       <p class="text-muted text-sm">No stock moves yet — ${esc(fromName)} will review and send it.</p>`,
                confirmText: 'Send Request',
                onConfirm: async () => {
                    await this.onRequest({ fromBranchId: fromId, toBranchId: toId, reason, items });
                }
            });
        } else {
            Modal.open({
                title: 'Confirm Transfer',
                body: `<p>Send <strong>${items.length} item${items.length !== 1 ? 's' : ''}</strong> (${totalQty} units) to <strong>${esc(toName)}</strong>?</p>
                       <p class="text-muted text-sm">Stock will be deducted from your branch immediately.</p>`,
                confirmText: 'Confirm & Send',
                onConfirm: async () => {
                    await this.onTransfer({ fromBranchId: fromId, toBranchId: toId, reason, items });
                }
            });
        }
    }

    _toast(msg) {
        Toast.error(msg);
    }
}

module.exports = TransferStagingPanel;