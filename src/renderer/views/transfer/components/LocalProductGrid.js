function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =======================================================================
   1. LocalProductCardBuilder
   ======================================================================= */
class LocalProductCardBuilder {
    static build(p, locationMap = {}, focusBranchId = null) {
        // POS sets this to 'branch_stock' allowing local UI logic to disable the item
        // if the cashier has 0 stock locally.
        const localStock = parseInt(p.stock_quantity || 0);
        const transferablePool = parseInt(p.transferable_pool || 0);
        const isOOS = localStock <= 0;
        const isTransferable = isOOS && transferablePool > 0;
        const isLow = localStock > 0 && localStock <= 5;
        const isBackordered = p.stock_status === 'onbackorder';
        const onSale = !!p.on_sale;
        const feat = !!p.featured;

        const div = document.createElement('div');
        div.className = 'lpg-row'
            + (isOOS && !isTransferable ? ' lpg-row--oos' : '')
            + (isTransferable ? ' lpg-row--transferable' : '');
        div.dataset.id = p.id;

        // ── Thumbnail ──────────────────────────────────────────────────────
        const imgUrl = p.image_url || p.images?.[0]?.src || '';
        const imgHtml = imgUrl
            ? `<img src="${esc(imgUrl)}" class="lpg-thumb lpg-zoomable" loading="lazy" decoding="async" alt="">`
            : `<div class="lpg-thumb lpg-thumb--empty">
                   <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" width="16">
                       <rect x="3" y="3" width="18" height="18" rx="2"/>
                       <circle cx="8.5" cy="8.5" r="1.5"/>
                       <polyline points="21 15 16 10 5 21"/>
                   </svg>
               </div>`;
        let primaryBadge;
        if (isBackordered) {
            primaryBadge = `<span class="lpg-badge lpg-badge--backorder">Backorder</span>`;
        } else if (isTransferable) {
            primaryBadge = `<span class="lpg-badge lpg-badge--transferable">Transferable</span>`;
        } else if (isOOS) {
            primaryBadge = `<span class="lpg-badge lpg-badge--oos">Out of Stock</span>`;
        } else if (isLow) {
            primaryBadge = `<span class="lpg-badge lpg-badge--low">Low (${localStock})</span>`;
        }

        const wcLabel = transferablePool > 0
            ? `<span class="lpg-wc-badge" title="Sum of stock across other branches">Available Elsewhere: ${transferablePool}</span>`
            : '';
        let breakdownHtml = '';
        const branchStocks = {};
        const breakdown = [];

        if (p.stock_breakdown) {
            p.stock_breakdown.toString().split(',').forEach(pair => {
                const colonIdx = pair.lastIndexOf(':');
                if (colonIdx === -1) return;
                const lid = pair.substring(0, colonIdx).trim();
                const qty = parseInt(pair.substring(colonIdx + 1).trim() || 0);
                branchStocks[lid] = qty;
                breakdown.push({ lid, qty });
            });
        }

        // Ensure focus branch is included even if missing from breakdown (shows as 0)
        if (focusBranchId && !branchStocks.hasOwnProperty(String(focusBranchId)) && !branchStocks.hasOwnProperty(Number(focusBranchId))) {
            breakdown.push({ lid: String(focusBranchId), qty: 0 });
            branchStocks[String(focusBranchId)] = 0;
        }

        if (breakdown.length > 0) {
            const badges = breakdown.map(({ lid, qty }) => {
                const name = locationMap[lid] || locationMap[String(lid)] || locationMap[Number(lid)] || `#${esc(lid)}`;
                const isFocus = focusBranchId && String(lid) === String(focusBranchId);

                if (qty === 0 && !isFocus) return '';

                let cls = 'lpg-branch-badge';
                if (isFocus) cls += ' lpg-branch-badge--focus';
                if (qty <= 0) cls += ' lpg-branch-badge--zero';
                else if (qty < 5) cls += ' lpg-branch-badge--low';
                else if (qty > 50) cls += ' lpg-branch-badge--high';

                return `<span class="${esc(cls)}" title="${esc(name)}">${esc(name)}: <strong>${qty}</strong></span>`;
            }).filter(Boolean).join('');

            if (badges) breakdownHtml = `<div class="lpg-breakdown">${badges}</div>`;
        }

        // ── Price (Enhanced with POS Strikethrough Logic) ──────────────────
        const price = parseInt(p.price || p.regular_price || 0);
        const regPrice = parseInt(p.regular_price || 0);

        let priceHtml;
        if (onSale && regPrice > price) {
            priceHtml = `<div class="lpg-price">
                <div>${price.toLocaleString()} <span class="lpg-currency">Frw</span></div>
                <div style="font-size:10px;color:#9ca3af;text-decoration:line-through;margin-top:2px;font-weight:normal;">${regPrice.toLocaleString()} Frw</div>
               </div>`;
        } else if (price > 0) {
            priceHtml = `<div class="lpg-price">${price.toLocaleString()} <span class="lpg-currency">Frw</span></div>`;
        } else {
            priceHtml = `<div class="lpg-price lpg-price--none">—</div>`;
        }

        // ── Row 2: SKU + copy-SKU + category + barcode ─
        const catName = p.category || p.category_name || p.categories?.[0]?.name || '';

        const copyIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

        const skuChip = p.sku
            ? `<span class="lpg-chip lpg-chip--sku">${esc(p.sku)}</span>
               <button class="lpg-copy-btn" data-copy="${esc(p.sku)}" data-label="SKU" title="Copy SKU">${copyIcon}</button>`
            : `<span class="lpg-chip lpg-chip--nosku">No SKU</span>`;

        div.innerHTML = `
            ${imgHtml}
            <div class="lpg-info">
                <div class="lpg-name-row">
                    <span class="lpg-name">${esc(p.name)}</span>
                    <button class="lpg-copy-btn" data-copy="${esc(p.name)}" data-label="Name" title="Copy name">${copyIcon}</button>
                </div>
                <div class="lpg-meta-row">
                    ${primaryBadge || ''}
                    ${wcLabel}
                    ${breakdownHtml}
                    ${onSale ? `<span class="lpg-badge lpg-badge--sale">Sale</span>` : ''}
                    ${feat ? `<span class="lpg-badge lpg-badge--feat">★ Featured</span>` : ''}
                </div>
                <div class="lpg-meta-row lpg-meta-row--2">
                    ${skuChip}
                    ${catName ? `<span class="lpg-chip">${esc(catName)}</span>` : ''}
                    ${p.barcode ? `<span class="lpg-chip">EAN: ${esc(p.barcode)}</span>` : ''}
                    ${p.product_url ? ` | <span class="lpg-chip"><a href="${p.product_url}" target="_blank">View on Web</a></span>` : ''}
                </div>
            </div>
            ${priceHtml}`;

        return div;
    }
}

