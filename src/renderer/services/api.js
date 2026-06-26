// const API_URL = 'http://localhost:8000/index.php';

const API_URL = 'https://api.faranux.com';

async function request(action, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {'Content-Type': 'application/json'}
        };
        const storedUser = localStorage.getItem('faranux_user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                if (user?.api_token) {
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
            throw new Error('Server Error: ' + text.substring(0, 100));
        }
    } catch (e) {
        console.error('API Error:', e);
        return {status: 'error', message: e.message};
    }
}

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
                if (user?.api_token) {
                    options.headers['Authorization'] = `Bearer ${user.api_token}`;
                }
            } catch (e) {
            }
        }
        const separator = action.includes('?') ? '&' : '?';
        const url = `${API_URL}${separator}action=${action}`;
        const res = await fetch(url, options);
        if (!res.ok) {
            throw new Error(`Server rejected: ${res.status}`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return {status: 'success'};
    } catch (e) {
        return {status: 'error', message: e.message};
    }
}

module.exports = {
    getBaseUrl: () => API_URL,
    getToken: () => {
        try {
            return JSON.parse(localStorage.getItem('faranux_user'))?.api_token || '';
        } catch (e) {
            return '';
        }
    },
    login: (email, password) => request('login', 'POST', {email, password}),
    googleLogin: (token) => request('google_login', 'POST', {token}),
    updateProfile: (data) => request('update_profile', 'POST', data),

    getUsers: (showTrash = false) => request(`get_users&trash=${showTrash}`),
    restoreUser: (id) => request('restore_user', 'POST', {id}),
    registerUser: (newUser) => request('register_user', 'POST', newUser),
    deleteUser: (id) => request('delete_user', 'POST', {id}),
    permanentlyDeleteUser: (id) => request('permanently_delete_user', 'POST', {id}),
    approveUser: (id) => request('approve_user', 'POST', {id}),
    deactivateUser: (id) => request('deactivate_user', 'POST', {id}),
    updateUserRole: (id, role, allowedBranches = [], name = '', email = '') =>
        request('admin_update_role', 'POST', {id, role, allowed_branches: allowedBranches, name, email}),
    regeneratePassword: (id, newPassword) => request('regenerate_password', 'POST', {id, password: newPassword}),

    getInventory: (page = 1, search = '', locationId = '', status = 'publish', sortBy = 'name', sortOrder = 'ASC', category = '', stockFilter = 'all') =>
        request(`get_inventory&page=${page}&search=${encodeURIComponent(search)}&location_id=${locationId}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}&category=${encodeURIComponent(category)}&stock_filter=${stockFilter}`),

    importStock: (items, mode) => request('import_stock', 'POST', {items, mode}),
    getAuditLogs: (actionFilter = '', page = 1, startDate = '', endDate = '') => {
        let query = `get_audit_logs&filter_action=${actionFilter}&page=${page}`;
        if (startDate) query += `&start_date=${encodeURIComponent(startDate)}`;
        if (endDate) query += `&end_date=${encodeURIComponent(endDate)}`;
        return request(query);
    },
    getSyncState: () => request('sync_state'),

    getNavPermissions: () => request('get_nav_permissions'),
    saveNavPermissions: (permissions) => request('save_nav_permissions', 'POST', {permissions}),

    getCategories: () => request('get_categories'),

    wcGetCategories: () => request('wc_get_categories'),
    getStockAdjustments: (productId) => request(`get_stock_adjustments&product_id=${productId}`),
    adjustStock: (productId, locationId, qty, reason) => request('adjust_stock', 'POST', {
        product_id: productId,
        location_id: locationId,
        qty,
        reason
    }),

    syncBatch: (page = 1, perPage = 50) => request('sync_batch', 'POST', {page, per_page: perPage}),
    exportInventory: (status, locationId, category, search, stockFilter, sortBy, sortOrder) => {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        // Build all query parameters dynamically
        const params = new URLSearchParams({
            status: status || '',
            location_id: locationId || '',
            category: category || '',
            search: search || '',
            stock_filter: stockFilter || 'all',
            sort_by: sortBy || 'name',
            sort_order: sortOrder || 'ASC'
        });

        return downloadFile(`export_inventory&${params.toString()}`, `Inventory_${dateStr}.csv`);
    },

    wcGetProducts: (page = 1, perPage = 50, search = '', category = '', stockStatus = 'all', onSale = false, featured = false) => {
        let q = `wc_get_products&page=${page}&per_page=${perPage}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
        if (stockStatus && stockStatus !== 'all') q += `&stock_status=${stockStatus}`;
        if (onSale) q += `&on_sale=1`;
        if (featured) q += `&featured=1`;
        return request(q);
    },

    getTransferDetails: (batchId) => request(`get_transfer_details&batch_id=${encodeURIComponent(batchId)}`),

    initiateTransfer: (items, fromBranchId, toBranchId, reason = '') => request('initiate_transfer', 'POST', {
        items,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        reason,
    }),

    approveTransfer: (batchId, action = 'approve', itemsData = []) => request('approve_transfer', 'POST', {
        batch_id: batchId,
        action,
        items_data: itemsData
    }),
    resolveDiscrepancy: (batchId) => request('resolve_discrepancy', 'POST', {batch_id: batchId}),
    cancelTransfer: (batchId, reason = '') => request('cancel_transfer', 'POST', {batch_id: batchId, reason}),
    revertTransfer: (batchId, reason) => request('revert_transfer', 'POST', {batch_id: batchId, reason}),
    exportTransfersCsv: (type = 'all', direction = 'all', search = '', start = '', end = '') => {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return downloadFile(`export_transfers_csv&type=${type}&direction=${direction}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}`, `Transfers_${dateStr}.csv`);
    },

    getLocations: () => request('get_locations'),
    updateBranchPriority: (priorities) => request('update_branch_priority', 'POST', {priorities}),
    getTrashedLocations: () => request('get_trashed_locations'),
    addLocation: (name) => request('add_location', 'POST', {name}),

    processPOSCheckout: (payload) => request('pos_checkout', 'POST', payload),
    posGetInventory: (page = 1, search = '', locationId = '', category = '', stockFilter = 'all', featured = false) =>
        request(`pos_get_inventory&page=${page}&search=${encodeURIComponent(search)}&location_id=${locationId}&category=${encodeURIComponent(category)}&stock_filter=${stockFilter}&featured=${featured ? 1 : 0}`),

    // --> Added the missing dictionary endpoint here:
    getBranchStockDictionary: (locationId) => request(`pos_get_stock_dictionary&location_id=${locationId}`),

    getWCCustomers: (search = '') => request(`wc_get_customers&search=${encodeURIComponent(search)}`),
    getWCStaff: (forceRefresh = false) => request(`wc_get_staff${forceRefresh ? '&force_refresh=true' : ''}`),
    getWCPaymentGateways: () => request('wc_get_payment_gateways'),
    getWCTaxRates: () => request('wc_get_tax_rates'),

    getTransfers: (type = 'all', direction = 'all', page = 1, search = '', branch_id = '', start = '', end = '', user_id = '') =>
        request(`get_transfers&type=${type}&direction=${direction}&page=${page}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}&branch_id=${branch_id}&user_id=${user_id}`),

    getNotifications: () => request('get_notifications'),
    markNotificationRead: (notificationId) => request('mark_notification_read', 'POST', {notification_id: notificationId}),
    markAllNotificationsRead: () => request('mark_all_notifications_read', 'POST'),
};