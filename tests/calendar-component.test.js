const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const Calendar = require('../src/renderer/components/Calendar.js');

const helpersMock = {
    API: {}, Toast: {}, esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character])),
    today: () => '2026-11-04', statusLabel: value => String(value || '')
};
const originalModuleLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../helpers.js') return helpersMock;
    return originalModuleLoad.call(this, request, parent, isMain);
};
let CalendarTab;
try {
    CalendarTab = require('../src/renderer/views/mps/components/CalendarTab.js');
} finally {
    Module._load = originalModuleLoad;
}

test('Calendar computes week, month, and three-month agenda request ranges', () => {
    assert.deepEqual(Calendar.viewRange('2026-11-04', 'week'), {from: '2026-11-02', to: '2026-11-08'});
    assert.deepEqual(Calendar.viewRange('2026-11-04', 'month'), {from: '2026-10-26', to: '2026-12-06'});
    assert.deepEqual(Calendar.viewRange('2026-11-04', 'agenda'), {from: '2026-11-01', to: '2027-01-31'});
    assert.equal(Calendar.viewRange('bad-date', 'agenda'), null);
});

test('Calendar renders branded Week, Month, and Agenda controls with the selected date', () => {
    const html = Calendar.html({month: '2026-11', selectedDate: '2026-11-04', view: 'agenda', className: 'mps-calendar'});

    assert.match(html, /type="date" value="2026-11-04"/);
    assert.match(html, /data-calendar-view="week" aria-pressed="false">Week/);
    assert.match(html, /data-calendar-view="month" aria-pressed="false">Month/);
    assert.match(html, /class="btn btn-sm btn-outline mps-brand-outline active" data-calendar-view="agenda" aria-pressed="true">Agenda/);
    assert.match(html, /data-calendar-prev/);
    assert.match(html, /data-calendar-next/);
    assert.match(html, /data-calendar-today/);
});

