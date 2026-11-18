const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const apiMock = {};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../components/Toast.js') return {error() {}, success() {}, info() {}};
    if (request === '../../services/api.js') return apiMock;
    return originalLoad.call(this, request, parent, isMain);
};
let PlanningTab;
try {
    PlanningTab = require('../src/renderer/views/mps/components/PlanningTab.js');
} finally {
    Module._load = originalLoad;
}

test('MPS Planning uses shared filters, card, select, buttons, table, and pagination', () => {
    const view = {
        ...PlanningTab,
        results: {total: 1, data: [{
            product_id: 12, name: 'Test product', sku: 'T-12', status: 'reorder',
            current_stock: 2, incoming: 0, avg_window: 1, buffer: 3,
            reorder_qty: 4, order_by_date: '2026-11-10', order_value: 500
        }], run: null},
        filters: {},
        filterControlsHtml: () => '<input aria-label="Planning filter">'
    };
    const html = PlanningTab.planningHtml.call(view);

    assert.match(html, /class="shared-filter-bar mps-toolbar mps-toolbar-advanced"/);
    assert.match(html, /class="card mps-planning-forecast"[^>]*aria-label="Planning exports"/);
    assert.match(html, /<select[^>]*id="mpsStockoutMonths"/);
    assert.match(html, /id="mpsExportStockout"[^>]*disabled/);
    assert.match(html, /id="mpsExportOutOfStock"[^>]*disabled/);
    assert.match(html, /wp-list-table-wrapper/);
    assert.match(html, /id="mpsResultsPagination"/);
    const viewSource = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/MpsView.js'), 'utf8');
    assert.match(viewSource, /this\.perPage = 25/);
});

