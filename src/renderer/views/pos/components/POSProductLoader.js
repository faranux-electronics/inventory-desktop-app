/**
 * POSProductLoader — owns product fetching, pagination, and cache-validity
 * logic for the POS grid. Extracted from POSView.js so filter/stock-status
 * logic (all/instock/outofstock/onbackorder/transferable/...) lives in one
 * place instead of being interleaved with cart, layout, and live-cart code.
 */
class POSProductLoader {
    constructor({ api, getUser, productGrid }) {
        this.api = api;
        this.getUser = getUser;
        this.productGrid = productGrid;

        this.query = '';
        this.category = '';
        this.stockFilter = 'all';
        this.featured = false;

        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;

        this._productCache = [];
        this._cacheParams = null;
        this._syncSession = 0;
        this._reloadDebounce = null;
    }

    // ─── Filter state ──────────────────────────────────────────────────────

    setFilters({ query, category, stockFilter, featured }) {
        this.query = query;
        this.category = category;
        this.stockFilter = stockFilter;
        this.featured = featured;
    }

    getFilters() {
        return {
            query: this.query, category: this.category,
            stockFilter: this.stockFilter, featured: this.featured
        };
    }

    get allLoaded() { return this._allLoaded; }
    get loadingPage() { return this._loadingPage; }
    get currentPage() { return this._currentPage; }
    getCache() { return this._productCache; }

    // ─── Cache validity ────────────────────────────────────────────────────

    isCacheValid() {
        if (!this._cacheParams) return false;
        const branchId = this.getUser()?.branch_id || '';
        return (
            this._cacheParams.query === this.query &&
            this._cacheParams.category === this.category &&
            this._cacheParams.stockFilter === this.stockFilter &&
            this._cacheParams.featured === this.featured &&
            this._cacheParams.branchId === branchId
        );
    }

    _updateCacheParams() {
        const branchId = this.getUser()?.branch_id || '';
        this._cacheParams = {
            query: this.query, category: this.category,
            stockFilter: this.stockFilter, featured: this.featured,
            branchId
        };
    }

    // ─── Lifecycle resets ──────────────────────────────────────────────────

    resetPaging() {
        this._loadingPage = false;
        this._allLoaded = false;
        this._currentPage = 1;
    }

    /** Renders from cache immediately if valid. Returns true if it did. */
    renderFromCacheIfValid() {
        if (this.isCacheValid() && this._productCache.length > 0) {
            this.productGrid.update(this._productCache, false);
            this._currentPage = 1;
            this._allLoaded = true;
            return true;
        }
        return false;
    }

    // ─── Loading ───────────────────────────────────────────────────────────

    /** Debounced full reload (e.g. after a filter change). */
    reload() {
        this._allLoaded = false;
        this._currentPage = 1;
        this._productCache = [];
        this._cacheParams = null;
        clearTimeout(this._reloadDebounce);
        return new Promise(resolve => {
            this._reloadDebounce = setTimeout(() => this.load(1, false).then(resolve), 220);
        });
    }

    async loadMore() {
        if (this._loadingPage || this._allLoaded) return;
        await this.load(this._currentPage + 1, true);
    }

    /** Initial boot fetch (page 1, no pre-existing cache check). */
    async fetchInitial() {
        this._currentPage = 1;
        this._allLoaded = false;
        const session = this._syncSession = (this._syncSession || 0) + 1;
        this.productGrid.showLoading(false);
        const branchId = this.getUser()?.branch_id || '';

        try {
            const res = await this.api.posGetInventory(
                1, this.query, branchId, this.category, this.stockFilter, this.featured
            );
            if (session !== this._syncSession) return;

            this.productGrid.update(res?.data || [], false);
            if (1 >= (res?.pagination?.pages || 1)) this._allLoaded = true;

            this._productCache = res?.data || [];
            this._updateCacheParams();
        } catch (e) {
            if (session === this._syncSession) this.productGrid.showError(`Error: ${e.message}`);
        } finally {
            if (session === this._syncSession) this._loadingPage = false;
        }
    }

    /** Paged load — page 1 (fresh) or page N (append via infinite scroll). */
    async load(page, append) {
        if (this._loadingPage && append) return;

        if (!append && page === 1 && this.renderFromCacheIfValid()) return;

        const session = this._syncSession = (this._syncSession || 0) + 1;

        if (append) this.productGrid.setSyncStatus('syncing');
        else this.productGrid.showLoading(false);

        this._loadingPage = true;
        const branchId = this.getUser()?.branch_id || '';

        try {
            const res = await this.api.posGetInventory(
                page, this.query, branchId, this.category, this.stockFilter, this.featured
            );
            if (session !== this._syncSession) return;

            if (res.status !== 'success') {
                if (!append) this.productGrid.showError(res.message || 'Failed to load products.');
                return;
            }

            const products = res.data || [];
            if (products.length === 0) {
                if (!append) this.productGrid.showEmpty();
                this._allLoaded = true;
                return;
            }

            this.productGrid.update(products, append);

            if (!append && page === 1) {
                this._productCache = products;
                this._updateCacheParams();
            } else if (append) {
                this._productCache = [...this._productCache, ...products];
            }

            this._currentPage = page;
            if (page >= (res.pagination?.pages || 1)) this._allLoaded = true;
            if (append) this.productGrid.setSyncStatus('done', products.length);

        } catch (e) {
            if (session === this._syncSession && !append) {
                this.productGrid.showError(`Error: ${e.message}`);
            }
        } finally {
            if (session === this._syncSession) this._loadingPage = false;
        }
    }
}

module.exports = POSProductLoader;