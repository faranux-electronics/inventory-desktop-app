const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let importResponses = [];
const importCalls = [];
const api = {
    getLocations: async () => ({status: 'success', data: []}),
    getStockImportLogs: async (...args) => {
        importCalls.push(args);
        return importResponses.shift() || {status: 'success', data: [], pagination: {page: 1, pages: 1, total: 0}};
    }
};
const modalCalls = [];
const modal = {open: config => modalCalls.push(config)};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../services/api.js' || request === '../../../services/api.js') return api;
    if (request === '../../../components/Toast.js' || request === '../../components/Toast.js') return {error() {}, success() {}, info() {}};
    if (request === '../../../components/Modal.js') return modal;
    if (request === './components/ImportForm.js') return class {
        render(target) { this.target = target; }
        updateLocations(locations) { this.locations = locations; }
    };
    if (request === './components/ImportHistory.js') return class {
        render(target) { this.target = target; }
        loadHistory() { this.loaded = true; }
    };
    return originalLoad.call(this, request, parent, isMain);
};
let ImportView;
let ImportHistory;
try {
    ImportView = require('../src/renderer/views/import/ImportView.js');
    ImportHistory = require('../src/renderer/views/import/components/ImportHistory.js');
} finally {
    Module._load = originalLoad;
}

function element(properties = {}) {
    return Object.assign({
        value: '', innerHTML: '', textContent: '', disabled: false, dataset: {}, style: {},
        listeners: {}, classList: {toggle() {}, add() {}, remove() {}},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        setAttribute() {},
        removeAttribute() {},
        querySelectorAll() { return []; }
    }, properties);
}

function makeImportLog({mode = 'add', old = 0, next = 6, details = `Imported 1 items. Mode: ${mode}`} = {}) {
    return {
        id: 10,
        created_at: '2026-11-03 10:30:00',
        user_name: 'Amina User',
        action: 'STOCK_IMPORT',
        details,
        metadata: {mode, imported_items: [{sku: 'SKU-100', branch: 1, old, new: next}]}
    };
}

test('Import tab uses shared tabs and switches between New Import and Import History', async () => {
    const content = element({dataset: {}});
    const classListFor = initial => {
        const classes = new Set(initial);
        return {
            toggle(name, active) { active ? classes.add(name) : classes.delete(name); },
            contains(name) { return classes.has(name); },
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); }
        };
    };
    const newView = element({classList: classListFor([])});
    const historyView = element({classList: classListFor(['hidden'])});
    const newTab = element({dataset: {tab: 'new'}, classList: classListFor(['active'])});
    const historyTab = element({dataset: {tab: 'history'}, classList: classListFor([])});
    const tabContainer = element({querySelectorAll: () => [newTab, historyTab]});
    const nodes = {content, viewNewImport: newView, viewHistory: historyView, importTabs: tabContainer, mainTabNew: newTab, mainTabHistory: historyTab};
    const previousDocument = global.document;
    global.document = {
        getElementById: id => nodes[id] || null
    };
    const view = new ImportView({state: {}});

    try {
        view.render();
        await new Promise(resolve => setImmediate(resolve));
        assert.match(content.innerHTML, /class="tabs import-tabs"/);
        assert.match(content.innerHTML, /New Import/);
        assert.match(content.innerHTML, /Import History/);
        assert.equal(view.formComponent.target, newView);
        assert.equal(view.historyComponent.target, historyView);

        historyTab.listeners.click();
        assert.equal(historyView.classList.contains('hidden'), false);
        assert.equal(newView.classList.contains('hidden'), true);
        assert.equal(view.historyComponent.loaded, true);
    } finally {
        global.document = previousDocument;
    }
});

test('Import History renders shared table/filter components and defaults to three months', () => {
    const controls = new Map();
    const container = element({querySelector: selector => {
        if (!controls.has(selector)) controls.set(selector, element());
        return controls.get(selector);
    }});
    const history = new ImportHistory({locationsCache: []});

    history.render(container);
    assert.match(container.innerHTML, /shared-filter-bar import-history-filter-bar/);
    assert.match(container.innerHTML, /shared-table import-history-list-table/);
    assert.match(container.innerHTML, /Showing imports from the last three months/);
    assert.match(container.innerHTML, /aria-label="Import history"/);

    const start = new Date();
    start.setMonth(start.getMonth() - 3);
    const dateValue = date => {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    };
    assert.equal(history.defaultDateRange.start, dateValue(start));
    assert.equal(history.defaultDateRange.end, dateValue(new Date()));
});

