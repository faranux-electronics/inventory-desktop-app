const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadApi() {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'electron') return {ipcRenderer: {invoke: async () => 'http://localhost:8000/index.php'}};
        return originalLoad.call(this, request, parent, isMain);
    };
    const resolved = require.resolve('../src/renderer/services/api.js');
    delete require.cache[resolved];
    try { return require(resolved); }
    finally { Module._load = originalLoad; }
}

function setSession() {
    global.localStorage = {
        getItem(key) {
            return key === 'faranux_user' ? JSON.stringify({api_token: 'token-1', branch_id: 4, allowed_branches: [4, 7]}) : null;
        }
    };
}

test('401 API responses delegate sign-out once and include the cached branch snapshot', async () => {
    setSession();
    const messages = [];
    global.window = {app: {handleAuthenticationRequired: message => messages.push(message)}};
    let requestHeaders;
    global.fetch = async (_url, options) => {
        requestHeaders = options.headers;
        return new Response(JSON.stringify({status: 'error', message: 'Unauthorized'}), {status: 401});
    };

    const api = loadApi();
    await api.getLocations();
    await api.getLocations();

    assert.equal(requestHeaders.Authorization, 'Bearer token-1');
    assert.deepEqual(JSON.parse(requestHeaders['X-Client-Session-Branches']), {branch_id: 4, allowed_branches: [4, 7]});
    assert.equal(messages.length, 1);
    assert.match(messages[0], /session is no longer valid/i);
});

test('branch assignment conflict requests a fresh sign-in with a clear message', async () => {
    setSession();
    let message = '';
    global.window = {app: {handleAuthenticationRequired: value => { message = value; }}};
    global.fetch = async () => new Response(JSON.stringify({
        status: 'error', code: 'branch_assignment_changed', message: 'Branch changed'
    }), {status: 409});

    const api = loadApi();
    await api.getLocations();

    assert.match(message, /branch assignments changed/i);
    assert.match(message, /sign in again/i);
});

test('app authentication handler clears session, stops background work, and navigates to login', async () => {
    const warnings = [];
    const originalLoad = Module._load;
    const originalAddEventListener = global.document?.addEventListener;
    global.document = {addEventListener() {}};
    const stubs = new Map([
        ['electron', {ipcRenderer: {}}],
        ['./renderer/components/Sidebar.js', class {}],
        ['./renderer/components/Toast.js', {warning: message => warnings.push(message)}],
        ['./renderer/services/state.js', {}],
        ['./renderer/services/api.js', {}],
        ['./renderer/components/Modal.js', {}],
        ['./renderer/services/NotificationManager.js', class {}],
        ['./updater.js', () => {}],
        ['./renderer/services/Theme.js', {}],
        ['./renderer/views/auth/Loginview.js', class {}],
        ['./renderer/views/products/ProductsView.js', class {}],
        ['./renderer/views/branches/Branchesview.js', class {}],
        ['./renderer/views/transfer/Transfersview.js', class {}],
        ['./renderer/views/profile/ProfileView.js', class {}],
        ['./renderer/views/import/ImportView.js', class {}],
        ['./renderer/views/pos/POSView.js', class {}],
        ['./renderer/views/logger/LogsView.js', class {}],
        ['./renderer/views/notifications/NotsView.js', class {}],
        ['./renderer/views/users/AccessView', class {}],
        ['./renderer/views/mps/MpsView.js', class {}],
        ['./renderer/config/navRegistry.js', []]
    ]);
    Module._load = function (request, parent, isMain) {
        return stubs.has(request) ? stubs.get(request) : originalLoad.call(this, request, parent, isMain);
    };
    const resolved = require.resolve('../src/app.js');
    delete require.cache[resolved];
    let App;
    try { App = require(resolved); }
    finally {
        Module._load = originalLoad;
        if (originalAddEventListener) global.document.addEventListener = originalAddEventListener;
        else delete global.document;
    }

    let loggedOut = 0;
    let stoppedSync = 0;
    let stoppedNotifications = 0;
    const destinations = [];
    const app = Object.create(App.prototype);
    Object.assign(app, {
        authRedirectInProgress: false,
        state: {logout: () => { loggedOut++; }},
        views: {products: {_bgSync: {stop: () => { stoppedSync++; }}}},
        notifManager: {stopPolling: () => { stoppedNotifications++; }},
        navigate: async view => { destinations.push(view); }
    });

    await app.handleAuthenticationRequired('Your session expired. Please sign in again.');

    assert.equal(loggedOut, 1);
    assert.equal(stoppedSync, 1);
    assert.equal(stoppedNotifications, 1);
    assert.equal(app.notifManager, null);
    assert.deepEqual(destinations, ['login']);
    assert.match(warnings[0], /sign in again/i);
});
