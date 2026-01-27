const api = require('./js/api.js');
const state = require('./js/state.js');
const view = require('./js/view.js');
const modal = require('./js/modal.js');
const toast = require('./js/toast.js');

const contentDiv = document.getElementById('appContent');
modal.init();

// --- ROUTER ---
window.loadView = (viewName, navElement) => {
    state.get().view = viewName;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if(navElement) navElement.classList.add('active');

    if (viewName === 'dashboard') initDashboard();
    if (viewName === 'branches') initBranches();
    if (viewName === 'transfers') initTransfers();
    if (viewName === 'orders') initOrders();
};

// --- CONTROLLER: DASHBOARD ---
function initDashboard() {
    const s = state.get();
    contentDiv.innerHTML = view.dashboardSkeleton(s);
    setupDashboardListeners();

    if (s.currentInventory && s.currentInventory.length > 0) {
        renderInventoryTable(s.currentInventory, s.totalPages);
    } else {
        loadDashboardData();
    }
}

function renderInventoryTable(data, totalPages) {
    const s = state.get();
    const tbody = document.getElementById('dashTable');
    if(!tbody) return;

    tbody.innerHTML = '';
    document.getElementById('pageInfo').innerText = `Page ${s.page} of ${totalPages}`;
    document.getElementById('prevBtn').disabled = s.page === 1;
    document.getElementById('nextBtn').disabled = s.page >= totalPages;

    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px">No products found.</td></tr>`;
        return;
    }

    data.forEach(p => {
        tbody.insertAdjacentHTML('beforeend', view.productRow(p, s.selectedIds.has(p.id)));
    });

    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.onchange = () => { state.toggleSelect(parseInt(cb.dataset.id)); updateSelectionUI(); };
    });
    document.querySelectorAll('.btn-transfer-single').forEach(btn => {
        btn.onclick = () => {
            const product = state.getProduct(parseInt(btn.dataset.id));
            modal.open('single', product, loadDashboardData);
        };
    });
    document.querySelectorAll('.sortable').forEach(th => {
        th.onclick = () => { state.toggleSort(th.dataset.sort); loadDashboardData(); };
    });
    updateSelectionUI();
}

async function loadDashboardData() {
    const s = state.get();
    const tbody = document.getElementById('dashTable');
    if(tbody) tbody.style.opacity = '0.5';

    try {
        const res = await api.getInventory(s.page, s.search, s.status, s.sortBy, s.sortOrder);
        if (res.status === 'success') {
            state.setInventoryData(res.data, res.pagination.total_pages, res.pagination.total_items);
            renderInventoryTable(res.data, res.pagination.total_pages);
        } else {
            toast.show(res.message, "error");
        }
    } catch (e) { console.error(e); }
    if(tbody) tbody.style.opacity = '1';
}

function setupDashboardListeners() {
    let timeout;
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => { state.setSearch(e.target.value); loadDashboardData(); }, 500);
        });
    }

    // Redirect "Deduct Sales" to Orders Tab
    document.getElementById('btnGotoOrders').onclick = () => {
        const ordersNav = document.querySelectorAll('.nav-item')[3];
        loadView('orders', ordersNav);
    };

    document.getElementById('syncBtn').onclick = startSyncLoop;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => { state.setStatus(btn.dataset.tab); initDashboard(); loadDashboardData(); };
    });

    document.getElementById('prevBtn').onclick = () => { state.get().page--; loadDashboardData(); };
    document.getElementById('nextBtn').onclick = () => { state.get().page++; loadDashboardData(); };

    const selectAll = document.getElementById('selectAll');
    if(selectAll) {
        selectAll.onchange = (e) => {
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
                state.toggleSelect(parseInt(cb.dataset.id));
            });
            updateSelectionUI();
        };
    }

    document.getElementById('btnBulkTransfer').onclick = () => {
        const selected = state.getProducts(state.get().selectedIds);
        modal.open('bulk', selected, () => { state.clearSelection(); loadDashboardData(); });
    };
}

function updateSelectionUI() {
    const bar = document.getElementById('selectionBar');
    const count = state.get().selectedIds.size;
    if(bar) {
        bar.style.display = count > 0 ? 'flex' : 'none';
        document.getElementById('selectCount').innerText = `${count} Selected`;
    }
}

