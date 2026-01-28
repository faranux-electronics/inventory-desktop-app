const Modal = require('./Modal.js');

class Sidebar {
    constructor(navigateCallback, logoutCallback) {
        this.navigateCallback = navigateCallback;
        this.logoutCallback = logoutCallback;
    }

    render(user) {
        const isAdmin = user.role === 'admin';

        return `
      <div class="sidebar">
        <div class="sidebar-brand">
           <i class="fa-solid fa-box-open"></i> Faranux Inventory
        </div>
        
        <div class="sidebar-nav">
           <div class="nav-item" data-view="dashboard">
             <i class="fa-solid fa-chart-line"></i> Dashboard
           </div>
           <div class="nav-item" data-view="branches">
             <i class="fa-solid fa-store"></i> Branches
           </div>
           <div class="nav-item" data-view="transfers">
             <i class="fa-solid fa-truck-arrow-right"></i> Transfers
           </div>
           <div class="nav-item" data-view="orders">
             <i class="fa-solid fa-clipboard-list"></i> Order Review
           </div>
           ${isAdmin ? `
           <div class="nav-item" data-view="users">
             <i class="fa-solid fa-users-gear"></i> Users
           </div>
           ` : ''}
        </div>

        <div class="sidebar-profile cursor-pointer hover:bg-neutral-800 transition-colors" data-view="profile" title="Edit Profile">
            <div class="user-info">
                <div class="user-name">${user.name || 'User'}</div>
                <div class="user-role">${user.role || 'Role'}</div>
            </div>
            <button class="logout-btn" id="logoutBtn" title="Logout">
                <i class="fa-solid fa-power-off"></i>
            </button>
        </div>
      </div>
    `;
    }

    attachEvents() {
        // Navigation Click Events (Nav Items + Profile Footer)
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

        // Optional: Highlight profile if selected
        const profile = document.querySelector('.sidebar-profile');
        if(profile) {
            profile.style.background = viewName === 'profile' ? 'var(--sidebar-active)' : '';
        }
    }
}

module.exports = Sidebar;