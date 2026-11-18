const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const apiCalls = [];
const api = {
    getLocations: async () => { apiCalls.push('active'); return {status: 'success', data: []}; },
    getTrashedLocations: async () => { apiCalls.push('trash'); return {status: 'success', data: []}; }
};
class FakeModal { static open() {} }
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../components/Toast.js') return {error() {}, success() {}};
    if (request === '../../components/Modal.js') return FakeModal;
    if (request === '../../services/api.js') return api;
    return originalLoad.call(this, request, parent, isMain);
};
let BranchesView;
try {
    BranchesView = require('../src/renderer/views/branches/Branchesview.js');
} finally {
    Module._load = originalLoad;
}

function tab(tabName) {
    const classes = new Set();
    if (tabName === 'active') classes.add('active');
    return {
        dataset: {tab: tabName},
        listeners: {},
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        },
        addEventListener(event, handler) { this.listeners[event] = handler; }
    };
}

test('Branches uses the shared header and tab styles, with Add New in the header actions', async () => {
    const activeTab = tab('active');
    const trashTab = tab('trash');
    const content = {dataset: {}, innerHTML: ''};
    const branchesContent = {innerHTML: ''};
    const stateSaves = [];
    const previousDocument = global.document;
    global.document = {
        getElementById: id => ({content, branchesContent}[id] || null),
        querySelectorAll: selector => selector === '.tab-btn' ? [activeTab, trashTab] : []
    };
    apiCalls.length = 0;
    const view = new BranchesView({state: {
        getTabState: () => null,
        saveTabState: (name, state) => stateSaves.push([name, state])
    }});

    try {
        view.render();
        assert.match(content.innerHTML, /page-header-surface branches-page-header/);
        assert.match(content.innerHTML, /fa-code-branch/);
        assert.match(content.innerHTML, /class="btn btn-outline btn-md branches-add-btn" id="addBranchBtn"/);
        assert.match(content.innerHTML, /class="tab-btn active" data-tab="active"/);
        assert.match(content.innerHTML, /class="tab-btn " data-tab="trash"/);

        trashTab.listeners.click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(view.currentTab, 'trash');
        assert.deepEqual(stateSaves, [['branches', {currentTab: 'trash'}]]);
        assert.ok(apiCalls.includes('trash'));
        assert.match(branchesContent.innerHTML, /Trash is empty/);
    } finally {
        global.document = previousDocument;
    }
});