async function startSyncLoop() {
    const s = state.get();
    if (s.isSyncing) return;
    s.isSyncing = true; s.syncPage = 1;
    const btn = document.getElementById('syncBtn');

    while(s.isSyncing) {
        if(btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Page ${s.syncPage}...`;
        const res = await api.syncProducts(s.syncPage);
        if(res.status === 'done' || res.synced_count === 0) s.isSyncing = false;
        else s.syncPage++;
    }

    if(btn) btn.innerHTML = 'Done';
    setTimeout(() => { if(btn) btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Sync Web'; }, 2000);
    if(s.view === 'dashboard') loadDashboardData();
}

// --- CONTROLLER: BRANCHES ---
async function initBranches() {
    contentDiv.innerHTML = view.branchesSkeleton();

    document.getElementById('btnAddBranch').onclick = () => {
        modal.openInput("Add New Branch", "Enter Branch Name:", async (name) => {
            try {
                const res = await api.addLocation(name);
                if (res.status === 'success') {
                    state.locations = [];
                    initBranches();
                    toast.show("Branch Created", "success");
                } else {
                    toast.show(res.message, "error");
                }
            } catch (e) { toast.show(e.message, "error"); }
        });
    };

    const locations = await state.loadLocations();
    const tbody = document.getElementById('branchTable');
    if(!tbody) return;
    tbody.innerHTML = '';

    locations.forEach(loc => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>#${loc.id}</td><td><b>${loc.name}</b></td><td>${loc.created_at}</td>
        <td><button class="btn btn-danger btn-del-loc" data-id="${loc.id}">Delete</button></td>`;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-del-loc').forEach(btn => {
        btn.onclick = async () => {
            if(confirm('Delete?')) {
                await api.deleteLocation(btn.dataset.id);
                state.locations = [];
                initBranches();
            }
        };
    });
}

// --- CONTROLLER: TRANSFERS ---
async function initTransfers() {
    contentDiv.innerHTML = view.transfersSkeleton();
    document.getElementById('btnFilterTransfers').onclick = () => loadTransferData();
    document.getElementById('transSearch').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') loadTransferData();
    });
    loadTransferData();
}

async function loadTransferData() {
    const container = document.getElementById('transferList');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Loading...</div>';

    const search = document.getElementById('transSearch').value;
    const start = document.getElementById('transStart').value;
    const end = document.getElementById('transEnd').value;

    const res = await api.getTransfers(search, start, end);

    if (res.status === 'success') {
        if (res.data.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">No transfers found matching your criteria.</div>';
            return;
        }

        const groups = {};
        res.data.forEach(log => {
            if (!groups[log.batch_id]) {
                groups[log.batch_id] = {
                    date: log.created_at,
                    from: log.from_loc_name,
                    to: log.to_loc_name,
                    items: []
                };
            }
            groups[log.batch_id].items.push(log);
        });

        container.innerHTML = '';
        Object.values(groups).forEach(group => {
            const dateStr = new Date(group.date).toLocaleString();
            let itemsHtml = '';
            group.items.forEach(item => {
                itemsHtml += `
                    <li class="transfer-item">
                        <div><b>${item.product_name}</b> <span style="color:#888; font-size:0.9em; margin-left:10px;">${item.sku || ''}</span></div>
                        <div class="t-qty">x ${item.qty}</div>
                    </li>`;
            });

            const card = `
                <div class="transfer-group">
                    <div class="transfer-header" onclick="this.parentElement.classList.toggle('open')">
                        <div>
                            <span class="t-date">${dateStr}</span>
                            <span class="t-meta">ID: ${group.items[0].batch_id.substring(0,8)}...</span>
                            <span class="t-meta" style="margin-left:10px;">(${group.items.length} items)</span>
                        </div>
                        <div style="display:flex; align-items:center;">
                            <span class="t-badge t-from">${group.from}</span> 
                            <i class="fa-solid fa-arrow-right" style="color:#aaa; margin:0 10px; font-size:0.8em;"></i> 
                            <span class="t-badge t-to">${group.to}</span>
                            <i class="fa-solid fa-chevron-down transfer-toggle-icon"></i>
                        </div>
                    </div>
                    <ul class="transfer-items">${itemsHtml}</ul>
                </div>`;
            container.insertAdjacentHTML('beforeend', card);
        });
    } else {
        container.innerHTML = `<div style="color:red">Error: ${res.message}</div>`;
    }
}

