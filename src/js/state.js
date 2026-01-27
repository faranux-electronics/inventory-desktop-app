const api = require('./api.js');

const state = {
    view: 'dashboard',

    // Filter State
    page: 1,
    search: '',
    status: 'publish',
    sortBy: 'name',
    sortOrder: 'ASC',

    // Data Cache
    currentInventory: [],
    totalPages: 1,
    totalItems: 0,
    selectedIds: new Set(),
    locations: [],

    isSyncing: false,
    syncPage: 1
};

module.exports = {
    get: () => state,

    // Updates
    setPage: (p) => state.page = p,
    setSearch: (s) => { state.search = s; state.page = 1; },
    setStatus: (s) => { state.status = s; state.page = 1; state.selectedIds.clear(); },

    // Cache Updates
    setInventoryData: (data, totalPages, totalItems) => {
        state.currentInventory = data;
        state.totalPages = totalPages;
        state.totalItems = totalItems;
    },

    getProduct: (id) => state.currentInventory.find(p => p.id === id),
    getProducts: (ids) => state.currentInventory.filter(p => ids.has(p.id)),

    toggleSort: (field) => {
        if (state.sortBy === field) state.sortOrder = state.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        else { state.sortBy = field; state.sortOrder = 'ASC'; }
    },

    // Cache Locations (Load Once)
    loadLocations: async () => {
        if(state.locations.length === 0) {
            const res = await api.getLocations();
            if(res.status === 'success') state.locations = res.data;
        }
        return state.locations;
    },

    toggleSelect: (id) => {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
    },
    clearSelection: () => state.selectedIds.clear()
};