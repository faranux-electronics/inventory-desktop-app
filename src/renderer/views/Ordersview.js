const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class OrdersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.ordersCache = null;
        this.cacheTime = null;
        this.CACHE_DURATION = 2 * 60 * 1000;

        // Restore previous state if exists
        const savedState = this.state.getTabState('orders');
        if (savedState) {
            this.defaultLocation = savedState.defaultLocation || '';
            this.startDate = savedState.startDate || '';
            this.endDate = savedState.endDate || '';
        } else {
            this.defaultLocation = localStorage.getItem('cashier_default_location') || '';
            this.startDate = '';
            this.endDate = '';
        }
    }

    saveState() {
        this.state.saveTabState('orders', {
            defaultLocation: this.defaultLocation,
            startDate: this.startDate,
            endDate: this.endDate
        });
    }

    render() {
        const content = document.getElementById('content');
        if (!content) {
            console.error('Content container not found');
            return;
        }

        content.innerHTML = `
            <div class="page-header">
                <div class="header-row">
                    <h1 class="page-title">Order Review</h1>
                    <div class="header-actions flex items-center gap-md">
                        <select id="defaultLocationSelect" class="form-select" style="min-width:200px;">
                            <option value="">-- Cashier Default --</option>
                        </select>
                        <button id="btnRefreshOrders" class="btn btn-primary">
                            <i class="fa-solid fa-rotate"></i> Fetch Orders
                        </button>
                    </div>
                </div>
                
                <div class="card p-md flex items-center gap-md flex-wrap">
                    <span class="font-semibold text-sm text-neutral-700">Filter Date:</span>
                    <input type="date" id="orderStart" class="form-input" style="width:auto;" value="${this.startDate}">
                    <span class="text-muted">to</span>
                    <input type="date" id="orderEnd" class="form-input" style="width:auto;" value="${this.endDate}">
                    <button id="btnFilterOrders" class="btn btn-sm btn-primary">Apply Filter</button>
                </div>
            </div>

            <div id="orderList" class="flex flex-wrap gap-md">
                <div class="w-full text-center p-xl text-muted">
                    <i class="fa-solid fa-cart-shopping text-neutral-400" style="font-size: 3rem; display:block; margin-bottom: 1rem;"></i>
                    Click "Fetch Orders" to check for sales.
                </div>
            </div>
        `;

        this.initControls();
        this.loadOrders();
    }

    async initControls() {
        const defLocSelect = document.getElementById('defaultLocationSelect');
        if (!defLocSelect) return;

        const locations = await this.state.loadLocations();

        const options = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
        defLocSelect.innerHTML = `<option value="">-- No Default --</option>` + options;

        if (this.defaultLocation) {
            defLocSelect.value = this.defaultLocation;
        }

        defLocSelect.addEventListener('change', () => {
            this.defaultLocation = defLocSelect.value;
            localStorage.setItem('cashier_default_location', this.defaultLocation);
            this.saveState();
            Toast.info("Default location saved");
        });

        const btnRefresh = document.getElementById('btnRefreshOrders');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.loadOrders(true));
        }

        const btnFilter = document.getElementById('btnFilterOrders');
        if (btnFilter) {
            btnFilter.addEventListener('click', () => {
                this.startDate = document.getElementById('orderStart')?.value || '';
                this.endDate = document.getElementById('orderEnd')?.value || '';
                this.saveState();
                this.loadOrders(true);
            });
        }
    }

    async loadOrders(forceRefresh = false) {
        const container = document.getElementById('orderList');
        const btn = document.getElementById('btnRefreshOrders');

        if (!container) {
            console.error('Order list container not found');
            return;
        }

        const start = document.getElementById('orderStart')?.value || this.startDate;
        const end = document.getElementById('orderEnd')?.value || this.endDate;
        const cacheKey = `${start}-${end}`;

        // Return cached data if valid and not forcing refresh
        if (!forceRefresh && this.ordersCache && this.cacheTime && this.ordersCache.cacheKey === cacheKey) {
            const age = Date.now() - this.cacheTime;
            if (age < this.CACHE_DURATION) {
                await this.renderOrders(this.ordersCache.data);
                return;
            }
        }

        container.innerHTML = '<div class="w-full text-center p-xl text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Checking WooCommerce...</div>';
        if(btn) btn.disabled = true;

        try {
            // STEP 1: Sync with WooCommerce if refreshing
            if (forceRefresh) {
                if(btn) btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down fa-bounce"></i> Syncing...';

                const syncRes = await API.syncOrders();

                if (syncRes.status === 'error') {
                    // Check if it's a configuration error
                    if (syncRes.configured === false) {
                        this.renderConfigError(container, syncRes.message, syncRes.errors);
                        Toast.error("WooCommerce not configured");
                        return;
                    } else if (syncRes.error_type === 'missing_table') {
                        this.renderDatabaseError(container, syncRes.message);
                        Toast.error("Database error");
                        return;
                    } else {
                        throw new Error(syncRes.message);
                    }
                }

                Toast.success(syncRes.message || "Orders synced successfully");
            }

            // STEP 2: Read from the Database
            if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
            const res = await API.getPendingOrders(start, end);

            if (res.status === 'success') {
                this.ordersCache = { data: res.data, cacheKey: cacheKey };
                this.cacheTime = Date.now();
                await this.renderOrders(res.data);
            } else if (res.error_type === 'missing_table') {
                this.renderDatabaseError(container, res.message);
                Toast.error("Database error");
            } else {
                this.renderError(container, "Failed to Load Orders", res.message);
                Toast.error(res.message);
            }
        } catch (e) {
            this.renderError(container, "Network Error", e.message || "Unable to connect. Please check your connection.");
            console.error("Order load error:", e);
            Toast.error(e.message || "Network error");
        } finally {
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Fetch Orders';
            }
        }
    }

    renderConfigError(container, message, errors = []) {
        if (!container) return;

        const errorList = errors.length > 0
            ? `<ul class="text-left mt-md" style="list-style: disc; padding-left: 1.5rem;">
                ${errors.map(err => `<li class="text-sm text-neutral-700 mb-xs">${err}</li>`).join('')}
               </ul>`
            : '';

        container.innerHTML = `
            <div class="card w-full bg-warning-50" style="border-left: 4px solid var(--warning-500);">
                <div class="p-lg">
                    <div class="text-center mb-md">
                        <i class="fa-solid fa-plug-circle-exclamation text-warning-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                        <h3 class="text-warning-700 font-bold mb-sm">WooCommerce Not Configured</h3>
                        <p class="text-neutral-700 text-sm">${message}</p>
                    </div>
                    ${errorList}
                    <div class="mt-lg p-md bg-neutral-100 rounded text-sm">
                        <strong>To fix this:</strong> Add the following to your <code>config.php</code> file:
                        <pre class="mt-sm bg-white p-sm rounded border" style="overflow-x: auto;">define('WC_URL', 'https://your-store.com');
define('WC_CONSUMER_KEY', 'ck_xxxxx');
define('WC_CONSUMER_SECRET', 'cs_xxxxx');</pre>
                    </div>
                </div>
            </div>
        `;
    }

    renderDatabaseError(container, message) {
        if (!container) return;

        container.innerHTML = `
            <div class="card w-full bg-error-50" style="border-left: 4px solid var(--error-500);">
                <div class="p-lg text-center">
                    <i class="fa-solid fa-database text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <h3 class="text-error-700 font-bold mb-sm">Database Error</h3>
                    <p class="text-neutral-700 text-sm">${message}</p>
                    <div class="mt-lg p-md bg-neutral-100 rounded text-sm text-left">
                        <strong>To fix this:</strong> Run the database migration to create the required table:
                        <pre class="mt-sm bg-white p-sm rounded border" style="overflow-x: auto;">CREATE TABLE IF NOT EXISTS woocommerce_orders (
    id INT PRIMARY KEY,
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    total DECIMAL(10,2),
    status VARCHAR(50),
    order_date DATETIME,
    raw_data TEXT,
    processed TINYINT DEFAULT 0,
    processed_at DATETIME NULL,
    processed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);</pre>
                    </div>
                </div>
            </div>
        `;
    }

    renderError(container, title, message) {
        if (!container) return;

        container.innerHTML = `
            <div class="card w-full bg-error-50" style="border-left: 4px solid var(--error-500);">
                <div class="p-lg text-center">
                    <i class="fa-solid fa-exclamation-triangle text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                    <h3 class="text-error-700 font-bold mb-sm">${title}</h3>
                    <p class="text-neutral-700 text-sm">${message}</p>
                </div>
            </div>
        `;
    }

    async renderOrders(orders) {
        const container = document.getElementById('orderList');
        if (!container) {
            console.error('Order list container not found');
            return;
        }

        const locations = await this.state.loadLocations();
        const defaultLoc = this.defaultLocation || document.getElementById('defaultLocationSelect')?.value;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="w-full text-center p-xl text-muted">
                    <i class="fa-solid fa-check-circle text-success-500" style="font-size: 3rem; display:block; margin-bottom: 1rem;"></i>
                    No pending orders found.
                </div>`;
            return;
        }

        container.innerHTML = '';

        orders.forEach(order => {
            const itemsJson = JSON.stringify(order.raw_items).replace(/"/g, '&quot;');
            const totalFormatted = parseInt(order.total).toLocaleString();

            const orderDate = new Date(order.date);
            const dateStr = orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = orderDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const itemsListHtml = order.raw_items.map(item =>
                `<li class="flex items-center gap-sm py-sm border-b border-dashed border-neutral-200">
                    <span class="badge badge-neutral">${item.quantity}x</span> 
                    <span class="text-sm text-neutral-700 flex-1">${item.name}</span>
                </li>`
            ).join('');

            const locOptions = locations.map(l =>
                `<option value="${l.id}" ${l.id === defaultLoc ? 'selected' : ''}>${l.name}</option>`
            ).join('');

            const card = document.createElement('div');
            card.className = 'card';
            card.style.width = '350px';
            card.style.alignSelf = 'start';

            card.innerHTML = `
                <div class="p-md flex justify-between items-center cursor-pointer order-header hover:bg-neutral-50 transition-colors">
                    <div class="flex-1">
                        <div class="flex items-center gap-md mb-xs">
                            <span class="font-bold text-neutral-900">#${order.id}</span>
                            <span class="badge badge-success">${totalFormatted} Frw</span>
                        </div>
                        <div class="text-xs text-neutral-700">${order.customer}</div>
                        <div class="text-xs text-muted mt-xs">
                            <i class="fa-solid fa-calendar-day"></i> ${dateStr} at ${timeStr}
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-down text-muted transition-transform duration-200"></i>
                </div>
                
                <div class="order-body hidden border-t border-neutral-200 p-md bg-neutral-50">
                    <ul class="m-0 p-0 mb-md" style="list-style:none;">${itemsListHtml}</ul>
                    <div class="flex gap-sm">
                        <select class="form-select text-sm order-select flex-1" id="loc-select-${order.id}">
                            <option value="" disabled ${!defaultLoc ? 'selected' : ''}>Select Source...</option>
                            ${locOptions}
                        </select>
                        <button class="btn btn-primary btn-sm btn-process-order" data-order-id="${order.id}" data-items='${itemsJson}'>
                            <i class="fa-solid fa-check"></i> Confirm
                        </button>
                    </div>
                </div>
            `;

            const header = card.querySelector('.order-header');
            const body = card.querySelector('.order-body');
            const icon = card.querySelector('.fa-chevron-down');

            if (header && body && icon) {
                header.addEventListener('click', () => {
                    body.classList.toggle('hidden');
                    icon.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                });
            }

            const orderSelect = card.querySelector('.order-select');
            if (orderSelect) {
                orderSelect.addEventListener('click', (e) => e.stopPropagation());
            }

            const confirmBtn = card.querySelector('.btn-process-order');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const oid = confirmBtn.dataset.orderId;
                    const items = JSON.parse(confirmBtn.dataset.items);
                    const locSelect = document.getElementById(`loc-select-${oid}`);
                    const locId = locSelect ? locSelect.value : '';

                    if (!locId) {
                        Toast.error("Please select the Source Branch first");
                        return;
                    }

                    const locName = locations.find(l => l.id === locId)?.name || 'selected branch';

                    Modal.open({
                        title: "Confirm Order Processing",
                        body: `
                            <div class="mb-md">
                                <p class="text-neutral-700 mb-md">Are you sure you want to process this order?</p>
                                <div class="card bg-neutral-50 p-md">
                                    <div class="flex justify-between mb-sm">
                                        <span class="text-sm font-semibold">Order ID:</span>
                                        <span class="text-sm">#${oid}</span>
                                    </div>
                                    <div class="flex justify-between mb-sm">
                                        <span class="text-sm font-semibold">Customer:</span>
                                        <span class="text-sm">${order.customer}</span>
                                    </div>
                                    <div class="flex justify-between mb-sm">
                                        <span class="text-sm font-semibold">Total:</span>
                                        <span class="text-sm font-bold" style="color: var(--primary-500);">${totalFormatted} Frw</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-sm font-semibold">Stock Source:</span>
                                        <span class="badge badge-info">${locName}</span>
                                    </div>
                                </div>
                                <p class="text-xs text-muted mt-md">
                                    <i class="fa-solid fa-info-circle"></i> 
                                    This will deduct stock from ${locName} for all items in this order.
                                </p>
                            </div>
                        `,
                        confirmText: "Process Order",
                        cancelText: "Cancel",
                        onConfirm: async () => {
                            await this.handleProcessOrder(oid, items, locId, card);
                        }
                    });
                });
            }

            container.appendChild(card);
        });
    }

    async handleProcessOrder(oid, items, locId, cardElement) {
        try {
            const res = await API.processOrder({ order_id: oid, location_id: locId, items: items });
            if (res.status === 'success') {
                this.ordersCache = null;
                this.cacheTime = null;

                if (cardElement) {
                    cardElement.style.transition = 'all 0.5s';
                    cardElement.style.opacity = '0';
                    cardElement.style.transform = 'scale(0.9)';
                    setTimeout(() => cardElement.remove(), 500);
                }

                Toast.success("Stock Deducted Successfully");
            } else {
                Toast.error(res.message || "Failed to process");
                throw new Error(res.message);
            }
        } catch (e) {
            Toast.error(e.message || "Network Error");
            throw e;
        }
    }
}

module.exports = OrdersView;