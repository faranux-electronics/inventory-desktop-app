const Toast = require('../components/Toast.js');
const Modal = require('../components/Modal.js');
const API = require('../services/api.js');

class ImportView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
        this.parsedData = [];
        this.historyLogs = [];
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row mb-sm">
                    <h1 class="page-title text-neutral-800 font-normal">Import Stock</h1>
                </div>
                
                <div class="tabs" style="border-bottom: 1px solid #c3c4c7;">
                    <button class="tab-btn active" id="mainTabNew" style="padding: 8px 16px; font-weight: 600;">New Import</button>
                    <button class="tab-btn" id="mainTabHistory" style="padding: 8px 16px; font-weight: 600;"><i class="fa-solid fa-clock-rotate-left"></i> Import History</button>
                </div>
            </div>

            <div id="viewNewImport">
                <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;">
                    
                    <div style="flex: 1; min-width: 350px; background: white; border: 1px solid #c3c4c7; border-radius: 4px; padding: 20px;">
                        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 15px; border-bottom: 1px solid #f0f0f1; padding-bottom: 10px;">
                            1. Import Settings
                        </h3>
                        
                        <div class="form-group mb-lg">
                            <label class="form-label" style="font-weight: 500;">Import Mode</label>
                            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="radio" name="importMode" value="add" checked>
                                    <span><b>Add</b> to existing stock <span class="text-muted text-xs">(e.g., Receiving new purchases)</span></span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="radio" name="importMode" value="replace">
                                    <span><b>Replace</b> existing stock <span class="text-muted text-xs">(e.g., Initial setup or full physical count)</span></span>
                                </label>
                            </div>
                        </div>

                        <div class="tabs mb-md" style="border-bottom: 1px solid #c3c4c7;">
                            <button class="tab-btn active" id="tabUpload" style="padding: 8px 16px;">Upload File</button>
                            <button class="tab-btn" id="tabLink" style="padding: 8px 16px;">Import via Link</button>
                        </div>

                        <div id="sectionUpload">
                            <div class="form-group mb-md">
                                <input type="file" id="csvFileInput" accept=".csv" class="form-input" style="padding: 10px;">
                                <small class="text-muted block mt-xs">Must be a standard comma-separated .csv file</small>
                            </div>
                            <button class="btn btn-sm btn-ghost w-full" id="downloadTemplateBtn">
                                <i class="fa-solid fa-download"></i> Download Template
                            </button>
                        </div>

                        <div id="sectionLink" class="hidden">
                            <div class="form-group mb-md">
                                <label class="form-label text-sm text-neutral-600">CSV URL (e.g., Published Google Sheet)</label>
                                <input type="url" id="csvUrlInput" class="form-input" placeholder="https://docs.google.com/spreadsheets/.../pub?output=csv">
                                <small class="text-muted block mt-xs"><i class="fa-solid fa-lightbulb text-warning-500"></i> <b>Google Sheets:</b> Go to File > Share > Publish to web > Choose "Comma-separated values (.csv)"</small>
                            </div>
                            <button class="btn btn-sm btn-secondary w-full" id="fetchUrlBtn">
                                <i class="fa-solid fa-cloud-arrow-down"></i> Fetch Data from Link
                            </button>
                        </div>
                    </div>

                    <div style="width: 300px; background: #f8f9fa; border: 1px solid #c3c4c7; border-radius: 4px; padding: 20px;">
                        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 15px; border-bottom: 1px solid #f0f0f1; padding-bottom: 10px;">
                            <i class="fa-solid fa-circle-info" style="color: #2271b1;"></i> Branch ID Guide
                        </h3>
                        <p class="text-xs text-muted mb-md">Use these exact IDs in the <b>Branch_ID</b> column of your CSV.</p>
                        <table class="compact-table" style="width: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 4px;">
                            <tbody id="branchGuideTable">
                                <tr><td class="text-center text-xs text-muted p-sm">Loading branches...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="previewContainer" class="hidden" style="margin-top: 20px; background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                    <div style="padding: 15px; background: #f8f9fa; border-bottom: 1px solid #c3c4c7; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="font-size: 14px; font-weight: 600; margin: 0;">2. Preview Data</h3>
                        <button class="btn btn-sm btn-primary" id="confirmImportBtn">
                            <i class="fa-solid fa-check"></i> Confirm & Import
                        </button>
                    </div>
                    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: white; border-bottom: 1px solid #c3c4c7; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 10px;">Row</th>
                                    <th style="padding: 10px;">SKU</th>
                                    <th style="padding: 10px;">Quantity</th>
                                    <th style="padding: 10px;">Branch ID</th>
                                </tr>
                            </thead>
                            <tbody id="previewTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="viewHistory" class="hidden">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #1d2327;">Recent Imports</h3>
                    
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="date" id="historyStartDate" class="form-input" style="padding: 4px 8px; font-size: 12px; height: 30px;" title="Start Date">
                        <span style="color: #a7aaad; font-size: 12px;">to</span>
                        <input type="date" id="historyEndDate" class="form-input" style="padding: 4px 8px; font-size: 12px; height: 30px;" title="End Date">
                        
                        <button class="btn btn-sm btn-secondary" id="filterHistoryBtn" style="height: 30px; display: flex; align-items: center;">
                            <i class="fa-solid fa-filter mr-xs"></i> Filter
                        </button>
                        
                        <div style="width: 1px; height: 20px; background: #c3c4c7; margin: 0 4px;"></div>
                        
                        <button class="btn btn-sm" id="exportHistoryBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1; padding: 4px 12px; font-weight: 500; height: 30px; display: flex; align-items: center;">
                            <i class="fa-solid fa-file-csv mr-xs"></i> Export Page
                        </button>
                    </div>
                </div>
                
                <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                            <tr>
                                <th style="padding: 12px 16px; color: #2c3338; font-weight: 500;">Date & Time</th>
                                <th style="padding: 12px 16px; color: #2c3338; font-weight: 500;">Performed By</th>
                                <th style="padding: 12px 16px; color: #2c3338; font-weight: 500;">Import Details</th>
                            </tr>
                        </thead>
                        <tbody id="historyTableBody">
                            <tr><td colspan="3" class="text-center p-lg text-muted">Loading history...</td></tr>
                        </tbody>
                    </table>
                    
                    <div id="historyPagination" style="background: #f8f9fa; border-top: 1px solid #c3c4c7;"></div>
                </div>
            </div>
        `;

        this.init();
    }

    async init() {
        try {
            const locRes = await API.getLocations();
            if (locRes.status === 'success') {
                this.locationsCache = locRes.data;
                const tbody = document.getElementById('branchGuideTable');
                tbody.innerHTML = this.locationsCache.map(l => `
                    <tr>
                        <td style="padding: 8px; font-weight: 600; color: #2271b1; width: 50px; text-align: center; border-right: 1px solid #f0f0f1;">${l.id}</td>
                        <td style="padding: 8px; font-size: 12px; color: #50575e;">${l.name}</td>
                    </tr>
                `).join('');
            }
        } catch (e) {
            console.error("Failed to load locations for guide");
        }

        this.attachEvents();
    }

    attachEvents() {
        // Main View Tabs
        document.getElementById('mainTabNew').addEventListener('click', (e) => {
            e.target.classList.add('active');
            document.getElementById('mainTabHistory').classList.remove('active');
            document.getElementById('viewNewImport').classList.remove('hidden');
            document.getElementById('viewHistory').classList.add('hidden');
        });

        document.getElementById('mainTabHistory').addEventListener('click', (e) => {
            e.target.classList.add('active');
            document.getElementById('mainTabNew').classList.remove('active');
            document.getElementById('viewHistory').classList.remove('hidden');
            document.getElementById('viewNewImport').classList.add('hidden');
            this.loadHistory();
        });

        // Source Sub-Tabs
        const tabUpload = document.getElementById('tabUpload');
        const tabLink = document.getElementById('tabLink');
        const secUpload = document.getElementById('sectionUpload');
        const secLink = document.getElementById('sectionLink');

        tabUpload.addEventListener('click', () => {
            tabUpload.classList.add('active');
            tabLink.classList.remove('active');
            secUpload.classList.remove('hidden');
            secLink.classList.add('hidden');
        });

        tabLink.addEventListener('click', () => {
            tabLink.classList.add('active');
            tabUpload.classList.remove('active');
            secLink.classList.remove('hidden');
            secUpload.classList.add('hidden');
        });

        // Download Template
        document.getElementById('downloadTemplateBtn').addEventListener('click', () => {
            const csv = "SKU,Quantity,Branch_ID\nPROD-001,50,1\nPROD-002,25,1";
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'faranux_stock_import_template.csv';
            a.click();
            window.URL.revokeObjectURL(url);
        });

        // Local File Upload
        document.getElementById('csvFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                this.parseCSV(event.target.result);
            };
            reader.readAsText(file);
        });

        // Fetch URL via Link
        document.getElementById('fetchUrlBtn').addEventListener('click', async () => {
            const url = document.getElementById('csvUrlInput').value.trim();
            if (!url) return Toast.error("Please enter a valid URL");

            const btn = document.getElementById('fetchUrlBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching...';

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

                const text = await response.text();
                this.parseCSV(text);
                Toast.success("Successfully fetched data from link!");
            } catch (e) {
                console.error(e);
                Toast.error("Failed to fetch CSV. Make sure the link is public and points directly to a CSV format.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });

        document.getElementById('confirmImportBtn').addEventListener('click', () => this.submitImport());

        // History Actions
        document.getElementById('filterHistoryBtn').addEventListener('click', () => this.loadHistory(1));
        document.getElementById('exportHistoryBtn').addEventListener('click', () => this.exportHistoryCSV());
    }

    async loadHistory(page = 1) {
        const tbody = document.getElementById('historyTableBody');
        const paginationContainer = document.getElementById('historyPagination');

        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-lg text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Fetching records...</td></tr>';

        // Grab values from Date Filters
        const startDate = document.getElementById('historyStartDate').value;
        let endDate = document.getElementById('historyEndDate').value;
        if (endDate) endDate += ' 23:59:59'; // Ensure it captures the entire end day

        try {
            // Pass the requested page and filters to the API
            const res = await API.getAuditLogs('STOCK_IMPORT', page, startDate, endDate);

            if (res.status === 'success') {
                let logs = Array.isArray(res.data) ? res.data : (res.data.data || []);
                logs = logs.filter(log => log.action === 'STOCK_IMPORT');

                this.historyLogs = logs; // Save current page for exporting

                if (logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-lg text-muted" style="background: #f9f9f9;">No import history found for this period.</td></tr>';
                    paginationContainer.innerHTML = '';
                    return;
                }

                const locMap = {};
                this.locationsCache.forEach(l => { locMap[String(l.id)] = l.name; });

                tbody.innerHTML = logs.map(log => {
                    const date = new Date(log.created_at).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });

                    let detailsHtml = log.details || '';

                    if (log.metadata) {
                        try {
                            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                            if (meta && meta.imported_items && meta.imported_items.length > 0) {
                                const itemCount = meta.imported_items.length;
                                detailsHtml += `
                                <div style="margin-top: 10px;">
                                    <details style="background: white; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                        <summary style="padding: 8px 12px; background: #f8f9fa; cursor: pointer; font-weight: 600; color: #2271b1; font-size: 12px; border-bottom: 1px solid #e5e7eb; outline: none; user-select: none;">
                                            <i class="fa-solid fa-table-list mr-xs"></i> View ${itemCount} affected item${itemCount !== 1 ? 's' : ''}
                                        </summary>
                                        <div style="max-height: 250px; overflow-y: auto;">
                                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                                <thead style="background: white; position: sticky; top: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                                                    <tr>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; color: #50575e; font-weight: 600;">SKU</th>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; color: #50575e; font-weight: 600;">Branch</th>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #50575e; font-weight: 600;">Before</th>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #50575e; font-weight: 600;">After</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${meta.imported_items.map(item => {
                                        const bName = locMap[String(item.branch)] || 'Unknown Branch';
                                        return `
                                                        <tr class="hover:bg-neutral-50">
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; font-family: monospace; font-weight: 600; color: #2c3338;">${item.sku}</td>
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; color: #50575e;">${bName} [${item.branch}]</td>
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; text-align: right; color: #8c8f94;">${item.old}</td>
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; text-align: right; color: #00a32a; font-weight: 600;">${item.new}</td>
                                                        </tr>
                                                        `;
                                                    }).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </details>
                                </div>`;
                                    }
                                    } catch(e) {}
                    }
                    
                    return `
                                    <tr class="hover:bg-neutral-50" style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                                    <td style="padding: 12px 16px; color: #50575e; white-space: nowrap; vertical-align: top;">${date}</td>
                                <td style="padding: 12px 16px; font-weight: 500; color: #2271b1; white-space: nowrap; vertical-align: top;">
                                    <i class="fa-solid fa-user-shield text-xs mr-xs"></i> ${log.user_name || 'System User'}
                                </td>
                                <td style="padding: 12px 16px; color: #2c3338; vertical-align: top;">
                                <span style="background: #f0f6fb; color: #2271b1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 8px; border: 1px solid #c7dff3; display: inline-block; margin-bottom: 6px;">
                                    ${log.action}
                                </span>
                                    <div>${detailsHtml}</div>
                                </td>
                            </tr>
                                `;
                }).join('');

                // --- BUILD PAGINATION CONTROLS ---
                if (res.pagination && res.pagination.pages > 1) {
                    const p = res.pagination;
                    paginationContainer.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;">
                                    <span class="text-sm text-muted">Showing page <b>${p.page}</b> of <b>${p.pages}</b> (Total records: ${p.total})</span>
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn btn-sm btn-ghost btn-hist-page" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Previous</button>
                                    <button class="btn btn-sm btn-ghost btn-hist-page" data-page="${p.page + 1}" ${p.page >= p.pages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>
                                </div>
                            </div>
                                `;
                    
                    paginationContainer.querySelectorAll('.btn-hist-page').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            if (!btn.disabled) this.loadHistory(parseInt(btn.dataset.page));
                        });
                    });
                } else {
                    paginationContainer.innerHTML = ''; // Hide if only 1 page
                }

            } else {
                tbody.innerHTML = `<tr><td colspan="3" class="text-center p-lg text-error">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-lg text-error">Failed to load history</td></tr>';
        }
    }

    exportHistoryCSV() {
        if (!this.historyLogs || this.historyLogs.length === 0) {
            return Toast.error("No history to export.");
        }

        const locMap = {};
        this.locationsCache.forEach(l => { locMap[String(l.id)] = l.name; });

        let csvContent = "Date,User,Action,SKU,Branch Name,Branch ID,Stock Before,Stock After\n";

        this.historyLogs.forEach(log => {
            const date = log.created_at; 
            const user = (log.user_name || 'System User').replace(/"/g, '""');
            const action = log.action;
            
            let hasItems = false;
            if (log.metadata) {
                try {
                    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                    if (meta && meta.imported_items && meta.imported_items.length > 0) {
                        hasItems = true;
                        meta.imported_items.forEach(item => {
                            const cleanSku = `"${item.sku.replace(/"/g, '""')}"`;
                            const bName = locMap[String(item.branch)] || 'Unknown';
                            csvContent += `"${date}","${user}","${action}",${cleanSku},"${bName}",${item.branch},${item.old},${item.new}\n`;
                        });
                    }
                } catch(e) {}
            }

            if (!hasItems) {
                csvContent += `"${date}","${user}","${action}","N/A","N/A","N/A","N/A","N/A"\n`;
            }
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `Stock_Import_History_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    parseCSV(text) {
        const rows = text.split(/\r\n|\n|\r/).filter(r => r.trim() !== '');
        if (rows.length < 2) return Toast.error("The CSV file appears to be empty or missing data.");

        const delimiter = rows[0].includes(';') ? ';' : ',';
        const headers = rows[0].split(delimiter).map(h => h.trim().toLowerCase());

        const skuIdx = headers.indexOf('sku');
        const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
        const branchIdx = headers.findIndex(h => h.includes('branch') || h.includes('location'));

        if (skuIdx === -1 || qtyIdx === -1 || branchIdx === -1) {
            return Toast.error("CSV Headers must include: SKU, Quantity, Branch_ID");
        }

        this.parsedData = [];
        let previewHtml = '';

        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());
            const maxRequiredIdx = Math.max(skuIdx, qtyIdx, branchIdx);

            if (cols.length <= maxRequiredIdx || !cols[skuIdx]) continue;

            const item = {
                sku: cols[skuIdx].trim(),
                qty: parseInt(cols[qtyIdx], 10) || 0,
                branch_id: parseInt(cols[branchIdx], 10)
            };

            this.parsedData.push(item);

            previewHtml += `
                <tr style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                    <td style="padding: 8px 10px; color: #a7aaad;">${i}</td>
                    <td style="padding: 8px 10px; font-family: monospace; font-weight: 600;">${item.sku}</td>
                    <td style="padding: 8px 10px; color: #2271b1; font-weight: 600;">${item.qty}</td>
                    <td style="padding: 8px 10px;">${item.branch_id}</td>
                </tr>
            `;
        }

        if (this.parsedData.length > 0) {
            document.getElementById('previewTableBody').innerHTML = previewHtml;
            document.getElementById('previewContainer').classList.remove('hidden');
            Toast.info(`Parsed ${this.parsedData.length} valid rows from file.`);
        } else {
            Toast.error("No valid data rows found in the CSV.");
            document.getElementById('previewContainer').classList.add('hidden');
        }
    }

    async submitImport() {
        if (this.parsedData.length === 0) return Toast.error("No data to import.");

        const mode = document.querySelector('input[name="importMode"]:checked').value;

        if (mode === 'replace') {
            const confirmed = await new Promise((resolve) => {
                Modal.open({
                    title: "Replace existing stock?",
                    body: `<p>This will <b>overwrite</b> the current stock quantities for every item in the import file. This cannot be undone.</p><p>Are you sure you want to continue?</p>`,
                    confirmText: "Yes, Replace",
                    confirmClass: "btn-danger",
                    onConfirm: () => resolve(true),
                    onCancel:  () => resolve(false)
                });
            });
            if (!confirmed) return;
        }

        const btn = document.getElementById('confirmImportBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        try {
            const res = await API.importStock(this.parsedData, mode);
            if (res.status === 'success') {
                Toast.success(res.message);

                if (res.errors && res.errors.length > 0) {
                    Modal.open({
                        title: "Import Finished with Warnings",
                        body: `
                            <p class="mb-sm">Some rows were skipped because the SKU was not found in the local database:</p>
                            <div style="max-height: 200px; overflow-y: auto; background: #fef2f2; color: #b91c1c; padding: 10px; border-radius: 4px; font-size: 12px; font-family: monospace;">
                                ${res.errors.join('<br>')}
                            </div>
                        `,
                        confirmText: "Close"
                    });
                }

                document.getElementById('csvFileInput').value = '';
                document.getElementById('previewContainer').classList.add('hidden');
                this.parsedData = [];

                if (!document.getElementById('viewHistory').classList.contains('hidden')) {
                    this.loadHistory();
                }

            } else {
                Toast.error(res.message);
            }
        } catch (e) {
            Toast.error("An error occurred during import.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm & Import';
        }
    }
}

module.exports = ImportView;