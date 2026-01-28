const Toast = require('../components/Toast.js');
const API = require('../services/api.js');

class TransfersView {
    constructor(app) {
        this.app = app;
    }

    render() {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="page-header">
                <div class="header-row">
                    <h1 class="page-title">Transfer History</h1>
                    <button class="btn btn-secondary" id="resetTransfersBtn">
                        <i class="fa-solid fa-rotate"></i> Reset
                    </button>
                </div>
                
                <div class="card" style="padding: var(--spacing-md); display:flex; flex-wrap:wrap; gap:var(--spacing-md); align-items:center;">
                    <div class="search-box">
                        <i class="fa-solid fa-search"></i>
                        <input type="text" id="transSearch" class="search-input" placeholder="Search Product, SKU...">
                    </div>
                    <div class="flex items-center gap-sm">
                        <input type="date" id="transStart" class="form-input" style="width:auto;">
                        <span class="text-muted">to</span>
                        <input type="date" id="transEnd" class="form-input" style="width:auto;">
                    </div>
                    <button class="btn btn-primary" id="btnFilterTransfers">Filter</button>
                </div>
            </div>

            <div id="transferList" class="mt-lg">
                <div class="text-center p-xl text-muted">Loading...</div>
            </div>
        `;

        this.attachEvents();
        this.loadData();
    }

    attachEvents() {
        document.getElementById('btnFilterTransfers').addEventListener('click', () => this.loadData());

        document.getElementById('resetTransfersBtn').addEventListener('click', () => {
            document.getElementById('transSearch').value = '';
            document.getElementById('transStart').value = '';
            document.getElementById('transEnd').value = '';
            this.loadData();
        });

        document.getElementById('transSearch').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.loadData();
        });
    }

    async loadData() {
        const container = document.getElementById('transferList');
        container.innerHTML = '<div class="text-center p-xl text-muted">Loading...</div>';

        const search = document.getElementById('transSearch').value;
        const start = document.getElementById('transStart').value;
        const end = document.getElementById('transEnd').value;

        try {
            const res = await API.getTransfers(search, start, end);

            if (res.status === 'success') {
                if (res.data.length === 0) {
                    container.innerHTML = '<div class="text-center p-xl text-muted">No transfers found matching criteria.</div>';
                    return;
                }

                // Group by Batch ID
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

                    const itemsHtml = group.items.map(item => `
                        <div class="flex justify-between items-center p-sm border-b border-neutral-200">
                            <div>
                                <span class="font-semibold text-sm">${item.product_name}</span> 
                                <span class="text-muted text-xs ml-sm">${item.sku || ''}</span>
                            </div>
                            <div class="font-bold text-sm">x ${item.qty}</div>
                        </div>
                    `).join('');

                    // Using the Card style for the group
                    const card = document.createElement('div');
                    card.className = 'card mb-md';
                    card.innerHTML = `
                        <div class="p-md flex justify-between items-center bg-neutral-50 cursor-pointer transfer-header" style="border-bottom: 1px solid var(--neutral-200);">
                            <div>
                                <span class="font-bold text-neutral-800 mr-md">${dateStr}</span>
                                <span class="text-muted text-xs">ID: ${group.items[0].batch_id.substring(0,8)}...</span>
                                <span class="badge badge-neutral ml-sm">${group.items.length} items</span>
                            </div>
                            <div class="flex items-center gap-sm">
                                <span class="badge badge-error">${group.from}</span> 
                                <i class="fa-solid fa-arrow-right text-muted text-xs"></i> 
                                <span class="badge badge-success">${group.to}</span>
                                <i class="fa-solid fa-chevron-down text-muted ml-md transition-transform duration-200"></i>
                            </div>
                        </div>
                        <div class="transfer-body hidden">
                            <div class="p-md bg-white">
                                ${itemsHtml}
                            </div>
                        </div>
                    `;

                    // Accordion Logic
                    const header = card.querySelector('.transfer-header');
                    const body = card.querySelector('.transfer-body');
                    const icon = card.querySelector('.fa-chevron-down');

                    header.addEventListener('click', () => {
                        body.classList.toggle('hidden');
                        icon.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                    });

                    container.appendChild(card);
                });

            } else {
                container.innerHTML = `<div class="text-error p-lg">Error: ${res.message}</div>`;
            }
        } catch (e) {
            container.innerHTML = `<div class="text-error p-lg">Network Error</div>`;
        }
    }
}

module.exports = TransfersView;