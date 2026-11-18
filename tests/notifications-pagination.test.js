const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../services/api.js') return {};
    if (request === '../../components/Toast.js') return {};
    return originalLoad.call(this, request, parent, isMain);
};
let NotificationsView;
try {
    NotificationsView = require('../src/renderer/views/notifications/NotsView.js');
} finally {
    Module._load = originalLoad;
}

test('notification pagination renders a bounded page range and disables unavailable navigation', () => {
    const view = new NotificationsView({});
    view.notificationsPage = 1;
    const firstPage = view._paginationHTML(86, 5, 1, 20);
    assert.match(firstPage, /Showing 1-20 of 86 notifications/);
    assert.match(firstPage, /data-page="0" disabled/);
    assert.match(firstPage, /aria-current="page">1<\/button>/);
    assert.match(firstPage, /data-page="5">5<\/button>/);

    view.notificationsPage = 5;
    const lastPage = view._paginationHTML(86, 5, 81, 86);
    assert.match(lastPage, /Showing 81-86 of 86 notifications/);
    assert.match(lastPage, /data-page="6" disabled/);
});
