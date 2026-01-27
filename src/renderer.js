// src/renderer.js
const api = require('./js/api.js');
const state = require('./js/state.js');
const view = require('./js/view.js');
const modal = require('./js/modal.js');
const toast = require('./js/toast.js');

const contentDiv = document.getElementById('appContent');

// Initialize Modal
modal.init();

// --- ROUTER ---
window.loadView = (viewName, navElement) => {
    state.get().view = viewName;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if(navElement) navElement.classList.add('active');

    if (viewName === 'dashboard') initDashboard();
    if (viewName === 'branches') initBranches();
    if (viewName === 'transfers') initTransfers();
    };

// --- CONTROLLER: DASHBOARD ---
function initDashboard() {
    const s = state.get();
    contentDiv.innerHTML = view.dashboardSkeleton(s);
    setupDashboardListeners();

    // CACHE CHECK: Do we already have data?
    if (s.currentInventory && s.currentInventory.length > 0) {
        // Yes! Render from Memory (Instant)
        console.log("Loading from Cache...");
        renderInventoryTable(s.currentInventory, s.totalPages);
    } else {
        // No, fetch from Server
        console.log("Fetching from Server...");
        loadDashboardData();
    }
}

// Helper: Just draws the table (No Network)
function renderInventoryTable(data, totalPages) {
    const s = state.get();
    const tbody = document.getElementById('dashTable');
    if(!tbody) return;

    tbody.innerHTML = '';
    tbody.style.opacity = '1';

    // Update Pagination Text
    document.getElementById('pageInfo').innerText = `Page ${s.page} of ${totalPages}`;
    document.getElementById('prevBtn').disabled = s.page === 1;
    document.getElementById('nextBtn').disabled = s.page >= totalPages;

    // Empty State
    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px">No products found.</td></tr>`;
        return;
    }

    // Draw Rows
    data.forEach(p => {
        tbody.insertAdjacentHTML('beforeend', view.productRow(p, s.selectedIds.has(p.id)));
    });

    // Re-attach Listeners
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.onchange = () => { state.toggleSelect(parseInt(cb.dataset.id)); updateSelectionUI(); };
    });
    document.querySelectorAll('.btn-transfer-single').forEach(btn => {
        btn.onclick = () => {
            const product = state.getProduct(parseInt(btn.dataset.id));
            modal.open('single', product, loadDashboardData); // Refresh on success
        };
    });
    document.querySelectorAll('.sortable').forEach(th => {
        th.onclick = () => { state.toggleSort(th.dataset.sort); loadDashboardData(); };
    });

    updateSelectionUI();
}

// Helper: Fetches Data from API
async function loadDashboardData() {
    const s = state.get();
    const tbody = document.getElementById('dashTable');
    if(tbody) tbody.style.opacity = '0.5';

    try {
        const res = await api.getInventory(s.page, s.search, s.status, s.sortBy, s.sortOrder);

        if (res.status === 'success') {
            // SAVE TO CACHE
            state.setInventoryData(res.data, res.pagination.total_pages, res.pagination.total_items);
            // RENDER
            renderInventoryTable(res.data, res.pagination.total_pages);
        } else {
            toast.show("Failed to load data: " + res.message, "error");
        }
    } catch (e) {
        console.error(e);
    }
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

    const syncBtn = document.getElementById('syncBtn');
    if(syncBtn) syncBtn.onclick = startSyncLoop;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => { state.setStatus(btn.dataset.tab); initDashboard(); loadDashboardData(); }; // Tabs always fetch fresh
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

// --- CONTROLLER: SYNC ---
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
    // If we are on dashboard, refresh data to show new items
    if(s.view === 'dashboard') loadDashboardData();
}

// --- CONTROLLER: BRANCHES ---
async function initBranches() {
    contentDiv.innerHTML = view.branchesSkeleton();

    document.getElementById('btnAddBranch').onclick = async () => {
        const name = prompt("Branch Name:");
        if(name) { await api.addLocation(name); state.locations = []; initBranches(); } // Clear cache to reload
    };

    // CACHE CHECK: Use state.loadLocations() instead of api directly
    const locations = await state.loadLocations();

    const tbody = document.getElementById('branchTable');
    if(!tbody) return; // Safety check
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
                state.locations = []; // Clear cache
                initBranches();
            }
        };
    });
}

// 2. NEW CONTROLLER: TRANSFERS
// ... imports ...

async function initTransfers() {
    // 1. Load Skeleton
    contentDiv.innerHTML = `
        <div class="page-header">
            <h2>Transfer History</h2>
            <button class="btn btn-primary" onclick="initTransfers()"><i class="fa-solid fa-rotate"></i> Refresh</button>
        </div>
        <div id="transferList">Loading...</div>
    `;

    const container = document.getElementById('transferList');
    const res = await api.getTransfers();

    if (res.status === 'success') {
        if (res.data.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">No transfers found.</div>';
            return;
        }

        // 2. GROUP BY BATCH_ID
        const groups = {};
        res.data.forEach(log => {
            if (!groups[log.batch_id]) {
                groups[log.batch_id] = {
                    date: log.created_at,
                    from: log.from_loc_name,
                    to: log.to_loc_name,
                    user: log.performed_by,
                    items: []
                };
            }
            groups[log.batch_id].items.push(log);
        });

        // 3. RENDER CARDS
        container.innerHTML = '';
        Object.values(groups).forEach(group => {
            const dateStr = new Date(group.date).toLocaleString();

            let itemsHtml = '';
            group.items.forEach(item => {
                itemsHtml += `
                    <li class="transfer-item">
                        <div>
                            <b>${item.product_name}</b> 
                            <span style="color:#888; font-size:0.9em; margin-left:10px;">${item.sku || ''}</span>
                        </div>
                        <div class="t-qty">x ${item.qty}</div>
                    </li>`;
            });

            const card = `
                <div class="transfer-group">
                    <div class="transfer-header">
                        <div>
                            <span class="t-date">${dateStr}</span>
                            <span class="t-meta">ID: ${group.items[0].batch_id.substring(0,8)}...</span>
                        </div>
                        <div>
                            <span class="t-badge t-from">${group.from}</span> 
                            <i class="fa-solid fa-arrow-right" style="color:#aaa; margin:0 10px; font-size:0.8em;"></i> 
                            <span class="t-badge t-to">${group.to}</span>
                        </div>
                    </div>
                    <ul class="transfer-items">
                        ${itemsHtml}
                    </ul>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });

    } else {
        container.innerHTML = `<div style="color:red">Error: ${res.message}</div>`;
    }
}

// START APP
// Trigger the first load immediately!
loadDashboardData();
// We don't call initDashboard() here because index.html usually has the sidebar active
// but content empty. Let's force the view:
loadView('dashboard', document.querySelector('.nav-item.active'));