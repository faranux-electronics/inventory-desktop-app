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
    }

    render() {
        const content = document.getElementById('content');
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
                    <input type="date" id="orderStart" class="form-input" style="width:auto;">
                    <span class="text-muted">to</span>
                    <input type="date" id="orderEnd" class="form-input" style="width:auto;">
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
        const locations = await this.state.loadLocations();

        const options = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
        defLocSelect.innerHTML = `<option value="">-- No Default --</option>` + options;

        const savedDef = localStorage.getItem('cashier_default_location');
        if (savedDef) defLocSelect.value = savedDef;

        defLocSelect.addEventListener('change', () => {
            localStorage.setItem('cashier_default_location', defLocSelect.value);
            Toast.info("Default location saved");
        });

        document.getElementById('btnRefreshOrders').addEventListener('click', () => this.loadOrders(true));
        document.getElementById('btnFilterOrders').addEventListener('click', () => this.loadOrders(true));
    }

    async loadOrders(forceRefresh = false) {
        const container = document.getElementById('orderList');
        const btn = document.getElementById('btnRefreshOrders');

        const start = document.getElementById('orderStart').value;
        const end = document.getElementById('orderEnd').value;

        const cacheKey = `${start}-${end}`;

        if (!forceRefresh && this.ordersCache && this.cacheTime && this.ordersCache.cacheKey === cacheKey) {
            const age = Date.now() - this.cacheTime;
            if (age < this.CACHE_DURATION) {
                this.renderOrders(this.ordersCache.data);
                return;
            }
        }

        container.innerHTML = '<div class="w-full text-center p-xl text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Checking WooCommerce...</div>';
        btn.disabled = true;

        try {
            const res = await API.getPendingOrders(start, end);

            if (res.status === 'success') {
                this.ordersCache = { data: res.data, cacheKey: cacheKey };
                this.cacheTime = Date.now();
                this.renderOrders(res.data);
            } else {
                container.innerHTML = `
                    <div class="card w-full bg-error-50" style="border-left: 4px solid var(--error-500);">
                        <div class="p-lg text-center">
                            <i class="fa-solid fa-exclamation-triangle text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                            <h3 class="text-error-700 font-bold mb-sm">Failed to Fetch Orders</h3>
                            <p class="text-neutral-700 text-sm">${res.message || 'An error occurred while fetching orders.'}</p>
                        </div>
                    </div>
                `;
                Toast.error(res.message || "Failed to fetch orders");
            }
        } catch (e) {
            container.innerHTML = `
                <div class="card w-full bg-error-50" style="border-left: 4px solid var(--error-500);">
                    <div class="p-lg text-center">
                        <i class="fa-solid fa-wifi-slash text-error-500" style="font-size: 2.5rem; display:block; margin-bottom: 1rem;"></i>
                        <h3 class="text-error-700 font-bold mb-sm">Network Error</h3>
                        <p class="text-neutral-700 text-sm">Unable to connect. Please check your connection and try again.</p>
                    </div>
                </div>
            `;
            Toast.error("Network error");
        } finally {
            btn.disabled = false;
        }
    }

    async renderOrders(orders) {
        const container = document.getElementById('orderList');
        const locations = await this.state.loadLocations();
        const defaultLoc = document.getElementById('defaultLocationSelect').value;

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

            header.addEventListener('click', () => {
                body.classList.toggle('hidden');
                icon.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            });

            card.querySelector('.order-select').addEventListener('click', (e) => e.stopPropagation());

            const confirmBtn = card.querySelector('.btn-process-order');
            confirmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const oid = confirmBtn.dataset.orderId;
                const items = JSON.parse(confirmBtn.dataset.items);
                const locSelect = document.getElementById(`loc-select-${oid}`);
                const locId = locSelect.value;

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

            container.appendChild(card);
        });
    }

    async handleProcessOrder(oid, items, locId, cardElement) {
        try {
            const res = await API.processOrder({ order_id: oid, location_id: locId, items: items });
            if (res.status === 'success') {
                this.ordersCache = null;
                this.cacheTime = null;

                cardElement.style.transition = 'all 0.5s';
                cardElement.style.opacity = '0';
                cardElement.style.transform = 'scale(0.9)';
                setTimeout(() => cardElement.remove(), 500);

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