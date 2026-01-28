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

    // --- PROFILE ---
    updateProfile: (data) => request('update_profile', 'POST', data),

    // --- USER MANAGEMENT ---
    registerUser: (newUser, currentRole) => request('register_user', 'POST', { ...newUser, current_user_role: currentRole }),
    getUsers: (currentRole) => request(`get_users&role=${currentRole}`),
    deleteUser: (id, currentRole) => request('delete_user', 'POST', { id, current_user_role: currentRole }),
    updateUserRole: (targetId, newRole, currentRole, branchId) =>
        request('admin_update_role', 'POST', { target_id: targetId, role: newRole, current_user_role: currentRole, branch_id: branchId }),

    // --- INVENTORY ---
    getInventory: (page, search, status, sortBy, sortOrder, locationId = '') =>
        request(`get_inventory&page=${page}&search=${search}&status=${status}&sort_by=${sortBy}&sort_order=${sortOrder}&location_id=${locationId}`),

    syncProducts: (page) => request(`sync&page=${page}`),

    // --- TRANSFERS ---
    initiateTransfer: (items, userId, toBranchId) =>
        request('initiate_transfer', 'POST', { items, user_id: userId, to_branch_id: toBranchId }),

    approveTransfer: (batchId, approvals, userId, action = 'approve') =>
        request('approve_transfer', 'POST', { batch_id: batchId, approvals, user_id: userId, action }),

    // Updated to strictly include user_id in the query string
    getTransfers: ({ type = 'all', page = 1, search = '', start = '', end = '', branch_id = '', user_id = '' }) => {
        const query = `get_transfers&type=${type}&page=${page}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}&branch_id=${branch_id}&user_id=${user_id}`;
        return request(query);
    },

    getBranchesWithCashiers: (excludeBranchId = '') =>
        request(`get_branches_with_cashiers&exclude_branch_id=${excludeBranchId}`),

    // --- NOTIFICATIONS ---
    getNotifications: (userId) => request('get_notifications', 'POST', { user_id: userId }),
    markNotificationRead: (notificationId, userId) =>
        request('mark_notification_read', 'POST', { notification_id: notificationId, user_id: userId }),
    markAllNotificationsRead: (userId) =>
        request('mark_all_notifications_read', 'POST', { user_id: userId }),

    // --- LOCATIONS ---
    getRealLocations: () => request('get_locations'),
    getLocations: () => request('get_real_locations'),
    getTrashedLocations: (currentRole) => request('get_trashed_locations', 'POST', { current_user_role: currentRole }),
    addLocation: (name) => request('add_location', 'POST', { name }),
    updateLocation: (id, name) => request('update_location', 'POST', { id, name }),
    deleteLocation: (id, currentRole) => request('delete_location', 'POST', { id, current_user_role: currentRole }),
    restoreLocation: (id, currentRole) => request('restore_location', 'POST', { id, current_user_role: currentRole }),
    permanentlyDeleteLocation: (id, currentRole) => request('permanently_delete_location', 'POST', { id, current_user_role: currentRole }),

    // --- ORDERS ---
    getPendingOrders: (start = '', end = '') => request(`get_pending_orders&start_date=${start}&end_date=${end}`),
    processOrder: (data) => request('process_order', 'POST', data),
};