const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');
const Card = require('../../../components/Card.js');
const Table = require('../../../components/Table.js');
const Input = require('../../../components/Input.js');
const Select = require('../../../components/Select.js');
const Button = require('../../../components/Button.js');

const renderAiMarkdown = value => esc(value || '').replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');

module.exports = {
    async showProduct(productId) {
        const [data, settingsResult] = await Promise.all([API.mpsGetProductAnalysis(productId), API.mpsGetSettings()]);
        if (data.status !== 'success') return Toast.error(data.message || 'Could not load product analysis.');
        await this.ensureSuppliers();
        const settings = settingsResult.status === 'success' ? settingsResult.settings || {} : {};
        const aiEnabled = settings.ai_enabled === true;
        const formatSpan = span => {
            const value = Number(span?.value);
            if (!Number.isFinite(value) || value <= 0 || !span?.unit) return '';
            return `${num(value)} ${span.unit}${value === 1 ? '' : 's'}`;
        };
        const historyRange = formatSpan(settings.history_window);
        const coverRange = formatSpan(settings.cover_period);
        const historyLabel = historyRange ? `last ${historyRange}` : 'history period';
        const coverLabel = coverRange ? `cover: last ${coverRange}` : 'cover period';
        const p = data.product, summary = data.summary, result = data.mps || {};
        const params = data.params || {};
        const supplierOptions = (this.suppliersList || []).map(s => ({value: Number(s.id), label: s.name}));
        const projection = Array.isArray(data.projection) ? data.projection : [];
        const hasForecastDemand = Number(result.daily_rate_window || 0) > 0;
        const hasIncomingStock = Number(result.incoming || 0) > 0;
        const projectionUnavailableMessage = result.status === 'excluded' || params.excluded || params.planning_status === 'discontinued'
            ? 'Projection is not generated for products excluded from planning.'
            : !hasForecastDemand && !hasIncomingStock
                ? 'No projection was generated because there is no forecast demand or incoming stock.'
                : 'No projection was saved for the latest planner run. Run the planner again to refresh it.';
        const peakMonths = Array.isArray(data.peak_months) ? data.peak_months : [];
        const peakMonthsNote = peakMonths.length
            ? `Top months: ${peakMonths.map(item => `${monthLabel(`${item.month}-01`)} (${qty(item.quantity)})`).join(' · ')}`
            : 'No positive sales months in complete history';
        const riskBuffer = Number(result.buffer || 0);
        const bufferExceedsStock = riskBuffer > Number(result.total_stock || 0);
        const currentStock = Number(result.current_stock || 0);
        const totalStock = Number(result.total_stock || 0);
        const deviation = Number(result.deviation || 0);
        const deviationTone = deviation > 0 ? 'success' : deviation < 0 ? 'danger' : 'neutral';
        const deviationIcon = deviation > 0 ? 'fa-caret-up' : deviation < 0 ? 'fa-caret-down' : 'fa-minus';
        const stockTone = stock => stock <= 0 ? 'danger' : stock <= riskBuffer ? 'warning' : 'success';
        const metrics = [
            ['Current stock', qty(result.current_stock), false, stockTone(currentStock)],
            ['Incoming stock', qty(result.incoming), false, Number(result.incoming || 0) > 0 ? 'success' : 'neutral'],
            ['Total stock', qty(result.total_stock), false, stockTone(totalStock)],
            ['Cumulative average (all history)', qty(result.avg_all), false, 'info'],
            [`Cumulative demand (${coverLabel})`, qty(result.cover_all), false, 'info'],
            ['Cumulative peak (all history)', qty(result.peak_all), false, 'info', '', peakMonthsNote],
            [`Window average (${historyLabel})`, qty(result.avg_window), false, 'info'],
            [`Window demand (${coverLabel})`, qty(result.cover_window), false, 'info'],
            [`Window peak (${historyLabel})`, qty(result.peak_window), false, 'info'],
            ['Deviation', `${deviation > 0 ? '+' : ''}${qty(deviation)}`, false, deviationTone, deviationIcon],
            ['Risk buffer', qty(result.buffer), bufferExceedsStock, bufferExceedsStock ? 'danger' : 'success']
        ].map(([label, value, risk, tone, icon, detail]) => Card.html({tagName: 'div', className: `mps-detail-metric${risk ? ' mps-risk-metric' : ''}`, content: `<span>${esc(label)}</span><b class="mps-detail-value mps-value-${tone || 'info'}">${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : ''}${esc(value)}</b>${detail ? `<small class="mps-detail-note">${esc(detail)}</small>` : ''}`})).join('');
        const summaryMetrics = [
            ['Sales in range', summary.total_qty],
            ['Daily rate', summary.avg_per_day],
            ['Peak bucket', summary.peak_bucket_qty],
            ['Days of cover', result.days_of_cover ?? '—'],
            ['First stockout', result.first_stockout_date || '—'],
            ['Suggested reorder', result.reorder_qty || 0]
        ].map(([label, value, note]) => {
            let tone = 'info';
            if (label === 'Days of cover') {
                const days = Number(value);
                tone = !Number.isFinite(days) ? 'neutral' : days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'success';
            } else if (label === 'First stockout') tone = result.first_stockout_date ? 'danger' : 'success';
            else if (label === 'Suggested reorder') tone = Number(value) > 0 ? 'warning' : 'success';
            return Card.html({tagName: 'div', className: 'mps-detail-metric', content: `<span>${esc(label)}</span><b class="mps-detail-value mps-value-${tone}">${esc(value)}</b>${note ? `<small class="mps-detail-note">${esc(note)}</small>` : ''}`});
        }).join('');
        const projectionRows = projection.map(row => {
            const closing = Number(row.closing || 0);
            const stockout = closing < 0;
            return `<tr class="${stockout ? 'mps-stockout-row' : ''}"><td>${esc(monthLabel(row.period_start))}</td><td class="mps-num">${esc(qty(row.opening))}</td><td class="mps-num">${esc(qty(row.incoming))}</td><td class="mps-num">${esc(qty(row.demand))}</td><td class="mps-num ${stockout ? 'mps-negative' : ''}">${esc(qty(closing))}</td></tr>`;
        }).join('');
        const projectionTable = Table.html({
            wrapperClass: 'mps-projection-wrap', className: 'mps-projection', ariaLabel: 'Monthly stock projection',
            headers: ['Month', ...['Opening', 'Incoming', 'Demand', 'Closing'].map(label => ({label, className: 'mps-num'}))],
            body: projectionRows
        });
        const overlay = document.createElement('div'); overlay.className = 'mps-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `<section class="mps-dialog"><header><div><small>${esc(p.sku)}</small><h2>${esc(p.name)}</h2></div><button class="mps-close" aria-label="Close">×</button></header>
            <div class="mps-detail-grid"><div><span>Sales in range</span><b>${esc(summary.total_qty)}</b></div><div><span>Daily rate</span><b>${esc(summary.avg_per_day)}</b></div><div><span>Peak bucket</span><b>${esc(summary.peak_bucket_qty)}</b></div><div><span>Days of cover</span><b>${esc(result.days_of_cover ?? '—')}</b></div><div><span>First stockout</span><b>${esc(result.first_stockout_date || '—')}</b></div><div><span>Suggested reorder</span><b>${esc(result.reorder_qty || 0)}</b></div></div>
            <h3>Planning metrics</h3>
            <div class="mps-detail-grid mps-metrics-grid">${metrics}</div>
            <h3>Monthly stock projection</h3>
            ${projectionRows ? `<div class="mps-projection-wrap"><table class="mps-projection"><thead><tr><th>Month</th><th class="mps-num">Opening</th><th class="mps-num">Incoming</th><th class="mps-num">Demand</th><th class="mps-num">Closing</th></tr></thead><tbody>${projectionRows}</tbody></table></div>` : '<p class="mps-chart-empty">' + esc(projectionUnavailableMessage) + '</p>'}
            <h3 title="An asterisk marks a period whose multi-day sales total was distributed across the planner periods it covers.">Demand history <small>* adjusted</small></h3><div class="mps-series">${(data.series||[]).slice(-24).map(x=>`<div class="${x.estimated ? 'mps-series-estimated' : ''}" title="${esc(x.period_start)}: ${esc(x.qty)}${x.estimated ? ' (multi-day sales total distributed across periods)' : ''}"><span>${esc(String(x.period_start).slice(0,7))}${x.estimated ? '*' : ''}</span><b style="height:${Math.max(3,Math.min(100,Number(x.qty)*5))}%"></b></div>`).join('')}</div>
            <h3>Open purchase orders</h3><div class="mps-po-lines">${(data.open_purchase_orders||[]).map(x=>`<p>${esc(x.reference)} · ${esc(statusLabel(x.status))} · ETA ${esc(x.eta_date||'—')} · ${esc(Number(x.qty_ordered)-Number(x.qty_received))} units</p>`).join('') || '<p>No open purchase orders.</p>'}</div>
            ${aiEnabled ? `<h3>AI assistance</h3><div class="mps-ai-panel">
                <div class="mps-ai-actions">
                    <button class="btn btn-sm mps-btn-outline" type="button" data-mps-ai-task="summary"><i class="fa-solid fa-wand-magic-sparkles"></i> Summary</button>
                    <button class="btn btn-sm mps-btn-outline" type="button" data-mps-ai-task="explanation"><i class="fa-solid fa-circle-info"></i> Explain reorder</button>
                    <button class="btn btn-sm mps-btn-outline" type="button" data-mps-ai-task="planning_notes"><i class="fa-solid fa-clipboard-list"></i> Planning notes</button>
                </div>
                <p class="mps-ai-hint">AI suggestions are for review only. They never change stock, forecasts, purchase orders, or prices.</p>
                <div class="mps-ai-output" id="mpsAiOutput" hidden></div>
            </div>` : ''}
            ${this.isWriter ? `<h3>Planning controls</h3><div class="mps-param-edit">
                <label>Planning status<select id="mpsPlanningStatus">${['active','new','seasonal','discontinued'].map(v => `<option value="${v}" ${(params.planning_status || 'active') === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
                <label>Supplier<select id="mpsProductSupplier"><option value="">Use no assigned supplier</option>${supplierOptions}</select></label>
                <label>Mostly purchased by<select id="mpsPreferredFreight"><option value="" ${!params.preferred_freight_mode ? 'selected' : ''}>Use default route (Air)</option><option value="local" ${params.preferred_freight_mode === 'local' ? 'selected' : ''}>Local purchase</option><option value="sea" ${params.preferred_freight_mode === 'sea' ? 'selected' : ''}>Imported by sea</option><option value="air" ${params.preferred_freight_mode === 'air' ? 'selected' : ''}>Imported by air</option></select></label>
                <label>Lead time days<input id="mpsLeadDays" type="number" min="0" value="${esc(params.lead_time_days ?? '')}" placeholder="Use supplier/default"></label>
                <label>Minimum order qty<input id="mpsMoq" type="number" min="0" value="${esc(params.min_order_qty ?? '')}" placeholder="No MOQ"></label>
                <label>Manual risk buffer<input id="mpsManualBuffer" type="number" min="0" value="${esc(params.manual_buffer ?? '')}" placeholder="Use calculated buffer"></label>
                <label>Launch date<input id="mpsLaunchDate" type="date" value="${esc(params.launch_date ?? '')}"></label>
                <label class="mps-check"><input id="mpsExcluded" type="checkbox" ${params.excluded ? 'checked' : ''}> Exclude from planner</label>
                <label>Planning note<input id="mpsProductNote" type="text" maxlength="255" value="${esc(params.note ?? '')}"></label>
                <button class="btn btn-primary btn-sm" id="mpsSaveParams">Save planning controls</button></div>` : ''}</section>`;
        const summaryGrid = overlay.querySelector('.mps-dialog>.mps-detail-grid');
        if (summaryGrid) summaryGrid.innerHTML = summaryMetrics;
        const aiHeading = [...overlay.querySelectorAll('.mps-dialog>h3')].find(heading => heading.textContent.trim() === 'AI assistance');
        const aiPanel = aiHeading?.nextElementSibling;
        if (summaryGrid && aiHeading && aiPanel?.classList.contains('mps-ai-panel')) summaryGrid.after(aiHeading, aiPanel);
        if (projectionRows) {
            const projectionWrap = overlay.querySelector('.mps-projection-wrap');
            if (projectionWrap) projectionWrap.outerHTML = projectionTable;
        }
        const replaceControl = (selector, html) => {
            const element = overlay.querySelector(selector);
            if (element) element.outerHTML = html;
        };
        replaceControl('#mpsPlanningStatus', Select.html({id: 'mpsPlanningStatus', value: params.planning_status || 'active', ariaLabel: 'Planning status', options: ['active', 'new', 'seasonal', 'discontinued'].map(value => ({value, label: value}))}));
        replaceControl('#mpsProductSupplier', Select.html({id: 'mpsProductSupplier', value: params.supplier_id || '', ariaLabel: 'Supplier', options: [{value: '', label: 'Use no assigned supplier'}, ...supplierOptions]}));
        replaceControl('#mpsPreferredFreight', Select.html({id: 'mpsPreferredFreight', value: params.preferred_freight_mode || '', ariaLabel: 'Mostly purchased by', options: [
            {value: '', label: 'Use default route (Air)'}, {value: 'local', label: 'Local purchase'},
            {value: 'sea', label: 'Imported by sea'}, {value: 'air', label: 'Imported by air'}
        ]}));
        [
            ['#mpsLeadDays', 'number', params.lead_time_days, 'Use supplier/default'],
            ['#mpsMoq', 'number', params.min_order_qty, 'No MOQ'],
            ['#mpsManualBuffer', 'number', params.manual_buffer, 'Use calculated buffer'],
            ['#mpsLaunchDate', 'date', params.launch_date, ''],
            ['#mpsProductNote', 'text', params.note, '']
        ].forEach(([selector, type, value, placeholder]) => {
            const element = overlay.querySelector(selector);
            if (!element) return;
            const label = element.closest('label')?.childNodes[0]?.textContent.trim() || element.id;
            element.outerHTML = Input.html({id: element.id, type, value: value ?? '', min: type === 'number' ? 0 : undefined, maxLength: type === 'text' ? 255 : undefined, placeholder, ariaLabel: label});
        });
        replaceControl('.mps-close', Button.html({text: '×', variant: 'ghost', size: 'sm', className: 'mps-close', ariaLabel: 'Close product detail'}));
        replaceControl('#mpsSaveParams', Button.html({id: 'mpsSaveParams', text: 'Save planning controls', variant: 'primary', size: 'sm'}));
        [
            ['[data-mps-ai-task="summary"]', 'Summary', 'fa-solid fa-wand-magic-sparkles', 'summary'],
            ['[data-mps-ai-task="explanation"]', 'Explain reorder', 'fa-solid fa-circle-info', 'explanation'],
            ['[data-mps-ai-task="planning_notes"]', 'Planning notes', 'fa-solid fa-clipboard-list', 'planning_notes']
        ].forEach(([selector, text, icon, task]) => {
            replaceControl(selector, Button.html({text, icon, variant: 'outline', size: 'sm', className: 'mps-btn-outline', dataAttributes: {'data-mps-ai-task': task}}));
        });
        document.body.appendChild(overlay);
        overlay.querySelector('.mps-close').onclick = () => overlay.remove();
        overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };

        const aiOutput = overlay.querySelector('#mpsAiOutput');
        const aiButtons = [...overlay.querySelectorAll('[data-mps-ai-task]')];
        aiButtons.forEach(button => button.addEventListener('click', async () => {
            const task = button.dataset.mpsAiTask;
            aiButtons.forEach(btn => { btn.disabled = true; });
            aiOutput.hidden = false;
            aiOutput.className = 'mps-ai-output';
            aiOutput.textContent = 'Generating suggestion...';
            try {
                const res = await API.mpsAISuggest(productId, task);
                if (res.status === 'success') {
                    aiOutput.innerHTML = renderAiMarkdown(res.suggestion || 'No suggestion returned.');
                } else {
                    aiOutput.classList.add('mps-ai-error');
                    aiOutput.textContent = `${res.error || res.message || 'Could not generate an AI suggestion.'}${res.quota_exceeded ? ' Daily AI limit reached; try again after it resets.' : ''}`;
                    if (res.quota_exceeded) Toast.error('Daily AI limit has been reached. Try again after it resets.');
                }
            } catch (e) {
                aiOutput.classList.add('mps-ai-error');
                aiOutput.textContent = e.message || 'AI service unavailable.';
                Toast.error(e.message || 'AI service unavailable.');
            } finally {
                aiButtons.forEach(btn => { btn.disabled = false; });
            }
        }));

        overlay.querySelector('#mpsSaveParams')?.addEventListener('click', async () => {
            const numberOrNull = id => { const el = overlay.querySelector(`#${id}`); if (!el || el.value === '') return null; return Number(el.value); };
            const saved = await API.mpsSaveProductParams(productId, {
                planning_status: overlay.querySelector('#mpsPlanningStatus').value,
                supplier_id: overlay.querySelector('#mpsProductSupplier').value || null,
                preferred_freight_mode: overlay.querySelector('#mpsPreferredFreight').value || null,
                lead_time_days: numberOrNull('mpsLeadDays'), min_order_qty: numberOrNull('mpsMoq'),
                manual_buffer: numberOrNull('mpsManualBuffer'), launch_date: overlay.querySelector('#mpsLaunchDate').value || null,
                excluded: overlay.querySelector('#mpsExcluded').checked, note: overlay.querySelector('#mpsProductNote').value.trim()
            });
            if (saved.status === 'success') {
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success(saved.message || 'Planning parameters saved.');
                overlay.remove();
                this.loadTab();
            }
            else Toast.error(saved.message || 'Could not save parameters.');
        });
    }
};