test('empty default range falls back to the latest import and renders its mode and item count', async () => {
    const latest = makeImportLog();
    importCalls.length = 0;
    importResponses = [
        {status: 'success', data: [], pagination: {page: 1, pages: 0, total: 0}},
        {status: 'success', data: [latest], pagination: {page: 1, pages: 4, total: 31}}
    ];
    const body = element();
    const pagination = element();
    const label = element();
    const start = '2026-08-03';
    const end = '2026-11-03';
    const fields = {
        historyTableBody: body,
        historyPagination: pagination,
        historyRangeLabel: label,
        historyStartDate: element({value: start}),
        historyEndDate: element({value: end})
    };
    const previousDocument = global.document;
    global.document = {getElementById: id => fields[id] || null};
    const history = new ImportHistory({locationsCache: [{id: 1, name: 'Kigali'}]});
    history.defaultDateRange = {start, end};

    try {
        await history.loadHistory(1);
        assert.deepEqual(importCalls, [[1, start, `${end} 23:59:59`], [1]]);
        assert.match(label.textContent, /showing the latest import/i);
        assert.match(body.innerHTML, /Amina User/);
        assert.match(body.innerHTML, /import-history-mode--add/);
        assert.match(body.innerHTML, />1<\/td>/);
        assert.match(body.innerHTML, /data-import-items-index="0"/);
        assert.match(body.innerHTML, /data-import-export-index="0"/);
        assert.equal(pagination.innerHTML, '');
    } finally {
        global.document = previousDocument;
    }
});

test('empty custom date range does not fetch an all-time fallback', async () => {
    importCalls.length = 0;
    importResponses = [{status: 'success', data: [], pagination: {page: 1, pages: 0, total: 0}}];
    const fields = {
        historyTableBody: element(),
        historyPagination: element(),
        historyRangeLabel: element(),
        historyStartDate: element({value: '2026-09-01'}),
        historyEndDate: element({value: '2026-09-30'})
    };
    const previousDocument = global.document;
    global.document = {getElementById: id => fields[id] || null};
    const history = new ImportHistory({locationsCache: []});
    history.defaultDateRange = {start: '2026-08-03', end: '2026-11-03'};

    try {
        await history.loadHistory(1);
        assert.deepEqual(importCalls, [[1, '2026-09-01', '2026-09-30 23:59:59']]);
        assert.match(fields.historyTableBody.innerHTML, /No import history found/);
    } finally {
        global.document = previousDocument;
    }
});

test('affected items show added or replaced quantities and exports include mode and quantity', () => {
    const tableBody = element();
    const tablePagination = element();
    const exportButton = element();
    const previousDocument = global.document;
    global.document = {getElementById: id => ({affectedItemsTableBody: tableBody, affectedItemsPagination: tablePagination, exportAffectedItemsBtn: exportButton})[id] || null};
    const history = new ImportHistory({locationsCache: [{id: 1, name: 'Kigali'}]});
    const added = makeImportLog({mode: 'add', old: 2, next: 8});
    const replaced = makeImportLog({mode: 'replace', old: 2, next: 8, details: 'Imported 1 items. Mode: replace'});
    const exports = [];
    history.downloadCSV = (csv, filename) => exports.push({csv, filename});

    try {
        history.openAffectedItems(added);
        assert.match(modalCalls.at(-1).body, /Added Qty/);
        assert.match(tableBody.innerHTML, /<td class="import-affected-number import-affected-change import-affected-change--add">6<\/td>/);
        history.exportAffectedItemsCSV(added, added.metadata.imported_items);
        assert.match(exports.at(-1).csv, /"Add"/);
        assert.match(exports.at(-1).csv, /"Added Quantity"/);
        assert.match(exports.at(-1).csv, /"6"/);

        history.openAffectedItems(replaced);
        assert.match(modalCalls.at(-1).body, /Replaced Qty/);
        assert.match(tableBody.innerHTML, /import-affected-change--replace">8<\/td>/);
        history.exportAffectedItemsCSV(replaced, replaced.metadata.imported_items);
        assert.match(exports.at(-1).csv, /"Replace"/);
        assert.match(exports.at(-1).csv, /"Replaced Quantity"/);
        assert.match(exports.at(-1).csv, /"8"/);
    } finally {
        global.document = previousDocument;
    }
});
