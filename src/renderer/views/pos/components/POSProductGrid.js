/**
 * POSProductGrid — infinite-scroll list view with sale/featured badges
 * Architecture:
 * 1. ProductCardBuilder: Pure utility to generate product HTML.
 * 2. ImageHoverZoom: UI controller for hovering over thumbnails.
 * 3. POSProductGrid: Main orchestrator for rendering, events, and infinite scroll.
 */

/* =======================================================================
   1. ProductCardBuilder
   ======================================================================= */
class ProductCardBuilder {
    static build(p) {
        const stock = parseInt(p.stock_quantity || 0);
        const isOOS = stock <= 0;
        const isLow = stock > 0 && stock <= 5;
        const onSale = !!p.on_sale;
        const feat = !!p.featured;

        const div = document.createElement('div');
        div.className = 'pos-list-row' + (isOOS ? ' pos-list-row--oos' : '');
        div.dataset.id = p.id;

        const imgUrl = p.images?.[0]?.src || p.image_url || '';
        const img = imgUrl
            ? `<img src="${imgUrl}" class="pos-list-thumb pos-zoomable-img" loading="lazy" decoding="async" alt="product image">`
            : `<div class="pos-list-thumb" style="display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" width="18"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

        const stockBadge = isOOS
            ? `<span class="pos-badge pos-badge--oos">OOS (${stock})</span>`
            : isLow
                ? `<span class="pos-badge pos-badge--low">Low (${stock})</span>`
                : `<span class="pos-badge pos-badge--ok">${stock} in stock</span>`;

        const isBackordered = p.stock_status === 'onbackorder';
        const backorderBadge = isBackordered
            ? `<span class="pos-badge pos-badge--backorder">Backordered (${stock})</span>`
            : '';

        const price = parseInt(p.price || p.regular_price || 0);
        const regPrice = parseInt(p.regular_price || 0);

        const priceHtml = onSale && regPrice > price
            ? `<div class="pos-list-price">
                <div>${price.toLocaleString()} Frw</div>
                <div style="font-size:10px;color:#9ca3af;text-decoration:line-through;">${regPrice.toLocaleString()} Frw</div>
               </div>`
            : `<div class="pos-list-price">${price.toLocaleString()} Frw</div>`;

        const catName = p.categories?.[0]?.name || p.category_name || '';
        const barcode = p.barcode || '';

        const copyIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

        const skuChip = p.sku
            ? `<span class="pos-meta-chip" style="border-color:#2689C4;color:#2689C4;">${p.sku}</span>`
            : `<span class="pos-meta-chip" style="color:#9ca3af;">No SKU</span>`;

        div.innerHTML = `
        ${img}
        <div class="pos-list-info" style="flex:1;">
            <p class="pos-list-name" style="display:flex;align-items:center;gap:8px;">
                ${p.name}
                <button class="pos-copy-name-btn" title="Copy name" data-name="${p.name.replace(/"/g, '&quot;')}" 
                        style="background:none;border:none;padding:2px;cursor:pointer;opacity:0.7;">
                    ${copyIcon}
                </button>
            </p>
            
            <div class="pos-list-meta pos-list-meta--row1">
                ${isBackordered ? backorderBadge : stockBadge}
                ${onSale ? `<span class="pos-badge pos-badge--sale">Sale</span>` : ''}
                ${feat ? `<span class="pos-badge pos-badge--feat">★ Featured</span>` : ''}
            </div>
            
            <div class="pos-list-meta pos-list-meta--row2" style="align-items:center;gap:8px;">
                ${skuChip}
                <button class="pos-copy-sku-btn" title="Copy SKU" data-sku="${p.sku || ''}" 
                        style="background:none;border:none;padding:2px;cursor:pointer;opacity:0.7;">
                    ${copyIcon}
                </button>
                ${catName ? `<span class="pos-meta-chip">${catName}</span>` : ''}
                ${barcode ? `<span class="pos-meta-chip">EAN: ${barcode}</span>` : ''}
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
        this.overlay.style.cssText = `
            position: fixed;
            display: none;
            z-index: 99999;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            padding: 6px;
            pointer-events: none;
            transition: opacity 0.15s ease-in-out;
            opacity: 0;
        `;

        this.img = document.createElement('img');
        this.img.style.cssText = `
            max-width: 280px; 
            max-height: 280px; 
            object-fit: contain; 
            border-radius: 4px;
            display: block;
        `;

        this.overlay.appendChild(this.img);
        document.body.appendChild(this.overlay);
    }

    show(src, x, y) {
        if (!src) return;
        this.img.src = src;
        this.overlay.style.display = 'block';

        // Brief timeout to allow display:block to apply before fading in
        requestAnimationFrame(() => {
            this.overlay.style.opacity = '1';
        });

        this.move(x, y);
    }

    move(x, y) {
        if (this.overlay.style.display !== 'block') return;

        const offset = 15;
        let top = y + offset;
        let left = x + offset;

        // Prevent overlay from clipping off the screen
        const rect = this.overlay.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left = x - rect.width - offset;
        if (top + rect.height > window.innerHeight) top = y - rect.height - offset;

        this.overlay.style.top = `${top}px`;
        this.overlay.style.left = `${left}px`;
    }

    hide() {
        this.overlay.style.opacity = '0';
        // Wait for fade out before hiding
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.img.src = '';
        }, 150);
    }
}

/* =======================================================================
   3. POSProductGrid (Main Orchestrator)
   ======================================================================= */
class POSProductGrid {
    constructor({onAddToCart, onScrollEnd}) {
        this.onAddToCart = onAddToCart;
        this.onScrollEnd = onScrollEnd;
        this._products = [];
        this.zoomer = new ImageHoverZoom();
    }

