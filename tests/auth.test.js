const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const toastCalls = {errors: [], successes: [], infos: []};
let ipcInvoke = async () => undefined;
const api = {
    login: async () => ({status: 'error', message: 'not configured'}),
    googleLogin: async () => ({status: 'error', message: 'not configured'})
};
const toast = {
    error: message => toastCalls.errors.push(message),
    success: message => toastCalls.successes.push(message),
    info: message => toastCalls.infos.push(message)
};
const ipcRenderer = {invoke: (...args) => ipcInvoke(...args)};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'electron') return {ipcRenderer};
    if (request === '../../components/Toast.js') return toast;
    if (request === '../../services/api.js') return api;
    return originalLoad.call(this, request, parent, isMain);
};

const loginViewPath = require.resolve('../src/renderer/views/auth/Loginview.js');
delete require.cache[loginViewPath];
const LoginView = require(loginViewPath);
Module._load = originalLoad;

function makeElement(value = '') {
    const listeners = {};
    const classes = new Set();
    return {
        value,
        innerHTML: '',
        disabled: false,
        textContent: '',
        style: {},
        listeners,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        },
        addEventListener: (name, callback) => { listeners[name] = callback; }
    };
}

function setup() {
    toastCalls.errors.length = 0;
    toastCalls.successes.length = 0;
    toastCalls.infos.length = 0;

    const elements = {
        loginForm: makeElement(),
        loginEmail: makeElement('user@example.com'),
        loginPassword: makeElement('correct-horse-battery-staple'),
        loginBtn: makeElement(),
        googleLoginBtn: makeElement(),
        cancelGoogleBtn: makeElement(),
        loginCard: makeElement(),
        checkStatusBtn: makeElement(),
        backToLoginBtn: makeElement(),
        'version-display': makeElement()
    };
    const previousDocument = global.document;
    const previousWindow = global.window;
    global.document = {
        getElementById: id => elements[id] || (elements[id] = makeElement())
    };
    global.window = {
        faranuxDesktop: {
            loginGoogle: () => ipcInvoke('login-google'),
            cancelGoogleLogin: () => ipcInvoke('cancel-google-login'),
            getAppVersion: () => ipcInvoke('get-app-version')
        }
    };

    const appCalls = [];
    const app = {
        state: {setUser: user => appCalls.push(['setUser', user])},
        renderApp: user => appCalls.push(['renderApp', user]),
        navigate: route => appCalls.push(['navigate', route])
    };

    const view = new LoginView(app);
    return {
        view,
        elements,
        appCalls,
        restore: () => {
            global.document = previousDocument;
            if (previousWindow === undefined) delete global.window;
            else global.window = previousWindow;
        }
    };
}

function silenceConsoleError() {
    const previous = console.error;
    console.error = () => {};
    return () => { console.error = previous; };
}

test('email login validates required fields before making an API request', async () => {
    const {view, elements, restore} = setup();
    let apiCalls = 0;
    api.login = async () => { apiCalls++; return {status: 'success'}; };
    elements.loginEmail.value = '   ';
    view.attachEvents();

    try {
        await elements.loginForm.listeners.submit({preventDefault() {}});
        assert.equal(apiCalls, 0);
        assert.deepEqual(toastCalls.errors, ['Please fill in all fields']);
    } finally {
        restore();
    }
});

test('email login trims the email, stores the user, opens the app, and restores the button', async () => {
    const {view, elements, appCalls, restore} = setup();
    const user = {id: 7, email: 'user@example.com'};
    let credentials;
    api.login = async (email, password) => {
        credentials = {email, password};
        return {status: 'success', user};
    };
    elements.loginEmail.value = '  user@example.com  ';
    view.attachEvents();

    try {
        await elements.loginForm.listeners.submit({preventDefault() {}});
        assert.deepEqual(credentials, {email: 'user@example.com', password: 'correct-horse-battery-staple'});
        assert.deepEqual(appCalls, [['setUser', user], ['renderApp', user], ['navigate', 'pos']]);
        assert.deepEqual(toastCalls.successes, ['Welcome back!']);
        assert.equal(elements.loginBtn.disabled, false);
        assert.match(elements.loginBtn.innerHTML, /Sign In/);
    } finally {
        restore();
    }
});

test('email login handles pending approval', async () => {
    const {view, elements, restore} = setup();
    api.login = async () => ({status: 'pending_approval'});
    view.attachEvents();

    try {
        await elements.loginForm.listeners.submit({preventDefault() {}});
        assert.match(elements.loginCard.innerHTML, /Approval Pending/);
        assert.equal(elements.checkStatusBtn.listeners.click instanceof Function, true);
        assert.equal(elements.backToLoginBtn.listeners.click instanceof Function, true);
        assert.equal(elements.loginBtn.disabled, false);
    } finally {
        restore();
    }
});

test('email login shows backend credential errors and recovers the button', async () => {
    const {view, elements, restore} = setup();
    api.login = async () => ({status: 'error', message: 'Invalid email or password'});
    view.attachEvents();

    try {
        await elements.loginForm.listeners.submit({preventDefault() {}});
        assert.deepEqual(toastCalls.errors, ['Invalid email or password']);
        assert.equal(elements.loginBtn.disabled, false);
    } finally {
        restore();
    }
});

