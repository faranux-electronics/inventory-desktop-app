const API_URL = 'https://api.faranux.com/'; // Ensure this matches your server

async function request(action, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (body) options.body = JSON.stringify(body);

        // Construct URL
        const separator = action.includes('?') ? '&' : '?';
        const url = `${API_URL}${separator}action=${action}`;

        const res = await fetch(url, options);

        // Handle Empty Response
        const text = await res.text();
        if (!text) throw new Error("Empty response from server");

        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error("Invalid JSON: " + text);
        }
    } catch (e) {
        console.error("API Error:", e);
        return { status: "error", message: e.message };
    }
}

module.exports = {
    // --- INVENTORY ---
    getInventory: (page, search, status, sortBy, sortOrder) =>
        request(`get_inventory&page=${page}&search=${search}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}`),

    syncProducts: (page) => request(`sync&page=${page}`),

    // --- TRANSFERS ---
    transfer: (data) => request('transfer', 'POST', data),
    bulkTransfer: (items) => request('bulk_transfer', 'POST', items),
    getTransfers: (search = '', start = '', end = '') =>
        request(`get_transfers&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}`),

    // --- LOCATIONS ---
    getLocations: () => request('get_locations'),
    addLocation: (name) => request('add_location', 'POST', { name }),
    deleteLocation: (id) => request('delete_location', 'POST', { id }),

    // --- ORDER REVIEW ---
    getPendingOrders: (start = '', end = '') =>
        request(`get_pending_orders&start_date=${start}&end_date=${end}`),
    processOrder: (data) => request('process_order', 'POST', data)
};