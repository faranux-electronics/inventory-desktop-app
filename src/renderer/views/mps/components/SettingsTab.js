const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    async loadSettings() {
        const panel = document.getElementById('mpsPanel'); if (!panel) return;
        panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading settings…</div>';
        const result = await API.mpsGetSettings();
        if (!document.getElementById('mpsPanel')) return;
        if (result.status !== 'success') { panel.innerHTML = `<div class="mps-empty">${esc(result.message || 'Could not load settings.')}</div>`; this.addContextualHelp('settings'); return; }
        const s = result.settings || {}, span = key => s[key] || {value:1,unit:'month'};
        panel.innerHTML = `<div class="mps-settings"><div><h2>Planner settings</h2><p>These settings apply to future planner runs.</p></div>${this.isWriter ? `<form id="mpsSettingsForm"><div class="mps-settings-grid">
            ${[['History window','history_window','How far back to look for sales history'],['Cover period','cover_period','Demand window used for coverage calculations'],['Default lead time','default_lead_time','Default lead time used if supplier has none']].map(([label,key,tip])=>`<fieldset class="mps-has-tooltip" data-tooltip="${esc(tip)}"><legend>${label}</legend><input name="${key}_value" type="number" min="1" max="1000" value="${esc(span(key).value)}"><select name="${key}_unit">${['day','week','month'].map(unit=>`<option ${span(key).unit===unit?'selected':''}>${unit}</option>`).join('')}</select></fieldset>`).join('')}
            <fieldset class="mps-has-tooltip" data-tooltip="Projection bucket size and number of buckets"><legend>Projection</legend><select name="bucket">${['day','week','month'].map(unit=>`<option ${(s.projection?.bucket||'month')===unit?'selected':''}>${unit}</option>`).join('')}</select><input name="buckets" type="number" min="1" max="120" value="${esc(s.projection?.buckets||12)}" aria-label="Projection buckets"></fieldset>
            <label class="mps-check mps-has-tooltip" data-tooltip="Only use complete periods when calculating averages"><input name="history_complete_only" type="checkbox" ${s.history_complete_only?'checked':''}> Use complete history periods only</label><label class="mps-has-tooltip" data-tooltip="Sales before this date are skipped during refresh; imported history remains untouched">Sales cutover date<input name="sales_cutover_date" type="date" value="${esc(s.sales_cutover_date||'')}"></label>
            </div><button class="btn btn-sm mps-btn-primary" type="submit">Save settings</button></form>` : '<p>You have read-only access to planner settings.</p>'}</div>`;
        if (this.isWriter) {
            panel.insertAdjacentHTML('beforeend', '<button class="btn btn-sm mps-btn-outline" id="mpsWorkbookImport">Preview / import workbook</button>');
            document.getElementById('mpsWorkbookImport')?.addEventListener('click', () => this.openWorkbookImport(s));
            panel.insertAdjacentHTML('beforeend', `<form id="mpsPricingSettingsForm" class="mps-settings" style="margin-top:16px"><div><h2>Pricing formulas</h2><p>Defaults match the Parts Pricing workbook.</p></div><div class="mps-settings-grid">
                <label>USD to RWF<input name="pricing_exchange_rate" type="number" min="1" step="0.01" value="${esc(s.pricing_exchange_rate || 1500)}"></label>
                <label>Cost markup<input name="pricing_markup" type="number" min="0.01" step="0.0001" value="${esc(s.pricing_markup || 2.8738)}"></label>
                <label>VAT percent<input name="pricing_vat_percent" type="number" min="0" max="100" step="0.01" value="${esc(s.pricing_vat_percent ?? 18)}"></label>
                <label>CIT percent<input name="pricing_cit_percent" type="number" min="0" max="100" step="0.01" value="${esc(s.pricing_cit_percent ?? 30)}"></label></div><button class="btn btn-sm mps-btn-primary" type="submit">Save pricing formulas</button></form>`);
        }
        document.getElementById('mpsSettingsForm')?.addEventListener('submit', async event => {
            event.preventDefault(); const form = new FormData(event.currentTarget), spanData = key => ({value:Number(form.get(`${key}_value`)),unit:form.get(`${key}_unit`)});
            const payload = {history_window:spanData('history_window'),cover_period:spanData('cover_period'),default_lead_time:spanData('default_lead_time'),projection:{bucket:form.get('bucket'),buckets:Number(form.get('buckets'))},history_complete_only:form.has('history_complete_only'),sales_cutover_date:form.get('sales_cutover_date')};
            const saved = await API.mpsSaveSettings(payload);
            if (saved.status === 'success') {
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success('MPS settings saved.');
            } else Toast.error(saved.message || 'Settings could not be saved.');
        });
        document.getElementById('mpsPricingSettingsForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = Object.fromEntries(['pricing_exchange_rate','pricing_markup','pricing_vat_percent','pricing_cit_percent'].map(key => [key, Number(form.get(key))]));
            const saved = await API.mpsSaveSettings(payload);
            if (saved.status === 'success') {
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success('Pricing formulas saved.');
            } else Toast.error(saved.message || 'Pricing formulas could not be saved.');
        });
        this.addContextualHelp('settings');
    }
};
