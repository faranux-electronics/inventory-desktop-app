const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../components/Toast.js') return {error() {}, success() {}, info() {}};
    if (request === '../../services/api.js') return {};
    return originalLoad.call(this, request, parent, isMain);
};
let PlanningTab;
try {
    PlanningTab = require('../src/renderer/views/mps/components/PlanningTab.js');
} finally {
    Module._load = originalLoad;
}

function summaryView(overrides = {}) {
    return {
        ...PlanningTab,
        summary: {
            overview: {
                by_status: {
                    stockout_risk: {products: 2, reorder_units: 6, order_value: 1200},
                    reorder: {products: 1, reorder_units: 3, order_value: 500}
                },
                order_now: 1,
                prorated_history_products: 1,
                run: {id: 9, as_of_date: '2026-11-04'},
                sales_last_refresh: null
            },
            total: 3,
            rows: [
                {name: 'Arduino Uno', order_value: 1200, supplier_name: 'Faranux', category: 'Boards', days_of_cover: 2, order_by_date: '2026-11-09'},
                {name: 'Jumper wires', order_value: 500, supplier_name: 'Faranux', category: 'Wires', days_of_cover: 10, order_by_date: '2026-11-16'},
                {name: 'Resistor', order_value: 0, supplier_name: '', category: 'Components', days_of_cover: 40}
            ],
            top: [], pagesLoaded: 1, capped: false
        },
        summaryPerPage: 50,
        pricingExchangeRate: 1500,
        filterControlsHtml: () => '',
        salesRefreshMetaText: () => 'No refresh recorded',
        ...overrides
    };
}

test('MPS summary renders chart groups and uses plain-language adjusted history labels', () => {
    const html = PlanningTab.summaryHtml.call(summaryView());

    assert.match(html, /id="mpsSummaryStats"/);
    assert.match(html, /Products by planner status/);
    assert.match(html, /Adjusted sales history/);
    assert.match(html, /Products by category/);
    assert.match(html, /Estimated reorder cost by status/);
    assert.match(html, /Suggested units to purchase/);
    assert.match(html, /Products with the highest reorder cost/);
    assert.match(html, /Estimated reorder cost by supplier/);
    assert.match(html, /Stock by demand trend/);
    assert.match(html, /Estimated stock cover/);
    assert.match(html, /Suggested order dates by week/);
    assert.doesNotMatch(html, /\bprorated\b/i);
});

test('MPS horizontal summary charts occupy two columns without inheriting the legacy three-column span', () => {
    const html = PlanningTab.summaryHtml.call(summaryView());
    const cssPath = path.join(__dirname, '../src/renderer/styles/mps.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const horizontalGroup = html.match(/<div class="mps-chart-columns mps-chart-horizontal-columns[\s\S]*?<\/div>\s*<div class="mps-chart-columns mps-chart-vertical-columns/);

    assert.ok(horizontalGroup, 'summary should include a dedicated horizontal chart group');
    assert.equal((horizontalGroup[0].match(/<section class="mps-chart-card"/g) || []).length, 5);
    assert.match(css, /#content\[data-view="mps"\] \.mps-chart-columns\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css, /#content\[data-view="mps"\] \.mps-chart-horizontal-columns>\.mps-chart-card\{grid-column:auto;min-width:0\}/);
});
