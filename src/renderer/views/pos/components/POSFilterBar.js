/**
 * POSFilterBar — search, category, stock status, on-sale, featured filters
 */
class POSFilterBar {
    constructor({ initialQuery='', initialCategory='', initialStockFilter='all',
                    initialOnSale = false, initialFeatured = false, minimal = false, onFilter
                }) {
        this.onFilter = onFilter;
        this._q = initialQuery;
        this._cat = initialCategory;
        this._stock = initialStockFilter;
        this._onSale = initialOnSale;
        this._featured = initialFeatured;
        this._minimal = minimal;   // when true: only search + category, no chip row
        this._timer = null;
    }

    render(container) {
        container.innerHTML = `
        <div class="pos-filter-bar">
            <div class="pos-search-row">
                <div class="pos-search-wrap">
                    <svg class="pos-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input id="posSearch" type="text" class="pos-search-input" placeholder="Search products or scan barcode…" autocomplete="off" spellcheck="false" value="${this._q}">
                </div>
                <select id="posCategory" class="pos-category-select">
                    <option value="">All Categories</option>
                </select>
            </div>
            ${this._minimal ? '' : `
            <div class="pos-filter-chips" id="posFilterChips">
                <span style="font-size:10px;color:#9ca3af;font-weight:600;margin-right:2px;">STOCK:</span>
                <button class="pos-chip ${this._stock==='all' ? 'active' : ''}" data-stock="all">All</button>
                <button class="pos-chip ${this._stock==='instock' ? 'active' : ''}" data-stock="instock">
                    <svg viewBox="0 0 10 10" width="8"><circle cx="5" cy="5" r="4" fill="#16a34a"/></svg> In Stock
                </button>
                <button class="pos-chip ${this._stock==='outofstock' ? 'active' : ''}" data-stock="outofstock">
                    <svg viewBox="0 0 10 10" width="8"><circle cx="5" cy="5" r="4" fill="#dc2626"/></svg> OOS
                </button>
                <button class="pos-chip ${this._stock==='onbackorder' ? 'active' : ''}" data-stock="onbackorder">
                    <svg viewBox="0 0 10 10" width="8"><circle cx="5" cy="5" r="4" fill="#d97706"/></svg> Backorder
                </button>
                <span style="width:1px;background:#e5e7eb;margin:0 4px;height:16px;"></span>
                <button class="pos-chip pos-chip--sale ${this._onSale ? 'active' : ''}" id="posOnSaleChip">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
                    On Sale
                </button>
                <button class="pos-chip pos-chip--feat ${this._featured ? 'active' : ''}" id="posFeaturedChip">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Featured
                </button>
            </div>`}
        </div>`;

        this._attach(container);
    }

    populateCategories(categories) {
        const sel = document.getElementById('posCategory');
        if (!sel) return;
        // Support flat list of strings or WC category objects {id, name, slug}
        if (Array.isArray(categories) && categories.length) {
            if (typeof categories[0] === 'object') {
                categories.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.slug || c.id || c.name;
                    opt.textContent = c.name;
                    if (opt.value === this._cat) opt.selected = true;
                    sel.appendChild(opt);
                });
            } else {
                categories.forEach(c => {
                    const parts = c.split('>');
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = '\u00a0'.repeat((parts.length - 1) * 3) + parts[parts.length - 1].trim();
                    if (c === this._cat) opt.selected = true;
                    sel.appendChild(opt);
                });
            }
        }
    }

    focus() { document.getElementById('posSearch')?.focus(); }

    _emit() {
        this.onFilter({
            query:       this._q,
            category:    this._cat,
            stockFilter: this._stock,
            onSale:      this._onSale,
            featured:    this._featured
        });
    }

    _attach(container) {
        const search = container.querySelector('#posSearch');
        const catSel = container.querySelector('#posCategory');

        search.addEventListener('input', e => {
            this._q = e.target.value;
            clearTimeout(this._timer);
            this._timer = setTimeout(() => this._emit(), 380);
        });

        catSel.addEventListener('change', e => {
            this._cat = e.target.value;
            this._emit();
        });

        container.querySelectorAll('.pos-chip[data-stock]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._stock = btn.dataset.stock;
                container.querySelectorAll('.pos-chip[data-stock]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._emit();
            });
        });

        const onSaleChip = container.querySelector('#posOnSaleChip');
        if (onSaleChip) {
            onSaleChip.addEventListener('click', () => {
                this._onSale = !this._onSale;
                onSaleChip.classList.toggle('active', this._onSale);
                this._emit();
            });
        }

        const featChip = container.querySelector('#posFeaturedChip');
        if (featChip) {
            featChip.addEventListener('click', () => {
                this._featured = !this._featured;
                featChip.classList.toggle('active', this._featured);
                this._emit();
            });
        }

        document.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.focus(); }
        });
    }
}

module.exports = POSFilterBar;