/* =======================================================================
   2. ImageHoverZoom
   ======================================================================= */
class ImageHoverZoom {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = [
            'position:fixed', 'display:none', 'z-index:99999',
            'background:#fff', 'border:1px solid #e2e8f0', 'border-radius:8px',
            'box-shadow:0 10px 25px rgba(0,0,0,.18)', 'padding:6px',
            'pointer-events:none', 'transition:opacity .15s', 'opacity:0'
        ].join(';');

        this.img = document.createElement('img');
        this.img.style.cssText = 'max-width:260px;max-height:260px;object-fit:contain;border-radius:4px;display:block;';
        this.overlay.appendChild(this.img);
        document.body.appendChild(this.overlay);
    }

    show(src, x, y) {
        if (!src) return;
        this.img.src = src;
        this.overlay.style.display = 'block';
        requestAnimationFrame(() => {
            this.overlay.style.opacity = '1';
        });
        this.move(x, y);
    }

    move(x, y) {
        if (this.overlay.style.display !== 'block') return;
        const off = 15;
        let top = y + off, left = x + off;
        const r = this.overlay.getBoundingClientRect();
        if (left + r.width > window.innerWidth) left = x - r.width - off;
        if (top + r.height > window.innerHeight) top = y - r.height - off;
        this.overlay.style.top = `${top}px`;
        this.overlay.style.left = `${left}px`;
    }

    hide() {
        this.overlay.style.opacity = '0';
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.img.src = '';
        }, 150);
    }
}

/* =======================================================================
   3. LocalProductGrid
   ======================================================================= */