test('email login handles a network/API rejection', async () => {
    const {view, elements, restore} = setup();
    api.login = async () => { throw new Error('network unavailable'); };
    view.attachEvents();

    try {
        await elements.loginForm.listeners.submit({preventDefault() {}});
        assert.deepEqual(toastCalls.errors, ['Login failed']);
        assert.equal(elements.loginBtn.disabled, false);
    } finally {
        restore();
    }
});

test('Google login exchanges the browser token and opens the app', async () => {
    const {view, elements, appCalls, restore} = setup();
    const user = {id: 12, email: 'google@example.com'};
    ipcInvoke = async channel => channel === 'login-google' ? 'google-id-token' : '1.4.4';
    let receivedToken;
    api.googleLogin = async token => {
        receivedToken = token;
        return {status: 'success', user};
    };

    try {
        await view.handleGoogleLogin();
        assert.equal(receivedToken, 'google-id-token');
        assert.deepEqual(appCalls, [['setUser', user], ['renderApp', user], ['navigate', 'pos']]);
        assert.deepEqual(toastCalls.successes, ['Welcome back!']);
        assert.equal(elements.googleLoginBtn.disabled, false);
        assert.equal(view.googleLoginInProgress, false);
    } finally {
        restore();
    }
});

test('Google login handles pending approval', async () => {
    const {view, elements, restore} = setup();
    ipcInvoke = async channel => channel === 'login-google' ? 'google-id-token' : undefined;
    api.googleLogin = async () => ({status: 'pending_approval'});

    try {
        await view.handleGoogleLogin();
        assert.match(elements.loginCard.innerHTML, /Approval Pending/);
        assert.equal(elements.checkStatusBtn.listeners.click instanceof Function, true);
        assert.equal(view.googleLoginInProgress, false);
    } finally {
        restore();
    }
});

test('Google login reports backend rejection and restores controls', async () => {
    const {view, elements, restore} = setup();
    ipcInvoke = async channel => channel === 'login-google' ? 'google-id-token' : undefined;
    api.googleLogin = async () => ({status: 'error', message: 'Google account is not allowed'});

    try {
        await view.handleGoogleLogin();
        assert.deepEqual(toastCalls.errors, ['Google account is not allowed']);
        assert.equal(elements.googleLoginBtn.disabled, false);
        assert.equal(elements.cancelGoogleBtn.classList.contains('hidden'), true);
    } finally {
        restore();
    }
});

for (const scenario of [
    {name: 'callback listener already in use', error: 'Server error (EADDRINUSE): port 4200 is occupied', message: 'Port 4200 is already in use. Close any other Google sign-in window and try again.'},
    {name: 'authentication timeout', error: 'Authentication timeout - please try again', message: 'Login timed out. Please try again.'},
    {name: 'local callback server failure', error: 'Server error: permission denied', message: 'Authentication server error. Please try again.'},
    {name: 'unrecognized IPC failure', error: 'browser launch failed', message: 'Google login cancelled or failed'}
]) {
    test(`Google login reports ${scenario.name}`, async () => {
        const {view, elements, restore} = setup();
        ipcInvoke = async () => { throw new Error(scenario.error); };
        const restoreConsole = silenceConsoleError();

        try {
            await view.handleGoogleLogin();
            assert.deepEqual(toastCalls.errors, [scenario.message]);
            assert.equal(elements.googleLoginBtn.disabled, false);
            assert.equal(elements.cancelGoogleBtn.classList.contains('hidden'), true);
            assert.equal(view.googleLoginInProgress, false);
        } finally {
            restoreConsole();
            restore();
        }
    });
}

test('Google login suppresses the error when the user cancels', async () => {
    const {view, elements, restore} = setup();
    let rejectPendingLogin;
    ipcInvoke = channel => {
        if (channel === 'login-google') return new Promise((resolve, reject) => { rejectPendingLogin = reject; });
        if (channel === 'cancel-google-login') return Promise.resolve({status: 'cancelled'});
        return Promise.resolve('1.4.4');
    };
    view.attachEvents();
    const restoreConsole = silenceConsoleError();

    try {
        const loginAttempt = elements.googleLoginBtn.listeners.click();
        assert.equal(elements.googleLoginBtn.disabled, true);
        await elements.cancelGoogleBtn.listeners.click();
        rejectPendingLogin(new Error('Google login cancelled'));
        await loginAttempt;

        assert.deepEqual(toastCalls.errors, []);
        assert.deepEqual(toastCalls.infos, ['Login cancelled']);
        assert.equal(elements.googleLoginBtn.disabled, false);
        assert.equal(elements.cancelGoogleBtn.classList.contains('hidden'), true);
    } finally {
        restoreConsole();
        restore();
    }
});

test('rapid duplicate Google attempts start only one IPC flow', async () => {
    const {view, restore} = setup();
    let resolveLogin;
    let calls = 0;
    ipcInvoke = channel => {
        assert.equal(channel, 'login-google');
        calls++;
        return new Promise(resolve => { resolveLogin = resolve; });
    };
    api.googleLogin = async () => ({status: 'error', message: 'test completion'});

    try {
        const first = view.handleGoogleLogin();
        await view.handleGoogleLogin();
        assert.equal(calls, 1);
        resolveLogin('google-id-token');
        await first;
        assert.equal(view.googleLoginInProgress, false);
    } finally {
        restore();
    }
});
