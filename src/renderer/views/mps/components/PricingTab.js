const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    pricingPaginationHtml(total) {
        const perPage = 50;
        if (!total) return '';
        const pages = Math.max(1, Math.ceil(total / perPage));
        const page = this.pricingPage;
        const start = total ? (page - 1) * perPage + 1 : 0;
        const end = Math.min(page * perPage, total);
        let buttons = '';
        const first = Math.max(1, Math.min(page - 1, pages - 2));
        const last = Math.min(pages, first + 2);
        if (first > 1) buttons += '<span class="mps-page-gap">...</span>';
        for (let i = first; i <= last; i++) {
            buttons += `<button class="page-btn ${i === page ? 'active' : ''}" data-pricing-page="${i}">${i}</button>`;
        }
        if (last < pages) buttons += '<span class="mps-page-gap">...</span>';
        return `<div class="pagination mps-pagination"><div class="pagination-info">Showing ${start} - ${end} of ${total.toLocaleString()} products</div><div class="pagination-controls">
            <button class="page-btn" data-pricing-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Prev</button>
            ${buttons}
            <button class="page-btn" data-pricing-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>
        </div></div>`;
    },

    async loadPricing() {
        clearTimeout(this.pricingFilterTimer);
        this.pricingFilterTimer = null;
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        const retainedSearch = panel.querySelector('#mpsPricingSearch');
        const retainedStatus = panel.querySelector('#mpsPricingStatus');
        const restoreSearchFocus = retainedSearch && document.activeElement === retainedSearch;
        const searchSelection = restoreSearchFocus ? [retainedSearch.selectionStart, retainedSearch.selectionEnd] : null;
        const token = ++this.pricingRequestToken;
        if (!retainedSearch) panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading part costs…</div>';
        else panel.querySelector('.mps-table')?.setAttribute('aria-busy', 'true');
        const [catalog, settingsResult] = await Promise.all([
            API.mpsGetPricingCatalog({page: this.pricingPage, per_page: 50, search: this.pricingSearch || '', product_status: this.pricingStatus, sort_by: this.pricingSortBy, sort_order: this.pricingSortOrder}),
            API.mpsGetSettings()
        ]);
        if (token !== this.pricingRequestToken || !document.getElementById('mpsPanel')) return;
        if (catalog.status !== 'success') {
            if (retainedSearch) { panel.querySelector('.mps-table')?.removeAttribute('aria-busy'); Toast.error(catalog.message || 'Could not load pricing data.'); }
            else panel.innerHTML = `<div class="mps-empty">${esc(catalog.message || 'Could not load pricing data.')}</div>`;
            this.addContextualHelp('pricing');
            return;
        }
        const pricing = catalog.pricing || {};
        const fmt = value => Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 2});
        const rows = (catalog.data || []).map(p => {
            const cost = Number(p.cost_price || 0), approved = Number(p.approved_price || 0);
            const vatPct = Number(pricing.pricing_vat_percent ?? 18), citPct = Number(pricing.pricing_cit_percent ?? 30);
            const vat = approved > 0 ? approved * vatPct / (100 + vatPct) : 0;
            const cit = (approved - cost - vat) * citPct / 100;
            const profit = approved - cost - vat - cit;
            const calculated = cost * Number(pricing.pricing_markup ?? 2.8738);
            return `<tr><td><strong>${esc(p.sku)}</strong></td><td>${esc(p.name)}</td><td class="mps-num">${fmt(cost)}</td><td class="mps-num">${fmt(cost / Number(pricing.pricing_exchange_rate || 1500))}</td><td class="mps-num">${fmt(calculated)}</td><td class="mps-num">${fmt(approved)}</td><td class="mps-num">${fmt(vat)}</td><td class="mps-num">${fmt(cit)}</td><td class="mps-num">${fmt(profit)}</td><td class="mps-num">${approved > 0 ? `${(profit / approved * 100).toFixed(1)}%` : '—'}</td></tr>`;
        }).join('');
        const totalPages = Math.max(1, Math.ceil(Number(catalog.total || 0) / 50));
        panel.innerHTML = `<div class="mps-orders-head"><div><h2>Part pricing</h2><p>Purchase costs are stored in RWF. Calculated sale price, VAT, CIT, after tax profit and margin follow the pricing workbook rules.</p></div>${this.isWriter ? `<div class="mps-actions"><button class="btn btn-sm mps-btn-outline" id="mpsImportCosts">Import purchase costs</button><button class="btn btn-sm mps-btn-primary" id="mpsExportPricing">Export pricing CSV</button>${this.lastCostImportBatchId ? `<button class="btn btn-sm btn-secondary" id="mpsRollbackCosts">Rollback import #${Number(this.lastCostImportBatchId)}</button>` : ''}</div>` : ''}</div>
            <div class="mps-toolbar"><input id="mpsPricingSearch" type="search" placeholder="Search SKU or product" value="${esc(this.pricingSearch || '')}"><span>${Number(catalog.total || 0).toLocaleString()} products</span></div>
            <div class="mps-modal-note">Formula settings: USD/RWF ${fmt(pricing.pricing_exchange_rate)} · markup ${fmt(pricing.pricing_markup)} · VAT ${fmt(pricing.pricing_vat_percent)}% · CIT ${fmt(pricing.pricing_cit_percent)}%. Edit these in Settings. Calculated price is a recommendation; approved price remains the current inventory price.</div>
            <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Part</th><th>Cost RWF</th><th>Cost USD</th><th>Calculated sale RWF</th><th>Approved sale RWF</th><th>VAT</th><th>CIT</th><th>Profit after tax</th><th>Margin</th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="mps-empty">No products matched.</td></tr>'}</tbody></table></div>
            <div class="mps-pagination"><button class="btn btn-sm btn-secondary" id="mpsPricingPrev" ${this.pricingPage <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${this.pricingPage} of ${totalPages}</span><button class="btn btn-sm btn-secondary" id="mpsPricingNext" ${this.pricingPage >= totalPages ? 'disabled' : ''}>Next</button></div>`;
        const pricingHeader = panel.querySelector('.mps-orders-head');
        const pricingActions = pricingHeader?.querySelector('.mps-actions');
        const pricingToolbar = panel.querySelector('.mps-toolbar');
        if (pricingActions && pricingToolbar) pricingToolbar.append(pricingActions);
        pricingHeader?.remove();
        panel.querySelector('.mps-modal-note')?.remove();
        panel.querySelector('.mps-pagination')?.replaceWith(document.createRange().createContextualFragment(this.pricingPaginationHtml(Number(catalog.total || 0))));
        panel.querySelector('.mps-table thead tr')?.insertAdjacentHTML('beforeend', '<th>Status</th>');
        const pricingEmptyCell = panel.querySelector('.mps-table td.mps-empty');
        if (pricingEmptyCell) pricingEmptyCell.colSpan = this.isWriter ? 12 : 11;
        if (this.isWriter) {
            panel.querySelector('thead tr')?.insertAdjacentHTML('beforeend', '<th>Actions</th>');
            [...panel.querySelectorAll('tbody tr')].forEach((row, index) => {
                const product = (catalog.data || [])[index];
                if (!product) return;
                row.dataset.pricingRow = Number(product.product_id);
                const costInput = document.createElement('input');
                costInput.type = 'number'; costInput.min = '0'; costInput.step = '0.01'; costInput.value = Number(product.cost_price || 0); costInput.dataset.pricingCost = '';
                row.cells[2].replaceChildren(costInput);
                const exchange = Number(pricing.pricing_exchange_rate || 1500);
                const usdInput = document.createElement('input');
                usdInput.type = 'number'; usdInput.min = '0'; usdInput.step = '0.01'; usdInput.value = (Number(product.cost_price || 0) / exchange).toFixed(2); usdInput.dataset.pricingCostUsd = '';
                row.cells[3].replaceChildren(usdInput);
                costInput.addEventListener('input', () => { usdInput.value = (Number(costInput.value || 0) / exchange).toFixed(2); });
                usdInput.addEventListener('input', () => { costInput.value = (Number(usdInput.value || 0) * exchange).toFixed(2); });
                const approvedInput = document.createElement('input');
                approvedInput.type = 'number'; approvedInput.min = '0'; approvedInput.step = '0.01'; approvedInput.value = Number(product.approved_price || 0); approvedInput.dataset.pricingApproved = '';
                row.cells[5].replaceChildren(approvedInput);
                const updateCalculatedCells = () => {
                    const currentCost = Number(costInput.value || 0), currentApproved = Number(approvedInput.value || 0);
                    const currentVat = currentApproved > 0 ? currentApproved * Number(pricing.pricing_vat_percent ?? 18) / (100 + Number(pricing.pricing_vat_percent ?? 18)) : 0;
                    const currentCit = (currentApproved - currentCost - currentVat) * Number(pricing.pricing_cit_percent ?? 30) / 100;
                    const currentProfit = currentApproved - currentCost - currentVat - currentCit;
                    row.cells[4].textContent = fmt(currentCost * Number(pricing.pricing_markup ?? 2.8738));
                    row.cells[6].textContent = fmt(currentVat);
                    row.cells[7].textContent = fmt(currentCit);
                    row.cells[8].textContent = fmt(currentProfit);
                    row.cells[9].textContent = currentApproved > 0 ? `${(currentProfit / currentApproved * 100).toFixed(1)}%` : '—';
                };
                costInput.addEventListener('input', updateCalculatedCells);
                usdInput.addEventListener('input', updateCalculatedCells);
                approvedInput.addEventListener('input', updateCalculatedCells);
                const statusCell = row.insertCell(-1);
                statusCell.innerHTML = `<span class="mps-status">${esc(statusLabel(product.status || 'unknown'))}</span>`;
                const actions = row.insertCell(-1);
                actions.innerHTML = `<button class="btn btn-ghost btn-sm" data-pricing-save>Save</button>${Number(product.has_price_override) ? '<button class="btn btn-ghost btn-sm" data-pricing-reset>Reset price</button>' : ''}`;
            });
        } else {
            [...panel.querySelectorAll('.mps-table tbody tr')].forEach((row, index) => {
                const product = (catalog.data || [])[index];
                if (!product) return;
                const statusCell = row.insertCell(-1);
                statusCell.innerHTML = `<span class="mps-status">${esc(statusLabel(product.status || 'unknown'))}</span>`;
            });
        }
        this.decorateSortableTable(panel.querySelector('.mps-table'), ['sku','name','cost','cost_usd','calculated','approved','vat','cit','profit','margin','status',null], 'pricing', this.pricingSortBy, this.pricingSortOrder);
        panel.querySelectorAll('th[data-mps-sort^="pricing:"]').forEach(th => th.addEventListener('click', () => {
            const key = th.dataset.mpsSort.split(':')[1];
            this.pricingSortOrder = this.pricingSortBy === key && this.pricingSortOrder === 'ASC' ? 'DESC' : 'ASC';
            this.pricingSortBy = key;
            this.pricingPage = 1;
            this.loadPricing();
        }));
        let search = panel.querySelector('#mpsPricingSearch');
        let statusFilter = retainedStatus || document.createElement('select');
        statusFilter.id = 'mpsPricingStatus';
        statusFilter.setAttribute('aria-label', 'Filter by publication status');
        statusFilter.innerHTML = `<option value="all" ${this.pricingStatus === 'all' ? 'selected' : ''}>All products</option><option value="published" ${this.pricingStatus === 'published' ? 'selected' : ''}>Published</option><option value="unpublished" ${this.pricingStatus === 'unpublished' ? 'selected' : ''}>Not published</option>`;
        if (retainedSearch && search) { search.replaceWith(retainedSearch); search = retainedSearch; }
        search?.after(statusFilter);
        if (retainedStatus) statusFilter.value = this.pricingStatus;
        const schedulePricingReload = () => {
            clearTimeout(this.pricingFilterTimer);
            this.pricingFilterTimer = setTimeout(() => { this.pricingFilterTimer = null; this.loadPricing(); }, FILTER_DEBOUNCE_MS);
        };
        if (!retainedStatus) statusFilter.addEventListener('change', () => { this.pricingStatus = statusFilter.value; this.pricingPage = 1; schedulePricingReload(); });
        if (!retainedSearch) search?.addEventListener('input', () => { this.pricingSearch = search.value.trim(); this.pricingPage = 1; schedulePricingReload(); });
        panel.querySelectorAll('[data-pricing-page]').forEach(button => button.addEventListener('click', () => {
            const nextPage = Number(button.dataset.pricingPage);
            if (Number.isInteger(nextPage) && nextPage >= 1 && nextPage <= totalPages && nextPage !== this.pricingPage) {
                this.pricingPage = nextPage;
                this.loadPricing();
            }
        }));
        panel.querySelectorAll('[data-pricing-save]').forEach(button => button.addEventListener('click', async () => {
            const row = button.closest('[data-pricing-row]');
            const result = await API.mpsSavePartPricing({product_id: Number(row.dataset.pricingRow), cost_price: Number(row.querySelector('[data-pricing-cost]').value), approved_price: Number(row.querySelector('[data-pricing-approved]').value)});
            if (result.status !== 'success') return Toast.error(result.message || 'Pricing could not be saved.');
            if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
            Toast.success('Part pricing saved.');
            this.loadPricing();
        }));
        panel.querySelectorAll('[data-pricing-reset]').forEach(button => button.addEventListener('click', async () => {
            const row = button.closest('[data-pricing-row]');
            this.confirmDialog({
                title: 'Reset approved price',
                message: 'Remove the approved price override and use the current inventory price again?',
                confirmText: 'Reset price',
                busyText: 'Resetting price...',
                onConfirm: async () => {
                    const result = await API.mpsDeletePartPricing(Number(row.dataset.pricingRow));
                    if (result.status !== 'success') { Toast.error(result.message || 'Price override could not be removed.'); return false; }
                    if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                    Toast.success('Approved price reset to the current inventory price.');
                    this.loadPricing();
                    return true;
                }
            });
        }));
        panel.querySelector('#mpsExportPricing')?.addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            const result = await API.mpsExportPricing();
            event.currentTarget.disabled = false;
            if (result.status === 'success') Toast.success('Pricing calculation CSV exported.'); else Toast.error(result.message || 'Pricing export failed.');
        });
        panel.querySelector('#mpsImportCosts')?.addEventListener('click', () => this.openWorkbookImport(settingsResult.settings || {}));
        panel.querySelector('#mpsRollbackCosts')?.addEventListener('click', () => {
            this.confirmDialog({
                title: 'Rollback purchase cost import',
                message: `Restore purchase costs saved before import #${this.lastCostImportBatchId}? This is allowed only if none of those costs changed after the import.`,
                confirmText: 'Rollback import',
                busyText: 'Restoring purchase costs...',
                onConfirm: async () => {
                    const result = await API.mpsRollbackCostImport(this.lastCostImportBatchId);
                    if (result.status !== 'success') { Toast.error(result.message || 'Cost rollback failed.'); return false; }
                    this.lastCostImportBatchId = null;
                    if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                    Toast.success(`Restored ${Number(result.rows_rolled_back || 0).toLocaleString()} purchase costs.`);
                    this.loadPricing();
                    return true;
                }
            });
        });
        if (restoreSearchFocus && search) {
            search.focus({preventScroll: true});
            if (searchSelection && searchSelection[0] !== null) search.setSelectionRange(...searchSelection);
        }
        this.addContextualHelp('pricing');
    }
};
