const API = require('./api.js');

class StateManager {
    constructor() {
        this.user = this.loadFromStorage('faranux_user');
        this.locations = [];
        this.locationsLoaded = false;
        this.inventory = [];
        this.totalPages = 1;
        this.totalItems = 0;
        this.selectedIds = new Set();

        this.filters = {
            page: 1, search: '', status: 'publish', sortBy: 'name', sortOrder: 'ASC', location_id: '', category: ''
        };

        this.inventoryCacheTime = null;
        this.CACHE_DURATION = 5 * 60 * 1000;
        this.TAB_CACHE_DURATION = 12 * 60 * 60 * 1000;
        this.WC_CACHE_DURATION = 15 * 60 * 1000;

        const savedTabs = this.loadFromStorage('faranux_tab_states') || {};
        this.tabStates = new Map(Object.entries(savedTabs));

        const savedWc = this.loadFromStorage('faranux_wc_cache') || {};
        this.wcProductsCache = new Map(Object.entries(savedWc));

        // --- NEW: Master Product Catalog (Offline Search DB) ---
        const savedCatalog = this.loadFromStorage('faranux_catalog') || [];
        this.productCatalog = new Map(savedCatalog.map(p => [p.id, p]));
    }

    getCatalogCount() {
        return this.productCatalog ? this.productCatalog.size : 0;
    }

