const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class NotsView {
    constructor(app) {
        this.app = app;
        this.notifications = [];
        this.loading = false;
    }

    render() {
        document.getElementById('content').innerHTML = this._layoutHTML();
        this._attachEvents();
        this.loadNotifications();
    }

    _layoutHTML() {
        // Get the currently selected sound to set the dropdown correctly
        const currentSound = this.app.notifManager ? this.app.notifManager.selectedSound : 'message_notification.mp3';

        return `
        <div class="p-lg flex-1 overflow-y-auto bg-neutral-100" style="height: 100%;">
            <div class="max-w-4xl mx-auto">
                <div class="flex items-center justify-between mb-md">
                    <h2 class="text-2xl font-bold text-neutral-900">
                        <i class="fa-regular fa-bell mr-sm text-primary"></i> Notifications
                    </h2>
                    
                    <div class="flex items-center gap-md">
                        <div class="flex items-center gap-sm bg-white border border-neutral-200 rounded px-sm py-xs shadow-sm">
                            <label for="soundSelect" class="text-sm text-neutral-700 m-0"><i class="fa-solid fa-volume-high text-muted"></i> Sound:</label>
                            <select id="soundSelect" class="form-input form-input-sm border-none bg-transparent m-0 p-0 shadow-none text-sm w-auto cursor-pointer focus:ring-0">
                                <option value="message_notification.mp3" ${currentSound === 'message_notification.mp3' ? 'selected' : ''}>Standard Message</option>
                                <option value="slack_notification.mp3" ${currentSound === 'slack_notification.mp3' ? 'selected' : ''}>Slack Style</option>
                                <option value="door_notification.mp3" ${currentSound === 'door_notification.mp3' ? 'selected' : ''}>Doorbell</option>
                            </select>
                        </div>
                        <button id="btnMarkAllRead" class="btn btn-secondary" style="display: none;">
                            <i class="fa-solid fa-check-double"></i> Mark All Read
                        </button>
                    </div>
                </div>
                
                <div id="notificationsList" class="bg-white rounded border border-neutral-200 shadow-sm overflow-hidden min-h-[300px]">
                    <div class="p-xl text-center text-muted mt-lg">
                        <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-md text-primary"></i>
                        <p>Loading notifications...</p>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    async loadNotifications() {
        try {
            const res = await API.getNotifications();
            if (res.status === 'success') {
                this.notifications = res.data || [];
                this.app.sidebar.updateBadgeCount(res.unread_count || 0);
                this._renderList();
            } else {
                this._showError(res.message);
            }
        } catch (e) {
            this._showError("Failed to load notifications. Please check your connection.");
        }
    }

    _renderList() {
        const listEl = document.getElementById('notificationsList');
        const btnAll = document.getElementById('btnMarkAllRead');

        if (!listEl) return;

        if (this.notifications.length === 0) {
            btnAll.style.display = 'none';
            listEl.innerHTML = `
                <div class="p-xl text-center text-muted" style="margin-top: 40px;">
                    <i class="fa-regular fa-bell-slash text-5xl mb-md" style="opacity: 0.2; display:block;"></i>
                    <p class="text-lg font-semibold text-neutral-800">You're all caught up!</p>
                    <p class="text-sm mt-xs">There are no new notifications to review.</p>
                </div>
            `;
            return;
        }

        btnAll.style.display = 'inline-flex';

        listEl.innerHTML = this.notifications.map(n => this._buildNotificationItem(n)).join('');

        listEl.querySelectorAll('.btn-mark-read').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.markAsRead(id);
            });
        });

        listEl.querySelectorAll('.btn-view-ref').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ref = e.currentTarget.dataset.ref;
                const type = e.currentTarget.dataset.type;

                if (type.startsWith('transfer_')) {
                    this.app.navigate('transfers');
                    setTimeout(() => {
                        const searchInput = document.getElementById('trvSearch');
                        if (searchInput) {
                            searchInput.value = ref;
                            searchInput.dispatchEvent(new Event('input'));
                        }
                    }, 100);
                }
            });
        });
    }

    _buildNotificationItem(n) {
        const timeStr = this._timeSince(new Date(n.created_at));

        let icon = '<i class="fa-solid fa-bell text-primary"></i>';
        let bgStyle = 'background: var(--primary-50); color: var(--primary-700);';

        if (n.type === 'transfer_pending') {
            icon = '<i class="fa-solid fa-clock-rotate-left"></i>';
            bgStyle = 'background: var(--warning-50, #fffde7); color: var(--warning-700, #fbc02d); border: 1px solid var(--warning-500, #ffd600)';
        } else if (n.type === 'transfer_approved') {
            icon = '<i class="fa-solid fa-check-double"></i>';
            bgStyle = 'background: var(--success-50, #f0fdf4); color: var(--success-700, #15803d); border: 1px solid #bbf7d0';
        } else if (n.type === 'transfer_rejected') {
            icon = '<i class="fa-solid fa-xmark"></i>';
            bgStyle = 'background: var(--error-50, #fef2f2); color: var(--error-700, #b71c1c); border: 1px solid #fecaca';
        }

        const circleStyle = `width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; ${bgStyle}`;

        return `
            <div class="flex items-start gap-md p-md border-b border-neutral-100 hover:bg-neutral-50 transition-colors" data-id="${n.id}">
                <div style="${circleStyle}">
                    ${icon}
                </div>
                <div class="flex-1">
                    <div class="text-sm text-neutral-900 font-semibold mb-xs" style="line-height: 1.4;">${esc(n.formatted_message)}</div>
                    <div class="text-xs text-muted flex items-center gap-sm mt-xs">
                        <span><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                        ${n.reference_id ? `
                            <span style="opacity: 0.5">&bull;</span>
                            <span class="font-mono text-primary cursor-pointer btn-view-ref hover:underline font-semibold" data-ref="${esc(n.reference_id)}" data-type="${esc(n.type)}" title="View related record">
                                Ref: ${esc(n.reference_id)}
                            </span>
                        ` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-sm ml-md pl-sm" style="border-left: 1px solid var(--neutral-100);">
                    <button class="btn btn-ghost btn-mark-read text-muted hover:text-primary" data-id="${n.id}" title="Mark as Read" style="padding: 8px;">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
            </div>
        `;
    }

    async markAsRead(id) {
        try {
            const res = await API.markNotificationRead(id);
            if (res.status === 'success') {
                this.notifications = this.notifications.filter(n => String(n.id) !== String(id));
                this.app.sidebar.updateBadgeCount(this.notifications.length);
                this._renderList();
            } else {
                Toast.error(res.message || "Failed to mark as read");
            }
        } catch (e) {
            Toast.error("An error occurred connecting to the server");
        }
    }

    _attachEvents() {
        const btnAll = document.getElementById('btnMarkAllRead');
        if (btnAll) {
            btnAll.addEventListener('click', async () => {
                try {
                    btnAll.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
                    btnAll.disabled = true;

                    const res = await API.markAllNotificationsRead();
                    if (res.status === 'success') {
                        this.notifications = [];
                        this.app.sidebar.updateBadgeCount(0);
                        this._renderList();
                        Toast.success("All notifications marked as read");
                    } else {
                        Toast.error(res.message);
                        btnAll.disabled = false;
                        btnAll.innerHTML = '<i class="fa-solid fa-check-double"></i> Mark All as Read';
                    }
                } catch (e) {
                    Toast.error("An error occurred connecting to the server");
                    btnAll.disabled = false;
                    btnAll.innerHTML = '<i class="fa-solid fa-check-double"></i> Mark All as Read';
                }
            });
        }

        // Sound Selection Event
        const soundSelect = document.getElementById('soundSelect');
        if (soundSelect && this.app.notifManager) {
            soundSelect.addEventListener('change', (e) => {
                this.app.notifManager.setSoundPreference(e.target.value);
                Toast.info("Notification sound updated");
            });
        }
    }

    _showError(msg) {
        const listEl = document.getElementById('notificationsList');
        if (listEl) {
            listEl.innerHTML = `
                <div class="p-xl text-center text-error mt-lg">
                    <i class="fa-solid fa-circle-exclamation text-4xl mb-sm"></i>
                    <p class="font-semibold">${esc(msg)}</p>
                </div>
            `;
        }
        const btnAll = document.getElementById('btnMarkAllRead');
        if (btnAll) btnAll.style.display = 'none';
    }

    _timeSince(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "y ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "mo ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m ago";
        return "Just now";
    }
}

module.exports = NotsView;