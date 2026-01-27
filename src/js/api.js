// src/js/api.js
const API_BASE_URL = "https://api.faranux.com";

async function request(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE_URL}/?action=${endpoint}`;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (data) options.body = JSON.stringify(data);

    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        return { status: "error", message: error.message };
    }
}

module.exports = {
    syncProducts: (page) => request(`sync&page=${page}`),
    getInventory: (page = 1, search = '', status = 'publish', sortBy = 'name', sortOrder = 'ASC') =>
        request(`get_inventory&page=${page}&search=${encodeURIComponent(search)}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}`),
    getLocations: () => request('get_locations'),

    transfer: (data) => request('transfer', 'POST', data),
    bulkTransfer: (items) => request('bulk_transfer', 'POST', items),
    getTransfers: () => request('get_transfers'),

    addLocation: (name) => request('add_location', 'POST', { name }),
    deleteLocation: (id) => request('delete_location', 'POST', { id })
};