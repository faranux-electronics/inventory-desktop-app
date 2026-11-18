const test = require('node:test');
const assert = require('node:assert/strict');
const Tabs = require('../src/renderer/components/Tabs.js');

test('Tabs.html renders reusable shared tab styles, active state, ids, and icons', () => {
    const html = Tabs.html({
        id: 'importTabs', className: 'import-tabs', activeId: 'new',
        tabs: [
            {key: 'new', elementId: 'mainTabNew', label: 'New Import'},
            {key: 'history', elementId: 'mainTabHistory', label: 'Import History', icon: 'fa-solid fa-clock'}
        ]
    });

    assert.match(html, /id="importTabs" class="tabs import-tabs"/);
    assert.match(html, /class="tab-btn active" id="mainTabNew" data-tab="new" aria-current="page"/);
    assert.match(html, /class="tab-btn" id="mainTabHistory" data-tab="history"/);
    assert.match(html, /<i class="fa-solid fa-clock" aria-hidden="true"><\/i>/);
});

test('Tabs.bind switches the active state and reports the selected tab', () => {
    const firstClasses = new Set(['active']);
    const secondClasses = new Set();
    const first = {
        dataset: {tab: 'new'}, disabled: false,
        classList: {toggle: (name, active) => active ? firstClasses.add(name) : firstClasses.delete(name)},
        addEventListener(type, handler) { this[type] = handler; },
        setAttribute() {}, removeAttribute() {}
    };
    const second = {
        dataset: {tab: 'history'}, disabled: false,
        classList: {toggle: (name, active) => active ? secondClasses.add(name) : secondClasses.delete(name)},
        addEventListener(type, handler) { this[type] = handler; },
        setAttribute() {}, removeAttribute() {}
    };
    const container = {querySelectorAll: () => [first, second]};
    const selected = [];

    Tabs.bind(container, key => selected.push(key));
    second.click();

    assert.equal(firstClasses.has('active'), false);
    assert.equal(secondClasses.has('active'), true);
    assert.deepEqual(selected, ['history']);
});

test('Tabs.html escapes labels and attributes', () => {
    const html = Tabs.html({
        id: 'tabs" onfocus="bad',
        tabs: [{key: 'x" onclick="bad', label: '<Unsafe>'}]
    });

    assert.match(html, /id="tabs&quot; onfocus=&quot;bad"/);
    assert.match(html, /data-tab="x&quot; onclick=&quot;bad"/);
    assert.match(html, /&lt;Unsafe&gt;/);
});
