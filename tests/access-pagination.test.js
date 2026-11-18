const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let usersResponse = [];
const api = {
    getUsers: async () => ({status: 'success', data: usersResponse})
};
class FakeUserTable {
    render(users, currentUser) {
        this.users = users;
        this.currentUser = currentUser;
    }
}
class FakeUserModals {}
class FakeNavPermissionsPanel {}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../../services/api.js') return api;
    if (request === '../../components/Toast.js') return {error() {}};
    if (request === './components/UserTable.js') return FakeUserTable;
    if (request === './components/UserModals.js') return FakeUserModals;
    if (request === './components/NavPermissionsPanel.js') return FakeNavPermissionsPanel;
    return originalLoad.call(this, request, parent, isMain);
};
let AccessView;
try {
    AccessView = require('../src/renderer/views/users/AccessView.js');
} finally {
    Module._load = originalLoad;
}

function makeContainer() {
    return {
        innerHTML: '',
        querySelectorAll: () => [],
        querySelector: () => null
    };
}

test('Access Management renders reusable user pagination and slices the current page', async () => {
    usersResponse = Array.from({length: 45}, (_, index) => ({
        id: index + 1,
        name: `User ${String(index + 1).padStart(2, '0')}`,
        email: `user${index + 1}@example.com`,
        role: 'manager',
        status: 'active',
        deleted_at: null,
        allowed_branches: []
    }));
    const body = makeContainer();
    const pagination = makeContainer();
    const search = {value: ''};
    const previousDocument = global.document;
    global.document = {getElementById: id => ({usersTableBody: body, userPagination: pagination, userSearch: search})[id] || null};
    const user = {id: 999, role: 'admin'};
    const view = new AccessView({state: {getUser: () => user}});

    try {
        await view.loadUsers();
        assert.equal(view.tableComponent.users.length, 20);
        assert.equal(view.tableComponent.users[0].id, 1);
        assert.match(pagination.innerHTML, /Showing 1-20 of 45 users/);
        assert.match(pagination.innerHTML, /userRowsPerPage/);

        view.currentPage = 2;
        view.renderUsersPage();
        assert.equal(view.tableComponent.users.length, 20);
        assert.equal(view.tableComponent.users[0].id, 21);
        assert.equal(view.tableComponent.users.at(-1).id, 40);

        view.pageSize = 50;
        view.currentPage = 1;
        view.renderUsersPage();
        assert.equal(view.tableComponent.users.length, 45);
    } finally {
        global.document = previousDocument;
    }
});

test('Access Management search and Trash tab filters are applied before pagination', async () => {
    usersResponse = [
        {id: 1, name: 'Active Alice', email: 'alice@example.com', role: 'manager', status: 'active', deleted_at: null, allowed_branches: []},
        {id: 2, name: 'Trashed Bob', email: 'bob@example.com', role: 'manager', status: 'active', deleted_at: '2026-01-01', allowed_branches: []},
        {id: 3, name: 'Active Amy', email: 'amy@example.com', role: 'manager', status: 'active', deleted_at: null, allowed_branches: []},
        {id: 4, name: 'Suspended Alex', email: 'alex@example.com', role: 'cashier', status: 'suspended', deleted_at: null, allowed_branches: []}
    ];
    const body = makeContainer();
    const pagination = makeContainer();
    const search = {value: 'amy'};
    const previousDocument = global.document;
    global.document = {getElementById: id => ({usersTableBody: body, userPagination: pagination, userSearch: search})[id] || null};
    const view = new AccessView({state: {getUser: () => ({id: 999, role: 'admin'})}});

    try {
        view.userFilters = {role: 'manager', status: 'active'};
        await view.loadUsers();
        assert.deepEqual(view.tableComponent.users.map(user => user.id), [3]);

        search.value = '';
        view.userSubTab = 'trash';
        view.userFilters = {role: '', status: ''};
        await view.loadUsers();
        assert.deepEqual(view.tableComponent.users.map(user => user.id), [2]);
        assert.match(pagination.innerHTML, /of 1 users/);

        view.userSubTab = 'active';
        view.userFilters = {role: 'cashier', status: 'suspended'};
        await view.loadUsers();
        assert.deepEqual(view.tableComponent.users.map(user => user.id), [4]);
    } finally {
        global.document = previousDocument;
    }
});
