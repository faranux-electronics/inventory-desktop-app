const Toast = require('../../../components/Toast.js');
const Modal = require('../../../components/Modal.js');
const API = require('../../../services/api.js');

class ImportForm {
    constructor(parentView) {
        this.parent = parentView;
        this.parsedData = [];
    }

    render(container) {
        container.innerHTML = `
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
        `;
        this.attachEvents(container);
    }

    updateLocations(locations) {
        const tbody = document.getElementById('branchGuideTable');
        if (tbody) {
            tbody.innerHTML = locations.map(l => `
                <tr>
                    <td style="padding: 8px; font-weight: 600; color: #2271b1; width: 50px; text-align: center; border-right: 1px solid #f0f0f1;">${l.id}</td>
                    <td style="padding: 8px; font-size: 12px; color: #50575e;">${l.name}</td>
                </tr>
            `).join('');
        }
    }

    attachEvents(container) {
        const tabUpload = container.querySelector('#tabUpload');
        const tabLink = container.querySelector('#tabLink');
        const secUpload = container.querySelector('#sectionUpload');
        const secLink = container.querySelector('#sectionLink');

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

        container.querySelector('#downloadTemplateBtn').addEventListener('click', () => {
            const csv = "SKU,Quantity,Branch_ID\nPROD-001,50,1\nPROD-002,25,1";
            const blob = new Blob([csv], {type: 'text/csv'});
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'faranux_stock_import_template.csv';
            a.click();
            window.URL.revokeObjectURL(url);
        });

        container.querySelector('#csvFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => this.parseCSV(event.target.result);
            reader.readAsText(file);
        });

        container.querySelector('#fetchUrlBtn').addEventListener('click', async () => {
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
                Toast.error("Failed to fetch CSV. Make sure the link is public and points directly to a CSV format.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });

        container.querySelector('#confirmImportBtn').addEventListener('click', () => this.submitImport());
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

    downloadFailedRowsCsv(errors, dataSnapshot) {
        let csvContent = "Row Number,SKU,Quantity,Branch_ID,Error Reason\n";

        errors.forEach(errString => {
            const match = errString.match(/^Row (\d+):\s*(.*)$/);
            if (match) {
                const rowNum = parseInt(match[1], 10);
                const reason = match[2].replace(/"/g, '""');

                // Read from the snapshot instead of this.parsedData
                const item = dataSnapshot[rowNum - 1];

                if (item) {
                    csvContent += `"${rowNum}","${item.sku}","${item.qty}","${item.branch_id}","${reason}"\n`;
                } else {
                    csvContent += `"${rowNum}","","","","${reason}"\n`;
                }
            } else {
                csvContent += `"","","","","${errString.replace(/"/g, '""')}"\n`;
            }
        });

        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `Unsuccessful_Import_Rows_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
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
                    onCancel: () => resolve(false)
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
                // Perfect run: clear UI and refresh history
                Toast.success(res.message);

                document.getElementById('csvFileInput').value = '';
                document.getElementById('previewContainer').classList.add('hidden');
                this.parsedData = [];

                if (document.getElementById('viewHistory') && !document.getElementById('viewHistory').classList.contains('hidden')) {
                    if (typeof this.loadHistory === 'function') this.loadHistory();
                    if (this.parent && typeof this.parent.historyComponent?.loadHistory === 'function') this.parent.historyComponent.loadHistory();
                }

            } else if (res.status === 'validation_error') {
                // Aborted run: show errors, allow download, DO NOT clear the UI
                Toast.error("Import aborted due to errors.");

                const dataSnapshot = [...this.parsedData];

                Modal.open({
                    title: "Import Aborted: Errors Found",
                    cancelText: null,
                    body: `
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; gap: 10px;">
                            <p class="text-neutral-700" style="margin: 0; font-size: 13px;"><b>0 items were imported.</b> Please fix the errors below and try again:</p>
                            <button id="btnDownloadErrors" class="btn btn-sm btn-secondary" style="flex-shrink: 0; background: white; border: 1px solid #c3c4c7;">
                                <i class="fa-solid fa-download"></i> Download CSV
                            </button>
                        </div>
                        <div style="max-height: 200px; overflow-y: auto; background: #fef2f2; color: #b91c1c; padding: 10px; border-radius: 4px; font-size: 12px; font-family: monospace; border: 1px solid #fca5a5;">
                            ${res.errors.join('<br>')}
                        </div>
                    `,
                    confirmText: "Close"
                });

                const downloadBtn = document.getElementById('btnDownloadErrors');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', () => {
                        this.downloadFailedRowsCsv(res.errors, dataSnapshot);
                    });
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

module.exports = ImportForm;