const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    async openWorkbookImport(initialKind = null) {
        const supplierResult = await API.mpsGetSuppliers();
        const suppliers = supplierResult.status === 'success' ? (supplierResult.data || []) : [];
        let previewed = null;
        const supplierOptions = suppliers.map(s => `<option value="${Number(s.id)}">${esc(s.name)}</option>`).join('');
        const overlay = this.openDialog({
            title: 'Import MPS workbook', confirmText: 'Import workbook', busyText: 'Importing workbook…',
            body: `<p class="mps-modal-note">Preview first. Workbook rows are matched by exact SKU.</p>
                <label>Workbook type<select id="mpsWorkbookKind">
                    <option value="incoming_stock">Master Planner · incoming stock</option>
                    <option value="po_2117">PO 2117 · purchase order lines</option>
                    <option value="purchase_costs">Parts Pricing · purchase costs</option>
                </select></label>
                <label>Excel workbook (.xlsx)<input id="mpsWorkbookFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>
                <div id="mpsWorkbookOptions">
                    <label data-kind="incoming_stock po_2117">Purchase order reference<input id="mpsWorkbookReference" type="text" maxlength="50" placeholder="For example: LEGACY-INCOMING-2026-10"></label>
                    <label data-kind="incoming_stock po_2117">Supplier<select id="mpsWorkbookSupplier"><option value="">Unassigned</option>${supplierOptions}</select></label>
                    <label data-kind="incoming_stock po_2117">Expected arrival date<input id="mpsWorkbookEta" type="date"></label>
                </div>
                <button type="button" class="btn btn-sm mps-btn-outline" id="mpsWorkbookPreview">Preview workbook</button>
                <div id="mpsWorkbookPreviewResult" class="mps-modal-note" aria-live="polite"></div>`,
            onConfirm: async dialog => {
                const file = dialog.querySelector('#mpsWorkbookFile').files[0];
                const kind = dialog.querySelector('#mpsWorkbookKind').value;
                if (!file) { Toast.error('Choose an .xlsx workbook first.'); return false; }
                if (!previewed || previewed.file !== file || previewed.kind !== kind) {
                    Toast.error('Preview this selected workbook before importing.'); return false;
                }
                const options = this.workbookImportOptions(dialog, kind);
                if (kind === 'incoming_stock' && !options.reference) { Toast.error('Enter a purchase order reference.'); return false; }
                if (kind === 'po_2117' && !options.reference) { Toast.error('Enter the PO reference.'); return false; }
                const result = await API.mpsImportWorkbook(file, kind, options);
                if (result.status !== 'success') {
                    const detail = result.unmatched_skus?.length ? ` Unmatched SKUs: ${result.unmatched_skus.slice(0, 12).join(', ')}` : '';
                    Toast.error((result.message || 'Workbook import failed.') + detail);
                    this.renderWorkbookErrors(dialog.querySelector('#mpsWorkbookPreviewResult'),
                        result.errors, result.message || 'Workbook import failed.', kind, file.name);
                    return false;
                }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                if (kind === 'purchase_costs') this.lastCostImportBatchId = result.batch_id;
                const count = result.rows_imported ?? result.lines_imported ?? 0;
                Toast.success(kind === 'incoming_stock' || kind === 'po_2117'
                    ? `Imported ${Number(count).toLocaleString()} lines as ${options.reference}.`
                    : `Imported ${Number(count).toLocaleString()} rows.`);
                this.loadTab();
                return true;
            }
        });

        const kindSelect = overlay.querySelector('#mpsWorkbookKind');
        const resultEl = overlay.querySelector('#mpsWorkbookPreviewResult');
        if (initialKind === 'purchase_order') {
            [...kindSelect.options].forEach(option => { if (!['incoming_stock','po_2117'].includes(option.value)) option.remove(); });
            kindSelect.value = 'po_2117';
            overlay.querySelector('h2').textContent = 'Import purchase order';
        }
        const refreshOptions = () => {
            const kind = kindSelect.value;
            overlay.querySelectorAll('#mpsWorkbookOptions [data-kind]').forEach(el => { el.hidden = !el.dataset.kind.split(/\s+/).includes(kind); });
            if (kind === 'po_2117' && !overlay.querySelector('#mpsWorkbookReference').value) overlay.querySelector('#mpsWorkbookReference').value = 'PO2117';
            previewed = null;
            resultEl.textContent = '';
        };
        kindSelect.addEventListener('change', refreshOptions);
        refreshOptions();
        overlay.querySelector('#mpsWorkbookFile').addEventListener('change', () => { previewed = null; resultEl.textContent = ''; });
        overlay.querySelector('#mpsWorkbookPreview').addEventListener('click', async event => {
            const file = overlay.querySelector('#mpsWorkbookFile').files[0];
            if (!file) { Toast.error('Choose an .xlsx workbook first.'); return; }
            if (file.size > 25 * 1024 * 1024) { Toast.error('The workbook must be 25 MB or smaller.'); return; }
            const kind = kindSelect.value, button = event.currentTarget;
            button.disabled = true;
            button.textContent = 'Reading workbook…';
            try {
                const result = await API.mpsPreviewWorkbook(file, kind, this.workbookImportOptions(overlay, kind));
                const errors = Array.isArray(result.errors) ? result.errors : [];
                if (result.status !== 'success') {
                    previewed = null;
                    this.renderWorkbookErrors(resultEl, errors, result.message || 'Workbook preview failed.', kind, file.name);
                    return;
                }
                previewed = {file, kind};
                const summary = `<p><strong>${Number(result.rows_in_file || 0).toLocaleString()} rows</strong> from ${esc(result.sheet || 'workbook')}${result.period_from ? ` · ${esc(result.period_from)} to ${esc(result.period_to)}` : ''}${result.exchange_rate ? ` · USD/RWF ${esc(result.exchange_rate)}` : ''}.</p>`;
                if (errors.length) {
                    resultEl.innerHTML = `${summary}<div data-workbook-error-report></div>`;
                    this.renderWorkbookErrors(resultEl.querySelector('[data-workbook-error-report]'), errors,
                        `${errors.length.toLocaleString()} row(s) have validation errors. No data can be imported until they are corrected.`, kind, file.name);
                    return;
                }
                const previewRows = (result.sample || []).slice(0, 8).map(row => {
                    const cells = Array.isArray(row) ? row : Object.values(row);
                    return `<tr>${cells.map(value => `<td>${esc(value)}</td>`).join('')}</tr>`;
                }).join('');
                let headings = '<th>SKU</th><th>Name</th><th>Details</th>';
                if (kind === 'incoming_stock') headings = '<th>SKU</th><th>Quantity</th><th>Unit cost</th>';
                if (kind === 'po_2117') headings = '<th>SKU</th><th>Quantity</th><th>Unit cost RWF</th><th>Unit cost USD</th>';
                if (kind === 'purchase_costs') headings = '<th>SKU</th><th>Name</th><th>USD cost</th><th>Purchase cost RWF</th><th>Approved price</th><th>Calculated sale</th><th>VAT</th><th>CIT</th><th>Profit after tax</th><th>Margin %</th>';
                if (kind === 'cost_inventory') headings = '<th>SKU</th><th>Name</th><th>In qty</th><th>Unit cost USD</th><th>Current qty</th><th>Approved price</th>';
                resultEl.innerHTML = `${summary}${result.message ? `<p>${esc(result.message)}</p>` : ''}<div class="mps-table-wrap"><table class="mps-table"><thead><tr>${headings}</tr></thead><tbody>${previewRows}</tbody></table></div><p>Verify the sample and counts before importing.</p>`;
                this.enableClientTableSorting(resultEl.querySelector('.mps-table'));
            } catch (error) {
                previewed = null;
                this.renderWorkbookErrors(resultEl, [], error.message || 'Workbook preview failed.', kind, file.name);
            } finally {
                button.disabled = false;
                button.textContent = 'Preview workbook';
            }
        });
    },

    workbookKindLabel(kind) {
        return ({
            incoming_stock: 'Master Planner - incoming stock',
            po_2117: 'PO 2117 - purchase order lines',
            purchase_costs: 'Parts Pricing - purchase costs',
            cost_inventory: 'Cost inventory'
        })[kind] || kind || 'Workbook';
    },

    workbookSheetLabel(kind) {
        return ({
            incoming_stock: 'Incoming Stock',
            po_2117: 'Sheet1',
            purchase_costs: 'Updated(RW)',
            cost_inventory: 'Sheet1'
        })[kind] || '';
    },

    workbookErrorCsv(errors, kind, fileName) {
        const columns = [
            ['Source file', () => fileName || ''],
            ['Workbook type', () => this.workbookKindLabel(kind)],
            ['Worksheet', () => this.workbookSheetLabel(kind)],
            ['Row', row => row.row],
            ['SKU', row => row.sku],
            ['Product name', row => row.name],
            ['Quantity', row => row.qty ?? row.qty_ordered],
            ['Unit cost RWF', row => row.unit_cost],
            ['Unit cost USD', row => row.unit_cost_usd],
            ['Purchase cost RWF', row => row.cost_rwf],
            ['Purchase cost USD', row => row.cost_usd],
            ['Approved price RWF', row => row.approved_price_rwf],
            ['Error', row => row.error || row.message]
        ];
        const cell = value => {
            let text = value === null || value === undefined ? '' : String(value);
            if (/^[=+\-@]/.test(text)) text = `'${text}`;
            return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const lines = [columns.map(column => cell(column[0])).join(',')];
        (Array.isArray(errors) ? errors : []).forEach(error => {
            lines.push(columns.map(column => cell(column[1](error || {}))).join(','));
        });
        return '\uFEFF' + lines.join('\r\n');
    },

    downloadWorkbookErrors(errors, kind, fileName) {
        const blob = new Blob([this.workbookErrorCsv(errors, kind, fileName)], {type: 'text/csv;charset=utf-8;'});
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        const base = String(fileName || 'workbook').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'workbook';
        link.href = blobUrl;
        link.download = `MPS_Import_Errors_${base}_${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    },

    renderWorkbookErrors(container, errors, message, kind, fileName) {
        if (!container) return;
        const list = Array.isArray(errors) && errors.length ? errors : [{error: message || 'Workbook validation failed.'}];
        const shown = list.slice(0, 12);
        const rows = shown.map(error => `<tr><td>${esc(error.row ?? '')}</td><td>${esc(error.sku ?? '')}</td><td>${esc(error.error || error.message || '')}</td></tr>`).join('');
        container.innerHTML = `<div class="mps-import-errors">
            <p class="mps-negative">${esc(message || `${list.length} error(s) found. The workbook was not imported.`)}</p>
            <div class="mps-import-error-actions">
                <span class="mps-modal-note">${list.length.toLocaleString()} error row(s) captured. The CSV includes every error and its source row.</span>
                <button type="button" class="btn btn-sm mps-btn-outline" data-download-import-errors><i class="fa-solid fa-download"></i> Download error CSV</button>
            </div>
            <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>Row</th><th>SKU</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></div>
            ${list.length > shown.length ? `<p class="mps-modal-note">Showing the first ${shown.length} of ${list.length} errors. Download the CSV for all rows.</p>` : ''}
        </div>`;
        container.querySelector('[data-download-import-errors]')?.addEventListener('click', () => this.downloadWorkbookErrors(list, kind, fileName));
    },

    workbookImportOptions(dialog, kind) {
        if (kind === 'incoming_stock' || kind === 'po_2117') return {
            reference: dialog.querySelector('#mpsWorkbookReference').value.trim(),
            supplier_id: dialog.querySelector('#mpsWorkbookSupplier').value || null,
            eta_date: dialog.querySelector('#mpsWorkbookEta').value || null,
            status: 'shipped', freight_mode: 'air', note: 'Imported from Master Planner Incoming Stock workbook'
        };
        return {};
    }
};
