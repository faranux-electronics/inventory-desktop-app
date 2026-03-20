const Modal = require('./Modal.js');
const API = require("../services/api");

class Sidebar {
    constructor(navigateCallback, logoutCallback) {
        this.navigateCallback = navigateCallback;
        this.logoutCallback = logoutCallback;
        this.locations = [];
        this.userBranchId = null;
    }

    async loadLocations(stateManager) {
        try {
            // Fetch from your global state cache
            this.locations = await stateManager.loadLocations();
            this.updateBranchDisplay();
        } catch (e) {
            this.updateBranchDisplayFallback("Offline");
        }
    }

    getActiveBranchName(branchId) {
        // If strictly null or undefined, treat as Global Admin
        if (branchId === null || branchId === undefined || branchId === '') {
            return null;
        }

        // Look up the actual branch name from the fetched locations array
        const loc = this.locations.find(l => String(l.id) === String(branchId));
        return loc ? loc.name : `Branch #${branchId}`;
    }

    updateBranchDisplay() {
        const branchName = this.getActiveBranchName(this.userBranchId);
        // If branchName is null, fallback to Global
        this.applyBranchNameToDOM(branchName || 'Global (All Branches)');
    }

    updateBranchDisplayFallback(fallbackText) {
        // Used only if the API call entirely fails
        const branchName = this.userBranchId ? `Branch #${this.userBranchId} (${fallbackText})` : 'Global (All Branches)';
        this.applyBranchNameToDOM(branchName);
    }

    applyBranchNameToDOM(branchName) {
        const branchEl = document.getElementById('sidebar-branch-name');
        if (branchEl) {
            branchEl.textContent = branchName;
        }

        const profileEl = document.getElementById('sidebar-profile-section');
        if (profileEl) {
            profileEl.title = `Edit Profile (Branch: ${branchName})`;
        }
    }

    render(user) {
        // Capture the user's branch ID from their session cache
        this.userBranchId = user.branch_id;
        const isAdmin = user.role === 'admin';

        // Set initial text. If they have a branch but locations aren't loaded yet, it will say "Branch #ID" temporarily.
        let initialBranchText = this.getActiveBranchName(this.userBranchId) || 'Global (All Branches)';

        // Default to collapsed, but remember if the user expanded it
        const isCollapsed = localStorage.getItem('sidebar_collapsed') !== 'false';
        const collapsedClass = isCollapsed ? 'collapsed' : '';

        return `
      <div class="sidebar ${collapsedClass}" id="mainSidebar">
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
           <div class="nav-item" data-view="transfers" title="Transfers">
             <i class="fa-solid fa-truck-arrow-right"></i> <span class="nav-text">Transfers</span>
           </div>
        ${isAdmin ? `
            <div class="nav-item" data-view="pos" title="Point of Sale">
                 <i class="fa-solid fa-cash-register"></i> <span class="nav-text">Point of Sale</span>
           </div>
           ` : ''}
           <div class="nav-item" data-view="products" title="Products">
             <i class="fa-solid fa-chart-line"></i> <span class="nav-text">Products</span>
           </div>
           ${isAdmin ? `
           <div class="nav-item" data-view="import" title="Import Stock">
             <i class="fa-solid fa-file-import"></i> <span class="nav-text">Import Stock</span>
           </div>
           <div class="nav-item" data-view="branches" title="Branches">
             <i class="fa-solid fa-store"></i> <span class="nav-text">Branches</span>
           </div>
           <div class="nav-item" data-view="users" title="Users">
             <i class="fa-solid fa-users-gear"></i> <span class="nav-text">Users</span>
           </div>
           ` : ''}
        </div>

        <div class="sidebar-profile cursor-pointer transition-colors" id="sidebar-profile-section" data-view="profile" title="Edit Profile (Branch: ${initialBranchText})">
            <div class="profile-icon"><i class="fa-solid fa-circle-user"></i></div>
            <div class="user-info nav-text">
                <div class="user-name">${user.name || 'User'}</div>
                <div class="user-role">${user.role || 'Role'}</div>
                <div class="user-branch" id="sidebar-branch-name" style="font-size: 10px; color: var(--primary-100);;">${initialBranchText}</div>
            </div>
            <button class="logout-btn" id="logoutBtn" title="Logout">
                <i class="fa-solid fa-power-off"></i>
            </button>
        </div>
      </div>
    `;
    }

    attachEvents() {
        // Toggle Sidebar Logic
        const sidebarToggle = document.getElementById('sidebarToggle');
        const mainSidebar = document.getElementById('mainSidebar');

        if (sidebarToggle && mainSidebar) {
            sidebarToggle.addEventListener('click', () => {
                mainSidebar.classList.toggle('collapsed');
                // Save preference locally
                const isCollapsed = mainSidebar.classList.contains('collapsed');
                localStorage.setItem('sidebar_collapsed', isCollapsed);
            });
        }

        // Navigation Click Events
        document.querySelectorAll('.nav-item, .sidebar-profile').forEach(item => {
            item.addEventListener('click', (e) => {
                // Ignore if clicked the logout button specifically
                if (e.target.closest('#logoutBtn')) return;

                const view = item.dataset.view;
                if(view) this.navigateCallback(view);
            });
        });

        // Logout Event
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                Modal.open({
                    title: "Confirm Logout",
                    body: `<div class="text-center p-md"><p>Are you sure you want to log out?</p></div>`,
                    confirmText: "Logout",
                    cancelText: "Cancel",
                    onConfirm: async () => {
                        this.logoutCallback();
                    }
                });
            });
        }
    }

    setActive(viewName) {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.view === viewName) {
                el.classList.add('active');
            }
        });

        const profile = document.querySelector('.sidebar-profile');
        if(profile) {
            profile.style.background = viewName === 'profile' ? 'rgba(255,255,255,0.05)' : '';
        }
    }
}

module.exports = Sidebar;