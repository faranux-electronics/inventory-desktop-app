/**
 * POSSearchBar — search input + category filter
 * Emits: onSearch(query), onCategory(category)
 */
class POSSearchBar {
    constructor({ onSearch, onCategory }) {
        this.onSearch   = onSearch;
        this.onCategory = onCategory;
        this._timer     = null;
    }

    render(container) {
        container.innerHTML = `
            <div class="pos-searchbar">
                <div class="pos-search-wrap">
                    <svg class="pos-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input id="posSearch" type="text" class="pos-search-input" placeholder="Search products or scan barcode…" autocomplete="off" spellcheck="false">
                    <kbd class="pos-search-kbd">⌘K</kbd>
                </div>
                <select id="posCategory" class="pos-category-select">
                    <option value="">All Categories</option>
                </select>
            </div>`;
        this._attach(container);
    }

    populateCategories(categories) {
        const sel = document.getElementById('posCategory');
        if (!sel) return;
        categories.forEach(c => {
            const parts  = c.split('>');
            const indent = '\u00a0'.repeat((parts.length - 1) * 3);
            const opt    = document.createElement('option');
            opt.value       = c;
            opt.textContent = indent + parts[parts.length - 1].trim();
            sel.appendChild(opt);
        });
    }

    focus() { document.getElementById('posSearch')?.focus(); }

    _attach(container) {
        container.querySelector('#posSearch').addEventListener('input', e => {
            clearTimeout(this._timer);
            this._timer = setTimeout(() => this.onSearch(e.target.value), 380);
        });
        container.querySelector('#posCategory').addEventListener('change', e => this.onCategory(e.target.value));
        document.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.focus(); }
        });
    }
}

module.exports = POSSearchBar;