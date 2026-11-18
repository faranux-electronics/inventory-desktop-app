const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {calculatePricing, getProfitMarginFilterOptions} = require('../src/renderer/views/mps/pricingMath.js');
const {renderPricingMeasurements} = require('../src/renderer/views/mps/components/PricingMeasurements.js');

test('pricing does not calculate negative CIT when the product is sold at a loss', () => {
    const result = calculatePricing(52000, 42000, 18, 30);

    assert.ok(result.vat > 0);
    assert.equal(result.cit, 0);
    assert.ok(result.profit < 0);
    assert.equal(result.margin, result.profit / 42000 * 100);
});

test('pricing applies CIT to positive taxable profit', () => {
    const result = calculatePricing(100, 200, 0, 30);

    assert.equal(result.vat, 0);
    assert.equal(result.cit, 30);
    assert.equal(result.profit, 70);
});

test('Part Pricing toolbar stays on one row and long SKUs are not clipped', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');

    assert.match(css, /\.mps-pricing-toolbar\{[^}]*flex-wrap:nowrap;overflow-x:auto/);
    assert.match(css, /\.mps-pricing-filters\{display:flex;align-items:center;flex:1 1 610px;flex-wrap:nowrap/);
    assert.match(css, /td\.mps-pricing-sku\{width:10%;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:clip/);
    assert.match(css, /table\.mps-pricing-table\{width:100%;max-width:100%;min-width:min\(100%,760px\);table-layout:fixed/);
    assert.match(css, /table\.mps-pricing-table th\{padding:12px;background:var\(--theme-surface-alt\);color:var\(--theme-text-secondary\)/);
    assert.match(css, /table\.mps-pricing-table \.mps-pricing-approved-value/);
});

test('profit margin filters use the default and configured target percentage', () => {
    assert.deepEqual(getProfitMarginFilterOptions().slice(-2), [
        {value: 'target_met', label: 'Meets target (35%+)'},
        {value: 'below_target', label: 'Below target (< 35%)'}
    ]);
    assert.deepEqual(getProfitMarginFilterOptions(42.5).slice(-2), [
        {value: 'target_met', label: 'Meets target (42.5%+)'},
        {value: 'below_target', label: 'Below target (< 42.5%)'}
    ]);
});

test('Part Pricing supports independent local products without SKUs and keeps their history', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PricingTab.js'), 'utf8');

    assert.match(ui, /Add pricing-only part/);
    assert.match(ui, /pricing_target_margin_percent/);
    assert.match(ui, /getProfitMarginFilterOptions\(targetMargin\)/);
    assert.match(ui, /profit: this.pricingProfit/);
    assert.match(ui, /id: 'mpsCatalogProductSku', label: 'SKU \(optional\)'/);
    assert.match(ui, /data-pricing-history/);
    assert.doesNotMatch(ui, /mpsGetCatalogLinkCandidates/);
    assert.doesNotMatch(ui, /mpsLinkCatalogProduct/);
});

test('Part Pricing keeps item history without link or unlink controls', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PricingTab.js'), 'utf8');

    assert.match(ui, /data-pricing-history/);
    assert.doesNotMatch(ui, /data-pricing-link/);
    assert.doesNotMatch(ui, /data-pricing-unlink/);
    assert.doesNotMatch(ui, /data-pricing-relink/);
});

test('Master Planner preserves its rendered tab when navigating to another view', () => {
    const mps = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/MpsView.js'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

    assert.match(mps, /_suspendedContent = document\.createDocumentFragment\(\)/);
    assert.match(mps, /content\.replaceChildren\(this\._suspendedContent\)/);
    assert.match(mps, /if \(panel\?\.querySelector\('\.mps-loading, \[aria-busy="true"\]'\)\) this\.loadTab\(\)/);
    assert.match(app, /previousView\.suspend\(\)/);
});

test('Part Pricing captures, edits, saves, and discards product dimensions and weight', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PricingTab.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');

    for (const field of ['length', 'width', 'height', 'weight']) {
        assert.ok(ui.includes(field), `UI should handle ${field}`);
    }
    assert.match(ui, /dimension_unit: row\.dataset\.dimensionUnit/);
    assert.match(ui, /weight_unit: row\.dataset\.weightUnit/);
    assert.match(ui, /const savedMeasures = result\.measurements/);
    assert.match(ui, /Update the API server and apply the catalog dimensions migration/);
    assert.match(ui, /\.mps-pricing-measure\.mps-pricing-\$\{field\}/);
    assert.match(ui, /value === undefined \|\| value === '' \? null : value/);
    assert.match(ui, /measures\.forEach\(\(input, index\) => \{ input\.value = original\.measures\[index\]; \}\)/);
    assert.match(ui, /<h3>Dimensions \(cm\)<\/h3>/);
    assert.match(ui, /label: 'Weight \(gr\)'/);
    assert.doesNotMatch(ui, /mpsCatalogProductDimensionUnit|mpsCatalogProductWeightUnit/);
    assert.match(css, /width:54px;min-width:44px;min-height:34px/);
    assert.match(css, /table\.mps-pricing-table\{[^}]*font-size:14px/);
    assert.match(css, /mps-pricing-field\{display:flex;align-items:center;justify-content:center;gap:5px/);
    assert.match(css, /table\.mps-pricing-table th,#content\[data-view="mps"\] table\.mps-pricing-table td\{padding:7px 8px/);
    assert.match(css, /mps-pricing-value-link\{font-size:14px;font-weight:500/);
    assert.match(css, /\.mps-pricing-dimension-inputs/);
});

test('Part Pricing renders dimension values and weight with visible units', () => {
    const product = {
        catalog_id: 7, name: 'Sample part', sku: 'PART-1',
        length: 12.5, width: 8, height: 2, dimension_unit: 'cm',
        weight: 350, weight_unit: 'g'
    };
    const format = value => String(value);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, '');

    const editable = renderPricingMeasurements(product, true, format, escape, {pricingFields: '<input class="mps-pricing-cost-rwf">', actions: '<button>Save</button><button>Discard</button><button>Reset</button>'});
    assert.match(editable.html, /popovertarget="mps-pricing-measurements-7"/);
    assert.match(editable.html, /data-pricing-popover-cancel/);
    assert.match(editable.html, /aria-label="Edit dimensions"/);
    assert.match(editable.html, /aria-label="Edit weight"/);
    assert.match(editable.html, /<button>Save<\/button><button>Discard<\/button><button>Reset<\/button>/);
    assert.match(editable.html, /class="form-input mps-pricing-measure mps-pricing-length"[^>]*value="12\.5"/);
    assert.match(editable.html, /class="form-input mps-pricing-measure mps-pricing-width"[^>]*value="8"/);
    assert.match(editable.html, /class="form-input mps-pricing-measure mps-pricing-height"[^>]*value="2"/);
    assert.match(editable.html, /class="form-input mps-pricing-measure mps-pricing-weight"[^>]*value="350"/);
    assert.match(editable.html, /<span class="mps-pricing-measure-unit">cm<\/span>/);
    assert.match(editable.html, /<span class="mps-pricing-measure-unit">gr<\/span>/);

    const readOnly = renderPricingMeasurements(product, false, format, escape);
    assert.match(readOnly.html, /<div class="mps-pricing-measurement-row"><span data-pricing-size-summary>12\.5 x 8 x 2<\/span><span class="mps-pricing-measure-unit-inline">cm<\/span><\/div>/);
    assert.match(editable.html, /<div class="mps-pricing-measurement-row"><button type="button" class="mps-pricing-value-link mps-pricing-measurement-number"[^>]*aria-label="Edit dimensions"/);
    assert.match(editable.html, /<div class="mps-pricing-measurement-row"><button type="button" class="mps-pricing-value-link mps-pricing-measurement-number"[^>]*aria-label="Edit weight"/);
    assert.match(readOnly.html, /<div class="mps-pricing-measurement-row"><span data-pricing-weight-summary>350<\/span><span class="mps-pricing-measure-unit-inline">gr<\/span><\/div>/);
});

test('Part Pricing shows a clean empty state when measurements are missing', () => {
    const product = {catalog_id: 8, name: 'Empty part', sku: 'EMPTY-1'};
    const format = value => String(value);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, '');

    const readOnly = renderPricingMeasurements(product, false, format, escape);
    assert.match(readOnly.html, /mps-pricing-measurement-empty/);
    assert.match(readOnly.html, /No measurements/);
    assert.doesNotMatch(readOnly.html, /- x - x -/);

    const editable = renderPricingMeasurements(product, true, format, escape, {pricingFields: '', actions: ''});
    assert.match(editable.html, /aria-label="Edit dimensions"/);
    assert.match(editable.html, /aria-label="Edit weight"/);
    assert.match(editable.html, /data-pricing-size-summary>—<\/span>/);
    assert.doesNotMatch(editable.html, /mps-pricing-measure-unit-inline/);
});

test('Part Pricing keeps profit margin compact below the amount', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PricingTab.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');

    assert.match(ui, /mps-pricing-sub mps-pricing-margin/);
    assert.ok(ui.includes('title="Margin"'));
    assert.ok(ui.includes('`${margin.toFixed(1)}%`'));
    assert.ok(!ui.includes('% margin`'));
    assert.match(css, /mps-pricing-margin\{[^}]*font-size:11px/);
    assert.match(ui, /margin >= targetMargin/);
    assert.match(ui, /marginToneFor\(margin\)/);
    assert.match(css, /mps-pricing-margin-caution\{color:var\(--palette-hex-b45309\)\}/);
    assert.match(ui, /data-pricing-margin="" title="Margin"><i class="fa-solid/);
    assert.match(css, /td:nth-child\(2\)\{width:19%\}/);
    assert.match(css, /td:nth-child\(4\)\{width:12%\}/);
    assert.match(css, /td:nth-child\(7\)\{width:9%\}/);
    assert.match(css, /td:nth-child\(8\)\{width:9%\}/);
});

test('Part Pricing keeps the status badge compact and clipped with a tooltip', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PricingTab.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');

    assert.match(ui, /mps-pricing-status-text/);
    assert.match(ui, /title="\$\{statusLabelText\}"/);
    assert.match(css, /mps-pricing-status-badge\{[^}]*max-width:100%;min-width:0;[^}]*overflow:hidden/);
    assert.match(css, /mps-pricing-status-text\{min-width:0;overflow:hidden;text-overflow:ellipsis/);
    assert.match(css, /td:nth-child\(9\)\{padding-left:4px;padding-right:4px\}/);
});
