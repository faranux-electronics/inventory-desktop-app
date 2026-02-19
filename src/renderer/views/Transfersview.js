//
const API = require('../services/api.js');
const TransferTable = require('./transfers/TransferTable.js');

class TransfersView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.tableComponent = new TransferTable(this);

        const savedState = this.state.getTabState('transfers');
        if (savedState) {
            this.currentTab = savedState.currentTab || 'pending_incoming';
            this.filters = savedState.filters || { search: '', start: '', end: '', page: 1, userId: '' };
        } else {
            this.currentTab = 'pending_incoming';
            this.filters = { search: '', start: '', end: '', page: 1, userId: '' };
        }
    }

    saveState() {
        this.state.saveTabState('transfers', {
            currentTab: this.currentTab,
            filters: this.filters
        });
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row">
                    <h1 class="page-title text-neutral-800 font-normal">Transfer Management</h1>
                </div>

                <div class="tabs mt-md" style="border-bottom: 1px solid #c3c4c7;">
                    <button class="tab-btn ${this.currentTab === 'pending_incoming' ? 'active' : ''}" data-tab="pending_incoming">Incoming (To Receive)</button>
                    <button class="tab-btn ${this.currentTab === 'pending_outgoing' ? 'active' : ''}" data-tab="pending_outgoing">Outgoing (Sent by Me)</button>
                    <button class="tab-btn ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
                </div>
            </div>

            <div class="flex items-center gap-sm mb-md p-sm" style="background: #f8f9fa; border: 1px solid #c3c4c7; border-radius: 4px; flex-wrap: wrap;">
                <div class="flex items-center">
                    <input type="date" id="dateStart" class="form-input form-input-sm" style="width: 140px; background: white; border-color: #8c8f94;" value="${this.filters.start}" title="From Date">
                </div>
                <div class="flex items-center">
                    <input type="date" id="dateEnd" class="form-input form-input-sm" style="width: 140px; background: white; border-color: #8c8f94;" value="${this.filters.end}" title="To Date">
                </div>
                <div class="search-box flex-1" style="min-width: 250px;">
                    <i class="fa-solid fa-search" style="font-size: 13px; color: #8c8f94; left: 10px;"></i>
                    <input type="text" id="transferSearch" class="search-input form-input-sm w-full" 
                           style="background: white; padding-left: 32px; border-color: #8c8f94;" 
                           placeholder="Filter by registered Batch ID or Product..." 
                           value="${this.filters.search}">
                </div>
                <button class="btn btn-sm" id="refreshBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1;">Filter</button>
                <button class="btn btn-sm btn-ghost" id="exportCsvBtn" style="border: 1px solid #8c8f94; color: #2c3338; background: white;">
                    <i class="fa-solid fa-file-csv"></i> Export
                </button>
            </div>

            <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: white; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="width: 40px; padding: 10px; border-bottom: 1px solid #c3c4c7;"></th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Batch ID</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Date</th>
                                <th class="text-center" style="padding: 10px; border-bottom: 1px solid #c3c4c7;"><i class="fa-solid fa-arrows-turn-to-dots" style="color: #a7aaad;"></i></th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">From</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">To</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Items (Sent)</th>
                                <th class="text-center" style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Discrepancy</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Status</th>
                                <th style="padding: 10px; color: #2c3338; font-weight: 400; border-bottom: 1px solid #c3c4c7;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="transfersTableBody">
                            <tr><td colspan="10" class="text-center p-lg text-muted">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="pagination" id="paginationControls" style="border-top: 1px solid #c3c4c7; background: #f8f9fa;"></div>
            </div>
        `;

        this.attachEvents();
        this.loadTransfers();
    }

    attachEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.filters.page = 1;
                this.saveState();
                this.loadTransfers();
            });
        });

        const applyFilters = () => {
            this.filters.search = document.getElementById('transferSearch').value.trim();
            this.filters.start = document.getElementById('dateStart').value;
            this.filters.end = document.getElementById('dateEnd').value;
            this.filters.page = 1;
            this.saveState();
            this.loadTransfers();
        };

        document.getElementById('transferSearch').addEventListener('input', applyFilters);
        document.getElementById('dateStart').addEventListener('change', applyFilters);
        document.getElementById('dateEnd').addEventListener('change', applyFilters);
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadTransfers());

        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            let apiType = 'all', apiDir = 'all';
            if (this.currentTab === 'pending_incoming') { apiType = 'pending'; apiDir = 'incoming'; }
            else if (this.currentTab === 'pending_outgoing') { apiType = 'pending'; apiDir = 'outgoing'; }
            else if (this.currentTab === 'history') { apiType = 'history'; apiDir = 'all'; }
            API.exportTransfersCsv(apiType, apiDir, this.filters.search, this.filters.start, this.filters.end);
        });
    }

    async loadTransfers() {
        const tbody = document.getElementById('transfersTableBody');
        tbody.innerHTML = '<tr><td colspan="10" class="text-center p-lg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

        let apiType = 'all', apiDir = 'all';
        if (this.currentTab === 'pending_incoming') { apiType = 'pending'; apiDir = 'incoming'; }
        else if (this.currentTab === 'pending_outgoing') { apiType = 'pending'; apiDir = 'outgoing'; }
        else if (this.currentTab === 'history') { apiType = 'history'; apiDir = 'all'; }

        try {
            const res = await API.getTransfers(apiType, apiDir, this.filters.page, this.filters.search, '', this.filters.start, this.filters.end, this.filters.userId);
            if (res.status === 'success') {
                // Delegate rendering to the Table component
                this.tableComponent.render(res.data || []);
            } else {
                tbody.innerHTML = `<tr><td colspan="10" class="text-center text-error p-lg">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center text-error p-lg">Connection Failed</td></tr>`;
        }
    }
}

module.exports = TransfersView;