class LocalProductGrid {
    constructor({onSelect, onScrollEnd}) {
        this.onSelect = onSelect;
        this.onScrollEnd = onScrollEnd;

        this._products = [];
        this._locationMap = {};
        this._focusBranchId = null;

        this._list = null;
        this._zoomer = new ImageHoverZoom();
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    getProducts() {
        return [...this._products];
    }

    setLocationMap(map) {
        this._locationMap = map || {};
    }

    setFocusBranch(branchId) {
        this._focusBranchId = branchId ? String(branchId) : null;
    }

    render(container) {
        container.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'lpg-list';
        container.appendChild(list);
        this._list = list;
        this._setupDelegation();
    }

    update(products, append = false) {
        this._removeLoadMore();

        if (!append) {
            this._products = [...products];
            this._list.innerHTML = '';
        } else {
            this._products = this._products.concat(products);
        }

        if (!products.length && !this._products.length) {
            this.showEmpty();
            return;
        }

        const frag = document.createDocumentFragment();
        products.forEach(p => frag.appendChild(
            LocalProductCardBuilder.build(p, this._locationMap, this._focusBranchId)
        ));
        this._list.appendChild(frag);
    }

    sortByStock(direction = 'desc') {
        if (!this._products || !this._products.length) return;

        this._products.sort((a, b) => {
            const stockA = parseInt(a.stock_quantity || 0, 10);
            const stockB = parseInt(b.stock_quantity || 0, 10);
            return direction === 'asc' ? stockA - stockB : stockB - stockA;
        });

        this._list.innerHTML = '';

        const frag = document.createDocumentFragment();
        this._products.forEach(p => frag.appendChild(
            LocalProductCardBuilder.build(p, this._locationMap, this._focusBranchId)
        ));
        this._list.appendChild(frag);
    }

    refreshCards() {
        const items = this._list.querySelectorAll('.lpg-row');
        items.forEach(el => {
            const id = el.dataset.id;
            const p = this._products.find(pr => String(pr.id) === String(id));
            if (!p) return;
            const fresh = LocalProductCardBuilder.build(p, this._locationMap, this._focusBranchId);
            el.replaceWith(fresh);
        });
        this._setupDelegation();
    }

    showLoading(append = false) {
        if (!append) {
            this._list.innerHTML = `
                <div class="lpg-state">
                    <svg class="lpg-spinner" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2689C4" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/>
                    </svg>
                    <span>Loading products…</span>
                </div>`;
        } else {
            if (document.getElementById('lpgLoadMore')) return;
            const lm = document.createElement('div');
            lm.id = 'lpgLoadMore';
            lm.className = 'lpg-load-more';
            lm.textContent = 'Loading more…';
            this._list.appendChild(lm);
        }
    }

    showEmpty(msg = 'No products found. Check your filters or search query.') {
        this._list.innerHTML = `
            <div class="lpg-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="rgba(36,59,83,.25)" stroke-width="1.5" width="36">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>${esc(msg)}</span>
            </div>`;
    }

    showError(msg = 'Failed to load products.') {
        this._list.innerHTML = `<div class="lpg-state lpg-state--error">${esc(msg)}</div>`;
    }

    flash(productId) {
        const row = this._list.querySelector(`.lpg-row[data-id="${productId}"]`);
        if (!row) return;
        row.classList.add('lpg-row--flash');
        setTimeout(() => row.classList.remove('lpg-row--flash'), 320);
    }

    setSyncStatus(status, count = 0) {
        const parent = this._list?.parentNode;
        if (!parent) return;

        let badge = parent.querySelector('#lpgSyncBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'lpgSyncBadge';
            badge.style.cssText = [
                'position:absolute', 'top:8px', 'right:12px', 'font-size:10px',
                'font-weight:700', 'padding:4px 8px', 'border-radius:12px',
                'background:rgba(38,137,196,.1)', 'color:#2689C4',
                'display:flex', 'align-items:center', 'gap:5px',
                'transition:opacity .4s', 'pointer-events:none', 'z-index:10'
            ].join(';');
            parent.style.position = 'relative';
            parent.appendChild(badge);
        }

        if (status === 'syncing') {
            badge.innerHTML = `<svg class="lpg-spinner" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Syncing…`;
            badge.style.opacity = '1';
        } else if (status === 'done') {
            badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> ${parseInt(count) || 0} products`;
            badge.style.opacity = '1';
            setTimeout(() => {
                badge.style.opacity = '0';
            }, 3000);
        }
    }

    // ─── Private ───────────────────────────────────────────────────────────────

    _removeLoadMore() {
        document.getElementById('lpgLoadMore')?.remove();
    }

    _setupDelegation() {
        const old = this._list;
        const fresh = old.cloneNode(true);
        old.replaceWith(fresh);
        this._list = fresh;

        this._setupHoverZoom();
        this._setupScrollWatch();

        this._list.addEventListener('click', e => {
            const copyBtn = e.target.closest('.lpg-copy-btn');
            if (copyBtn) {
                e.stopPropagation();
                this._handleCopy(copyBtn.dataset.copy, copyBtn, copyBtn.dataset.label);
                return;
            }

            const row = e.target.closest('.lpg-row');
            if (!row) return;

            const product = this._products.find(p => String(p.id) === row.dataset.id);
            if (product) {
                this.onSelect({...product});
                this.flash(product.id);
            }
        });
    }

    _setupHoverZoom() {
        this._list.addEventListener('mouseover', e => {
            if (e.target.tagName === 'IMG' && e.target.classList.contains('lpg-zoomable'))
                this._zoomer.show(e.target.src, e.clientX, e.clientY);
        });
        this._list.addEventListener('mousemove', e => {
            if (e.target.tagName === 'IMG' && e.target.classList.contains('lpg-zoomable'))
                this._zoomer.move(e.clientX, e.clientY);
        });
        this._list.addEventListener('mouseout', e => {
            if (e.target.tagName === 'IMG' && e.target.classList.contains('lpg-zoomable'))
                this._zoomer.hide();
        });
    }

    _setupScrollWatch() {
        this._list.addEventListener('scroll', () => {
            if (this._list.scrollTop + this._list.clientHeight >= this._list.scrollHeight - 120)
                this.onScrollEnd?.();
        }, {passive: true});
    }

    _handleCopy(text, btn, label = 'Text') {
        const val = (text || '').trim();
        if (!val) return;
        navigator.clipboard.writeText(val).then(() => {
            const orig = btn.innerHTML;
            btn.innerHTML = '✅';
            btn.style.opacity = '1';
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.opacity = '';
            }, 1400);
        }).catch(() => alert(`Failed to copy ${label}`));
    }
}

module.exports = LocalProductGrid;