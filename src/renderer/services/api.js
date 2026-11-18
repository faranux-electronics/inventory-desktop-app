const desktopBridge = typeof window !== 'undefined' ? window.faranuxDesktop : null;

let API_URL = 'http://localhost:8000/index.php';
let authFailureHandled = false;

function getClientBranchSnapshot() {
    try {
        const user = JSON.parse(localStorage.getItem('faranux_user') || 'null');
        return user ? JSON.stringify({branch_id: user.branch_id ?? null, allowed_branches: Array.isArray(user.allowed_branches) ? user.allowed_branches : []}) : '';
    } catch (_) { return ''; }
}

function handleAuthenticationFailure(response, data) {
    const branchChanged = data?.code === 'branch_assignment_changed';
    if ((!response || (response.status !== 401 && !branchChanged)) || authFailureHandled || !localStorage.getItem('faranux_user')) return;
    const app = window.app;
    if (!app || typeof app.handleAuthenticationRequired !== 'function') return;
    authFailureHandled = true;
    app.handleAuthenticationRequired(branchChanged
        ? 'Your branch assignments changed. You have been signed out; please sign in again to refresh your access.'
        : 'Your session is no longer valid. You have been signed out; please sign in again.');
}

// Safe async initialization
(async () => {
    try {
        const mainUrl = await desktopBridge?.getApiUrl?.();
        if (mainUrl) API_URL = mainUrl;
    } catch (e) {
        console.warn("Could not fetch API URL from main process, falling back to localhost.");
    }
})();

async function request(action, method = 'GET', body = null, signal = null) {
    try {
        const options = {
            method,
            headers: {'Content-Type': 'application/json'}
        };
        if (signal) {
            options.signal = signal;
        }
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
        const branchSnapshot = getClientBranchSnapshot();
        if (branchSnapshot) options.headers['X-Client-Session-Branches'] = branchSnapshot;
        if (body) options.body = JSON.stringify(body);
        const separator = action.includes('?') ? '&' : '?';
        const url = `${API_URL}${separator}action=${action}`;
        const res = await fetch(url, options);
        const text = await res.text();
        if (!text) throw new Error("Empty response from server");
        try {
            const data = JSON.parse(text);
            handleAuthenticationFailure(res, data);
            if ((action === 'login' || action === 'google_login') && data?.status === 'success') authFailureHandled = false;
            if (data && data.status === 'error') {
                console.error('Backend Validation Error:', data.message);
            }
            return data;
        } catch (e) {
            throw new Error('Server Error: ' + text.substring(0, 100));
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            throw e;
        }
        console.error('API Request Failed:', e);
        return {status: 'error', message: e.message};
    }
}

