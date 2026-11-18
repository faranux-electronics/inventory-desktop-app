const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const calls = [];
const api = {
    getAuditLogs: async (search, page, startDate, endDate, category, level) => {
        calls.push({search, page, startDate, endDate, category, level});
        return {
            status: 'success',
            data: [{id: page, user_id: 7, user_name: 'Ada', category: 'INVENTORY', level: 'INFO', action: `Page ${page}`, details: `Entry ${page}`, created_at: new Date().toISOString()}],
            pagination: {page, pages: 2, total: 2}
        };
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
        addEventListener(type, handler) { this.listeners[type] = handler; },
        insertAdjacentHTML(_position, html) { this.innerHTML += html; }
    }, properties);
}

test('Logs loads one API page, then loads older entries when the button is clicked', async () => {
    const elements = {
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
    global.document = {getElementById: id => elements[id] || null};
    global.localStorage = {getItem: () => JSON.stringify({id: 7})};
    calls.length = 0;
    const view = new LogsView({});

    try {
        await view.init();
        assert.deepEqual(calls.map(call => call.page), [1]);
        assert.equal(elements.loadMoreLogsBtn.style.display, 'inline-flex');
        assert.match(elements.logsChatArea.innerHTML, /Entry 1/);

        elements.loadMoreLogsBtn.listeners.click();
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(calls.map(call => call.page), [1, 2]);
        assert.match(elements.logsChatArea.innerHTML, /Entry 1/);
        assert.match(elements.logsChatArea.innerHTML, /Entry 2/);
        assert.equal(view.hasMore, false);
        assert.equal(elements.loadMoreLogsBtn.style.display, 'none');
    } finally {
        global.document = previousDocument;
        global.localStorage = previousStorage;
    }
});

test('Logs keeps the load-more control hidden when the first response is the only page', async () => {
    api.getAuditLogs = async () => ({status: 'success', data: [], pagination: {page: 1, pages: 1, total: 0}});
    const elements = {
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
    global.document = {getElementById: id => elements[id] || null};
    global.localStorage = {getItem: () => null};
    const view = new LogsView({});

    try {
        await view.init();
        assert.equal(elements.loadMoreLogsBtn.style.display, 'none');
        assert.equal(view.hasMore, false);
    } finally {
        global.document = previousDocument;
        global.localStorage = previousStorage;
        api.getAuditLogs = async (search, page) => ({
            status: 'success', data: [], pagination: {page, pages: 2, total: 2}
        });
    }
});
