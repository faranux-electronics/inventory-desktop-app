const API_URL = 'http://localhost:8000/index.php';

async function request(action, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        const storedUser = localStorage.getItem('faranux_user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                if (user && user.api_token) {
                    options.headers['Authorization'] = `Bearer ${user.api_token}`;
                }
            } catch (e) {
                console.warn("Corrupt user data in storage");
            }
        }

        if (body) options.body = JSON.stringify(body);

        const separator = action.includes('?') ? '&' : '?';
        const url = `${API_URL}${separator}action=${action}`;

        const res = await fetch(url, options);
        const text = await res.text();

        if (!text) throw new Error("Empty response from server");

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Server returned invalid JSON:", text);
            throw new Error("Server Error: " + text.substring(0, 100));
        }
    } catch (e) {
        console.error("API Error:", e);
        return { status: "error", message: e.message };
    }
}

module.exports = {
    // --- AUTH ---
    login: (email, password) => request('login', 'POST', { email, password }),
    googleLogin: (token) => request('google_login', 'POST', { token }),
    updateProfile: (data) => request('update_profile', 'POST', data), // no id needed

    // --- USER MANAGEMENT ---
    getUsers: (showTrash = false) => request(`get_users&trash=${showTrash}`),
    restoreUser: (id) => request('restore_user', 'POST', { id }),
    registerUser: (newUser) => request('register_user', 'POST', newUser),
    deleteUser: (id) => request('delete_user', 'POST', { id }),
    approveUser: (id) => request('approve_user', 'POST', { id }),
    deactivateUser: (id) => request('deactivate_user', 'POST', { id }),
    updateUserRole: (id, role, branchId = null) =>
        request('admin_update_role', 'POST', { id, role, branch_id: branchId }),

    // --- INVENTORY ---
    getInventory: (page = 1, search = '', locationId = '', status = 'publish', sortBy = 'name', sortOrder = 'ASC', category = '') => {
        const query = `get_inventory&page=${page}&search=${encodeURIComponent(search)}&location_id=${locationId}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}&category=${encodeURIComponent(category)}`;
        return request(query);
    },

    getStockComparison: (page = 1, search = '', category = '') => {
        const query = `get_stock_comparison&page=${page}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
        return request(query);
    },

    getCategories: () => request('get_categories'),

    adjustStock: (productId, locationId, qty, reason) =>
        request('adjust_stock', 'POST', { product_id: productId, location_id: locationId, qty, reason }),

    // --- SYNC ---
    syncBatch: (page = 1, perPage = 50) =>
        request('sync_batch', 'POST', { page, per_page: perPage }),

    // --- EXPORT ---
    exportInventory: (status = 'publish', locationId = '', category = '') => {
        const url = `${API_URL}?action=export_inventory&status=${status}&location_id=${locationId}&category=${encodeURIComponent(category)}`;
        window.open(url, '_blank');
    },

    // --- TRANSFERS ---
    getTransfers: (type = 'all', page = 1, search = '', branch_id = '', start = '', end = '', user_id = '') => {
        const query = `get_transfers&type=${type}&page=${page}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}&branch_id=${branch_id}&user_id=${user_id}`;
        return request(query);
    },

    initiateTransfer: (items, toBranchId) =>
        request('initiate_transfer', 'POST', { items, to_branch_id: toBranchId }),

    approveTransfer: (batchId, action = 'approve', approvals = []) =>
        request('approve_transfer', 'POST', { batch_id: batchId, action, approvals }),

    // --- LOCATIONS ---
    getLocations: () => request('get_locations'),
    getTrashedLocations: () => request('get_trashed_locations'),
    addLocation: (name) => request('add_location', 'POST', { name }),
    updateLocation: (id, name) => request('update_location', 'POST', { id, name }),
    deleteLocation: (id) => request('delete_location', 'POST', { id }),
    restoreLocation: (id) => request('restore_location', 'POST', { id }),
    permanentlyDeleteLocation: (id) => request('permanently_delete_location', 'POST', { id }),

    // --- ORDERS ---
    getPendingOrders: (startDate = '', endDate = '') =>
        request(`get_pending_orders&start_date=${startDate}&end_date=${endDate}`),

    processOrder: (orderData) => request('process_order', 'POST', orderData),
};