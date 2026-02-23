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

// --- NEW HELPER: SECURE FILE DOWNLOAD (Fixes CSV Unauthorized Issue) ---
async function downloadFile(action, filename) {
    try {
        const options = {
            method: 'GET',
            headers: {}
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

        const separator = action.includes('?') ? '&' : '?';
        const url = `${API_URL}${separator}action=${action}`;

        const res = await fetch(url, options);

        if (!res.ok) {
            throw new Error(`Server rejected request: ${res.status}`);
        }

        // Convert response to file blob
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Trigger browser download invisibly
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return { status: 'success' };
    } catch (e) {
        console.error("Download Error:", e);
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
    updateUserRole: (id, role, allowedBranches = [], name = '', email = '') =>
        request('admin_update_role', 'POST', {
            id,
            role,
            allowed_branches: allowedBranches,
            name,
            email
        }),

    regeneratePassword: (id, newPassword) =>
        request('regenerate_password', 'POST', { id, password: newPassword }),

    // --- INVENTORY ---
    getInventory: (page = 1, search = '', locationId = '', status = 'publish', sortBy = 'name', sortOrder = 'ASC', category = '') => {
        const query = `get_inventory&page=${page}&search=${encodeURIComponent(search)}&location_id=${locationId}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}&category=${encodeURIComponent(category)}`;
        return request(query);
    },

    // --- IMPORT STOCK ---
    importStock: (items, mode) =>
        request('import_stock', 'POST', { items, mode }),

    getStockComparison: (page = 1, search = '', category = '', locationId = '', status = 'publish', sortBy = 'difference', sortOrder = 'DESC') => {
        const query = `get_stock_comparison&page=${page}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&location_id=${locationId}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}`;
        return request(query);
    },

    getCategories: () => request('get_categories'),

    wcFetchOrders: (status = 'any', page = 1) =>
        request(`wc_fetch_orders&status=${status}&page=${page}`),

    wcUpdateOrderStatus: (orderId, status) =>
        request('wc_update_order_status', 'POST', { order_id: orderId, status }),

    wcUpdateStock: (productId, quantity) =>
        request('wc_update_product_stock', 'POST', { product_id: productId, quantity }),

    wcGetCategories: () => request('wc_get_categories'),

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
    getTransfers: (type = 'all', direction = 'all', page = 1, search = '', branch_id = '', start = '', end = '', user_id = '') => {
        const query = `get_transfers&type=${type}&direction=${direction}&page=${page}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}&branch_id=${branch_id}&user_id=${user_id}`;
        return request(query);
    },

    getTransferDetails: (batchId) => request(`get_transfer_details&batch_id=${batchId}`),

    initiateTransfer: (items, fromBranchId, toBranchId) =>
        request('initiate_transfer', 'POST', { items, from_branch_id: fromBranchId, to_branch_id: toBranchId }),

    approveTransfer: (batchId, action = 'approve', itemsData = []) =>
        request('approve_transfer', 'POST', { batch_id: batchId, action, items_data: itemsData }),

    cancelTransfer: (batchId, reason = '') =>
        request('cancel_transfer', 'POST', { batch_id: batchId, reason }),

    // --- EXPORT TRANSFERS (FIXED) ---
    exportTransfersCsv: (type = 'all', direction = 'all', search = '', start = '', end = '') => {
        const query = `export_transfers_csv&type=${type}&direction=${direction}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}`;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return downloadFile(query, `Transfers_Export_${dateStr}.csv`);
    },

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
    syncOrders: () => request('sync_orders', 'POST'),

    processOrder: (orderData) => request('process_order', 'POST', orderData),
};