    searchLocalCatalog({ query, category, stockFilter, onSale, featured }) {
        let results = Array.from(this.productCatalog.values());

        // Hide drafts/private/any non-published products from the local catalog.
        // syncProducts() now always includes the 'status' field, so this check is strict.
        results = results.filter(p => p.status === 'publish');

        if (query) {
            const q = query.toLowerCase();
            results = results.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.sku && p.sku.toLowerCase().includes(q)) ||
                (p.barcode && p.barcode.toLowerCase().includes(q))
            );
        }

        if (category) {
            results = results.filter(p => {
                if (p.categories && p.categories.some(c => c.slug === category || c.name === category || String(c.id) === String(category))) return true;
                return !!(p.category_name && p.category_name === category);

            });
        }

        if (stockFilter && stockFilter !== 'all') {
            results = results.filter(p => {
                const stock  = parseInt(p.stock_quantity || 0);
                // Change 'const' to 'let' so we can modify it
                let status = p.stock_status || (stock > 0 ? 'instock' : 'outofstock');

                // FIX: Force 'outofstock' if WooCommerce wrongly says 'instock' but qty is 0
                if (stock <= 0 && status === 'instock') {
                    status = 'outofstock';
                }

                if (stockFilter === 'instock')     return status === 'instock'    || (stock > 0 && status !== 'onbackorder');
                if (stockFilter === 'outofstock')  return status === 'outofstock' || (stock <= 0 && status !== 'onbackorder');
                if (stockFilter === 'lowstock')    return stock > 0 && stock <= 5 && status !== 'onbackorder';
                if (stockFilter === 'backordered' || stockFilter === 'onbackorder') return status === 'onbackorder';

                return false;
            });
        }

        if (onSale)    results = results.filter(p => !!p.on_sale);
        if (featured)  results = results.filter(p => !!p.featured);

        // Sort by name ASC to match the server's default sort order,
        // preventing a visual shuffle when the network response arrives.
        results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        return results;
    }

    // --- Standard Methods ---
    get() { return this; }
    getUser() { return this.user; }
    getUserBranchId() { return this.user?.branch_id || null; }

    setUser(user) {
        this.user = user;
        this.saveToStorage('faranux_user', user);
    }

    logout() {
        this.user = null;
        this.locations = [];
        this.locationsLoaded = false;
        this.inventory = [];
        this.selectedIds.clear();
        this.inventoryCacheTime = null;
        localStorage.removeItem('faranux_user');

        this.clearAllTabStates();
        this.clearWCCache();
        this.productCatalog.clear();
        localStorage.removeItem('faranux_catalog');
    }

    getWCCachedProducts(cacheKey) {
        const cached = this.wcProductsCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.WC_CACHE_DURATION)) return cached.data;
        return null;
    }

    // Update this method in state.js
    setWCCachedProducts(cacheKey, data) {
        // Prevent RAM bloat: keep only the 10 most recent search queries
        if (this.wcProductsCache.size >= 10) {
            const oldestKey = this.wcProductsCache.keys().next().value;
            this.wcProductsCache.delete(oldestKey);
        }

        this.wcProductsCache.set(cacheKey, { data, timestamp: Date.now() });

        try {
            this.saveToStorage('faranux_wc_cache', Object.fromEntries(this.wcProductsCache));
        } catch (e) {
            console.warn("Storage quota exceeded for WC queries. Clearing older cache...");
            this.wcProductsCache.clear(); // Nuke the old cache
            this.wcProductsCache.set(cacheKey, { data, timestamp: Date.now() }); // Keep just the current one
            try { this.saveToStorage('faranux_wc_cache', Object.fromEntries(this.wcProductsCache)); } catch(err){}
        }
    }

    // Update this method in state.js
    syncCatalog(products) {
        if (!products || !products.length) return;
        products.forEach(p => this.productCatalog.set(p.id, p));

        try {
            const arr = Array.from(this.productCatalog.values());
            // Hard limit the offline catalog to 3,000 items so it never blows up LocalStorage
            if (arr.length > 3000) arr.splice(0, arr.length - 3000);
            this.saveToStorage('faranux_catalog', arr);
        } catch (e) {
            console.warn("Storage quota exceeded for Master Catalog. Running from memory.");
            // If it still fails, shrink the array drastically and try once more
            try {
                const arr = Array.from(this.productCatalog.values()).slice(-500);
                this.saveToStorage('faranux_catalog', arr);
            } catch (err) {}
        }
    }

    clearWCCache() {
        this.wcProductsCache.clear();
        this.saveToStorage('faranux_wc_cache', {});
    }

    getInventory() { return this.inventory; }

    hasInventoryData() {
        if (this.inventory.length > 0 && this.inventoryCacheTime) {
            return (Date.now() - this.inventoryCacheTime) < this.CACHE_DURATION;
        }
        return false;
    }

    setInventoryData(data, totalPages, totalItems) {
        this.inventory = data || [];
        this.totalPages = totalPages || 1;
        this.totalItems = totalItems || 0;
        this.inventoryCacheTime = Date.now();
    }

    invalidateInventoryCache() {
        this.inventoryCacheTime = null;
        this.inventory = [];
        this.clearWCCache();
    }

    getLocations() { return this.locations; }

    setLocations(locations) {
        this.locations = locations || [];
        this.locationsLoaded = true;
    }

    async loadLocations(forceRefresh = false) {
        if (this.locationsLoaded && this.locations.length > 0 && !forceRefresh) return this.locations;
        try {
            const res = await API.getLocations();
            if (res.status === 'success') this.setLocations(res.data);
        } catch (e) { console.error("Failed to load locations", e); }
        return this.locations;
    }

    getFilters() { return { ...this.filters }; }
    setPage(page) { this.filters.page = Math.max(1, page); }
    setSearch(search) { this.filters.search = search; this.filters.page = 1; }
    setLocationFilter(id) { this.filters.location_id = id; this.filters.page = 1; this.invalidateInventoryCache(); }
    setStatus(status) { this.filters.status = status; this.filters.page = 1; this.selectedIds.clear(); this.invalidateInventoryCache(); }
    setCategory(category) { this.filters.category = category; this.filters.page = 1; }

    toggleSort(field) {
        if (this.filters.sortBy === field) this.filters.sortOrder = this.filters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        else { this.filters.sortBy = field; this.filters.sortOrder = 'ASC'; }
        this.invalidateInventoryCache();
    }

    selectProduct(id) { this.selectedIds.add(id); }
    deselectProduct(id) { this.selectedIds.delete(id); }
    toggleSelect(id) { this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id); }
    isSelected(id) { return this.selectedIds.has(id); }
    getSelectedIds() { return Array.from(this.selectedIds); }
    getSelectedCount() { return this.selectedIds.size; }
    clearSelection() { this.selectedIds.clear(); }
    getProduct(id) { return this.inventory.find(p => p.id === id); }

    getProducts(ids) {
        const idSet = ids instanceof Set ? ids : new Set(ids);
        return this.inventory.filter(p => idSet.has(p.id));
    }

    loadFromStorage(key) {
        const data = localStorage.getItem(key);
        if (!data || data === "undefined") return null;
        try { return JSON.parse(data); } catch (e) { return null; }
    }

    saveToStorage(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

    saveTabState(tabId, state) {
        this.tabStates.set(tabId, { state: state, timestamp: Date.now() });
        this.saveToStorage('faranux_tab_states', Object.fromEntries(this.tabStates));
    }

    getTabState(tabId) {
        const cachedData = this.tabStates.get(tabId);
        if (!cachedData) return null;
        if (Date.now() - cachedData.timestamp > this.TAB_CACHE_DURATION) {
            this.tabStates.delete(tabId);
            this.saveToStorage('faranux_tab_states', Object.fromEntries(this.tabStates));
            return null;
        }
        return cachedData.state;
    }

    clearTabState(tabId) {
        this.tabStates.delete(tabId);
        this.saveToStorage('faranux_tab_states', Object.fromEntries(this.tabStates));
    }

    clearAllTabStates() {
        this.tabStates.clear();
        this.saveToStorage('faranux_tab_states', {});
    }

    getNavPermissions() {
        return this.navPermissions || null;
    }

    setNavPermissions(permissions) {
        this.navPermissions = permissions;
        // Optionally persist across sessions:
        // this.saveToStorage('faranux_nav_permissions', permissions);
    }
}

module.exports = new StateManager();