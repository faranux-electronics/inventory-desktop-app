const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');
const Input = require('../../../components/Input.js');
const Select = require('../../../components/Select.js');
const Button = require('../../../components/Button.js');

module.exports = {
    async openWorkbookImport(initialKind = null) {
        const supplierResult = await API.mpsGetSuppliers();
        const suppliers = supplierResult.status === 'success' ? (supplierResult.data || []) : [];
        let previewed = null;
        const supplierOptions = [{value: '', label: 'Unassigned'}, ...suppliers.map(s => ({value: Number(s.id), label: s.name}))];
        const overlay = this.openDialog({
            title: 'Import MPS workbook', confirmText: 'Import workbook', busyText: 'Importing workbook...',
            body: `<p class="mps-modal-note">Preview first. Stock and purchase order rows match by SKU. Parts Pricing can create pricing-only catalog items, including items without a SKU.</p>
                <div class="mps-modal-form-grid mps-workbook-base-grid">
                    ${Select.field({id: 'mpsWorkbookKind', label: 'Workbook type', value: 'incoming_stock', options: [
                        {value: 'incoming_stock', label: 'Master Planner - incoming stock'},
                        {value: 'po_2117', label: 'PO 2117 - purchase order lines'},
                        {value: 'cost_inventory', label: 'PO cost inventory - costing, pricing and QA'},
                        {value: 'purchase_costs', label: 'Parts Pricing - purchase costs'}
                    ]})}
                    ${Input.field({id: 'mpsWorkbookFile', label: 'Excel workbook (.xlsx)', type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', className: 'mps-file-input', required: true, wrapperClass: 'mps-workbook-file-field'})}
                </div>
                <div id="mpsWorkbookOptions" class="mps-modal-form-grid mps-workbook-options-grid">
                    <div data-kind="incoming_stock po_2117 cost_inventory">${Input.field({id: 'mpsWorkbookReference', label: 'Purchase order reference', maxLength: 50, placeholder: 'Leave blank to generate automatically'})}</div>
                    <div data-kind="incoming_stock po_2117 cost_inventory">${Select.field({id: 'mpsWorkbookSupplier', label: 'Supplier', value: '', options: supplierOptions})}</div>
                    <div data-kind="incoming_stock po_2117 cost_inventory">${Input.field({id: 'mpsWorkbookEta', label: 'Expected arrival date', type: 'date'})}</div>
                    <div data-kind="cost_inventory">${Select.field({id: 'mpsWorkbookFreight', label: 'Purchase route', value: 'air', options: [{value: 'air', label: 'Imported by air'}, {value: 'sea', label: 'Imported by sea'}, {value: 'local', label: 'Local purchase'}]})}</div>
                </div>
                <div class="mps-workbook-preview-actions">${Button.html({id: 'mpsWorkbookPreview', text: 'Preview workbook', icon: 'fa-solid fa-eye', variant: 'outline', size: 'sm', className: 'mps-btn-outline'})}</div>
                <div id="mpsWorkbookPreviewResult" class="mps-modal-note mps-workbook-preview-result" aria-live="polite"></div>`,
            onConfirm: async dialog => {
                const file = dialog.querySelector('#mpsWorkbookFile').files[0];
                const kind = dialog.querySelector('#mpsWorkbookKind').value;
                if (!file) { Toast.error('Choose an .xlsx workbook first.'); return false; }
                if (!previewed || previewed.file !== file || previewed.kind !== kind) {
                    Toast.error('Preview this selected workbook before importing.'); return false;
                }
                const options = this.workbookImportOptions(dialog, kind, previewed.costInventorySummary || previewed.pricingSummary);
                if (kind === 'incoming_stock' && !options.reference) { Toast.error('Enter a purchase order reference.'); return false; }
                if (kind === 'po_2117' && !options.reference) { Toast.error('Enter the PO reference.'); return false; }
                if (kind === 'cost_inventory' && Number(previewed.costInventorySummary?.valid_count || 0) < 1) {
                    Toast.error('There are no valid product rows to add to a purchase order.'); return false;
                }
                if (kind === 'cost_inventory' && !options.confirm_cost_inventory_import) {
                    Toast.error('Review the workbook counts and confirm before adding it to the purchase orders.'); return false;
                }
                if (kind === 'cost_inventory' && Number(previewed.costInventorySummary?.skipped_count || 0) > 0 && !options.skip_invalid_rows) {
                    Toast.error('Review the invalid rows and confirm that they should be skipped.'); return false;
                }
                if (kind === 'purchase_costs' && Number(previewed.pricingSummary?.valid_count || 0) < 1) {
                    Toast.error('There are no valid rows to import. Download the error CSV to review them.'); return false;
                }
                if (kind === 'purchase_costs' && !options.confirm_pricing_import) {
                    Toast.error('Review the pricing import counts and confirm before importing.'); return false;
                }
                if (kind === 'purchase_costs' && Number(previewed.pricingSummary?.skipped_count || 0) > 0 && !options.skip_invalid_rows) {
                    Toast.error('Confirm that invalid rows should be skipped before importing the valid rows.'); return false;
                }
                const result = await API.mpsImportWorkbook(file, kind, options);
                if (result.status !== 'success') {
                    if (result.repreview_required) previewed = null;
                    const detail = result.unmatched_skus?.length ? ` Unmatched SKUs: ${result.unmatched_skus.slice(0, 12).join(', ')}` : '';
                    Toast.error((result.message || 'Workbook import failed.') + detail);
                    this.renderWorkbookErrors(dialog.querySelector('#mpsWorkbookPreviewResult'),
                        result.errors, result.message || 'Workbook import failed.', kind, file.name);
                    return false;
                }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                if (kind === 'purchase_costs') this.lastCostImportBatchId = result.batch_id;
                const count = result.rows_imported ?? result.lines_imported ?? 0;
                const importSummary = result.pricing_import_summary;
                Toast.success(kind === 'incoming_stock' || kind === 'po_2117' || kind === 'cost_inventory'
                    ? `Imported ${Number(count).toLocaleString()} lines as ${result.reference || options.reference || 'the new draft PO'}.`
                    : kind === 'purchase_costs' && importSummary
                        ? `Imported ${Number(count).toLocaleString()} rows${Number(result.rows_skipped || 0) ? `; skipped ${Number(result.rows_skipped).toLocaleString()} invalid rows` : ''}: created ${Number(importSummary.create_count || 0).toLocaleString()} pricing-only items and updated ${Number(importSummary.update_count || 0).toLocaleString()}.`
                        : `Imported ${Number(count).toLocaleString()} rows.`);
                this.loadTab();
                return true;
            }
        });

        const kindSelect = overlay.querySelector('#mpsWorkbookKind');
        const resultEl = overlay.querySelector('#mpsWorkbookPreviewResult');
        if (initialKind === 'purchase_order') {
            [...kindSelect.options].forEach(option => { if (!['incoming_stock','po_2117','cost_inventory'].includes(option.value)) option.remove(); });
            kindSelect.value = 'po_2117';
            overlay.querySelector('h2').textContent = 'Import purchase order';
        } else if (['incoming_stock', 'po_2117', 'purchase_costs'].includes(initialKind)) {
            kindSelect.value = initialKind;
            if (initialKind === 'purchase_costs') overlay.querySelector('h2').textContent = 'Import purchase costs';
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
        overlay.querySelector('#mpsWorkbookFile').addEventListener('change', event => {
            if (initialKind === 'purchase_order' && /cost[_ -]?inventory/i.test(event.target.files[0]?.name || '')) kindSelect.value = 'cost_inventory';
            refreshOptions();
        });
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
                const pricingSummary = result.pricing_import_summary || null;
                const costInventorySummary = result.cost_inventory_summary || null;
                previewed = {file, kind, pricingSummary, costInventorySummary};
                const summary = `<p><strong>${Number(result.rows_in_file || 0).toLocaleString()} rows</strong> from ${esc(result.sheet || 'workbook')}${result.period_from ? ` · ${esc(result.period_from)} to ${esc(result.period_to)}` : ''}${result.exchange_rate ? ` · USD/RWF ${esc(result.exchange_rate)}` : ''}.</p>`;
                let pricingNotice = '';
                if (kind === 'cost_inventory' && costInventorySummary) {
                    const skipped = Number(costInventorySummary.skipped_count || 0);
                    const valid = Number(costInventorySummary.valid_count || 0);
                    pricingNotice = `<div class="mps-import-pricing-confirm"><strong>Cost inventory import review</strong><p>This will create one draft purchase order with <b>${valid.toLocaleString()}</b> valid SKU lines. It will retain the workbook exchange rate, expense allocation, current-stock snapshot, product type, calculated and approved prices, tax/profit figures, and QA notes with the PO. WooCommerce stock and selling prices will not be changed by this import.</p><p>Workbook stock values are preserved as a snapshot; current WooCommerce inventory remains the source of truth.</p>${skipped ? `<p><b>${skipped.toLocaleString()}</b> invalid or unmatched row(s) will be skipped.</p>` : '<p>All product rows match the current product catalogue.</p>'}<label><input type="checkbox" id="mpsConfirmCostInventoryImport"> I reviewed the workbook counts and want to create this draft purchase order.</label></div>`;
                }
                if (kind === 'purchase_costs' && pricingSummary) {
                    const createCount = Number(pricingSummary.create_count || 0).toLocaleString();
                    const updateCount = Number(pricingSummary.update_count || 0).toLocaleString();
                    const noSkuCount = Number(pricingSummary.blank_sku_create_count || 0).toLocaleString();
                    const validCount = Number(pricingSummary.valid_count || 0).toLocaleString();
                    const skippedCount = Number(pricingSummary.skipped_count || 0).toLocaleString();
                    const skipMessage = Number(pricingSummary.skipped_count || 0) > 0
                        ? `<p><strong>${skippedCount}</strong> invalid row(s) will be skipped; <strong>${validCount}</strong> valid row(s) will be imported.</p>`
                        : '';
                    const acknowledgeText = Number(pricingSummary.skipped_count || 0) > 0
                        ? `I reviewed the counts and want to skip ${skippedCount} invalid rows and import ${validCount} valid rows.`
                        : `I reviewed these counts and want to import all ${validCount} valid rows.`;
                    pricingNotice = `<div class="mps-import-pricing-confirm"><strong>Review before importing</strong><p>This workbook will update costs and approved prices when provided for <b>${updateCount}</b> existing Part Pricing items, and create <b>${createCount}</b> pricing-only items. <b>${noSkuCount}</b> new item(s) will have no SKU. New items stay out of WooCommerce and stock workflows until linked.</p>${skipMessage}<label><input type="checkbox" id="mpsConfirmPricingImport" ${Number(pricingSummary.valid_count || 0) < 1 ? 'disabled' : ''}> ${acknowledgeText}</label></div>`;
                }
                if (errors.length && kind !== 'cost_inventory') {
                    resultEl.innerHTML = `${summary}${pricingNotice}<div data-workbook-error-report></div>`;
                    this.renderWorkbookErrors(resultEl.querySelector('[data-workbook-error-report]'), errors,
                        kind === 'purchase_costs' && Number(pricingSummary?.valid_count || 0) > 0
                            ? `${errors.length.toLocaleString()} row(s) have validation errors. Confirm above to skip them and import the valid rows.`
                            : `${errors.length.toLocaleString()} row(s) have validation errors. No valid rows are available to import.`, kind, file.name);
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
                if (kind === 'cost_inventory') {
                    headings = '<th>SKU</th><th>Name</th><th>In qty</th><th>Unit cost USD</th><th>Product type</th><th>Current qty snapshot</th><th>Calculated price RWF</th><th>Approved price RWF</th><th>QA</th>';
                    const costRows = (result.sample || []).slice(0, 8).map(row => `<tr><td>${esc(row.sku)}</td><td>${esc(row.name)}</td><td>${esc(row.qty)}</td><td>${esc(row.unit_cost_usd)}</td><td>${esc(({1:'New',2:'Existing',3:'Not for sale'})[Number(row.worksheet_data?.product_type)] || 'Existing')}</td><td>${esc(row.worksheet_data?.current_qty)}</td><td>${esc(row.worksheet_data?.calculated_price_rwf)}</td><td>${esc(row.worksheet_data?.approved_price_rwf)}</td><td>${esc(row.worksheet_data?.qa?.status || 'Not tested')}</td></tr>`).join('');
                    resultEl.innerHTML = `${summary}${pricingNotice}${result.message ? `<p>${esc(result.message)}</p>` : ''}<div data-workbook-error-report></div><div class="mps-table-wrap"><table class="mps-table"><thead><tr>${headings}</tr></thead><tbody>${costRows}</tbody></table></div><p>Review the sample, route, and row counts before creating the draft PO.</p>`;
                    if (errors.length) this.renderWorkbookErrors(resultEl.querySelector('[data-workbook-error-report]'), errors, `${errors.length.toLocaleString()} workbook rows need attention. Confirm above to skip them and add the valid rows.`, kind, file.name);
                } else {
                    resultEl.innerHTML = `${summary}${pricingNotice}${result.message ? `<p>${esc(result.message)}</p>` : ''}<div class="mps-table-wrap"><table class="mps-table"><thead><tr>${headings}</tr></thead><tbody>${previewRows}</tbody></table></div><p>Verify the sample and counts before importing.</p>`;
                }
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

    workbookImportOptions(dialog, kind, pricingSummary = null) {
        if (kind === 'incoming_stock' || kind === 'po_2117') return {
            reference: dialog.querySelector('#mpsWorkbookReference').value.trim(),
            supplier_id: dialog.querySelector('#mpsWorkbookSupplier').value || null,
            eta_date: dialog.querySelector('#mpsWorkbookEta').value || null,
            status: 'shipped', freight_mode: 'air', note: 'Imported from Master Planner Incoming Stock workbook'
        };
        if (kind === 'cost_inventory') return {
            reference: dialog.querySelector('#mpsWorkbookReference').value.trim(),
            supplier_id: dialog.querySelector('#mpsWorkbookSupplier').value || null,
            eta_date: dialog.querySelector('#mpsWorkbookEta').value || null,
            freight_mode: dialog.querySelector('#mpsWorkbookFreight').value,
            status: 'draft', currency: 'USD', note: 'Imported from cost inventory and QA workbook',
            confirm_cost_inventory_import: dialog.querySelector('#mpsConfirmCostInventoryImport')?.checked === true,
            skip_invalid_rows: dialog.querySelector('#mpsConfirmCostInventoryImport')?.checked === true,
            confirmed_cost_inventory_summary: pricingSummary
        };
        if (kind === 'purchase_costs') return {
            confirm_pricing_import: dialog.querySelector('#mpsConfirmPricingImport')?.checked === true,
            skip_invalid_rows: Number(pricingSummary?.skipped_count || 0) > 0
                && dialog.querySelector('#mpsConfirmPricingImport')?.checked === true,
            confirmed_pricing_import_summary: pricingSummary
        };
        return {};
    }
};
