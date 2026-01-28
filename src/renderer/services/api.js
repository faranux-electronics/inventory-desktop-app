const API_URL = 'https://api.faranux.com/';

async function request(action, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);

        const separator = action.includes('?') ? '&' : '?';
        const url = `${API_URL}${separator}action=${action}`;

        const res = await fetch(url, options);
        const text = await res.text();
        if (!text) throw new Error("Empty response");

        try { return JSON.parse(text); }
        catch (e) { throw new Error("Invalid JSON: " + text); }
    } catch (e) {
        console.error("API Error:", e);
        return { status: "error", message: e.message };
    }
}

module.exports = {
    // --- AUTH ---
    login: (email, password) => request('login', 'POST', { email, password }),
    googleLogin: (token) => request('google_login', 'POST', { token }),

    // --- PROFILE (NEW) ---
    updateProfile: (data) => request('update_profile', 'POST', data),

    // --- USER MANAGEMENT ---
    registerUser: (newUser, currentRole) => request('register_user', 'POST', { ...newUser, current_user_role: currentRole }),
    getUsers: (currentRole) => request(`get_users&role=${currentRole}`),
    deleteUser: (id, currentRole) => request('delete_user', 'POST', { id, current_user_role: currentRole }),

    // NEW: Assign Role
    updateUserRole: (targetId, newRole, currentRole) =>
        request('admin_update_role', 'POST', { target_id: targetId, role: newRole, current_user_role: currentRole }),

    // --- INVENTORY ---
    getInventory: (page, search, status, sortBy, sortOrder, locationId = '') =>
        request(`get_inventory&page=${page}&search=${search}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}&location_id=${locationId}`),

    syncProducts: (page) => request(`sync&page=${page}`),

    // --- TRANSFERS ---
    transfer: (data) => request('transfer', 'POST', data),
    bulkTransfer: (items) => request('bulk_transfer', 'POST', items),
    getTransfers: (search = '', start = '', end = '') =>
        request(`get_transfers&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}`),

    // --- LOCATIONS ---
    getLocations: () => request('get_locations'),

    // UPDATED: All admin actions now send current_user_role via POST
    getTrashedLocations: (currentRole) => request('get_trashed_locations', 'POST', { current_user_role: currentRole }),

    addLocation: (name) => request('add_location', 'POST', { name }),

    updateLocation: (id, name) => request('update_location', 'POST', { id, name }),

    // Soft Delete (Move to Trash)
    deleteLocation: (id, currentRole) => request('delete_location', 'POST', { id, current_user_role: currentRole }),

    // Restore from Trash
    restoreLocation: (id, currentRole) => request('restore_location', 'POST', { id, current_user_role: currentRole }),

    // Permanent Delete
    permanentlyDeleteLocation: (id, currentRole) => request('permanently_delete_location', 'POST', { id, current_user_role: currentRole }),

    // --- ORDERS ---
    getPendingOrders: (start = '', end = '') => request(`get_pending_orders&start_date=${start}&end_date=${end}`),
    processOrder: (data) => request('process_order', 'POST', data),
};