test('Calendar Agenda lists three months, caps each day at eight cards, and offers Show more', () => {
    const events = Array.from({length: 10}, (_, index) => ({
        date: '2026-11-04', title: `Item ${index + 1}`
    }));
    events.push({date: '2027-02-01', title: 'Outside agenda'});
    const html = Calendar.html({
        month: '2026-11', selectedDate: '2026-11-04', view: 'agenda', events,
        className: 'mps-calendar', getDate: event => event.date,
        renderEvent: event => `<strong>${event.title}</strong>`
    });

    assert.match(html, /Next 3 months · Nov 1, 2026 – Jan 31, 2027/);
    assert.equal((html.match(/class="mps-calendar-event /g) || []).length, 8);
    assert.match(html, /Show 2 more/);
    assert.doesNotMatch(html, /Outside agenda/);
});

test('Calendar delegates navigation, date, view, event, and more callbacks', () => {
    const listeners = new Map();
    const root = {
        addEventListener: (name, callback) => listeners.set(name, [...(listeners.get(name) || []), callback]),
        removeEventListener: (name, callback) => listeners.set(name, (listeners.get(name) || []).filter(item => item !== callback)),
        contains: () => true
    };
    const events = [{date: '2026-11-04', title: 'Reorder'}, {date: '2026-11-04', title: 'Purchase order'}];
    const calls = [];
    const unbind = Calendar.bind(root, {
        events,
        getDate: event => event.date,
        onPrevious: () => calls.push('previous'),
        onNext: () => calls.push('next'),
        onToday: () => calls.push('today'),
        onDateChange: date => calls.push(`date:${date}`),
        onViewChange: view => calls.push(`view:${view}`),
        onEvent: event => calls.push(`event:${event.title}`),
        onMore: (date, dayEvents) => calls.push(`more:${date}:${dayEvents.length}`)
    });
    const click = button => (listeners.get('click') || []).forEach(handler => handler({target: {closest: selector => selector === 'button' || button.hasAttribute(selector.slice(1, -1)) ? button : null}}));
    const button = (attributes = {}, dataset = {}) => ({
        dataset,
        hasAttribute: name => Object.hasOwn(attributes, name),
        matches: selector => Object.hasOwn(attributes, selector.slice(1, -1))
    });

    click(button({'data-calendar-prev': ''}));
    click(button({'data-calendar-next': ''}));
    click(button({'data-calendar-today': ''}));
    click(button({'data-calendar-view': ''}, {calendarView: 'week'}));
    click(button({'data-calendar-event': ''}, {calendarEvent: '1'}));
    click(button({'data-calendar-more': ''}, {calendarMore: '2026-11-04'}));
    (listeners.get('change') || []).forEach(handler => handler({target: {matches: selector => selector === '[data-calendar-date]', value: '2026-11-10'}}));
    unbind();

    assert.deepEqual(calls, [
        'previous', 'next', 'today', 'view:week', 'event:Purchase order',
        'more:2026-11-04:2', 'date:2026-11-10'
    ]);
    assert.equal((listeners.get('click') || []).length, 0);
    assert.equal((listeners.get('change') || []).length, 0);
});

test('Calendar day modal has side margins and exports every event as escaped CSV', () => {
    let exportHandler;
    let capturedBlob;
    let appendedOverlay;
    let downloadLink;
    const closeButton = {addEventListener: () => {}};
    const exportButton = {addEventListener: (_name, handler) => { exportHandler = handler; }};
    const overlay = {
        setAttribute: () => {},
        addEventListener: () => {},
        querySelector: selector => selector === '.mps-close' ? closeButton : selector === '#mpsCalendarExport' ? exportButton : null,
        querySelectorAll: () => [],
        remove: () => {}
    };
    const originalDocument = global.document;
    const originalBlob = global.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalSetTimeout = global.setTimeout;
    global.document = {
        createElement: tag => tag === 'div' ? overlay : (downloadLink = {click() { this.clicked = true; }, remove() { this.removed = true; }}),
        body: {append: element => { appendedOverlay = element; }}
    };
    global.Blob = class BlobMock {
        constructor(parts, options) { this.parts = parts; this.options = options; capturedBlob = this; }
    };
    URL.createObjectURL = () => 'blob:calendar-test';
    URL.revokeObjectURL = () => {};
    global.setTimeout = callback => { callback(); return 1; };

    try {
        const events = [
            {type: 'reorder', event_date: '2026-11-04', product_id: 8, sku: 'SKU-8', title: 'Part 8', quantity: 4, status: 'reorder'},
            {type: 'purchase_order', event_date: '2026-11-04', purchase_order_id: 22, reference: 'PO-22', title: 'PO-22', detail: 'Vendor, "A"', quantity: 5, status: 'processing'}
        ];
        CalendarTab.showCalendarDayEvents.call({}, '2026-11-04', events);
        assert.equal(appendedOverlay, overlay);
        assert.match(overlay.innerHTML, /id="mpsCalendarExport"/);
        assert.match(overlay.innerHTML, /class="mps-calendar-day-list"/);

        exportHandler();

        const csv = capturedBlob.parts[0];
        assert.equal(capturedBlob.options.type, 'text/csv;charset=utf-8');
        assert.match(csv, /"Date","Type","SKU \/ Reference","Product \/ Order","Quantity","Status","Details"/);
        assert.match(csv, /"2026-11-04","Reorder","SKU-8","Part 8","4","reorder",""/);
        assert.match(csv, /"2026-11-04","Purchase order","PO-22","PO-22","5","processing","Vendor, ""A"""/);
        assert.equal(downloadLink.download, 'calendar-2026-11-04.csv');
        assert.equal(downloadLink.clicked, true);
        assert.equal(downloadLink.removed, true);
    } finally {
        global.document = originalDocument;
        global.Blob = originalBlob;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        global.setTimeout = originalSetTimeout;
    }

    const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/mps.css'), 'utf8');
    assert.match(css, /\.mps-calendar-day-list\{[^}]*margin:16px 24px 24px/);
});
