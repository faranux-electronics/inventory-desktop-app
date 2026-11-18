const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const calls = {toastErrors: [], toastSuccesses: [], toastInfos: [], api: []};
const toast = {
    error: message => calls.toastErrors.push(message),
    success: message => calls.toastSuccesses.push(message),
    info: message => calls.toastInfos.push(message)
};
const api = {
    updateProfile: async data => { calls.api.push(['updateProfile', data]); return {status: 'success', user: {id: 1}}; },
    regeneratePassword: async (id, password) => { calls.api.push(['regeneratePassword', id, password]); return {status: 'success'}; }
};
let modalOptions = null;
const modal = {open: options => { modalOptions = options; }};

function loadWithMocks(file, mocks) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = require.resolve(file);
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

const ProfileView = loadWithMocks('../src/renderer/views/profile/ProfileView.js', {
    '../../components/Toast.js': toast,
    '../../components/Modal.js': modal,
    '../../services/api.js': api
});
const UserModals = loadWithMocks('../src/renderer/views/users/components/UserModals.js', {
    '../../../components/Toast.js': toast,
    '../../../components/Modal.js': modal,
    '../../../services/api.js': api
});

const storedValues = new Map();
global.localStorage = {
    getItem: key => storedValues.has(key) ? storedValues.get(key) : null,
    setItem: (key, value) => storedValues.set(key, String(value)),
    removeItem: key => storedValues.delete(key)
};
const State = loadWithMocks('../src/renderer/services/state.js', {'./api.js': api});

function element(value = '') {
    const listeners = {};
    return {
        value,
        innerHTML: '',
        textContent: '',
        disabled: false,
        listeners,
        addEventListener: (event, handler) => { listeners[event] = handler; }
    };
}

function installDocument(elements) {
    const previous = global.document;
    global.document = {getElementById: id => elements[id] || null};
    return () => { global.document = previous; };
}

function resetCalls() {
    calls.toastErrors.length = 0;
    calls.toastSuccesses.length = 0;
    calls.toastInfos.length = 0;
    calls.api.length = 0;
    modalOptions = null;
}

test('profile password change requires the current password for standard accounts', async () => {
    resetCalls();
    const elements = {
        profileForm: element(), saveProfileBtn: element(), pName: element('Ada'),
        pCurrentPass: element(''), pNewPass: element('new-secret'), pActiveBranch: element('4')
    };
    const restore = installDocument(elements);
    const view = new ProfileView({state: {}, app: {}});
    view.attachEvents({email: 'ada@example.com'}, false);

    try {
        await elements.profileForm.listeners.submit({preventDefault() {}});
        assert.deepEqual(calls.toastErrors, ['Current password is required to set a new password']);
        assert.equal(calls.api.length, 0);
    } finally {
        restore();
    }
});

test('profile header logout asks for confirmation then uses the app logout handler', async () => {
    resetCalls();
    const elements = {
        content: {dataset: {}, innerHTML: ''},
        profileLogoutBtn: element(),
        profileForm: element()
    };
    const restore = installDocument(elements);
    let logoutCalls = 0;
    const view = new ProfileView({
        state: {
            getUser: () => ({name: 'Ada', email: 'ada@example.com', role: 'Admin', google_id: false, branch_id: 2}),
            loadLocations: async () => []
        },
        handleLogout: async () => { logoutCalls += 1; }
    });

    try {
        await view.render();
        elements.profileLogoutBtn.listeners.click();
        assert.equal(modalOptions.title, 'Confirm Logout');
        assert.equal(logoutCalls, 0);
        await modalOptions.onConfirm();
        assert.equal(logoutCalls, 1);
    } finally {
        restore();
    }
});

test('profile password change sends the current and new password and refreshes the session', async () => {
    resetCalls();
    const updatedUser = {id: 1, email: 'ada@example.com'};
    api.updateProfile = async data => {
        calls.api.push(['updateProfile', data]);
        return {status: 'success', user: updatedUser};
    };
    const elements = {
        profileForm: element(), saveProfileBtn: element(), pName: element('Ada Lovelace'),
        pCurrentPass: element('old-secret'), pNewPass: element('new-secret'), pActiveBranch: element('4')
    };
    const restore = installDocument(elements);
    const appCalls = [];
    const view = new ProfileView({
        state: {setUser: user => appCalls.push(['setUser', user])},
        renderApp: user => appCalls.push(['renderApp', user]),
        navigate: route => appCalls.push(['navigate', route])
    });
    view.attachEvents({email: 'ada@example.com'}, false);

    try {
        await elements.profileForm.listeners.submit({preventDefault() {}});
        assert.deepEqual(calls.api, [['updateProfile', {
            name: 'Ada Lovelace', email: 'ada@example.com', current_password: 'old-secret',
            new_password: 'new-secret', active_branch: '4'
        }]]);
        assert.deepEqual(appCalls, [['setUser', updatedUser], ['renderApp', updatedUser], ['navigate', 'profile']]);
        assert.deepEqual(calls.toastSuccesses, ['Profile Updated Successfully!']);
        assert.equal(elements.saveProfileBtn.disabled, false);
        assert.equal(elements.saveProfileBtn.textContent, 'Update Profile');
    } finally {
        restore();
    }
});

