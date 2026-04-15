const Modal = require('./Modal.js');
const API = require("../services/api");
const NAV_ITEMS = require('../config/navRegistry.js');

class Sidebar {
    constructor(navigateCallback, logoutCallback) {
        this.navigateCallback = navigateCallback;
        this.logoutCallback = logoutCallback;
        this.locations = [];
        this.userBranchId = null;
    }

    async loadLocations(stateManager) {
        try {
            this.locations = await stateManager.loadLocations();
            this.updateBranchDisplay();
        } catch (e) {
            this.updateBranchDisplayFallback("Offline");
        }
    }

    updateBadgeCount(count) {
        const badge = document.getElementById('global-notification-badge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    getActiveBranchName(branchId) {
        if (branchId === null || branchId === undefined || branchId === '') return null;
        const loc = this.locations.find(l => String(l.id) === String(branchId));
        return loc ? loc.name : `Branch #${branchId}`;
    }

    updateBranchDisplay() {
        const branchName = this.getActiveBranchName(this.userBranchId);
        this.applyBranchNameToDOM(branchName || 'Global (All Branches)');
    }

    updateBranchDisplayFallback(fallbackText) {
        const branchName = this.userBranchId
            ? `Branch #${this.userBranchId} (${fallbackText})`
            : 'Global (All Branches)';
        this.applyBranchNameToDOM(branchName);
    }

    applyBranchNameToDOM(branchName) {
        const branchEl = document.getElementById('sidebar-branch-name');
        if (branchEl) branchEl.textContent = branchName;
        const profileEl = document.getElementById('sidebar-profile-section');
        if (profileEl) profileEl.title = `Edit Profile (Branch: ${branchName})`;
    }

    /**
     * Resolve which nav items are visible for the current user.
     * Priority: server-stored permissions > defaultRoles fallback.
     * `locked` items always pass through regardless of config.
     */
    _getVisibleItems(role, navPermissions) {
        return NAV_ITEMS.filter(item => {
            if (item.locked) return true;

            // If we have a server-side permission record for this role+key, use it
            if (navPermissions && navPermissions[role] && item.key in navPermissions[role]) {
                return navPermissions[role][item.key];
            }

            // Fall back to registry defaults
            return item.defaultRoles.includes(role);
        });
    }

    render(user, navPermissions = null) {
        this.userBranchId = user.branch_id;
        const role = user.role;

        const visibleItems = this._getVisibleItems(role, navPermissions);
        const initialBranchText = this.getActiveBranchName(this.userBranchId) || 'Global (All Branches)';
        const isCollapsed = localStorage.getItem('sidebar_collapsed') !== 'false';

        const navHtml = visibleItems.map(item => `
            <div class="nav-item" data-view="${item.key}" title="${item.label}">
                <i class="fa-solid ${item.icon}"></i>
                <span class="nav-text">${item.label}</span>
                ${item.badge ? `<span id="global-notification-badge" class="badge" style="display:none; margin-left: auto; background: var(--error-500, #ef4444); color: white; border-radius: 12px; padding: 2px 8px; font-size: 11px; font-weight: bold;">0</span>` : ''}
            </div>
        `).join('');

        return `
      <div class="sidebar ${isCollapsed ? 'collapsed' : ''}" id="mainSidebar">
        <div class="sidebar-header">
            <div class="sidebar-brand" title="Faranux Inventory">
               <img src="src/assets/logo1.png" alt="Faranux Inventory" class="brand-logo" />
            </div>
            <span class="brand-title nav-text">FARANUX MIS</span>
            <button id="sidebarToggle" class="sidebar-toggle-btn" title="Toggle Sidebar">
                <i class="fa-solid fa-bars"></i>
            </button>
        </div>
        <div class="sidebar-nav">
           ${navHtml}
        </div>
        <div class="sidebar-profile cursor-pointer transition-colors" id="sidebar-profile-section" data-view="profile" title="Edit Profile (Branch: ${initialBranchText})">
            <div class="profile-icon"><i class="fa-solid fa-circle-user"></i></div>
            <div class="user-info nav-text">
                <div class="user-name">${user.name || 'User'}</div>
                <div class="user-role">${user.role || 'Role'}</div>
                <div class="user-branch" id="sidebar-branch-name" style="font-size: 10px; color: var(--primary-100);">${initialBranchText}</div>
            </div>
            <button class="logout-btn" id="logoutBtn" title="Logout">
                <i class="fa-solid fa-power-off"></i>
            </button>
        </div>
      </div>
    `;
    }

    attachEvents() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const mainSidebar = document.getElementById('mainSidebar');

        if (sidebarToggle && mainSidebar) {
            sidebarToggle.addEventListener('click', () => {
                mainSidebar.classList.toggle('collapsed');
                localStorage.setItem('sidebar_collapsed', mainSidebar.classList.contains('collapsed'));
            });
        }

        document.querySelectorAll('.nav-item, .sidebar-profile').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('#logoutBtn')) return;
                const view = item.dataset.view;
                if (view) this.navigateCallback(view);
            });
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                Modal.open({
                    title: "Confirm Logout",
                    body: `<div class="text-center p-md"><p>Are you sure you want to log out?</p></div>`,
                    confirmText: "Logout",
                    cancelText: "Cancel",
                    onConfirm: async () => this.logoutCallback()
                });
            });
        }
    }

    setActive(viewName) {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.view === viewName) el.classList.add('active');
        });
        const profile = document.querySelector('.sidebar-profile');
        if (profile) {
            profile.style.background = viewName === 'profile' ? 'rgba(255,255,255,0.05)' : '';
        }
    }
}

module.exports = Sidebar;