// --- CONTROLLER: ORDERS ---
// --- CONTROLLER: ORDERS ---
async function initOrders() {
    // 1. RENDER HEADER & CONTROLS
    // We add a "Default Branch" selector here
    contentDiv.innerHTML = `
        <div class="page-header">
            <div class="header-top">
                <h2>Order Review</h2>
                <div style="display:flex; gap:10px; align-items:center;">
                    <div style="font-size:0.9em; color:#555;">Cashier Default:</div>
                    <select id="defaultLocationSelect" style="padding:6px; border-radius:4px; border:1px solid #ccc; width:150px;">
                        <option value="">-- None --</option>
                    </select>
                    <button id="btnRefreshOrders" class="btn btn-primary"><i class="fa-solid fa-rotate"></i> Fetch</button>
                </div>
            </div>
            
            <div style="margin-top:10px; display:flex; align-items:center; gap:10px; background:#fff; padding:10px; border-radius:6px; border:1px solid #ddd;">
                <span style="font-size:0.9em; font-weight:bold; color:#555;">Filter Date:</span>
                <input type="date" id="orderStart" style="padding:5px; border:1px solid #ccc; border-radius:4px;">
                <span style="color:#aaa;">to</span>
                <input type="date" id="orderEnd" style="padding:5px; border:1px solid #ccc; border-radius:4px;">
                <button id="btnFilterOrders" class="btn btn-sm btn-primary">Apply</button>
            </div>
        </div>
        
        <div id="orderList" class="order-grid">
            <div style="grid-column: 1/-1; text-align:center; padding:40px; color:#888;">Click "Fetch" to check for sales.</div>
        </div>
    `;

    const container = document.getElementById('orderList');
    const btnRefresh = document.getElementById('btnRefreshOrders');
    const btnFilter = document.getElementById('btnFilterOrders');
    const defLocSelect = document.getElementById('defaultLocationSelect');

    // 2. LOAD LOCATIONS & SETUP DEFAULT
    const locations = await state.loadLocations();
    const locOptions = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

    // Populate Default Dropdown
    defLocSelect.innerHTML = `<option value="">-- None --</option>` + locOptions;

    // Load saved default
    const savedDef = localStorage.getItem('cashier_default_location');
    if(savedDef) defLocSelect.value = savedDef;

    // Save on change
    defLocSelect.onchange = () => {
        localStorage.setItem('cashier_default_location', defLocSelect.value);
        // Optional: Update currently visible dropdowns?
        // For now, next fetch will use it.
    };

    // 3. FETCH & RENDER LOGIC
    const loadOrders = async () => {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#666;"><i class="fa-solid fa-spinner fa-spin"></i> Checking WooCommerce...</div>';
        btnRefresh.disabled = true;

        const start = document.getElementById('orderStart').value;
        const end = document.getElementById('orderEnd').value;
        const currentDefault = defLocSelect.value;

        try {
            const res = await api.getPendingOrders(start, end);

            if(res.status === 'success') {
                if(res.data.length === 0) {
                    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#888;">No pending orders found.</div>';
                } else {
                    container.innerHTML = ''; // Clear loading

                    res.data.forEach(order => {
                        const itemsJson = JSON.stringify(order.raw_items).replace(/"/g, '&quot;');
                        const totalFormatted = parseInt(order.total).toLocaleString(); // Comma separated

                        // Build Items List HTML
                        let itemsListHtml = '<ul class="order-items-list">';
                        order.raw_items.forEach(item => {
                            itemsListHtml += `<li><span class="qty-badge">${item.quantity}</span> ${item.name}</li>`;
                        });
                        itemsListHtml += '</ul>';

                        const html = `
                        <div class="order-card" id="order-card-${order.id}">
                            <div class="order-header" onclick="this.parentElement.classList.toggle('open')">
                                <div style="flex:1;">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <span class="order-id">#${order.id}</span>
                                        <span class="order-total">${totalFormatted} Frw</span>
                                    </div>
                                    <div class="order-customer">${order.customer}</div>
                                </div>
                                <i class="fa-solid fa-chevron-down toggle-icon"></i>
                            </div>
                            
                            <div class="order-body">
                                ${itemsListHtml}
                                
                                <div class="order-actions">
                                    <select id="loc-select-${order.id}" class="order-select">
                                        <option value="" disabled ${!currentDefault ? 'selected' : ''}>Source Branch?</option>
                                        ${locations.map(l => `<option value="${l.id}" ${l.id == currentDefault ? 'selected' : ''}>${l.name}</option>`).join('')}
                                    </select>
                                    <button class="btn btn-primary btn-process-order" 
                                        data-id="${order.id}" 
                                        data-items="${itemsJson}">
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </div>`;
                        container.insertAdjacentHTML('beforeend', html);
                    });

                    // Attach Confirm Listeners
                    document.querySelectorAll('.btn-process-order').forEach(btn => {
                        btn.onclick = (e) => {
                            e.stopPropagation(); // Prevent card toggle
                            handleProcessOrder(btn);
                        };
                    });

                    // Prevent dropdown clicks from toggling card
                    document.querySelectorAll('.order-select').forEach(sel => {
                        sel.onclick = (e) => e.stopPropagation();
                    });
                }
            } else {
                container.innerHTML = `<div style="color:red; padding:20px;">Error: ${res.message}</div>`;
            }
        } catch(e) {
            container.innerHTML = `<div style="color:red; padding:20px;">Network Error: ${e.message}</div>`;
        } finally {
            btnRefresh.disabled = false;
        }
    };

    btnRefresh.onclick = loadOrders;
    btnFilter.onclick = loadOrders;

    // Auto-load if no dates set, otherwise wait for user
    loadOrders();
}

async function handleProcessOrder(btn) {
    const oid = btn.dataset.id;
    const items = JSON.parse(btn.dataset.items);
    const locId = document.getElementById(`loc-select-${oid}`).value;

    if (!locId) return alert("Please select the Source Branch first.");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const res = await api.processOrder({ order_id: oid, location_id: locId, items: items });
        if (res.status === 'success') {
            const card = document.getElementById(`order-card-${oid}`);
            card.style.transition = 'all 0.5s';
            card.style.opacity = '0';
            setTimeout(() => { card.remove(); }, 500);
            toast.show("Stock Deducted", "success");
        } else {
            alert("Error: " + res.message);
            btn.disabled = false;
            btn.innerText = "Confirm";
        }
    } catch (e) {
        alert("Network Error");
        btn.disabled = false;
        btn.innerText = "Confirm";
    }
}

// START
loadDashboardData();
loadView('dashboard', document.querySelector('.nav-item.active'));