const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const messages = {success: [], error: [], info: []};
const toast = {
    success: value => messages.success.push(value),
    error: value => messages.error.push(value),
    info: value => messages.info.push(value)
};
const api = {
    getNotifications: async () => ({status: 'success', data: []}),
    markNotificationRead: async () => ({status: 'success'}),
    markAllNotificationsRead: async () => ({status: 'success'}),
    updateAlertSettings: async () => ({status: 'success'}),
    testAlertMessage: async () => ({ok: true, http_status: 200})
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../services/api.js') return api;
    if (request === '../../components/Toast.js') return toast;
    return originalLoad.call(this, request, parent, isMain);
};
let NotificationsView;
try {
    NotificationsView = require('../src/renderer/views/notifications/NotsView.js');
} finally {
    Module._load = originalLoad;
}

function element(properties = {}) {
    return Object.assign({
        value: '', checked: false, disabled: false, innerHTML: '', innerText: '',
        style: {}, dataset: {}, listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        querySelectorAll() { return []; },
        focus() { this.focused = true; }
    }, properties);
}

function installDocument(elements, selectors = {}) {
    const previous = global.document;
    global.document = {
        getElementById: id => elements[id] || null,
        querySelectorAll: selector => selectors[selector] || []
    };
    return () => { global.document = previous; };
}

function notification(id, isRead = 0) {
    return {
        id,
        is_read: isRead,
        type: 'general',
        formatted_message: `Notification ${id}`,
        created_at: new Date().toISOString(),
        reference_id: null
    };
}

function setupListDocument(pageButtons = []) {
    const list = element({querySelectorAll: () => []});
    const pagination = element({querySelectorAll: () => pageButtons});
    const btnAll = element();
    const badge = element();
    const restore = installDocument({
        notificationsList: list,
        notificationsPagination: pagination,
        btnMarkAllRead: btnAll,
        badgeUnread: badge
    });
    return {list, pagination, btnAll, badge, restore};
}

test('Notifications layout includes the shared header, sound selector, and reusable Alert buttons', () => {
    const view = new NotificationsView({
        state: {getUser: () => ({role: 'admin'})},
        notifManager: {selectedSound: 'slack_notification.mp3'}
    });
    const html = view._layoutHTML();

    assert.match(html, /page-header-surface notifications-page-header/);
    assert.match(html, /fa-regular fa-bell/);
    assert.match(html, /id="soundSelect"/);
    assert.match(html, /id="replaceWebhookBtn"/);
    assert.match(html, /id="clearWebhookBtn"/);
    assert.match(html, /id="saveSettingsBtn"/);
    assert.match(html, /id="testMessageBtn"/);
    assert.match(view._alertsSettingsHTML(), /class="webhook-action-buttons"/);
    assert.match(view._alertsSettingsHTML(), /class="webhook-url-entry"/);
    assert.match(view._alertsSettingsHTML(), /class="btn btn-outline btn-md" id="replaceWebhookBtn"/);
    assert.match(view._alertsSettingsHTML(), /class="btn btn-outline btn-md webhook-clear-btn" id="clearWebhookBtn"/);
    assert.match(view._alertsSettingsHTML(), /class="btn btn-primary btn-md" id="saveSettingsBtn"/);
});

test('loading notifications updates the unread badge and renders the result', async () => {
    api.getNotifications = async () => ({status: 'success', data: [notification(1), notification(2, 1)]});
    const dom = setupListDocument();
    let badgeCount = null;
    const view = new NotificationsView({sidebar: {updateBadgeCount: count => { badgeCount = count; }}});

    try {
        await view.loadNotifications();
        assert.equal(view.notifications.length, 2);
        assert.equal(badgeCount, 1);
        assert.equal(dom.badge.innerText, 1);
        assert.match(dom.list.innerHTML, /Notification 1/);
        assert.doesNotMatch(dom.list.innerHTML, /Notification 2/);
    } finally {
        dom.restore();
        api.getNotifications = async () => ({status: 'success', data: []});
    }
});

