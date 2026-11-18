const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const apiCalls = [];
const api = {
    getAuditLogs: async (...args) => {
        apiCalls.push(args);
        return {status: 'success', data: [], pagination: {pages: 5}};
    }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../services/api.js') return api;
    return originalLoad.call(this, request, parent, isMain);
};
let LogsView;
try {
    LogsView = require('../src/renderer/views/logger/LogsView.js');
} finally {
    Module._load = originalLoad;
}

function element(properties = {}) {
    return Object.assign({
        value: '', innerHTML: '', disabled: false, style: {}, listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; }
    }, properties);
}

test('logs filters combine category, severity, date range and text search, then reset pagination', async () => {
    const ids = {
        logsChatArea: element(),
        logSearch: element(),
        loadMoreLogsBtn: element(),
        logCategoryFilter: element(),
        logLevelFilter: element(),
        logStartDate: element(),
        logEndDate: element(),
        applyLogFiltersBtn: element(),
        clearLogFiltersBtn: element()
    };
    const previousDocument = global.document;
    const previousStorage = global.localStorage;
    global.document = {getElementById: id => ids[id] || null};
    global.localStorage = {getItem: () => JSON.stringify({id: 7})};
    apiCalls.length = 0;
    const view = new LogsView({});

    try {
        await view.init();
        assert.deepEqual(apiCalls[0], ['', 1, '', '', '', '']);
        assert.equal(ids.loadMoreLogsBtn.style.display, 'inline-flex');

        ids.logSearch.value = 'stock adjust';
        ids.logCategoryFilter.value = 'INVENTORY';
        ids.logLevelFilter.value = 'ERROR';
        ids.logStartDate.value = '2026-03-01';
        ids.logEndDate.value = '2026-03-31';
        view.page = 4;
        await ids.applyLogFiltersBtn.listeners.click();

        assert.deepEqual(apiCalls[1], ['stock adjust', 1, '2026-03-01', '2026-03-31', 'INVENTORY', 'ERROR']);
        assert.equal(view.page, 1);
        assert.equal(view.hasMore, true);

        await ids.clearLogFiltersBtn.listeners.click();
        assert.deepEqual(apiCalls[2], ['', 1, '', '', '', '']);
        assert.equal(ids.logSearch.value, '');
        assert.equal(ids.logCategoryFilter.value, '');
        assert.equal(ids.logLevelFilter.value, '');
        assert.equal(ids.logStartDate.value, '');
        assert.equal(ids.logEndDate.value, '');
    } finally {
        global.document = previousDocument;
        global.localStorage = previousStorage;
        api.getAuditLogs = async () => ({status: 'success', data: [], pagination: {pages: 1}});
    }
});
