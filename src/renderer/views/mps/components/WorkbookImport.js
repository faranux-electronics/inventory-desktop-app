const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    async openWorkbookImport(settings, initialKind = null) {
        const supplierResult = await API.mpsGetSuppliers();
        const suppliers = supplierResult.status === 'success' ? (supplierResult.data || []) : [];
        let previewed = null;
        const supplierOptions = suppliers.map(s => `<option value="${Number(s.id)}">${esc(s.name)}</option>`).join('');
        const overlay = this.openDialog({
            title: 'Import MPS workbook', confirmText: 'Import workbook', busyText: 'Importing workbook…',
            body: `<p class="mps-modal-note">Preview first. Workbook rows are matched by exact SKU.</p>
                <label>Workbook type<select id="mpsWorkbookKind">
                    <option value="sales_history">Master Planner · monthly sales history</option>
                    <option value="incoming_stock">Master Planner · incoming stock</option>
                    <option value="po_2117">PO 2117 · purchase order lines</option>
                    <option value="purchase_costs">Parts Pricing · purchase costs</option>
                </select></label>
                <label>Excel workbook (.xlsx)<input id="mpsWorkbookFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>
                <div id="mpsWorkbookOptions">
                    <label data-kind="sales_history">WooCommerce cutover date<input id="mpsWorkbookUntil" type="date" value="${esc(settings.sales_cutover_date || today())}"></label>
                    <label data-kind="sales_history" class="mps-check"><input id="mpsWorkbookReplace" type="checkbox"> Replace all previously imported sales history</label>
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
                if (kind === 'sales_history' && !options.until) { Toast.error('Choose the sales cutover date.'); return false; }
                if (kind === 'incoming_stock' && !options.reference) { Toast.error('Enter a purchase order reference.'); return false; }
                if (kind === 'po_2117' && !options.reference) { Toast.error('Enter the PO reference.'); return false; }
                const result = await API.mpsImportWorkbook(file, kind, options);
                if (result.status !== 'success') {
                    const detail = result.unmatched_skus?.length ? ` Unmatched SKUs: ${result.unmatched_skus.slice(0, 12).join(', ')}` : '';
                    Toast.error((result.message || 'Workbook import failed.') + detail);
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
                if (result.status !== 'success') {
                    previewed = null;
                    resultEl.textContent = result.message || 'Workbook preview failed.';
                    return;
                }
                previewed = {file, kind};
                const warning = result.unmatched_sku_count
                    ? `<p class="mps-negative">${Number(result.unmatched_sku_count).toLocaleString()} unmatched SKU(s); import will be rejected until all SKUs match.</p>` : '';
                const previewRows = (result.sample || []).slice(0, 8).map(row => {
                    const cells = Array.isArray(row) ? row : Object.values(row);
                    return `<tr>${cells.map(value => `<td>${esc(value)}</td>`).join('')}</tr>`;
                }).join('');
                let headings = '<th>SKU</th><th>Name</th><th>Details</th>';
                if (kind === 'sales_history') headings = '<th>SKU</th><th>Month</th><th>Units</th>';
                if (kind === 'incoming_stock') headings = '<th>SKU</th><th>Quantity</th><th>Unit cost</th>';
                if (kind === 'po_2117') headings = '<th>SKU</th><th>Quantity</th><th>Unit cost RWF</th><th>Unit cost USD</th>';
                if (kind === 'purchase_costs') headings = '<th>SKU</th><th>Name</th><th>USD cost</th><th>Purchase cost RWF</th><th>Approved price</th><th>Calculated sale</th><th>VAT</th><th>CIT</th><th>Profit after tax</th><th>Margin %</th>';
                if (kind === 'cost_inventory') headings = '<th>SKU</th><th>Name</th><th>In qty</th><th>Unit cost USD</th><th>Current qty</th><th>Approved price</th>';
                resultEl.innerHTML = `<p><strong>${Number(result.rows_in_file || 0).toLocaleString()} rows</strong> from ${esc(result.sheet || 'workbook')}${result.period_from ? ` · ${esc(result.period_from)} to ${esc(result.period_to)}` : ''}${result.exchange_rate ? ` · USD/RWF ${esc(result.exchange_rate)}` : ''}.</p>${result.message ? `<p>${esc(result.message)}</p>` : ''}${warning}<div class="mps-table-wrap"><table class="mps-table"><thead><tr>${headings}</tr></thead><tbody>${previewRows}</tbody></table></div><p>Verify the sample and counts before importing.</p>`;
                this.enableClientTableSorting(resultEl.querySelector('.mps-table'));
            } catch (error) {
                previewed = null;
                resultEl.textContent = error.message || 'Workbook preview failed.';
            } finally {
                button.disabled = false;
                button.textContent = 'Preview workbook';
            }
        });
    },

    workbookImportOptions(dialog, kind) {
        if (kind === 'sales_history') return {
            until: dialog.querySelector('#mpsWorkbookUntil').value,
            replace: dialog.querySelector('#mpsWorkbookReplace').checked
        };
        if (kind === 'incoming_stock' || kind === 'po_2117') return {
            reference: dialog.querySelector('#mpsWorkbookReference').value.trim(),
            supplier_id: dialog.querySelector('#mpsWorkbookSupplier').value || null,
            eta_date: dialog.querySelector('#mpsWorkbookEta').value || null,
            status: 'shipped', freight_mode: 'air', note: 'Imported from Master Planner Incoming Stock workbook'
        };
        return {};
    }
};
