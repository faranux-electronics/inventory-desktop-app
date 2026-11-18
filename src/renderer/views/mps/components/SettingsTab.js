const { API, Toast, esc } = require('../helpers.js');
const Button = require('../../../components/Button.js');
const Input = require('../../../components/Input.js');
const Select = require('../../../components/Select.js');
const Card = require('../../../components/Card.js');

module.exports = {
    async loadSettings() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading settings...</div>';
        const result = await API.mpsGetSettings();
        if (!document.getElementById('mpsPanel')) return;
        if (result.status !== 'success') {
            panel.innerHTML = `<div class="mps-empty">${esc(result.message || 'Could not load settings.')}</div>`;
            return;
        }

        const settings = result.settings || {};
        const units = ['day', 'week', 'month'].map(unit => ({value: unit, label: unit}));
        const span = key => settings[key] || {value: 1, unit: 'month'};
        const field = (label, control, description = '', wide = false) => `<label class="mps-setting-field${wide ? ' mps-setting-field-wide' : ''}">
            <span class="mps-setting-label">${esc(label)}</span>${control}${description ? `<small>${esc(description)}</small>` : ''}
        </label>`;
        const spanField = (label, key, description) => {
            const value = span(key);
            return `<label class="mps-setting-field"><span class="mps-setting-label">${esc(label)}</span>
                <span class="mps-setting-control">
                    ${Input.html({name: `${key}_value`, type: 'number', min: 1, max: 1000, value: value.value, ariaLabel: `${label} value`})}
                    ${Select.html({name: `${key}_unit`, value: value.unit, options: units, ariaLabel: `${label} unit`})}
                </span><small>${esc(description)}</small></label>`;
        };
        const numberField = (label, name, value, min, max, step) => field(label,
            Input.html({name, type: 'number', value, min, max, step, ariaLabel: label}));
        const settingsCard = (icon, title, description, content) => Card.html({
            tagName: 'section',
            className: 'mps-settings-card',
            content: `<div class="mps-settings-card-head">
                <span class="mps-settings-card-icon"><i class="fa-solid ${esc(icon)}" aria-hidden="true"></i></span>
                <div><h3>${esc(title)}</h3><p>${esc(description)}</p></div>
            </div>${content}`
        });
        const toggle = (name, title, description, checked) => `<label class="mps-settings-toggle">
            <span class="mps-settings-toggle-copy"><b>${esc(title)}</b><small>${esc(description)}</small></span>
            <span class="mps-settings-switch"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}><span aria-hidden="true"></span></span>
        </label>`;

        const planningFields = [
            ['History window', 'history_window', 'How far back to look for sales history.'],
            ['Cover period', 'cover_period', 'Demand window used for coverage calculations.'],
            ['Default lead time', 'default_lead_time', 'Default lead time used if a supplier has none.']
        ].map(([label, key, description]) => spanField(label, key, description)).join('');

        const plannerForm = this.isWriter ? `<form id="mpsSettingsForm" class="mps-settings-form">
            <div class="mps-settings-layout">
                <div class="mps-settings-column">
                    ${settingsCard('fa-calendar-days', 'Planning horizons', 'Define how far back demand is read and how much cover the planner targets.',
                        `<div class="mps-settings-fields">${planningFields}</div>`)}
                    ${settingsCard('fa-sliders', 'Planner behavior', 'Choose which products and periods are included in planner runs.',
                        `<div class="mps-settings-toggles">
                            ${toggle('history_complete_only', 'Use complete history periods only', 'Ignore partial periods when calculating sales averages.', settings.history_complete_only)}
                            ${toggle('include_unpublished_products', 'Include private, draft, and pending products', 'Include products that are not published in WooCommerce.', settings.include_unpublished_products)}
                            ${toggle('ai_enabled', 'AI assistance', 'Enable AI-powered summaries and planning insights (Cloudflare Workers AI free tier).', settings.ai_enabled)}
                        </div>`)}
                </div>
                <div class="mps-settings-column">
                    ${settingsCard('fa-chart-column', 'Projection', 'Set the bucket size and number of periods shown in forecasts.',
                        `<div class="mps-settings-fields">
                            ${field('Bucket size', Select.html({name: 'bucket', value: settings.projection?.bucket || 'month', options: units, ariaLabel: 'Projection bucket size'}), 'Time span for each projection bucket.')}
                            ${numberField('Number of buckets', 'buckets', settings.projection?.buckets ?? 12, 1, 120, 1)}
                        </div>`)}
                    ${settingsCard('fa-arrow-rotate-right', 'Sales sync', 'Control which sales are imported during a planner refresh.',
                        `<div class="mps-settings-fields">${field('Sales sync start date', Input.html({name: 'sales_cutover_date', type: 'date', value: settings.sales_cutover_date || '', ariaLabel: 'Sales sync start date'}), 'Sales before this date are skipped during refresh.', true)}</div>`)}
                </div>
            </div>
            <div class="mps-settings-actions"><p>Changes apply the next time the planner runs.</p>
                ${Button.html({text: 'Save planner settings', icon: 'fa-solid fa-floppy-disk', variant: 'primary', size: 'sm', className: 'mps-btn-primary', type: 'submit'})}
            </div>
        </form>` : Card.html({tagName: 'section', className: 'mps-settings-card mps-settings-readonly', content: `
            <span class="mps-settings-card-icon"><i class="fa-solid fa-lock" aria-hidden="true"></i></span>
            <div><h3>Read-only access</h3><p>You can review planner settings, but only users with write access can change them.</p></div>`});

        const pricingForm = this.isWriter ? `<form id="mpsPricingSettingsForm" class="mps-settings-pricing">
            ${settingsCard('fa-calculator', 'Pricing formulas', 'Defaults match the Parts Pricing workbook.',
                `<div class="mps-settings-fields">
                    ${numberField('USD to RWF', 'pricing_exchange_rate', settings.pricing_exchange_rate ?? 1500, 1, undefined, 0.01)}
                    ${numberField('Cost markup', 'pricing_markup', settings.pricing_markup ?? 2.8738, 0.01, undefined, 0.0001)}
                    ${numberField('VAT percent', 'pricing_vat_percent', settings.pricing_vat_percent ?? 18, 0, 100, 0.01)}
                    ${numberField('CIT percent', 'pricing_cit_percent', settings.pricing_cit_percent ?? 30, 0, 100, 0.01)}
                    ${numberField('Target profit margin (%)', 'pricing_target_margin_percent', settings.pricing_target_margin_percent ?? 35, 0, 100, 0.01)}
                </div>
                <div class="mps-settings-actions mps-settings-actions-inside"><p>Used for price calculations and margin target coloring.</p>
                    ${Button.html({text: 'Save pricing formulas', icon: 'fa-solid fa-floppy-disk', variant: 'primary', size: 'sm', className: 'mps-btn-primary', type: 'submit'})}
                </div>`)}
        </form>` : '';

        panel.innerHTML = `<div class="mps-settings-page">
            ${this.isWriter ? `<div class="mps-settings-toolbar">${Button.html({id: 'mpsWorkbookImport', text: 'Preview / import workbook', icon: 'fa-solid fa-file-import', variant: 'outline', size: 'sm', className: 'mps-btn-outline'})}</div>` : ''}
            ${plannerForm}${pricingForm}
        </div>`;

        if (this.isWriter) {
            document.getElementById('mpsWorkbookImport')?.addEventListener('click', () => this.openWorkbookImport());
        }
        document.getElementById('mpsSettingsForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const spanData = key => ({value: Number(form.get(`${key}_value`)), unit: form.get(`${key}_unit`)});
            const payload = {
                history_window: spanData('history_window'), cover_period: spanData('cover_period'), default_lead_time: spanData('default_lead_time'),
                projection: {bucket: form.get('bucket'), buckets: Number(form.get('buckets'))},
                history_complete_only: form.has('history_complete_only'), include_unpublished_products: form.has('include_unpublished_products'),
                ai_enabled: form.has('ai_enabled'), sales_cutover_date: form.get('sales_cutover_date')
            };
            const saved = await API.mpsSaveSettings(payload);
            if (saved.status === 'success') {
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success('MPS settings saved.');
            } else Toast.error(saved.message || 'Settings could not be saved.');
        });
        document.getElementById('mpsPricingSettingsForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const keys = ['pricing_exchange_rate', 'pricing_markup', 'pricing_vat_percent', 'pricing_cit_percent', 'pricing_target_margin_percent'];
            const payload = Object.fromEntries(keys.map(key => [key, Number(form.get(key))]));
            const saved = await API.mpsSaveSettings(payload);
            if (saved.status === 'success') {
                this.pricingExchangeRate = payload.pricing_exchange_rate;
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success('Pricing formulas saved.');
            } else Toast.error(saved.message || 'Pricing formulas could not be saved.');
        });
    }
};