test('Google-linked profile can set its first password without a current password', async () => {
    resetCalls();
    const updatedUser = {id: 2, email: 'google@example.com'};
    api.updateProfile = async data => {
        calls.api.push(['updateProfile', data]);
        return {status: 'success', user: updatedUser};
    };
    const elements = {
        profileForm: element(), saveProfileBtn: element(), pName: element('Grace'),
        pCurrentPass: element(''), pNewPass: element('new-google-password'), pActiveBranch: element('')
    };
    const restore = installDocument(elements);
    const view = new ProfileView({state: {setUser() {}}, renderApp() {}, navigate() {}});
    view.attachEvents({email: 'google@example.com'}, true);

    try {
        await elements.profileForm.listeners.submit({preventDefault() {}});
        assert.equal(calls.api[0][1].current_password, '');
        assert.equal(calls.api[0][1].new_password, 'new-google-password');
        assert.deepEqual(calls.toastSuccesses, ['Profile Updated Successfully!']);
    } finally {
        restore();
    }
});

test('admin password reset validates minimum length and submits a valid password', async () => {
    resetCalls();
    const elements = {newPassInput: element('abc'), genPassBtn: element()};
    const restore = installDocument(elements);
    const modals = new UserModals({});
    api.regeneratePassword = async (id, password) => {
        calls.api.push(['regeneratePassword', id, password]);
        return {status: 'success'};
    };

    try {
        modals.showResetPasswordModal(9, 'Ada');
        await assert.rejects(modalOptions.onConfirm(), /Validation/);
        assert.deepEqual(calls.toastErrors, ['Password must be at least 4 characters']);
        assert.equal(calls.api.length, 0);

        elements.newPassInput.value = 'new-admin-password';
        await modalOptions.onConfirm();
        assert.deepEqual(calls.api, [['regeneratePassword', 9, 'new-admin-password']]);
        assert.deepEqual(calls.toastSuccesses, ['Password for Ada has been updated.']);
    } finally {
        restore();
    }
});

test('admin password reset reports a backend failure', async () => {
    resetCalls();
    const elements = {newPassInput: element('valid-password'), genPassBtn: element()};
    const restore = installDocument(elements);
    api.regeneratePassword = async () => ({status: 'error', message: 'User is inactive'});
    new UserModals({}).showResetPasswordModal(9, 'Ada');

    try {
        await assert.rejects(modalOptions.onConfirm(), /User is inactive/);
        assert.deepEqual(calls.toastErrors, ['User is inactive']);
    } finally {
        restore();
    }
});

test('logout clears the persisted user, inventory caches, and local selections', () => {
    storedValues.clear();
    State.setUser({id: 5, api_token: 'test-token'});
    State.setLocations([{id: 3, name: 'Branch'}]);
    State.setInventoryData([{id: 21, name: 'Test product'}], 2, 40);
    State.selectProduct(21);
    State.saveTabState('products', {page: 3});
    State.setWCCachedProducts('search::test', [{id: 21}]);
    State.syncCatalog([{id: 21, name: 'Test product', status: 'publish'}]);

    State.logout();

    assert.equal(State.getUser(), null);
    assert.equal(State.getLocations().length, 0);
    assert.equal(State.getInventory().length, 0);
    assert.deepEqual(State.getSelectedIds(), []);
    assert.equal(State.tabStates.size, 0);
    assert.equal(State.wcProductsCache.size, 0);
    assert.equal(State.productCatalog.size, 0);
    assert.equal(storedValues.has('faranux_user'), false);
    assert.equal(storedValues.has('faranux_catalog'), false);
    assert.equal(storedValues.get('faranux_tab_states'), '{}');
    assert.equal(storedValues.get('faranux_wc_cache'), '{}');
});

test('logout stops background sync, clears session, stops notifications, and returns to login', async () => {
    const order = [];
    const mockState = {logout: () => order.push('state.logout')};
    class FakeView { constructor() {} }
    class FakeProductsView extends FakeView {
        constructor() { super(); this._bgSync = {stop: () => order.push('sync.stop')}; }
    }
    class FakeSidebar { constructor() {} }
    class FakeNotificationManager { constructor() {} }
    const viewMocks = {
        './renderer/views/auth/Loginview.js': FakeView,
        './renderer/views/products/ProductsView.js': FakeProductsView,
        './renderer/views/branches/Branchesview.js': FakeView,
        './renderer/views/transfer/Transfersview.js': FakeView,
        './renderer/views/profile/ProfileView.js': FakeView,
        './renderer/views/import/ImportView.js': FakeView,
        './renderer/views/pos/POSView.js': FakeView,
        './renderer/views/logger/LogsView.js': FakeView,
        './renderer/views/notifications/NotsView.js': FakeView,
        './renderer/views/users/AccessView': FakeView,
        './renderer/views/mps/MpsView.js': FakeView
    };
    const previousDocument = global.document;
    global.document = {addEventListener() {}};
    const App = loadWithMocks('../src/app.js', {
        electron: {ipcRenderer: {}},
        './renderer/components/Sidebar.js': FakeSidebar,
        './renderer/components/Toast.js': toast,
        './renderer/services/state.js': mockState,
        './renderer/services/api.js': {},
        './renderer/services/Theme.js': {apply() {}},
        './renderer/components/Modal.js': {},
        './renderer/services/NotificationManager.js': FakeNotificationManager,
        './updater.js': () => {},
        './renderer/config/navRegistry.js': [],
        ...viewMocks
    });
    global.document = previousDocument;
    resetCalls();
    const app = new App();
    app.notifManager = {stopPolling: () => order.push('notifications.stop')};
    app.navigate = async route => order.push(`navigate:${route}`);

    await app.handleLogout();

    assert.deepEqual(order, ['sync.stop', 'state.logout', 'notifications.stop', 'navigate:login']);
    assert.equal(app.notifManager, null);
    assert.deepEqual(calls.toastInfos, ['Logged out successfully']);
});
