const API = require('./api.js');

class StateManager {
    constructor() {
        this.user = this.loadFromStorage('faranux_user');

        // Cache for locations (persistent across tab switches)
        this.locations = [];
        this.locationsLoaded = false;

        // Cache for inventory (persistent across pagination)
        this.inventory = [];
        this.totalPages = 1;
        this.totalItems = 0;
        this.selectedIds = new Set();

        // Filters
        this.filters = {
            page: 1,
            search: '',
            status: 'publish',
            sortBy: 'name',
            sortOrder: 'ASC',
            location_id: ''
        };

        // Cache timestamp to invalidate old data (5 minutes)
        this.inventoryCacheTime = null;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    get() { return this; }

    // --- USER MANAGEMENT ---
    getUser() { return this.user; }

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
    }

    // --- INVENTORY MANAGEMENT ---
    getInventory() { return this.inventory; }

    hasInventoryData() {
        // Check if cache is still valid
        if (this.inventory.length > 0 && this.inventoryCacheTime) {
            const age = Date.now() - this.inventoryCacheTime;
            return age < this.CACHE_DURATION;
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
    }

    // --- LOCATIONS MANAGEMENT ---
    getLocations() { return this.locations; }

    setLocations(locations) {
        this.locations = locations || [];
        this.locationsLoaded = true;
    }

    async loadLocations(forceRefresh = false) {
        // Return cached locations if available and not forced
        if (this.locationsLoaded && this.locations.length > 0 && !forceRefresh) {
            return this.locations;
        }

        try {
            const res = await API.getLocations();
            if (res.status === 'success') {
                this.setLocations(res.data);
            }
        } catch (e) {
            console.error("Failed to load locations", e);
        }

        return this.locations;
    }

    // --- FILTER MANAGEMENT ---
    getFilters() { return { ...this.filters }; }

    setPage(page) {
        this.filters.page = Math.max(1, page);
    }

    setSearch(search) {
        this.filters.search = search;
        this.filters.page = 1;
        this.invalidateInventoryCache(); // Invalidate on filter change
    }

    setLocationFilter(id) {
        this.filters.location_id = id;
        this.filters.page = 1;
        this.invalidateInventoryCache();
    }

    setStatus(status) {
        this.filters.status = status;
        this.filters.page = 1;
        this.selectedIds.clear();
        this.invalidateInventoryCache();
    }

    toggleSort(field) {
        if (this.filters.sortBy === field) {
            this.filters.sortOrder = this.filters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        } else {
            this.filters.sortBy = field;
            this.filters.sortOrder = 'ASC';
        }
        this.invalidateInventoryCache();
    }

    // --- SELECTION MANAGEMENT ---
    selectProduct(id) { this.selectedIds.add(id); }

    deselectProduct(id) { this.selectedIds.delete(id); }

    toggleSelect(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
    }

    isSelected(id) { return this.selectedIds.has(id); }

    getSelectedIds() { return Array.from(this.selectedIds); }

    getSelectedCount() { return this.selectedIds.size; }

    clearSelection() { this.selectedIds.clear(); }

    // --- PRODUCT HELPERS ---
    getProduct(id) {
        return this.inventory.find(p => p.id === id);
    }

    getProducts(ids) {
        const idSet = ids instanceof Set ? ids : new Set(ids);
        return this.inventory.filter(p => idSet.has(p.id));
    }

    // --- STORAGE HELPERS ---
    loadFromStorage(key) {
        const data = localStorage.getItem(key);
        if (!data || data === "undefined") return null;
        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    saveToStorage(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
}

module.exports = new StateManager();