test('unread and archived lists filter independently and paginate 20 entries at a time', () => {
    const pageTwo = element({dataset: {page: '2'}});
    const dom = setupListDocument([pageTwo]);
    const view = new NotificationsView({});
    view.notifications = Array.from({length: 50}, (_, index) => notification(index + 1, index >= 25 ? 1 : 0));

    try {
        view._renderList();
        assert.equal((dom.list.innerHTML.match(/class="flex items-start/g) || []).length, 20);
        assert.match(dom.pagination.innerHTML, /Showing 1-20 of 25 notifications/);
        pageTwo.listeners.click();
        assert.equal(view.notificationsPage, 2);
        assert.equal((dom.list.innerHTML.match(/class="flex items-start/g) || []).length, 5);
        assert.match(dom.pagination.innerHTML, /Showing 21-25 of 25 notifications/);

        view.currentSubTab = 'archived';
        view.notificationsPage = 1;
        view._renderList();
        assert.equal((dom.list.innerHTML.match(/class="flex items-start/g) || []).length, 20);
        assert.match(dom.pagination.innerHTML, /Showing 1-20 of 25 notifications/);
        assert.match(dom.list.innerHTML, /Notification 26/);
    } finally {
        dom.restore();
    }
});

test('empty notification filters show their empty state and clear pagination', () => {
    const dom = setupListDocument();
    const view = new NotificationsView({});
    view.notifications = [notification(1, 0)];
    view.currentSubTab = 'archived';

    try {
        view._renderList();
        assert.match(dom.list.innerHTML, /No archived messages/);
        assert.equal(dom.pagination.innerHTML, '');
        assert.equal(dom.btnAll.style.display, 'none');
    } finally {
        dom.restore();
    }
});

test('marking one notification read updates its state and unread badge', async () => {
    api.markNotificationRead = async id => ({status: 'success', id});
    const dom = setupListDocument();
    let badgeCount = null;
    const view = new NotificationsView({sidebar: {updateBadgeCount: count => { badgeCount = count; }}});
    view.notifications = [notification(1, 0), notification(2, 0)];

    try {
        await view.markAsRead(1);
        assert.equal(view.notifications[0].is_read, 1);
        assert.equal(badgeCount, 1);
        assert.doesNotMatch(dom.list.innerHTML, /Notification 1/);
    } finally {
        dom.restore();
        api.markNotificationRead = async () => ({status: 'success'});
    }
});

test('mark all read updates every notification and clears the unread count', async () => {
    api.markAllNotificationsRead = async () => ({status: 'success'});
    const dom = setupListDocument();
    let badgeCount = null;
    const view = new NotificationsView({sidebar: {updateBadgeCount: count => { badgeCount = count; }}});
    view.notifications = [notification(1), notification(2)];
    const markAll = element();
    const restore = installDocument({btnMarkAllRead: markAll, ...{
        notificationsList: dom.list,
        notificationsPagination: dom.pagination,
        badgeUnread: dom.badge
    }});

    try {
        view._attachEvents();
        await markAll.listeners.click();
        assert.ok(view.notifications.every(item => item.is_read === 1));
        assert.equal(badgeCount, 0);
        assert.deepEqual(messages.success, ['All notifications marked as read']);
    } finally {
        restore();
        dom.restore();
        api.markAllNotificationsRead = async () => ({status: 'success'});
        messages.success.length = 0;
    }
});

test('changing the notification sound stores the selected preference', () => {
    const soundSelect = element();
    const preferenceChanges = [];
    const restore = installDocument({soundSelect});
    const view = new NotificationsView({notifManager: {setSoundPreference: sound => preferenceChanges.push(sound)}});

    try {
        view._attachEvents();
        soundSelect.listeners.change({target: {value: 'door_notification.mp3'}});
        assert.deepEqual(preferenceChanges, ['door_notification.mp3']);
        assert.deepEqual(messages.info, ['Notification sound updated']);
    } finally {
        restore();
        messages.info.length = 0;
    }
});

test('alert settings reject an invalid repeat interval before saving', async () => {
    const enableToggle = element({checked: false});
    const webhookUrlInput = element({value: '', style: {display: 'none'}});
    const webhookUrlMasked = element({style: {display: 'block'}});
    const webhookActions = element({style: {display: 'block'}});
    const repeatIntervalInput = element({value: '0'});
    const saveButton = element();
    const restore = installDocument({enableAlertsToggle: enableToggle, webhookUrlInput, webhookUrlMasked, webhookActions, repeatIntervalInput, saveSettingsBtn: saveButton});
    let saveCalls = 0;
    api.updateAlertSettings = async () => { saveCalls += 1; return {status: 'success'}; };
    const view = new NotificationsView({});

    try {
        await view._saveAlertSettings();
        assert.equal(saveCalls, 0);
        assert.equal(messages.error.at(-1), 'Repeat interval must be between 1 and 10080 minutes (1 week)');
        assert.equal(saveButton.disabled, false);
    } finally {
        restore();
        api.updateAlertSettings = async () => ({status: 'success'});
        messages.error.length = 0;
    }
});

test('saving valid alert settings submits the enabled state and repeat interval', async () => {
    const enableToggle = element({checked: true});
    const webhookUrlInput = element({value: 'https://chat.googleapis.com/v1/spaces/test?key=abc&token=def', style: {display: 'none'}});
    const webhookUrlMasked = element({style: {display: 'block'}});
    const webhookActions = element({style: {display: 'block'}});
    const repeatIntervalInput = element({value: '30'});
    const saveButton = element();
    const restore = installDocument({enableAlertsToggle: enableToggle, webhookUrlInput, webhookUrlMasked, webhookActions, repeatIntervalInput, saveSettingsBtn: saveButton});
    let submittedData;
    api.updateAlertSettings = async data => { submittedData = data; return {status: 'success'}; };
    const view = new NotificationsView({});
    view._loadAlertSettings = async () => {};

    try {
        await view._saveAlertSettings();
        assert.deepEqual(submittedData, {enabled: true, alert_repeat_minutes: 30});
        assert.deepEqual(messages.success, ['Alert settings saved successfully']);
        assert.equal(saveButton.disabled, false);
    } finally {
        restore();
        api.updateAlertSettings = async () => ({status: 'success'});
        messages.success.length = 0;
    }
});

test('existing masked webhook stays in the URL row beside its actions', async () => {
    const maskedClasses = new Set();
    const enableToggle = element();
    const webhookUrlInput = element({style: {display: 'block'}});
    const webhookUrlMasked = element({
        style: {display: 'none'},
        classList: {
            add: value => maskedClasses.add(value),
            remove: value => maskedClasses.delete(value)
        }
    });
    const webhookActions = element({style: {display: 'none'}});
    const repeatIntervalInput = element();
    const saveButton = element();
    const statusText = element();
    const lastUpdatedInfo = element();
    const restore = installDocument({enableAlertsToggle: enableToggle, webhookUrlInput, webhookUrlMasked, webhookActions, repeatIntervalInput, saveSettingsBtn: saveButton, enableStatusText: statusText, lastUpdatedInfo});
    api.getAlertSettings = async () => ({status: 'success', enabled: true, alert_repeat_minutes: 10, has_webhook: true, webhook_masked: 'https://chat.googleapis.com/...'});
    const view = new NotificationsView({});

    try {
        await view._loadAlertSettings();
        assert.equal(webhookUrlInput.style.display, 'none');
        assert.equal(webhookUrlMasked.style.display, 'block');
        assert.equal(webhookUrlMasked.textContent, 'https://chat.googleapis.com/...');
        assert.ok(maskedClasses.has('is-visible'));
        assert.equal(webhookActions.style.display, 'flex');
    } finally {
        restore();
        api.getAlertSettings = undefined;
    }
});

test('sending an alert test message reports success and restores the button', async () => {
    const webhookUrlInput = element({value: ''});
    const testButton = element();
    const testResult = element();
    const restore = installDocument({webhookUrlInput, testMessageBtn: testButton, testResult});
    let submittedData;
    api.testAlertMessage = async data => { submittedData = data; return {ok: true, http_status: 200}; };
    const view = new NotificationsView({});

    try {
        await view._sendTestAlertMessage();
        assert.deepEqual(submittedData, {webhook_url: null});
        assert.equal(testResult.style.display, 'block');
        assert.match(testResult.innerHTML, /Test Successful/);
        assert.equal(testButton.disabled, false);
        assert.deepEqual(messages.success, ['Test message sent successfully']);
    } finally {
        restore();
        api.testAlertMessage = async () => ({ok: true, http_status: 200});
        messages.success.length = 0;
    }
});
