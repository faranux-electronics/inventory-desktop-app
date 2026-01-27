module.exports = {
    dashboardSkeleton: (state) => `
        <div class="page-header">
            <div class="header-top">
                <h2>Inventory Dashboard</h2>
                <div style="display:flex; gap:10px;">
                    <div class="search-box">
                        <i class="fa-solid fa-search"></i>
                        <input type="text" id="searchInput" class="search-input" placeholder="Search..." value="${state.search}">
                    </div>
                    <button id="btnGotoOrders" class="btn" style="background:#6c5ce7; color:white;"><i class="fa-solid fa-cart-shopping"></i> Deduct Sales</button>
                    <button id="syncBtn" class="btn btn-primary"><i class="fa-solid fa-cloud-arrow-down"></i> Sync Web</button>
                </div>
            </div>
            <div class="tabs">
                <button class="tab-btn ${state.status === 'publish' ? 'active' : ''}" data-tab="publish">Published</button>
                <button class="tab-btn ${state.status === 'draft' ? 'active' : ''}" data-tab="draft">Drafts</button>
                <button class="tab-btn ${state.status === 'private' ? 'active' : ''}" data-tab="private">Private</button>
            </div>
        </div>

        <div id="selectionBar" style="display:none; background:#e8f0fe; padding:10px; border-radius:5px; margin-bottom:10px; justify-content:space-between; align-items:center;">
            <span id="selectCount" style="color:#1967d2; font-weight:600;">0 selected</span>
            <button class="btn btn-primary" id="btnBulkTransfer"><i class="fa-solid fa-truck-ramp-box"></i> Transfer Selected</button>
        </div>

        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th width="5%"><input type="checkbox" id="selectAll"></th>
                        <th width="45%" class="sortable" data-sort="name">Product <i class="fa-solid fa-sort"></i></th>
                        <th width="15%" class="sortable" data-sort="sku">SKU <i class="fa-solid fa-sort"></i></th>
                        <th width="35%">Stock Location</th>
                    </tr>
                </thead>
                <tbody id="dashTable"><tr><td colspan="4">Loading...</td></tr></tbody>
            </table>
            <div style="padding: 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee;">
                <span id="pageInfo" style="color: #666; font-size: 0.9em;">Page 1</span>
                <div>
                    <button id="prevBtn" class="btn btn-primary">Prev</button>
                    <button id="nextBtn" class="btn btn-primary">Next</button>
                </div>
            </div>
        </div>
    `,

    productRow: (p, isSelected) => {
        const imgHtml = (p.image && p.image.length > 5)
            ? `<img src="${p.image}" class="thumb">`
            : `<div class="thumb-placeholder">${p.name.charAt(0).toUpperCase()}</div>`;

        let stockHtml = '';
        if (p.stock_breakdown) {
            p.stock_breakdown.forEach(loc => {
                let color = loc.type === 'defect' ? '#ffebee' : (loc.type === 'virtual' ? '#fff3e0' : '#e3f2fd');
                let text = loc.type === 'defect' ? '#c62828' : (loc.type === 'virtual' ? '#ef6c00' : '#1565c0');
                stockHtml += `<span style="background:${color}; color:${text}; padding:4px 8px; border-radius:12px; margin-right:5px; font-size:0.85em; display:inline-block;">${loc.location_name}: <b>${loc.quantity}</b></span>`;
            });
        }

        return `
            <tr class="product-row">
                <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''}></td>
                <td><div style="display:flex; align-items:center;">${imgHtml} <b>${p.name}</b></div></td>
                <td><span style="color:#555;">${p.sku || '-'}</span></td>
                <td>
                    <div style="margin-bottom:5px;">${stockHtml}</div>
                    <button class="btn btn-sm btn-transfer-single" data-id="${p.id}"><i class="fa-solid fa-arrow-right-arrow-left"></i> Move</button>
                </td>
            </tr>`;
    },

    branchesSkeleton: () => `
        <div class="page-header">
            <div class="header-top">
                <h2>Manage Branches</h2>
                <button id="btnAddBranch" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Add New Branch</button>
            </div>
        </div>
        <div class="card">
            <table>
                <thead><tr><th>ID</th><th>Branch Name</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody id="branchTable"><tr><td colspan="4">Loading...</td></tr></tbody>
            </table>
        </div>
    `,

    transfersSkeleton: () => `
        <div class="page-header">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h2>Transfer History</h2>
                <button class="btn" onclick="initTransfers()"><i class="fa-solid fa-rotate"></i> Reset</button>
            </div>
            <div style="display:flex; gap:10px; background:#fff; padding:10px; border-radius:6px; border:1px solid #ddd; align-items:center;">
                <div style="flex:2; position:relative;">
                    <i class="fa-solid fa-search" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#aaa;"></i>
                    <input type="text" id="transSearch" placeholder="Search Product, SKU, Batch..." style="width:100%; padding:8px 8px 8px 35px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <div style="display:flex; align-items:center; gap:5px; color:#555; font-size:0.9em;">
                    <label>From:</label><input type="date" id="transStart" style="padding:7px; border:1px solid #ccc; border-radius:4px;">
                    <label>To:</label><input type="date" id="transEnd" style="padding:7px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <button class="btn btn-primary" id="btnFilterTransfers">Filter</button>
            </div>
        </div>
        <div id="transferList" style="margin-top:20px;">Loading...</div>
    `,

    ordersSkeleton: () => `
        <div class="page-header">
            <div class="header-top">
                <h2>Order Review</h2>
                <button id="btnRefreshOrders" class="btn btn-primary"><i class="fa-solid fa-rotate"></i> Fetch New Orders</button>
            </div>
            <p style="color:#666; font-size:0.9em; margin-top:5px;">Review pending WooCommerce orders and select the branch to deduct stock from.</p>
        </div>
        <div id="orderList" class="order-grid">
            <div style="grid-column: 1/-1; text-align:center; padding:40px; color:#888;">Click "Fetch New Orders" to check for sales.</div>
        </div>
    `
};