async function downloadFile(action, filename, signal = null) {
    try {
        const options = {
            method: 'GET',
            headers: {}
        };
        const branchSnapshot = getClientBranchSnapshot();
        if (branchSnapshot) options.headers['X-Client-Session-Branches'] = branchSnapshot;
        if (signal) {
            options.signal = signal;
        }
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
            const text = await res.text();
            let data = {};
            try { data = JSON.parse(text); } catch (_) {}
            handleAuthenticationFailure(res, data);
            throw new Error(data.message || text || `Server rejected: ${res.status}`);
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
        if (e.name === 'AbortError') {
            throw e;
        }
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
    getAuditLogs: (actionFilter = '', page = 1, startDate = '', endDate = '', category = '', level = '') => {
        let query = `get_audit_logs&filter_action=${encodeURIComponent(actionFilter)}&page=${page}`;
        if (startDate) query += `&start_date=${encodeURIComponent(startDate)}`;
        if (endDate) query += `&end_date=${encodeURIComponent(/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate} 23:59:59` : endDate)}`;
        if (category) query += `&category=${encodeURIComponent(category)}`;
        if (level) query += `&level=${encodeURIComponent(level)}`;
        return request(query);
    },
    getStockImportLogs: (page = 1, startDate = '', endDate = '', perPage = 10) => {
        let query = `get_audit_logs&filter_exact_action=STOCK_IMPORT&page=${page}`;
        query += `&per_page=${Math.max(1, Math.min(100, Number(perPage) || 10))}`;
        if (startDate) query += `&start_date=${encodeURIComponent(startDate)}`;
        if (endDate) query += `&end_date=${encodeURIComponent(endDate)}`;
        return request(query);
    },
    getSyncState: () => request('sync_state'),

    getNavPermissions: () => request('get_nav_permissions'),
    saveNavPermissions: (permissions) => request('save_nav_permissions', 'POST', {permissions}),

    getCategories: () => request('get_categories'),

    wcGetCategories: () => request('wc_get_categories'),
    getStockAdjustments: (productId, page = 1, perPage = 50) => request(`get_stock_adjustments&product_id=${productId}&page=${page}&per_page=${perPage}`),
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
    getProductPendingTransfers: (productId) => request(`get_product_pending_transfers&product_id=${productId}`),

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

    posValidateCoupon: (code) => request(`pos_validate_coupon&code=${encodeURIComponent(code)}`),

    // --> Added the missing dictionary endpoint here:
    getBranchStockDictionary: (locationId) => request(`pos_get_stock_dictionary&location_id=${locationId}`),

    getWCCustomers: (search = '') => request(`wc_get_customers&search=${encodeURIComponent(search)}`),
    getWCStaff: (forceRefresh = false) => request(`wc_get_staff${forceRefresh ? '&force_refresh=true' : ''}`),
    getWCPaymentGateways: () => request('wc_get_payment_gateways'),
    getWCTaxRates: () => request('wc_get_tax_rates'),

    // Live cart display
    updateLiveCart: (registerId, cartData) => request(`pos_live_cart_update&register_id=${encodeURIComponent(registerId)}`, 'POST', cartData),
    clearLiveCart: (registerId) => request(`pos_live_cart_update&register_id=${encodeURIComponent(registerId)}`, 'POST', {
        status: 'idle',
        items: [],
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        currency: 'RWF'
    }),

    requestTransfer: (items, fromBranchId, toBranchId, note) => request('request_transfer', 'POST', { items, from_branch_id: fromBranchId, to_branch_id: toBranchId, note }),
    getTransferRequests: (type, direction, page, search, branchId, startDate, endDate) => request(`get_transfer_requests&type=${type}&direction=${direction}&page=${page}&search=${encodeURIComponent(search)}&branch_id=${branchId}&start_date=${startDate}&end_date=${endDate}`),
    getTransferRequestDetails: (batchId) => request(`get_transfer_request_details&batch_id=${batchId}`),
    respondTransferRequest: (batchId, action, itemsData, responseNote) => request('respond_transfer_request', 'POST', { batch_id: batchId, action, items_data: itemsData, response_note: responseNote }),
    cancelTransferRequest: (batchId, reason) => request('cancel_transfer_request', 'POST', { batch_id: batchId, reason }),

    getTransfers: (type = 'all', direction = 'all', page = 1, search = '', branch_id = '', start = '', end = '', user_id = '') =>
        request(`get_transfers&type=${type}&direction=${direction}&page=${page}&search=${encodeURIComponent(search)}&start_date=${start}&end_date=${end}&branch_id=${branch_id}&user_id=${user_id}`),

    getNotifications: () => request('get_notifications'),
    markNotificationRead: (notificationId) => request('mark_notification_read', 'POST', {notification_id: notificationId}),
    markAllNotificationsRead: () => request('mark_all_notifications_read', 'POST'),

    getWCWebhookStatus: () => request('wc_webhook_status'),

    // Alert Settings
    getAlertSettings: () => request('get_alert_settings'),
    updateAlertSettings: (data) => request('update_alert_settings', 'POST', data),
    testAlertMessage: (data) => request('test_alert_message', 'POST', data),

    // Master Planner Sheet (MPS)
    mpsGetSettings: () => request('mps_get_settings'),
    mpsSaveSettings: (data) => request('mps_save_settings', 'POST', data),
    mpsGetOverview: (filters = {}, signal = null) => {
        const qs = new URLSearchParams(filters).toString();
        return request(`mps_overview${qs ? `&${qs}` : ''}`, 'GET', null, signal);
    },
    mpsGetResults: (filters = {}, signal = null) => request(`mps_results&${new URLSearchParams(filters).toString()}`, 'GET', null, signal),
    mpsExportResults: (filters = {}, filename = 'mps-results.csv', signal = null) => downloadFile(`mps_export_results&${new URLSearchParams(filters).toString()}`, filename, signal),
    mpsGetPricingCatalog: (filters = {}) => request(`mps_pricing_catalog&${new URLSearchParams(filters).toString()}`),
    mpsGetPartPricingHistory: (catalogId) => request(`mps_part_pricing_history&catalog_id=${encodeURIComponent(catalogId)}`),
    mpsSavePartPricing: (data) => request('mps_save_part_pricing', 'POST', data),
    mpsCreateCatalogProduct: (data) => request('mps_create_catalog_product', 'POST', data),
    mpsDeletePartPricing: (productId) => request('mps_delete_part_pricing', 'POST', {product_id: productId}),
    mpsExportPricing: (filename = 'mps-pricing.csv') => downloadFile('mps_export_pricing', filename),
    mpsExportPurchaseOrders: (filename = 'mps-purchase-orders.csv') => downloadFile('mps_export_purchase_orders', filename),
    mpsExportPurchaseOrder: (id, filename) => downloadFile(`mps_export_purchase_orders&id=${encodeURIComponent(id)}`, filename),
    mpsExportStockoutForecast: (months = 3, filename = `mps-stockout-forecast-${months}m.csv`) => downloadFile(`mps_export_stockout_forecast&months=${encodeURIComponent(months)}`, filename),
    mpsExportOutOfStock: (filename = 'mps-out-of-stock.csv') => downloadFile('mps_export_out_of_stock', filename),
    mpsRollbackCostImport: (batchId) => request('mps_rollback_cost_import', 'POST', {batch_id: batchId}),
    mpsGetProductAnalysis: (productId, from = '', to = '', bucket = 'month') => {
        const filters = {product_id: productId, bucket};
        if (from) filters.from = from;
        if (to) filters.to = to;
        return request(`mps_product_analysis&${new URLSearchParams(filters).toString()}`);
    },
    mpsSaveProductParams: (productId, data) => request('mps_save_product_params', 'POST', {product_id: productId, ...data}),
    mpsGetSuppliers: () => request('mps_get_suppliers'),
    mpsSaveSupplier: (data) => request('mps_save_supplier', 'POST', data),
    mpsDeleteSupplier: (id) => request('mps_delete_supplier', 'POST', {id}),
    mpsRefreshSales: (from, to) => request('mps_refresh_sales', 'POST', {from, to}),
    mpsRefreshSalesStatus: () => request('mps_refresh_sales_status'),
    mpsReconcileSales: (from, to) => request('mps_reconcile_sales', 'POST', {from, to}),
    mpsRun: (asOfDate = null) => request('mps_run', 'POST', asOfDate ? {as_of_date: asOfDate} : {}),
    mpsGetPurchaseOrders: (filters = {}) => request(`mps_get_purchase_orders&${new URLSearchParams(filters).toString()}`),
    mpsGetPurchaseOrder: (id) => request(`mps_get_purchase_order&id=${encodeURIComponent(id)}`),
    mpsGetPurchaseOrderCommercials: (id) => request(`mps_get_purchase_order_commercials&id=${encodeURIComponent(id)}`),
    mpsSavePurchaseOrderWorkflow: (id, workflow_data) => request('mps_save_purchase_order_workflow', 'POST', {id, workflow_data}),
    mpsSetPurchaseOrderPriority: (ids) => request('mps_set_purchase_order_priority', 'POST', {ids}),
    mpsGetCalendarEvents: (from, to) => request(`mps_get_calendar_events&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    mpsCalendarHasEvents: () => request('mps_calendar_has_events'),
    mpsSavePurchaseOrder: (data) => request('mps_save_purchase_order', 'POST', data),
    mpsSavePurchaseOrderQuote: (data) => request('mps_save_purchase_order_quote', 'POST', data),
    mpsFinalizePurchaseOrderQuote: (poId, quoteId) => request('mps_finalize_purchase_order_quote', 'POST', {po_id: poId, quote_id: quoteId}),
    mpsSavePurchaseOrderFee: (data) => request('mps_save_purchase_order_fee', 'POST', data),
    mpsDeletePurchaseOrder: (id) => request('mps_delete_purchase_order', 'POST', {id}),
    mpsRestorePurchaseOrder: (id) => request('mps_restore_purchase_order', 'POST', {id}),
    mpsPermanentlyDeletePurchaseOrder: (id) => request('mps_permanently_delete_purchase_order', 'POST', {id}),
    mpsImportPurchaseOrder: (data) => request('mps_import_purchase_order', 'POST', data),
    mpsWorkbook: async (action, file, kind, options = {}) => {
        try {
            const form = new FormData();
            form.append('workbook', file);
            form.append('kind', kind);
            form.append('options', JSON.stringify(options));
            const headers = {};
            const branchSnapshot = getClientBranchSnapshot();
            if (branchSnapshot) headers['X-Client-Session-Branches'] = branchSnapshot;
            const storedUser = localStorage.getItem('faranux_user');
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    if (user?.api_token) headers.Authorization = `Bearer ${user.api_token}`;
                } catch (e) {}
            }
            const separator = action.includes('?') ? '&' : '?';
            const response = await fetch(`${API_URL}${separator}action=${action}`, {method: 'POST', headers, body: form});
            const text = await response.text();
            const data = JSON.parse(text);
            handleAuthenticationFailure(response, data);
            return data;
        } catch (e) {
            return {status: 'error', message: e.message || 'Workbook request failed.'};
        }
    },
    mpsPreviewWorkbook: (file, kind, options = {}) => API.mpsWorkbook('mps_preview_workbook', file, kind, options),
    mpsImportWorkbook: (file, kind, options = {}) => API.mpsWorkbook('mps_import_workbook', file, kind, options),
    mpsSetPurchaseOrderStatus: (id, status) => request('mps_set_purchase_order_status', 'POST', {id, status}),
    mpsReceivePurchaseOrder: (id, received = {}, locationId = null) =>
        request('mps_receive_purchase_order', 'POST', {id, received, location_id: locationId}),
    mpsCreatePurchaseOrders: (data = {}) => request('mps_create_purchase_orders', 'POST', data),
    mpsAISuggest: (productId, task = 'summary') => request('mps_ai_suggest', 'POST', {product_id: productId, task}),
    mpsAIChat: (question, history = [], context = {}) => request('mps_ai_chat', 'POST', {question, history, context}),
};