test('planning products can seed a draft PO with suggested quantity and purchase details', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PlanningTab.js'), 'utf8');
    const purchaseOrders = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PurchaseOrdersTab.js'), 'utf8');
    const api = fs.readFileSync(path.join(__dirname, '../src/renderer/services/api.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');

    assert.match(ui, /text: 'Add to draft'/);
    assert.match(ui, /text: 'Custom add'/);
    assert.match(ui, /data-custom-po-add/);
    assert.match(ui, /data-add-po-draft/);
    assert.match(ui, /data-planning-select/);
    assert.match(ui, /data-add-selected-po/);
    assert.match(ui, /data-custom-selected-po/);
    assert.match(ui, /data-custom-bulk-qty/);
    assert.match(ui, /mpsCustomPoRoute/);
    assert.match(ui, /<option value="local">Local<\/option>/);
    assert.match(ui, /mps-planning-product-meta[\s\S]*?mps-planning-po-actions/);
    assert.match(ui, /const suggestedQty = Math\.max\(1, Number\(product\.reorder_qty \|\| 0\)\)/);
    assert.match(ui, /this\.addPlanningProductToDraft\(product, targetButton, Boolean\(customAddButton\)\)/);
    assert.match(ui, /if \(!drafts\.length\) \{[\s\S]*?if \(!custom\) \{[\s\S]*?this\.openPurchaseOrderEditor\(null, \[line\]/);
    assert.match(ui, /else if \(drafts\.length === 1\) \{[\s\S]*?appendProductToDraftPurchaseOrder\(drafts\[0\], line\)/);
    assert.match(ui, /Create new \$\{routeLabel\} draft/);
    assert.match(ui, /async appendProductToDraftPurchaseOrder/);
    assert.match(purchaseOrders, /async openPurchaseOrderEditor\(id = null, initialLines = \[\], defaults = \{\}\)/);
    assert.match(purchaseOrders, /detail\?\.lines \|\| initialLines/);
    assert.match(purchaseOrders, /draggable=/);
    assert.match(purchaseOrders, /Save Priority Order/);
    assert.match(api, /mpsSetPurchaseOrderPriority.*mps_set_purchase_order_priority/);
    assert.match(purchaseOrders, /defaults\.onSaved\?\.\(\)/);
    assert.match(css, /mps-planning-table\{width:100%;min-width:760px;table-layout:fixed/);
    assert.match(css, /mps-planning-po-actions\{display:inline-flex/);
    assert.match(css, /mps-planning-product-meta\{display:flex;align-items:center/);
    assert.match(css, /mps-planning-product-cell \.mps-product-link\{display:-webkit-box;[\s\S]*?-webkit-line-clamp:4/);
});

test('MPS Planning exposes deviation choices before the date filters', () => {
    const controls = PlanningTab.filterControlsHtml.call({
        filters: {
            search: '', status: '', category: '', supplier: '', deviation: '',
            stockout_date: '', order_by_date: '', max_days_of_cover: '', estimated_only: false
        },
        categoriesList: [],
        suppliersList: []
    });

    assert.match(controls, /id="mpsDeviation"/);
    assert.match(controls, /value="negative"[^>]*>Negative deviation/);
    assert.match(controls, /value="zero"[^>]*>No change/);
    assert.match(controls, /value="positive"[^>]*>Positive deviation/);
    assert.ok(controls.indexOf('id="mpsDeviation"') < controls.indexOf('id="mpsOrderByDate"'));
});

test('MPS Planning sends deviation to results while Summary filters omit it', () => {
    const view = {
        ...PlanningTab,
        filters: {search: 'uno', status: '', category: '', supplier: '', deviation: 'negative', stockout_date: '', order_by_date: '', max_days_of_cover: '', estimated_only: false},
        sortBy: 'order_by_date',
        sortOrder: 'ASC'
    };

    assert.equal(PlanningTab.activeFilters.call(view).deviation, 'negative');
    assert.equal(PlanningTab.summaryFilters.call(view).deviation, undefined);
});

test('MPS Planning keeps Adjusted history and export actions on the intended filter rows', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');

    assert.match(css, /\.mps-filter-controls>:nth-child\(5\)\{grid-column:1\/4;grid-row:2\}/);
    assert.match(css, /\.mps-filter-controls>:nth-child\(9\)\{grid-column:13\/16;grid-row:2\}/);
    assert.match(css, />#mpsExport\{grid-column:18\/21;grid-row:2/);
    assert.match(css, />\.mps-export-cancel\{display:flex;align-items:center;justify-content:center;gap:8px;grid-column:21\/25;grid-row:2;width:100%/);
});

test('Purchase Orders can import the cost inventory, costing, pricing, and QA workbook', () => {
    const importUi = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/WorkbookImport.js'), 'utf8');
    const purchaseOrders = fs.readFileSync(path.join(__dirname, '../src/renderer/views/mps/components/PurchaseOrdersTab.js'), 'utf8');

    assert.match(importUi, /value: 'cost_inventory', label: 'PO cost inventory - costing, pricing and QA'/);
    assert.match(importUi, /cost_inventory_summary/);
    assert.match(importUi, /skip_invalid_rows: dialog\.querySelector\('#mpsConfirmCostInventoryImport'\)/);
    assert.match(importUi, /current-stock snapshot[\s\S]*?calculated and approved prices[\s\S]*?QA notes/);
    assert.match(importUi, /WooCommerce inventory remains the source of truth/);
    assert.match(purchaseOrders, /worksheet_data/);
    assert.match(purchaseOrders, /Show imported expense sheet values/);
    assert.match(purchaseOrders, /QA:/);
});

test('Cancel button aborts the active export and is removed when export finishes', async () => {
    let exportSignal;
    apiMock.mpsExportResults = (_filters, _filename, signal) => {
        exportSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
        }, {once: true}));
    };
    const originalDocument = global.document;
    let cancelButton;
    global.document = {
        getElementById: () => null,
        createElement: () => (cancelButton = {
            addEventListener: (_event, handler) => { cancelButton.click = handler; },
            remove: () => { cancelButton.removed = true; }
        })
    };
    const parentNode = {insertBefore: child => { child.parentNode = parentNode; }};
    const button = {disabled: false, innerHTML: 'Export CSV', parentNode, nextSibling: null};
    const view = {
        ...PlanningTab,
        filters: {search: '', status: '', category: '', supplier: '', deviation: '', stockout_date: '', order_by_date: '', max_days_of_cover: '', estimated_only: false},
        sortBy: 'order_by_date', sortOrder: 'ASC', exportAbortController: null
    };

    try {
        const exportTask = PlanningTab.exportFilteredResults.call(view, button);
        assert.match(button.innerHTML, /Exporting/);
        assert.equal(button.disabled, true);
        assert.equal(cancelButton.className, 'btn btn-ghost btn-sm mps-export-cancel');
        assert.match(cancelButton.innerHTML, /<i[^>]*><\/i><span>Cancel<\/span>/);
        cancelButton.click();
        assert.equal(exportSignal.aborted, true);
        await exportTask;
        assert.equal(button.innerHTML, 'Export CSV');
        assert.equal(cancelButton.removed, true);
        assert.equal(view.exportAbortController, null);
    } finally {
        global.document = originalDocument;
        delete apiMock.mpsExportResults;
    }
});
