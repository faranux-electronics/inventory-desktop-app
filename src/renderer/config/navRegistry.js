/**
 * navRegistry.js — Single source of truth for all sidebar navigation items.
 * `defaultRoles` is used when no DB config exists yet (first-run fallback).
 * `locked` items are always shown (cannot be hidden by admin).
 */
const NAV_ITEMS = [
    {
        key: 'pos',
        label: 'Point of Sale',
        icon: 'fa-cash-register',
        defaultRoles: ['admin', 'manager', 'cashier'],
    },
    {
        key: 'transfers',
        label: 'Transfers',
        icon: 'fa-truck-arrow-right',
        defaultRoles: ['admin', 'manager', 'cashier'],
    },
    {
        key: 'products',
        label: 'Products',
        icon: 'fa-chart-line',
        defaultRoles: ['admin', 'manager'],
    },
    {
        key: 'import',
        label: 'Import Stock',
        icon: 'fa-file-import',
        defaultRoles: ['admin'],
    },
    {
        key: 'branches',
        label: 'Branches',
        icon: 'fa-store',
        defaultRoles: ['admin'],
    },
    {
        key: 'access',             // renamed from 'users'
        label: 'Access Management',
        icon: 'fa-users-gear',
        defaultRoles: ['admin'],
    },
    {
        key: 'logs',
        label: 'Logs',
        icon: 'fa-terminal',
        defaultRoles: ['admin'],
    },
    {
        key: 'nots',
        label: 'Notifications',
        icon: 'fa-bell',
        defaultRoles: ['admin', 'manager', 'cashier'],
        badge: true,
        locked: true,             // always visible — cannot be hidden
    },
];

module.exports = NAV_ITEMS;