    render(container) {
        container.innerHTML = `<div id="posProductList" class="pos-product-list"></div>`;
        this._list = container.querySelector('#posProductList');
        this._setupDelegation(this._list);
        this._setupScrollWatch(this._list);
        this._setupHoverZoom(this._list);
    }

    showLoading(append = false) {
        if (!append) {
            this._list.innerHTML = `<div style="padding:40px;text-align:center;color:#6b7280;font-size:13px;">Loading products…</div>`;
        } else {
            let lm = document.getElementById('posLoadMore');
            if (!lm) {
                lm = document.createElement('div');
                lm.id = 'posLoadMore';
                lm.style.cssText = 'padding:14px;text-align:center;color:#6b7280;font-size:12px;';
                lm.textContent = 'Loading more…';
                this._list.appendChild(lm);
            }
        }
    }

    removeLoadMore() {
        document.getElementById('posLoadMore')?.remove();
    }

    showError(msg = 'Failed to load products.') {
        this._list.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;font-size:13px;font-weight:600;">${msg}</div>`;
    }

    showEmpty(msg = 'No products found.') {
        this._list.innerHTML = `<div style="padding:40px;text-align:center;color:#6b7280;font-size:13px;">${msg}</div>`;
    }

    update(products, append = false) {
        this.removeLoadMore();
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
        products.forEach(p => {
            const card = ProductCardBuilder.build(p);
            frag.appendChild(card);
        });

        this._list.appendChild(frag);
    }

    flash(productId) {
        const row = this._list.querySelector(`.pos-list-row[data-id="${productId}"]`);
        if (!row) return;
        row.classList.add('pos-list-row--flash');
        setTimeout(() => row.classList.remove('pos-list-row--flash'), 300);
    }

    setSyncStatus(status, count = 0) {
        const parent = this._list.parentNode;
        let badge = parent.querySelector('#posSyncBadge');

        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'posSyncBadge';
            badge.style.cssText = 'position:absolute; top:8px; right:12px; font-size:10px; font-weight:700; padding:4px 8px; border-radius:12px; background:rgba(38,137,196,0.1); color:#2689C4; display:flex; align-items:center; gap:5px; transition:opacity 0.4s ease-in-out; pointer-events:none; z-index:10;';
            parent.style.position = 'relative';
            parent.appendChild(badge);
        }

        if (status === 'syncing') {
            badge.innerHTML = `<svg class="pos-spinner" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Syncing...`;
            badge.style.opacity = '1';
        } else if (status === 'done') {
            // Show the success checkmark and the number of items!
            badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> ${count} items cached`;
            badge.style.opacity = '1';

            // Fade it out after 3 seconds so it doesn't distract the user
            setTimeout(() => {
                if (badge.innerHTML.includes('cached')) {
                    badge.style.opacity = '0';
                }
            }, 3000);
        }
    }

    // --- Events & Delegation ---

    _setupDelegation(list) {
        list.addEventListener('click', e => {
            // 1. Check if it's a Copy Name action FIRST
            const copyNameBtn = e.target.closest('.pos-copy-name-btn');
            if (copyNameBtn) {
                e.stopPropagation();
                this._handleCopyText(copyNameBtn.dataset.name, copyNameBtn, 'Name');
                return;
            }

            // 2. Check if it's a Copy SKU action FIRST
            const copyBtn = e.target.closest('.pos-copy-sku-btn');
            if (copyBtn) {
                e.stopPropagation();
                this._handleCopyText(copyBtn.dataset.sku, copyBtn, 'SKU');
                return;
            }

            // 3. NOW check for row clicks, but block "Add to Cart" if OOS
            const row = e.target.closest('.pos-list-row');
            if (!row) return;

            // If the item is OOS or Backordered, we stop the "Add to Cart" action
            // but the copy actions above will still have worked.
            if (row.classList.contains('pos-list-row--oos')) return;

            const product = this._products.find(p => String(p.id) === row.dataset.id);
            if (product) {
                this.onAddToCart({
                    ...product,
                    price: product.price || product.regular_price || 0,
                    image_url: product.images?.[0]?.src || ''
                });
                this.flash(product.id);
            }
        });
    }

    _setupHoverZoom(list) {
        list.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'IMG' && e.target.classList.contains('pos-zoomable-img')) {
                this.zoomer.show(e.target.src, e.clientX, e.clientY);
            }
        });

        list.addEventListener('mousemove', (e) => {
            if (e.target.tagName === 'IMG' && e.target.classList.contains('pos-zoomable-img')) {
                this.zoomer.move(e.clientX, e.clientY);
            }
        });

        list.addEventListener('mouseout', (e) => {
            if (e.target.tagName === 'IMG' && e.target.classList.contains('pos-zoomable-img')) {
                this.zoomer.hide();
            }
        });
    }

    _handleCopyText(text, btn, label = 'Text') {
        const val = (text || '').trim();
        if (!val) return;

        navigator.clipboard.writeText(val).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✅';
            btn.style.color = '#10B981';
            btn.style.opacity = '1';

            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.color = '';
                btn.style.opacity = '0.7';
            }, 1400);

            if (typeof Toast !== 'undefined') {
                Toast.success(`${label} copied!`);
            }
        }).catch(() => {
            alert(`Failed to copy ${label.toLowerCase()}`);
        });
    }

    _setupScrollWatch(list) {
        list.addEventListener('scroll', () => {
            if (list.scrollTop + list.clientHeight >= list.scrollHeight - 120) {
                this.onScrollEnd?.();
            }
        }, {passive: true});
    }
}

module.exports = POSProductGrid;