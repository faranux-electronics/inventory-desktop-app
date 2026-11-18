const { API, Toast, esc, statusLabel, FILTER_DEBOUNCE_MS } = require('../helpers.js');
const Input = require('../../../components/Input.js');
const Select = require('../../../components/Select.js');
const Button = require('../../../components/Button.js');
const FilterBar = require('../../../components/FilterBar.js');
const Table = require('../../../components/Table.js');
const Card = require('../../../components/Card.js');
const Pagination = require('../../../components/Pagination.js');
const {calculatePricing, getProfitMarginFilterOptions} = require('../pricingMath.js');
const {renderPricingMeasurements} = require('./PricingMeasurements.js');

module.exports = {
    async loadPricing() {
        if (this.tab && this.tab !== 'pricing') return;
        clearTimeout(this.pricingFilterTimer);
        this.pricingFilterTimer = null;
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        const retainedSearch = panel.querySelector('#mpsPricingSearch');
        const restoreSearchFocus = retainedSearch && document.activeElement === retainedSearch;
        const searchSelection = restoreSearchFocus ? [retainedSearch.selectionStart, retainedSearch.selectionEnd] : null;
        const token = ++this.pricingRequestToken;
        if (!retainedSearch) panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading part costs...</div>';
        else panel.querySelector('.mps-table')?.setAttribute('aria-busy', 'true');
        const [catalog, settingsResult] = await Promise.all([
            API.mpsGetPricingCatalog({page: this.pricingPage, per_page: this.pricingPerPage || 25, search: this.pricingSearch || '', product_status: this.pricingStatus, profit: this.pricingProfit || 'all', sort_by: this.pricingSortBy, sort_order: this.pricingSortOrder}),
            API.mpsGetSettings()
        ]);
        if (token !== this.pricingRequestToken || (this.tab && this.tab !== 'pricing') || !document.getElementById('mpsPanel')) return;
        if (catalog.status !== 'success') {
            if (retainedSearch) { panel.querySelector('.mps-table')?.removeAttribute('aria-busy'); Toast.error(catalog.message || 'Could not load pricing data.'); }
            else panel.innerHTML = `<div class="mps-empty">${esc(catalog.message || 'Could not load pricing data.')}</div>`;
            return;
        }
        const pricing = catalog.pricing || {};
        this.pricingExchangeRate = Number(pricing.pricing_exchange_rate) > 0 ? Number(pricing.pricing_exchange_rate) : (Number(this.pricingExchangeRate) > 0 ? Number(this.pricingExchangeRate) : 1500);
        this.pricingVatPercent = Number(pricing.pricing_vat_percent ?? 18);
        this.pricingCitPercent = Number(pricing.pricing_cit_percent ?? 30);
        const targetMarginValue = Number(pricing.pricing_target_margin_percent ?? settingsResult?.settings?.pricing_target_margin_percent ?? 35);
        const targetMargin = Number.isFinite(targetMarginValue) ? targetMarginValue : 35;
        this.pricingTargetMarginPercent = targetMargin;
        const marginToneFor = margin => margin === null ? 'neutral' : margin < 0 ? 'negative' : margin >= targetMargin ? 'positive' : 'caution';
        const fmt = value => Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 2});
        const fmtRwf = value => Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 0});
        const fmtUsd = value => Number(value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const MAX_SAFE_RWF = Number.MAX_SAFE_INTEGER;
        const rows = (catalog.data || []).map(p => {
            const cost = Number(p.cost_price || 0), approved = Number(p.approved_price || 0);
            const vatPct = Number(pricing.pricing_vat_percent ?? 18), citPct = Number(pricing.pricing_cit_percent ?? 30);
            const {vat, cit, profit, margin: marginPercent} = calculatePricing(cost, approved, vatPct, citPct);
            const calculated = cost * Number(pricing.pricing_markup ?? 2.8738);
            const rowClass = `mps-pricing-row${this.isWriter ? '' : ''}`;
            const sourceType = String(p.source_type || 'woocommerce');
            const statusValue = sourceType === 'local' && !p.product_id ? 'pricing_only' : String(p.status || 'unknown').toLowerCase();
            const statusLabelText = esc(statusLabel(statusValue));
            const status = `<span class="mps-status mps-pricing-status-badge mps-pricing-status-${esc(statusValue)}" title="${statusLabelText}"><i class="fa-solid ${statusValue === 'publish' ? 'fa-circle-check' : 'fa-circle-minus'}" aria-hidden="true"></i><span class="mps-pricing-status-text">${statusLabelText}</span></span>`;
            const productImage = p.image_url
                ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" title="Hover to enlarge product image" loading="lazy">`
                : '<span class="mps-pricing-image-fallback"><i class="fa-regular fa-image" aria-hidden="true"></i></span>';
            const historyButton = Button.html({text: '', icon: 'fa-solid fa-clock-rotate-left', variant: 'ghost', size: 'sm', className: 'mps-pricing-history-link', title: 'View pricing change history', ariaLabel: `View pricing history for ${p.sku || p.name}`, dataAttributes: {'data-pricing-history': Number(p.catalog_id)}});
            const productCell = `<span class="mps-pricing-product-content"><span class="mps-pricing-product-image">${productImage}</span><span class="mps-pricing-product-name" title="${esc(p.name)}">${esc(p.name)}</span>${historyButton}</span>`;
            const exchangeRate = Number(pricing.pricing_exchange_rate || 1500);
            const editorId = `mps-pricing-measurements-${Number(p.catalog_id)}`;
            const pricingFields = this.isWriter ? `<div class="mps-pricing-popover-prices">
                <label><span>Cost (RWF)</span>${Input.html({type: 'number', min: 0, max: MAX_SAFE_RWF, step: '1', value: Math.round(cost), className: 'mps-pricing-cost-rwf', ariaLabel: `Cost in RWF for ${p.sku || p.name}`})}</label>
                <label><span>Cost (USD)</span>${Input.html({type: 'number', min: 0, max: (MAX_SAFE_RWF / exchangeRate).toFixed(2), step: '0.01', value: (cost / exchangeRate).toFixed(2), className: 'mps-pricing-cost-usd', ariaLabel: `Cost in USD for ${p.sku || p.name}`})}</label>
                <label><span>Approved price (RWF)</span>${Input.html({type: 'number', min: 0, max: MAX_SAFE_RWF, step: '1', value: Math.round(approved), className: 'mps-pricing-approved', ariaLabel: `Approved sale price for ${p.sku || p.name}`})}</label>
            </div>` : '';
            const rowActions = this.isWriter ? `${Button.html({text: 'Save', variant: 'outline', size: 'sm', className: 'mps-brand-outline', dataAttributes: {'data-pricing-save': ''}})}${Button.html({text: 'Discard', variant: 'ghost', size: 'sm', hidden: true, title: 'Discard unsaved changes for this row', dataAttributes: {'data-pricing-discard': ''}})}${Button.html({text: 'Reset', variant: 'ghost', size: 'sm', disabled: !Number(p.has_price_override), title: Number(p.has_price_override) ? 'Reset approved price to the current inventory price' : 'No approved price override to reset', dataAttributes: {'data-pricing-reset': ''}})}` : '';
            const dimensionUnit = String(p.dimension_unit || 'cm') === 'store' ? 'cm' : String(p.dimension_unit || 'cm');
            const weightUnit = String(p.weight_unit || 'g') === 'store' ? 'g' : String(p.weight_unit || 'g');
            const measurements = renderPricingMeasurements(p, this.isWriter, fmt, esc, {pricingFields, actions: rowActions});
            const sizeCell = measurements.html;
            const measurementField = (field, label, value, unit) => this.isWriter
                ? Input.html({type: 'number', min: 0, step: 'any', value: value ?? '', className: `mps-pricing-measure mps-pricing-${field}`, ariaLabel: `${label} (${unit}) for ${p.sku || p.name}`})
                : (value === null || value === '' ? '—' : `${fmt(value)} ${esc(unit)}`);
            const stackField = (tag, valueHtml, title = '') => `<div class="mps-pricing-field"><span class="mps-pricing-field-tag"${title ? ` title="${esc(title)}"` : ''}>${tag}</span><span class="mps-pricing-field-value">${valueHtml}</span></div>`;
            const costRwfDisplay = this.isWriter ? `<button type="button" class="mps-pricing-value-link" popovertarget="${editorId}">${fmtRwf(cost)}</button>` : fmtRwf(cost);
            const costUsdDisplay = this.isWriter ? `<button type="button" class="mps-pricing-value-link" popovertarget="${editorId}">${fmtUsd(cost / exchangeRate)}</button>` : fmtUsd(cost / exchangeRate);
            const approvedDisplay = this.isWriter ? `<button type="button" class="mps-pricing-value-link" popovertarget="${editorId}">${fmtRwf(approved)}</button>` : fmtRwf(approved);
            const costCell = `<td class="mps-num mps-pricing-stack">${stackField('RWF', costRwfDisplay)}${stackField('USD', costUsdDisplay)}</td>`;
            const taxCell = `<td class="mps-num mps-pricing-stack mps-pricing-tax">${stackField('VAT', `<span data-pricing-vat="">${fmtRwf(vat)}</span>`)}${stackField('CIT', `<span data-pricing-cit="">${fmtRwf(cit)}</span>`, 'CIT applies only to positive taxable profit; it is zero when there is no taxable profit.')}</td>`;
            const profitTone = profit > 0 ? 'positive' : profit < 0 ? 'negative' : 'neutral';
            const marginTone = marginToneFor(marginPercent);
            const profitIcon = profit > 0 ? 'fa-sort-up' : profit < 0 ? 'fa-sort-down' : 'fa-sort';
            const profitCell = `<td class="mps-num mps-pricing-stack"><div class="mps-pricing-profit"><span data-pricing-profit="">${fmtRwf(profit)}</span></div><div class="mps-pricing-sub mps-pricing-margin mps-pricing-margin-${marginTone}" data-pricing-margin="" title="Margin"><i class="fa-solid ${profitIcon} mps-pricing-profit-trend mps-pricing-profit-trend-${profitTone}" data-pricing-profit-trend="" aria-label="${profit > 0 ? 'Positive' : profit < 0 ? 'Negative' : 'No profit or loss'}"></i>${marginPercent === null ? '-' : `${marginPercent.toFixed(1)}%`}</div></td>`;
            return `<tr class="${rowClass}" data-pricing-row="${Number(p.catalog_id)}" data-pricing-product-id="${Number(p.product_id || 0)}" data-pricing-source="${esc(sourceType)}" data-dimension-unit="${esc(dimensionUnit)}" data-weight-unit="${esc(weightUnit)}"><td class="mps-pricing-sku"><strong>${p.sku ? esc(p.sku) : '<span class="mps-pricing-no-sku">No SKU</span>'}</strong></td><td class="mps-pricing-product">${productCell}</td>${sizeCell}${costCell}<td class="mps-num mps-pricing-calculated"><span data-pricing-calculated="">${fmtRwf(calculated)}</span></td><td class="mps-num mps-pricing-approved-cell${this.isWriter ? ' mps-pricing-editable' : ''}"><span class="mps-pricing-approved-value">${approvedDisplay}</span></td>${taxCell}${profitCell}<td>${status}</td></tr>`;
        }).join('');
        const total = Number(catalog.total || 0);
        const perPage = this.pricingPerPage || 25;
        const tableHeaders = [
            {label: 'SKU', className: 'mps-has-tooltip', title: 'Stock keeping unit'},
            'Part',
            {label: 'Size / weight', title: 'Length, width, height, and weight in the displayed units'},
            {label: 'Cost', title: 'Cost in Rwandan francs and US dollars', className: 'mps-num'},
            {label: 'Calc.', title: 'Calculated sale price in Rwandan francs', className: 'mps-num mps-pricing-calculated'},
            {label: 'Approved', title: 'Approved sale price in Rwandan francs', className: 'mps-num mps-pricing-approved-cell'},
            {label: 'Tax', title: 'VAT and corporate income tax in Rwandan francs', className: 'mps-num mps-pricing-tax'},
            {label: 'Profit', title: 'Profit after tax, with margin shown below', className: 'mps-num'},
            {label: 'Status'},
        ];
        const actions = this.isWriter ? [
            Button.html({id: 'mpsAddCatalogProduct', text: 'Add pricing-only part', icon: 'fa-solid fa-plus', variant: 'outline', size: 'sm', className: 'mps-brand-outline'}),
            Button.html({id: 'mpsImportCosts', text: 'Import purchase costs', icon: 'fa-solid fa-file-import', variant: 'outline', size: 'sm', className: 'mps-brand-outline'}),
            Button.html({id: 'mpsExportPricing', text: 'Export pricing CSV', icon: 'fa-solid fa-file-csv', variant: 'primary', size: 'sm', className: 'mps-btn-primary'}),
            ...(this.lastCostImportBatchId ? [Button.html({id: 'mpsRollbackCosts', text: `Rollback import #${Number(this.lastCostImportBatchId)}`, icon: 'fa-solid fa-rotate-left', variant: 'outline', size: 'sm', className: 'mps-brand-outline'})] : [])
        ].join('') : '';
        const formulaNote = Card.html({className: 'mps-modal-note mps-pricing-formula', content: `Pricing formula settings: USD/RWF ${fmt(pricing.pricing_exchange_rate)} | Markup ${fmt(pricing.pricing_markup)} | VAT ${fmt(pricing.pricing_vat_percent)}% | CIT ${fmt(pricing.pricing_cit_percent)}%. Change these in Settings. Calculated price is a recommendation; approved price is the approved sale price.`});
        const emptyRow = '<tr><td colspan="9" class="mps-empty">No products matched.</td></tr>';
        const filters = `<div class="mps-pricing-filters">${Input.html({id: 'mpsPricingSearch', type: 'search', placeholder: 'Search SKU or product', value: this.pricingSearch || '', ariaLabel: 'Search SKU or product'})}${Select.html({id: 'mpsPricingStatus', value: this.pricingStatus, ariaLabel: 'Filter by publication status', options: [{value: 'all', label: 'All products'}, {value: 'published', label: 'Published'}, {value: 'unpublished', label: 'Not published'}]})}${Select.html({id: 'mpsPricingProfit', value: this.pricingProfit || 'all', ariaLabel: 'Filter by profit or margin', options: getProfitMarginFilterOptions(targetMargin)})}<span class="mps-total">${total.toLocaleString()} products</span></div>${actions ? `<div class="mps-pricing-actions">${actions}</div>` : ''}`;
        this.pricingImagePreviewCleanup?.();
        panel.innerHTML = `${FilterBar.html({className: 'mps-toolbar mps-pricing-toolbar', ariaLabel: 'Part pricing filters and actions', content: filters})}
            ${formulaNote}
            ${Table.html({wrapperClass: 'mps-table-wrap mps-pricing-table-wrap', className: 'mps-table mps-pricing-table', ariaLabel: 'Part pricing', headers: tableHeaders, body: rows || emptyRow})}
            <div id="mpsPricingPagination"></div>`;
        let activePreview = null;
        const dismissPreview = () => {
            activePreview?.element.remove();
            activePreview = null;
        };
        const handleWindowBlur = () => dismissPreview();
        const handleVisibilityChange = () => { if (document.hidden) dismissPreview(); };
        window.addEventListener('scroll', dismissPreview, true);
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        this.pricingImagePreviewCleanup = () => {
            window.removeEventListener('scroll', dismissPreview, true);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            dismissPreview();
            this.pricingImagePreviewCleanup = null;
        };
        panel.querySelectorAll('.mps-pricing-product-image img').forEach(image => {
            image.addEventListener('error', () => {
                const fallback = document.createElement('span');
                fallback.className = 'mps-pricing-image-fallback';
                fallback.innerHTML = '<i class="fa-regular fa-image" aria-hidden="true"></i>';
                image.replaceWith(fallback);
            }, {once: true});
            const movePreview = event => {
                if (!activePreview || activePreview.image !== image) return;
                const preview = activePreview.element;
                const margin = 12;
                const width = preview.offsetWidth;
                const height = preview.offsetHeight;
                const left = event.clientX + 18 + width <= window.innerWidth - margin
                    ? event.clientX + 18
                    : Math.max(margin, event.clientX - width - 18);
                const top = Math.min(Math.max(margin, event.clientY + 18), window.innerHeight - height - margin);
                preview.style.left = `${left}px`;
                preview.style.top = `${top}px`;
            };
            image.addEventListener('pointerenter', event => {
                dismissPreview();
                const preview = document.createElement('div');
                preview.className = 'mps-pricing-image-preview';
                preview.setAttribute('aria-hidden', 'true');
                const enlarged = document.createElement('img');
                enlarged.src = image.currentSrc || image.src;
                enlarged.alt = '';
                preview.appendChild(enlarged);
                document.body.appendChild(preview);
                activePreview = {image, element: preview};
                movePreview(event);
            });
            image.addEventListener('pointermove', movePreview);
            image.addEventListener('pointerleave', () => { if (activePreview?.image === image) dismissPreview(); });
            image.addEventListener('pointercancel', () => { if (activePreview?.image === image) dismissPreview(); });
        });
        Pagination.render(panel.querySelector('#mpsPricingPagination'), {
            page: this.pricingPage, total, pageSize: perPage, pageSizes: [25, 50, 100], itemLabel: 'products', pageSizeId: 'mpsPricingPageSize',
            onPageChange: page => { this.pricingPage = page; this.loadPricing(); },
            onPageSizeChange: pageSize => { this.pricingPerPage = pageSize; this.pricingPage = 1; this.loadPricing(); }
        });
        this.decorateSortableTable(panel.querySelector('.mps-table'), ['sku','name',null,'cost','calculated','approved','vat','profit','status'], 'pricing', this.pricingSortBy, this.pricingSortOrder);
        panel.querySelectorAll('th[data-mps-sort^="pricing:"]').forEach(th => th.addEventListener('click', () => {
            const key = th.dataset.mpsSort.split(':')[1];
            this.pricingSortOrder = this.pricingSortBy === key && this.pricingSortOrder === 'ASC' ? 'DESC' : 'ASC';
            this.pricingSortBy = key;
            this.pricingPage = 1;
            this.loadPricing();
        }));
        let search = panel.querySelector('#mpsPricingSearch');
        const statusFilter = panel.querySelector('#mpsPricingStatus');
        const profitFilter = panel.querySelector('#mpsPricingProfit');
        if (retainedSearch && search) { search.replaceWith(retainedSearch); search = retainedSearch; }
        const schedulePricingReload = () => {
            clearTimeout(this.pricingFilterTimer);
            this.pricingFilterTimer = setTimeout(() => { this.pricingFilterTimer = null; this.loadPricing(); }, FILTER_DEBOUNCE_MS);
        };
        statusFilter?.addEventListener('change', () => { this.pricingStatus = statusFilter.value; this.pricingPage = 1; schedulePricingReload(); });
        profitFilter?.addEventListener('change', () => { this.pricingProfit = profitFilter.value; this.pricingPage = 1; schedulePricingReload(); });
        if (!retainedSearch) search?.addEventListener('input', () => { this.pricingSearch = search.value.trim(); this.pricingPage = 1; schedulePricingReload(); });
        panel.querySelectorAll('[data-pricing-row]').forEach(row => {
            const costRwf = row.querySelector('.mps-pricing-cost-rwf');
            const costUsd = row.querySelector('.mps-pricing-cost-usd');
            const approved = row.querySelector('.mps-pricing-approved');
            const discardButton = row.querySelector('[data-pricing-discard]');
            const measures = [...row.querySelectorAll('.mps-pricing-measure')];
            const original = {costRwf: costRwf?.value ?? '', costUsd: costUsd?.value ?? '', approved: approved?.value ?? '', measures: measures.map(input => input.value)};
            const syncDiscardVisibility = () => {
                const dirty = (costRwf && Number(costRwf.value || 0) !== Number(original.costRwf || 0))
                    || (costUsd && Number(costUsd.value || 0) !== Number(original.costUsd || 0))
                    || (approved && Number(approved.value || 0) !== Number(original.approved || 0))
                    || measures.some((input, index) => input.value !== original.measures[index]);
                discardButton?.classList.toggle('hidden', !dirty);
            };
            const updateMeasurementSummary = () => {
                const display = field => {
                    const value = row.querySelector(`.mps-pricing-measure.mps-pricing-${field}`)?.value;
                    return value === undefined || value === '' ? '-' : Number(value).toLocaleString(undefined, {maximumFractionDigits: 2});
                };
                const sizeSummary = row.querySelector('[data-pricing-size-summary]');
                const weightSummary = row.querySelector('[data-pricing-weight-summary]');
                if (sizeSummary) sizeSummary.textContent = ['length', 'width', 'height'].map(display).join(' x ');
                if (weightSummary) weightSummary.textContent = display('weight');
            };
            const exchange = Number(pricing.pricing_exchange_rate || 1500);
            const markup = Number(pricing.pricing_markup || 0);
            const vatPct = Number(pricing.pricing_vat_percent ?? 18);
            const citPct = Number(pricing.pricing_cit_percent ?? 30);
            const blockScientificNotation = (input, integerOnly = false) => input?.addEventListener('keydown', event => {
                if (['e', 'E', '+', '-', ...(integerOnly ? ['.', ','] : [])].includes(event.key)) event.preventDefault();
            });
            const blockScientificPaste = input => input?.addEventListener('paste', event => {
                const pasted = event.clipboardData?.getData('text') || '';
                if (/[eE]/.test(pasted)) event.preventDefault();
            });
            const normalizeWholeRwf = input => {
                if (!input || input.value === '') return true;
                const value = Number(input.value);
                if (!Number.isSafeInteger(value) || value < 0) {
                    input.setCustomValidity(`Enter a whole RWF amount up to ${MAX_SAFE_RWF.toLocaleString()}.`);
                    return false;
                }
                input.setCustomValidity('');
                input.value = String(value);
                return true;
            };
            const syncUsdToRwf = () => {
                if (!costUsd || !costRwf) return true;
                const converted = Math.round(Number(costUsd.value || 0) * exchange);
                if (!Number.isSafeInteger(converted) || converted < 0) {
                    costUsd.setCustomValidity(`Converted RWF cost must not exceed ${MAX_SAFE_RWF.toLocaleString()}.`);
                    return false;
                }
                costUsd.setCustomValidity('');
                costRwf.value = String(converted);
                costRwf.setCustomValidity('');
                return true;
            };
            blockScientificNotation(costRwf, true);
            blockScientificNotation(costUsd);
            blockScientificNotation(approved, true);
            blockScientificPaste(costRwf);
            blockScientificPaste(costUsd);
            blockScientificPaste(approved);
            const recalculate = () => {
                const cost = Number(costRwf?.value || 0);
                const sale = Number(approved?.value || 0);
                const {vat, cit, profit, margin} = calculatePricing(cost, sale, vatPct, citPct);
                const profitTrend = row.querySelector('[data-pricing-profit-trend]');
                if (profitTrend) {
                    profitTrend.className = `fa-solid ${profit > 0 ? 'fa-sort-up' : profit < 0 ? 'fa-sort-down' : 'fa-sort'} mps-pricing-profit-trend mps-pricing-profit-trend-${profit > 0 ? 'positive' : profit < 0 ? 'negative' : 'neutral'}`;
                    profitTrend.setAttribute('aria-label', profit > 0 ? 'Positive' : profit < 0 ? 'Negative' : 'No profit or loss');
                }
                const marginCell = row.querySelector('[data-pricing-margin]');
                if (marginCell) {
                    const tone = marginToneFor(margin);
                    ['positive', 'caution', 'negative', 'neutral'].forEach(name => marginCell.classList.toggle(`mps-pricing-margin-${name}`, name === tone));
                }
                const values = {
                    '[data-pricing-calculated]': fmtRwf(cost * markup),
                    '[data-pricing-vat]': fmtRwf(vat),
                    '[data-pricing-cit]': fmtRwf(cit),
                    '[data-pricing-profit]': fmtRwf(profit),
                    '[data-pricing-margin]': margin === null ? '-' : `${margin.toFixed(1)}%`
                };
                Object.entries(values).forEach(([selector, value]) => { const cell = row.querySelector(selector); if (cell) cell.textContent = value; });
            };
            costRwf?.addEventListener('input', () => { if (!normalizeWholeRwf(costRwf)) { syncDiscardVisibility(); return; } if (costUsd) costUsd.value = (Number(costRwf.value || 0) / exchange).toFixed(2); recalculate(); syncDiscardVisibility(); });
            costUsd?.addEventListener('input', () => { if (!syncUsdToRwf()) { syncDiscardVisibility(); return; } recalculate(); syncDiscardVisibility(); });
            costRwf?.addEventListener('blur', () => { if (!normalizeWholeRwf(costRwf)) { costRwf.reportValidity(); return; } if (costUsd) costUsd.value = (Number(costRwf.value || 0) / exchange).toFixed(2); recalculate(); syncDiscardVisibility(); });
            costUsd?.addEventListener('blur', () => { costUsd.value = Number(costUsd.value || 0).toFixed(2); if (!syncUsdToRwf()) { costUsd.reportValidity(); return; } recalculate(); syncDiscardVisibility(); });
            approved?.addEventListener('input', () => { if (!normalizeWholeRwf(approved)) { syncDiscardVisibility(); return; } recalculate(); syncDiscardVisibility(); });
            approved?.addEventListener('blur', () => { if (!normalizeWholeRwf(approved)) { approved.reportValidity(); return; } recalculate(); syncDiscardVisibility(); });
            measures.forEach(input => {
                input.addEventListener('input', () => { updateMeasurementSummary(); syncDiscardVisibility(); });
                input.addEventListener('change', () => { updateMeasurementSummary(); syncDiscardVisibility(); });
            });
            discardButton?.addEventListener('click', () => {
                if (costRwf) costRwf.value = original.costRwf;
                if (costUsd) costUsd.value = original.costUsd;
                if (approved) approved.value = original.approved;
                measures.forEach((input, index) => { input.value = original.measures[index]; });
                recalculate();
                updateMeasurementSummary();
                syncDiscardVisibility();
                row.querySelector('.mps-pricing-measure-popover')?.hidePopover();
            });
            row.querySelector('[data-pricing-popover-cancel]')?.addEventListener('click', () => discardButton?.click());
        });        panel.querySelectorAll('[data-pricing-save]').forEach(button => button.addEventListener('click', async () => {
            const row = button.closest('[data-pricing-row]');
            const costInput = row.querySelector('.mps-pricing-cost-rwf');
            const approvedInput = row.querySelector('.mps-pricing-approved');
            const cost = Number(costInput.value), approvedPrice = Number(approvedInput.value);
            const usdInput = row.querySelector('.mps-pricing-cost-usd');
            if (!Number.isSafeInteger(cost) || cost < 0 || !Number.isSafeInteger(approvedPrice) || approvedPrice < 0 || (usdInput && !usdInput.validity.valid)) {
                Toast.error(`RWF prices must be whole numbers up to ${Number.MAX_SAFE_INTEGER.toLocaleString()}.`);
                (usdInput && !usdInput.validity.valid ? usdInput : costInput.validity.valid ? approvedInput : costInput).reportValidity();
                return;
            }
            const measures = Object.fromEntries(['length', 'width', 'height', 'weight'].map(field => {
                const value = row.querySelector(`.mps-pricing-measure.mps-pricing-${field}`)?.value;
                return [field, value === undefined || value === '' ? null : value];
            }));
            if (Object.values(measures).some(value => value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
                Toast.error('Dimensions and weight must be non-negative numbers.');
                row.querySelector('.mps-pricing-measure')?.reportValidity();
                return;
            }
            const result = await API.mpsSavePartPricing({catalog_id: Number(row.dataset.pricingRow), cost_price: cost, approved_price: approvedPrice, ...measures, dimension_unit: row.dataset.dimensionUnit, weight_unit: row.dataset.weightUnit});
            if (result.status !== 'success') return Toast.error(result.message || 'Pricing could not be saved.');
            const savedMeasures = result.measurements;
            const measurementsConfirmed = savedMeasures
                && Object.entries(measures).every(([field, value]) => {
                    const saved = savedMeasures[field];
                    return value === null ? saved === null : Number.isFinite(Number(saved)) && Math.abs(Number(saved) - Number(value)) < 0.0001;
                })
                && savedMeasures.dimension_unit === row.dataset.dimensionUnit
                && savedMeasures.weight_unit === row.dataset.weightUnit;
            if (!measurementsConfirmed) {
                Toast.error('The server saved the prices but did not confirm dimensions and weight. Update the API server and apply the catalog dimensions migration.');
                return;
            }
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
                    const result = await API.mpsDeletePartPricing(Number(row.dataset.pricingProductId));
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
        panel.querySelector('#mpsImportCosts')?.addEventListener('click', () => this.openWorkbookImport('purchase_costs'));
        panel.querySelector('#mpsAddCatalogProduct')?.addEventListener('click', () => this.openCatalogProductDialog());
        panel.querySelectorAll('[data-pricing-history]').forEach(button => button.addEventListener('click', () => {
            const row = button.closest('[data-pricing-row]');
            this.openPartPricingHistory(Number(button.dataset.pricingHistory), row?.querySelector('.mps-pricing-product-name')?.textContent.trim() || 'Part');
        }));
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
    },
    async openPartPricingHistory(catalogId, productName = 'Part') {
        const result = await API.mpsGetPartPricingHistory(catalogId);
        if (result.status !== 'success') return Toast.error(result.message || 'Could not load pricing history.');
        const entries = Array.isArray(result.data) ? result.data : [];
        const formatValue = value => value === null || value === undefined || value === ''
            ? '-'
            : (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
                ? Number(value).toLocaleString(undefined, {maximumFractionDigits: 2})
                : String(value));
        const entryHtml = entries.map(entry => {
            const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Unknown date';
            let title = 'Pricing updated';
            let changes = [];
            if (entry.type === 'cost_import') {
                title = `${entry.created_catalog_item ? 'Pricing-only part created from' : 'Pricing updated from'} ${entry.file_name || 'workbook'} (batch #${entry.batch_id})`;
                changes = [{label: 'Cost (RWF)', from: entry.previous_cost_rwf, to: entry.imported_cost_rwf}];
                if (entry.source_cost_usd !== null && entry.source_cost_usd !== undefined) changes.push({label: 'Source cost (USD)', from: null, to: entry.source_cost_usd});
                if (entry.imported_approved_price_rwf !== null && entry.imported_approved_price_rwf !== undefined) {
                    changes.push({label: 'Approved price (RWF)', from: entry.previous_approved_price_rwf, to: entry.imported_approved_price_rwf});
                }
            } else {
                const metadata = entry.metadata || {};
                title = metadata.source === 'import_rollback' ? 'Purchase cost import rolled back'
                    : entry.action === 'MPS_PART_PRICING_RESET' ? 'Approved price reset'
                    : entry.action === 'MPS_CATALOG_PRODUCT_CREATE' ? 'Pricing-only part created'
                    : entry.action === 'MPS_CATALOG_PRODUCT_LINK' ? 'Linked to WooCommerce'
                    : entry.action === 'MPS_CATALOG_PRODUCT_UNLINK' ? 'Unlinked from WooCommerce'
                    : 'Pricing and measurements saved';
                changes = Object.values(metadata.changes || {});
                if (!changes.length && metadata.cost_price !== undefined) changes.push({label: 'Cost (RWF)', from: null, to: metadata.cost_price});
                if (!changes.length && metadata.approved_price !== undefined) changes.push({label: 'Approved price (RWF)', from: null, to: metadata.approved_price});
            }
            const changeMarkup = changes.length
                ? `<ul>${changes.map(change => `<li><span>${esc(change.label || 'Value')}</span><span>${esc(formatValue(change.from))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> ${esc(formatValue(change.to))}</span></li>`).join('')}</ul>`
                : (entry.details ? `<p>${esc(entry.details)}</p>` : '');
            return `<article class="mps-pricing-history-entry"><header><strong>${esc(title)}</strong><time>${esc(date)}</time></header>${entry.user_name ? `<div class="mps-pricing-history-user">${esc(entry.user_name)}</div>` : ''}${changeMarkup}</article>`;
        }).join('');
        const body = `<div class="mps-pricing-history">${entries.length ? entryHtml : '<div class="mps-empty">No pricing changes are recorded yet. New edits and imports will appear here.</div>'}</div>`;
        const overlay = this.openDialog({title: `Pricing history - ${productName}`, body, confirmText: 'Close', cancelText: null, busyText: 'Closing...', onConfirm: async () => true});
        overlay.querySelector('.mps-dialog')?.classList.add('mps-pricing-history-dialog');
    },
    openCatalogProductDialog() {
        const body = `<p class="mps-modal-note">Create a pricing-only product. SKU and image are optional. It stays out of WooCommerce and stock workflows until you link it.</p>
            <div class="mps-modal-form-grid mps-catalog-identity-grid">
                ${Input.field({id: 'mpsCatalogProductName', label: 'Product name', maxLength: 255, required: true, wrapperClass: 'mps-modal-field-wide'})}
                ${Input.field({id: 'mpsCatalogProductSku', label: 'SKU (optional)', maxLength: 100})}
                ${Input.field({id: 'mpsCatalogProductImage', label: 'Image URL (optional)', type: 'url', placeholder: 'https://'})}
            </div>
            <section class="mps-modal-form-section">
                <h3>Dimensions (cm)</h3>
                <div class="mps-modal-form-grid mps-catalog-measure-grid">
                    ${Input.field({id: 'mpsCatalogProductLength', label: 'Length', type: 'number', min: 0, step: 'any'})}
                    ${Input.field({id: 'mpsCatalogProductWidth', label: 'Width', type: 'number', min: 0, step: 'any'})}
                    ${Input.field({id: 'mpsCatalogProductHeight', label: 'Height', type: 'number', min: 0, step: 'any'})}
                </div>
                <div class="mps-modal-form-grid mps-catalog-weight-grid">${Input.field({id: 'mpsCatalogProductWeight', label: 'Weight (gr)', type: 'number', min: 0, step: 'any'})}</div>
            </section>
            <section class="mps-modal-form-section">
                <h3>Pricing</h3>
                <div class="mps-modal-form-grid mps-catalog-price-grid">
                    ${Input.field({id: 'mpsCatalogProductCost', label: 'Cost (RWF)', type: 'number', min: 0, step: 1, placeholder: '0', required: true})}
                    ${Input.field({id: 'mpsCatalogProductCostUsd', label: 'Cost (USD)', type: 'number', min: 0, step: '0.01', placeholder: '0.00', required: true})}
                    ${Input.field({id: 'mpsCatalogProductApproved', label: 'Approved price (RWF)', type: 'number', min: 0, step: 1, placeholder: '0', required: true})}
                </div>
                <div class="mps-catalog-profit-preview" aria-live="polite">
                    <div><span>Profit after tax</span><strong id="mpsCatalogProfitAfterTax">RWF 0</strong></div>
                    <div><span>Profit margin</span><strong id="mpsCatalogProfitMargin" class="mps-pricing-margin-neutral">-</strong></div>
                    <div><span>Target margin</span><strong>${Number(this.pricingTargetMarginPercent ?? 35).toLocaleString(undefined, {maximumFractionDigits: 2})}%</strong></div>
                </div>
            </section>`;
        const overlay = this.openDialog({
            title: 'Add pricing-only part',
            body,
            confirmText: 'Add part',
            busyText: 'Adding part...',
            onConfirm: async overlay => {
                const field = selector => overlay.querySelector(selector);
                const nameInput = field('#mpsCatalogProductName');
                const skuInput = field('#mpsCatalogProductSku');
                const imageInput = field('#mpsCatalogProductImage');
                const costInput = field('#mpsCatalogProductCost');
                const costUsdInput = field('#mpsCatalogProductCostUsd');
                const approvedInput = field('#mpsCatalogProductApproved');
                const name = nameInput.value.trim();
                const sku = skuInput.value.trim();
                const imageUrl = imageInput.value.trim();
                const measureInputs = ['Length', 'Width', 'Height', 'Weight'].map(label => ({
                    label,
                    input: field(`#mpsCatalogProduct${label}`),
                }));
                const measures = Object.fromEntries(measureInputs.map(({label, input}) => [label.toLowerCase(), input.value.trim()]));
                const {length, width, height, weight} = measures;
                const dimensionUnit = 'cm';
                const weightUnit = 'g';
                const costRaw = costInput.value.trim();
                const costUsdRaw = costUsdInput.value.trim();
                const approvedRaw = approvedInput.value.trim();
                const cost = Number(costRaw);
                const costUsd = Number(costUsdRaw);
                const approved = Number(approvedRaw);
                const reject = (input, message) => { Toast.error(message); input?.focus(); return false; };
                if (!name) return reject(nameInput, 'Enter a product name.');
                if (name.length > 255) return reject(nameInput, 'Product name must be 255 characters or fewer.');
                if (sku.length > 100) return reject(skuInput, 'SKU must be 100 characters or fewer.');
                if (imageUrl) {
                    let parsedImageUrl;
                    try { parsedImageUrl = new URL(imageUrl); } catch (_) { return reject(imageInput, 'Enter a valid image URL using HTTP or HTTPS.'); }
                    if (!['http:', 'https:'].includes(parsedImageUrl.protocol)) return reject(imageInput, 'Image URL must use HTTP or HTTPS.');
                }
                if (!costRaw || !/^\d+$/.test(costRaw) || !Number.isSafeInteger(cost) || cost < 0) return reject(costInput, 'Cost (RWF) is required and must be a whole non-negative number.');
                if (!costUsdRaw || !/^\d+(?:\.\d{1,2})?$/.test(costUsdRaw) || !Number.isFinite(costUsd) || costUsd < 0) return reject(costUsdInput, 'Cost (USD) is required and must be a non-negative amount with up to 2 decimal places.');
                if (!approvedRaw || !/^\d+$/.test(approvedRaw) || !Number.isSafeInteger(approved) || approved < 0) return reject(approvedInput, 'Approved price (RWF) is required and must be a whole non-negative number.');
                for (const {label, input} of measureInputs) {
                    const raw = input.value.trim();
                    if (raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
                        return reject(input, `${label} must be a non-negative number, or left blank.`);
                    }
                }
                const result = await API.mpsCreateCatalogProduct({name, sku, image_url: imageUrl, cost_price: cost, approved_price: approved, length, width, height, weight, dimension_unit: dimensionUnit, weight_unit: weightUnit});
                if (result.status !== 'success') { Toast.error(result.message || 'Pricing-only product could not be created.'); return false; }
                Toast.success('Pricing-only product added.');
                this.loadPricing();
                return true;
            }
        });
        const exchangeRate = Number(this.pricingExchangeRate) > 0 ? Number(this.pricingExchangeRate) : 1500;
        const costRwfInput = overlay.querySelector('#mpsCatalogProductCost');
        const costUsdInput = overlay.querySelector('#mpsCatalogProductCostUsd');
        const approvedInput = overlay.querySelector('#mpsCatalogProductApproved');
        const profitAfterTax = overlay.querySelector('#mpsCatalogProfitAfterTax');
        const profitMargin = overlay.querySelector('#mpsCatalogProfitMargin');
        const formatRwf = value => `RWF ${Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
        const updateProfitPreview = () => {
            const cost = Number(costRwfInput.value) || 0;
            const approved = Number(approvedInput.value) || 0;
            const {profit, margin} = calculatePricing(cost, approved, this.pricingVatPercent ?? 18, this.pricingCitPercent ?? 30);
            profitAfterTax.textContent = formatRwf(profit);
            profitMargin.textContent = margin === null ? '-' : `${margin.toFixed(1)}%`;
            const tone = margin === null ? 'neutral' : margin < 0 ? 'negative' : margin >= Number(this.pricingTargetMarginPercent ?? 35) ? 'positive' : 'caution';
            profitMargin.className = `mps-catalog-profit-margin mps-pricing-margin-${tone}`;
        };
        costRwfInput.addEventListener('input', () => {
            const raw = costRwfInput.value.trim();
            const rwf = Number(raw);
            costUsdInput.value = raw === '' ? '' : (Number.isFinite(rwf) ? (rwf / exchangeRate).toFixed(2) : '');
            updateProfitPreview();
        });
        costUsdInput.addEventListener('input', () => {
            const raw = costUsdInput.value.trim();
            const usd = Number(raw);
            costRwfInput.value = raw === '' ? '' : (Number.isFinite(usd) ? String(Math.round(usd * exchangeRate)) : '');
            updateProfitPreview();
        });
        approvedInput.addEventListener('input', updateProfitPreview);
        updateProfitPreview();
    }
};
