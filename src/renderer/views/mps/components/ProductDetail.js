const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    async showProduct(productId) {
        const data = await API.mpsGetProductAnalysis(productId);
        if (data.status !== 'success') return Toast.error(data.message || 'Could not load product analysis.');
        await this.ensureSuppliers();
        const p = data.product, summary = data.summary, result = data.mps || {};
        const params = data.params || {};
        const supplierOptions = (this.suppliersList || []).map(s => `<option value="${Number(s.id)}" ${String(s.id) === String(params.supplier_id || '') ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
        const projection = Array.isArray(data.projection) ? data.projection : [];
        const riskBuffer = Number(result.buffer || 0);
        const bufferExceedsStock = riskBuffer > Number(result.total_stock || 0);
        const metrics = [
            ['Current stock', qty(result.current_stock)],
            ['Incoming stock', qty(result.incoming)],
            ['Total stock', qty(result.total_stock)],
            ['Cumulative average', qty(result.avg_all)],
            ['Cumulative demand', qty(result.cover_all)],
            ['Cumulative peak', qty(result.peak_all)],
            ['Window average', qty(result.avg_window)],
            ['Window demand', qty(result.cover_window)],
            ['Window peak', qty(result.peak_window)],
            ['Deviation', `${Number(result.deviation || 0) > 0 ? '+' : ''}${qty(result.deviation)}`],
            ['Risk buffer', qty(result.buffer), bufferExceedsStock]
        ].map(([label, value, risk]) => `<div${risk ? ' class="mps-risk-metric"' : ''}><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
        const projectionRows = projection.map(row => {
            const closing = Number(row.closing || 0);
            const stockout = closing < 0;
            return `<tr class="${stockout ? 'mps-stockout-row' : ''}"><td>${esc(monthLabel(row.period_start))}</td><td class="mps-num">${esc(qty(row.opening))}</td><td class="mps-num">${esc(qty(row.incoming))}</td><td class="mps-num">${esc(qty(row.demand))}</td><td class="mps-num ${stockout ? 'mps-negative' : ''}">${esc(qty(closing))}</td></tr>`;
        }).join('');
        const overlay = document.createElement('div'); overlay.className = 'mps-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `<section class="mps-dialog"><header><div><small>${esc(p.sku)}</small><h2>${esc(p.name)}</h2></div><button class="mps-close" aria-label="Close">×</button></header>
            <div class="mps-detail-grid"><div><span>Sales in range</span><b>${esc(summary.total_qty)}</b></div><div><span>Daily rate</span><b>${esc(summary.avg_per_day)}</b></div><div><span>Peak bucket</span><b>${esc(summary.peak_bucket_qty)}</b></div><div><span>Days of cover</span><b>${esc(result.days_of_cover ?? '—')}</b></div><div><span>First stockout</span><b>${esc(result.first_stockout_date || '—')}</b></div><div><span>Suggested reorder</span><b>${esc(result.reorder_qty || 0)}</b></div></div>
            <h3>Planning metrics</h3>
            <div class="mps-detail-grid mps-metrics-grid">${metrics}</div>
            <p class="mps-modal-note">Cumulative uses all history; window uses the configured history period; demand uses the configured cover period.</p>
            <h3>Monthly stock projection</h3>
            ${projectionRows ? `<div class="mps-projection-wrap"><table class="mps-projection"><thead><tr><th>Month</th><th class="mps-num">Opening</th><th class="mps-num">Incoming</th><th class="mps-num">Demand</th><th class="mps-num">Closing</th></tr></thead><tbody>${projectionRows}</tbody></table></div>` : '<p class="mps-chart-empty">No projection available. Run the planner to generate one.</p>'}
            <h3>Demand history</h3><div class="mps-series">${(data.series||[]).slice(-24).map(x=>`<div title="${esc(x.period_start)}: ${esc(x.qty)}"><span>${esc(String(x.period_start).slice(0,7))}</span><b style="height:${Math.max(3,Math.min(100,Number(x.qty)*5))}%"></b></div>`).join('')}</div>
            <h3>Open purchase orders</h3><div class="mps-po-lines">${(data.open_purchase_orders||[]).map(x=>`<p>${esc(x.reference)} · ${esc(statusLabel(x.status))} · ETA ${esc(x.eta_date||'—')} · ${esc(Number(x.qty_ordered)-Number(x.qty_received))} units</p>`).join('') || '<p>No open purchase orders.</p>'}</div>
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
        document.body.appendChild(overlay);
        overlay.querySelector('.mps-close').onclick = () => overlay.remove();
        overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };
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
