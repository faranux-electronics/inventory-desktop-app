const { API, Toast, esc } = require('../helpers.js');

module.exports = {
    async loadSettings() {
        const panel = document.getElementById('mpsPanel'); if (!panel) return;
        panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading settings...</div>';
        const result = await API.mpsGetSettings();
        if (!document.getElementById('mpsPanel')) return;
        if (result.status !== 'success') { panel.innerHTML = `<div class="mps-empty">${esc(result.message || 'Could not load settings.')}</div>`; this.addContextualHelp('settings'); return; }
        const s = result.settings || {};
        const span = key => s[key] || { value: 1, unit: 'month' };
        const unitOptions = selected => ['day', 'week', 'month'].map(unit => `<option ${selected === unit ? 'selected' : ''}>${unit}</option>`).join('');
        const spanField = (label, key, description) => {
            const setting = span(key);
            return `<label class="mps-setting-field">
                <span class="mps-setting-label">${label}</span>
                <span class="mps-setting-control">
                    <input name="${key}_value" type="number" min="1" max="1000" value="${esc(setting.value)}">
                    <select name="${key}_unit">${unitOptions(setting.unit)}</select>
                </span>
                <small>${description}</small>
            </label>`;
        };
        const pricingField = (label, name, value, attributes) => `<label class="mps-setting-field"><span class="mps-setting-label">${label}</span><input name="${name}" type="number" ${attributes} value="${esc(value)}"></label>`;
        const planningFields = [
            ['History window', 'history_window', 'How far back to look for sales history.'],
            ['Cover period', 'cover_period', 'Demand window used for coverage calculations.'],
            ['Default lead time', 'default_lead_time', 'Default lead time used if a supplier has none.']
        ].map(([label, key, description]) => spanField(label, key, description)).join('');
        const plannerForm = this.isWriter ? `<form id="mpsSettingsForm" class="mps-settings-form">
            <div class="mps-settings-layout">
                <div class="mps-settings-column">
                    <section class="mps-settings-card">
                        <div class="mps-settings-card-head">
                            <span class="mps-settings-card-icon"><i class="fa-solid fa-calendar-days"></i></span>
                            <div><h3>Planning horizons</h3><p>Define how far back demand is read and how much cover the planner targets.</p></div>
                        </div>
                        <div class="mps-settings-fields">${planningFields}</div>
                    </section>
                    <section class="mps-settings-card">
                        <div class="mps-settings-card-head">
                            <span class="mps-settings-card-icon"><i class="fa-solid fa-sliders"></i></span>
                            <div><h3>Planner behavior</h3><p>Choose which products and periods are included in planner runs.</p></div>
                        </div>
                        <div class="mps-settings-toggles">
                            <label class="mps-settings-toggle">
                                <span class="mps-settings-toggle-copy"><b>Use complete history periods only</b><small>Ignore partial periods when calculating sales averages.</small></span>
                                <span class="mps-settings-switch"><input name="history_complete_only" type="checkbox" ${s.history_complete_only ? 'checked' : ''}><span aria-hidden="true"></span></span>
                            </label>
                            <label class="mps-settings-toggle">
                                <span class="mps-settings-toggle-copy"><b>Include private, draft, and pending products</b><small>Include products that are not published in WooCommerce.</small></span>
                                <span class="mps-settings-switch"><input name="include_unpublished_products" type="checkbox" ${s.include_unpublished_products ? 'checked' : ''}><span aria-hidden="true"></span></span>
                            </label>
                        </div>
                    </section>
                </div>
                <div class="mps-settings-column">
                    <section class="mps-settings-card">
                        <div class="mps-settings-card-head">
                            <span class="mps-settings-card-icon"><i class="fa-solid fa-chart-column"></i></span>
                            <div><h3>Projection</h3><p>Set the bucket size and number of periods shown in forecasts.</p></div>
                        </div>
                        <div class="mps-settings-fields">
                            <label class="mps-setting-field"><span class="mps-setting-label">Bucket size</span><select name="bucket">${unitOptions(s.projection?.bucket || 'month')}</select><small>Time span for each projection bucket.</small></label>
                            <label class="mps-setting-field"><span class="mps-setting-label">Number of buckets</span><input name="buckets" type="number" min="1" max="120" value="${esc(s.projection?.buckets || 12)}"><small>How many future buckets to display.</small></label>
                        </div>
                    </section>
                    <section class="mps-settings-card">
                        <div class="mps-settings-card-head">
                            <span class="mps-settings-card-icon"><i class="fa-solid fa-arrow-rotate-right"></i></span>
                            <div><h3>Sales sync</h3><p>Control which sales are imported during a planner refresh.</p></div>
                        </div>
                        <div class="mps-settings-fields">
                            <label class="mps-setting-field mps-setting-field-wide"><span class="mps-setting-label">Sales sync start date</span><input name="sales_cutover_date" type="date" value="${esc(s.sales_cutover_date || '')}"><small>Sales before this date are skipped during refresh.</small></label>
                        </div>
                    </section>
                </div>
            </div>
            <div class="mps-settings-actions">
                <p>Changes apply the next time the planner runs.</p>
                <button class="btn btn-sm mps-btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save planner settings</button>
            </div>
        </form>` : `<div class="mps-settings-card mps-settings-readonly">
            <span class="mps-settings-card-icon"><i class="fa-solid fa-lock"></i></span>
            <div><h3>Read-only access</h3><p>You can review planner settings, but only users with write access can change them.</p></div>
        </div>`;
        const pricingForm = this.isWriter ? `<form id="mpsPricingSettingsForm" class="mps-settings-card mps-settings-pricing">
            <div class="mps-settings-card-head">
                <span class="mps-settings-card-icon"><i class="fa-solid fa-calculator"></i></span>
                <div><h3>Pricing formulas</h3><p>Defaults match the Parts Pricing workbook.</p></div>
            </div>
            <div class="mps-settings-fields">
                ${pricingField('USD to RWF', 'pricing_exchange_rate', s.pricing_exchange_rate || 1500, 'min="1" step="0.01"')}
                ${pricingField('Cost markup', 'pricing_markup', s.pricing_markup || 2.8738, 'min="0.01" step="0.0001"')}
                ${pricingField('VAT percent', 'pricing_vat_percent', s.pricing_vat_percent ?? 18, 'min="0" max="100" step="0.01"')}
                ${pricingField('CIT percent', 'pricing_cit_percent', s.pricing_cit_percent ?? 30, 'min="0" max="100" step="0.01"')}
            </div>
            <div class="mps-settings-actions mps-settings-actions-inside">
                <p>Used when approved selling prices are recalculated.</p>
                <button class="btn btn-sm mps-btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save pricing formulas</button>
            </div>
        </form>` : '';
        panel.innerHTML = `<div class="mps-settings-page">
            ${this.isWriter ? '<div class="mps-settings-toolbar"><button class="btn btn-sm mps-btn-outline" type="button" id="mpsWorkbookImport"><i class="fa-solid fa-file-import"></i> Preview / import workbook</button></div>' : ''}
            ${plannerForm}
            ${pricingForm}
        </div>`;
        if (this.isWriter) {
            document.getElementById('mpsWorkbookImport')?.addEventListener('click', () => this.openWorkbookImport());
        }
        document.getElementById('mpsSettingsForm')?.addEventListener('submit', async event => {
            event.preventDefault(); const form = new FormData(event.currentTarget), spanData = key => ({value:Number(form.get(`${key}_value`)),unit:form.get(`${key}_unit`)});
            const payload = {history_window:spanData('history_window'),cover_period:spanData('cover_period'),default_lead_time:spanData('default_lead_time'),projection:{bucket:form.get('bucket'),buckets:Number(form.get('buckets'))},history_complete_only:form.has('history_complete_only'),include_unpublished_products:form.has('include_unpublished_products'),sales_cutover_date:form.get('sales_cutover_date')};
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

