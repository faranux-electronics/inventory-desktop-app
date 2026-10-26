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
        this.currentMainTab = 'notifications'; // 'notifications' | 'alerts'
        this.currentSubTab = 'unread'; // 'unread' | 'archived' (only for notifications tab)
        this.alertSettings = {
            isLoading: false,
            isTesting: false
        };
    }

    render() {
        // Reset to notifications tab when view is rendered
        this.currentMainTab = 'notifications';
        this.currentSubTab = 'unread';
        
        document.getElementById('content').innerHTML = this._layoutHTML();
        this._attachEvents();
        this.loadNotifications();
    }

    _layoutHTML() {
        // Get the currently selected sound to set the dropdown correctly
        const currentSound = this.app.notifManager ? this.app.notifManager.selectedSound : 'message_notification.mp3';
        
        // Check if user is admin
        const currentUser = this.app.state.getUser();
        const isAdmin = currentUser && currentUser.role === 'admin';

        return `
        <div class="p-lg flex-1 overflow-y-auto bg-neutral-100" style="height: 100%;">
            <div class="max-w-4xl mx-auto">
                <div class="flex items-center justify-between mb-md">
                    <h2 class="text-2xl font-bold text-neutral-900">
                        <i class="fa-regular fa-bell mr-sm text-primary"></i> Notifications${isAdmin ? ' & Alerts' : ''}
                    </h2>
                </div>

                <!-- Main Tabs: Notifications / Alert Settings (only show if admin and multiple tabs) -->
                ${isAdmin ? `
                <div class="flex gap-md border-b-2 border-neutral-300 mb-md mt-lg">
                    <button id="mainTabNotifications" class="main-tab-btn px-md py-sm font-semibold border-b-2 transition-colors" data-main-tab="notifications">
                        <i class="fa-solid fa-bell mr-xs"></i> Notifications
                    </button>
                    <button id="mainTabAlerts" class="main-tab-btn px-md py-sm font-semibold border-b-2 transition-colors" data-main-tab="alerts">
                        <i class="fa-solid fa-bell-slash mr-xs"></i> Alert Settings
                    </button>
                </div>
                ` : ''}

                <!-- Notifications Panel -->
                <div id="panelNotifications" style="display: ${!isAdmin || this.currentMainTab === 'notifications' ? 'block' : 'none'};">
                    <div class="flex items-center justify-between mb-md ${!isAdmin ? 'mt-lg' : ''}">
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

                    <div class="flex gap-md border-b border-neutral-300 mb-md">
                        <button id="tabUnread" class="sub-tab-btn px-md py-sm font-semibold transition-colors" data-sub-tab="unread">
                            New <span id="badgeUnread" class="ml-xs bg-primary text-white rounded-full px-xs py-[2px] text-xs inline-block min-w-[20px] text-center">0</span>
                        </button>
                        <button id="tabArchived" class="sub-tab-btn px-md py-sm font-semibold transition-colors" data-sub-tab="archived">
                            Archived
                        </button>
                    </div>

                    <div id="notificationsList" class="bg-white rounded border border-neutral-200 shadow-sm overflow-hidden min-h-[300px]">
                        <div class="p-xl text-center text-muted mt-lg">
                            <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-md text-primary"></i>
                            <p>Loading notifications...</p>
                        </div>
                    </div>
                </div>

                <!-- Alert Settings Panel (only included if admin) -->
                ${isAdmin ? `
                <div id="panelAlerts" style="display: ${this.currentMainTab === 'alerts' ? 'block' : 'none'};">
                    ${this._alertsSettingsHTML()}
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }

    _alertsSettingsHTML() {
        // This method is only called when user is admin (checked in _layoutHTML)
        return `
            <div class="card" style="max-width: 100%; margin: 0;">
                <div class="card-body p-lg">
                    <form id="alertSettingsForm">
                        <!-- Enable/Disable Toggle -->
                        <div class="form-group mb-md">
                            <label class="form-label" style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-toggle-on" style="color: var(--primary-500);"></i>
                                Enable Google Chat Alerts
                            </label>
                            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
                                <label class="toggle-switch">
                                    <input type="checkbox" id="enableAlertsToggle">
                                    <span class="toggle-slider"></span>
                                </label>
                                <span id="enableStatusText" class="text-muted" style="font-size: 14px;">Alerts are disabled</span>
                            </div>
                        </div>

                        <!-- Webhook URL -->
                        <div class="form-group mb-md">
                            <label class="form-label" style="font-weight: 600;">
                                <i class="fa-solid fa-link"></i> Google Chat Webhook URL
                            </label>
                            <div style="position: relative;">
                                <input type="password" id="webhookUrlInput" class="form-input w-full"
                                       placeholder="https://chat.googleapis.com/v1/spaces/..."
                                       style="padding-right: 120px;">
                                <div id="webhookUrlMasked" class="text-muted" style="
                                    position: absolute;
                                    right: 12px;
                                    top: 50%;
                                    transform: translateY(-50%);
                                    font-size: 12px;
                                    background: #f0f0f1;
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    display: none;
                                "></div>
                            </div>
                            <div class="form-help text-muted" style="font-size: 12px; margin-top: 4px;">
                                Format: https://chat.googleapis.com/v1/spaces/...?key=...&token=...
                            </div>
                        </div>

                        <!-- Webhook Actions -->
                        <div class="form-group mb-md" id="webhookActions" style="display: none;">
                            <div style="display: flex; gap: 8px;">
                                <button type="button" id="replaceWebhookBtn" class="btn btn-sm" style="background: white; border: 1px solid #c3c4c7;">
                                    <i class="fa-solid fa-rotate"></i> Replace
                                </button>
                                <button type="button" id="clearWebhookBtn" class="btn btn-sm" style="background: #fef7f7; border: 1px solid #dc3232; color: #dc3232;">
                                    <i class="fa-solid fa-trash"></i> Clear
                                </button>
                            </div>
                        </div>

                        <!-- Repeat Interval -->
                        <div class="form-group mb-md">
                            <label class="form-label" style="font-weight: 600;">
                                <i class="fa-solid fa-clock"></i> Alert Repeat Interval (minutes)
                            </label>
                            <input type="number" id="repeatIntervalInput" class="form-input w-full"
                                   min="1" max="10080" value="5"
                                   placeholder="5 = repeat every 5 minutes, max 10080 (1 week)">
                            <div class="form-help text-muted" style="font-size: 12px; margin-top: 4px;">
                                How often to repeat alerts while the issue persists. Minimum 1 minute, maximum 10080 (1 week).
                            </div>
                        </div>

                        <!-- Last Updated -->
                        <div class="form-group mb-lg">
                            <div id="lastUpdatedInfo" class="text-muted" style="font-size: 13px;">
                                <i class="fa-solid fa-info-circle"></i> Not configured yet
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                            <button type="button" id="saveSettingsBtn" class="btn btn-primary">
                                <i class="fa-solid fa-save"></i> Save Settings
                            </button>
                            <button type="button" id="testMessageBtn" class="btn" style="background: white; border: 1px solid #2271b1; color: #2271b1;">
                                <i class="fa-solid fa-paper-plane"></i> Send Test Message
                            </button>
                        </div>
                    </form>

                    <!-- Test Result -->
                    <div id="testResult" style="margin-top: 16px; padding: 12px; border-radius: 4px; display: none;"></div>
                </div>
            </div>
        `;
    }

    async loadNotifications() {
        try {
            const res = await API.getNotifications();
            if (res.status === 'success') {
                this.notifications = res.data || [];

                // Bulletproof unread calculation
                const unreadCount = this.notifications.filter(n => !(String(n.is_read) === "1" || n.is_read === true)).length;
                this.app.sidebar.updateBadgeCount(unreadCount);

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
        const badgeUnread = document.getElementById('badgeUnread');

        if (!listEl) return;

        const isArchivedTab = this.currentSubTab === 'archived';

        // Filter list based on selected tab with strict type checking
        const displayList = this.notifications.filter(n => {
            const isRead = (String(n.is_read) === "1" || n.is_read === true);
            return isArchivedTab ? isRead : !isRead;
        });

        // Update the New tab badge
        const unreadCount = this.notifications.filter(n => !(String(n.is_read) === "1" || n.is_read === true)).length;
        if (badgeUnread) badgeUnread.innerText = unreadCount;

        if (displayList.length === 0) {
            btnAll.style.display = 'none';
            const emptyMessage = isArchivedTab ? "No archived messages." : "You're all caught up!";
            const emptySubMessage = isArchivedTab ? "Read notifications will appear here." : "There are no new notifications to review.";
            const emptyIcon = isArchivedTab ? "fa-folder-open" : "fa-bell-slash";

            listEl.innerHTML = `
                <div class="p-xl text-center text-muted" style="margin-top: 40px;">
                    <i class="fa-regular ${emptyIcon} text-5xl mb-md" style="opacity: 0.2; display:block;"></i>
                    <p class="text-lg font-semibold text-neutral-800">${emptyMessage}</p>
                    <p class="text-sm mt-xs">${emptySubMessage}</p>
                </div>
            `;
            return;
        }

        // Only show "Mark All Read" on the Unread tab
        btnAll.style.display = isArchivedTab ? 'none' : 'inline-flex';

        listEl.innerHTML = displayList.map(n => this._buildNotificationItem(n)).join('');

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

        // Strict read check
        const isRead = (String(n.is_read) === "1" || n.is_read === true);

        let icon = '<i class="fa-solid fa-bell text-primary"></i>';
        let bgStyle = 'background: var(--primary-50); color: var(--primary-700);';

        if (n.type === 'transfer_pending') {
            icon = '<i class="fa-solid fa-clock-rotate-left"></i>';
            bgStyle = 'background: var(--warning-50, #fffde7); color: var(--warning-700, #fbc02d); border: 1px solid var(--warning-500, #ffd600)';
        } else if (n.type === 'transfer_approved') {
            icon = '<i class="fa-solid fa-check-double"></i>';
            bgStyle = 'background: var(--success-50, #f0fdf4); color: var(--success-700, #15803d); border: 1px solid #bbf7d0';
        } else if (n.type === 'transfer_rejected' || n.type === 'transfer_request_rejected') {
            icon = '<i class="fa-solid fa-xmark"></i>';
            bgStyle = 'background: var(--error-50, #fef2f2); color: var(--error-700, #b71c1c); border: 1px solid #fecaca';
        } else if (n.type === 'transfer_reverted' || n.type === 'transfer_canceled' || n.type === 'transfer_request_canceled') {
            icon = '<i class="fa-solid fa-rotate-left"></i>';
            bgStyle = 'background: var(--neutral-100, #f3f4f6); color: var(--neutral-600, #4b5563); border: 1px solid #e5e7eb';
        } else if (n.type === 'transfer_request') {
            icon = '<i class="fa-solid fa-hand-holding-hand"></i>';
            bgStyle = 'background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;';
        }

        const circleStyle = `width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; ${bgStyle}`;

        // Faded styling for archived items
        const itemOpacity = isRead ? 'opacity: 0.65; filter: grayscale(30%);' : '';

        // Only render checkmark if unread
        const checkmarkHtml = isRead ? '' : `
            <div class="flex items-center gap-sm ml-md pl-sm" style="border-left: 1px solid var(--neutral-100);">
                <button class="btn btn-ghost btn-mark-read text-muted hover:text-primary" data-id="${n.id}" title="Mark as Read" style="padding: 8px;">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        `;

        return `
            <div class="flex items-start gap-md p-md border-b border-neutral-100 hover:bg-neutral-50 transition-colors" data-id="${n.id}" style="${itemOpacity}">
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
                ${checkmarkHtml}
            </div>
        `;
    }

    async markAsRead(id) {
        try {
            const res = await API.markNotificationRead(id);
            if (res.status === 'success') {
                // Flag as read instead of deleting
                this.notifications = this.notifications.map(n => {
                    if (String(n.id) === String(id)) n.is_read = 1;
                    return n;
                });

                const unreadCount = this.notifications.filter(n => !(String(n.is_read) === "1" || n.is_read === true)).length;
                this.app.sidebar.updateBadgeCount(unreadCount);
                this._renderList();
            } else {
                Toast.error(res.message || "Failed to mark as read");
            }
        } catch (e) {
            Toast.error("An error occurred connecting to the server");
        }
    }

    _attachEvents() {
        // Main Tab Switching (Notifications / Alert Settings) - only if admin
        const mainTabButtons = document.querySelectorAll('.main-tab-btn');
        if (mainTabButtons.length > 0) {
            mainTabButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault(); // Prevent any default button behavior
                    const mainTab = btn.dataset.mainTab;
                    this.currentMainTab = mainTab;

                    // Update main tab styles
                    document.querySelectorAll('.main-tab-btn').forEach(b => {
                        if (b === btn) {
                            b.style.cssText = 'padding: 0.75rem 1.5rem; border: none; background: transparent; cursor: pointer; font-weight: 500; color: var(--primary-600); border-bottom: 2px solid var(--primary-600); margin-bottom: -2px;';
                        } else {
                            b.style.cssText = 'padding: 0.75rem 1.5rem; border: none; background: transparent; cursor: pointer; font-weight: 500; color: var(--neutral-600); border-bottom: 2px solid transparent; margin-bottom: -2px;';
                        }
                    });

                    // Show/hide panels
                    document.getElementById('panelNotifications').style.display = mainTab === 'notifications' ? 'block' : 'none';
                    document.getElementById('panelAlerts').style.display = mainTab === 'alerts' ? 'block' : 'none';

                    // Render alerts content if switching to alerts tab
                    if (mainTab === 'alerts') {
                        const panelAlerts = document.getElementById('panelAlerts');
                        // Only re-render if it's empty or doesn't have the form yet
                        if (!panelAlerts.querySelector('#alertSettingsForm')) {
                            panelAlerts.innerHTML = this._alertsSettingsHTML();
                            this._attachAlertSettingsEvents();
                            this._loadAlertSettings();
                        } else {
                            // Always re-attach events even if form exists
                            this._attachAlertSettingsEvents();
                            this._loadAlertSettings();
                        }
                    }
                });
            });

            // Initialize main tab styles
            this._updateMainTabStyles();
        } else {
            // If no main tabs (non-admin), still initialize sub tabs
            this._updateSubTabStyles();
        }

        // Sub Tab Switching (Unread / Archived) - only for notifications
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent any default button behavior
                const subTab = btn.dataset.subTab;
                this.currentSubTab = subTab;

                // Update sub tab styles
                document.querySelectorAll('.sub-tab-btn').forEach(b => {
                    if (b === btn) {
                        b.style.cssText = 'padding: 8px 16px; border: none; background: none; border-bottom: 2px solid var(--primary-500); color: var(--primary-500); font-weight: 600; cursor: pointer;';
                    } else {
                        b.style.cssText = 'padding: 8px 16px; border: none; background: none; border-bottom: 2px solid transparent; color: var(--neutral-600); font-weight: 600; cursor: pointer;';
                    }
                });

                this._renderList();
            });
        });

        // Initialize sub tab styles
        this._updateSubTabStyles();

        const btnAll = document.getElementById('btnMarkAllRead');
        if (btnAll) {
            btnAll.addEventListener('click', async () => {
                try {
                    btnAll.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
                    btnAll.disabled = true;

                    const res = await API.markAllNotificationsRead();
                    if (res.status === 'success') {
                        // Flag all as read instead of clearing array
                        this.notifications = this.notifications.map(n => {
                            n.is_read = 1;
                            return n;
                        });

                        this.app.sidebar.updateBadgeCount(0);
                        this._renderList();
                        Toast.success("All notifications marked as read");
                    } else {
                        Toast.error(res.message);
                    }
                } catch (e) {
                    Toast.error("An error occurred connecting to the server");
                } finally {
                    btnAll.disabled = false;
                    btnAll.innerHTML = '<i class="fa-solid fa-check-double"></i> Mark All Read';
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

    _updateMainTabStyles() {
        const mainTabButtons = document.querySelectorAll('.main-tab-btn');
        if (mainTabButtons.length === 0) return; // No tabs to style (non-admin)
        
        mainTabButtons.forEach(btn => {
            const isActive = btn.dataset.mainTab === this.currentMainTab;
            if (isActive) {
                btn.style.cssText = 'padding: 0.75rem 1.5rem; border: none; background: transparent; cursor: pointer; font-weight: 500; color: var(--primary-600); border-bottom: 2px solid var(--primary-600); margin-bottom: -2px;';
            } else {
                btn.style.cssText = 'padding: 0.75rem 1.5rem; border: none; background: transparent; cursor: pointer; font-weight: 500; color: var(--neutral-600); border-bottom: 2px solid transparent; margin-bottom: -2px;';
            }
        });
    }

    _updateSubTabStyles() {
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            const isActive = btn.dataset.subTab === this.currentSubTab;
            if (isActive) {
                btn.style.cssText = 'padding: 8px 16px; border: none; background: none; border-bottom: 2px solid var(--primary-500); color: var(--primary-500); font-weight: 600; cursor: pointer;';
            } else {
                btn.style.cssText = 'padding: 8px 16px; border: none; background: none; border-bottom: 2px solid transparent; color: var(--neutral-600); font-weight: 600; cursor: pointer;';
            }
        });
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

    // Alert Settings Methods
    async _loadAlertSettings() {
        const enableToggle = document.getElementById('enableAlertsToggle');
        const webhookUrlInput = document.getElementById('webhookUrlInput');
        const webhookUrlMasked = document.getElementById('webhookUrlMasked');
        const webhookActions = document.getElementById('webhookActions');
        const repeatIntervalInput = document.getElementById('repeatIntervalInput');
        const lastUpdatedInfo = document.getElementById('lastUpdatedInfo');
        const saveBtn = document.getElementById('saveSettingsBtn');

        if (!enableToggle) return;

        this.alertSettings.isLoading = true;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        try {
            const res = await API.getAlertSettings();

            if (res.status === 'success') {
                enableToggle.checked = res.enabled;
                repeatIntervalInput.value = res.alert_repeat_minutes || 0;

                if (res.has_webhook && res.webhook_masked) {
                    webhookUrlInput.style.display = 'none';
                    webhookUrlMasked.style.display = 'block';
                    webhookUrlMasked.textContent = res.webhook_masked;
                    webhookActions.style.display = 'block';
                } else {
                    webhookUrlInput.style.display = 'block';
                    webhookUrlMasked.style.display = 'none';
                    webhookActions.style.display = 'none';
                }

                if (res.updated_at) {
                    lastUpdatedInfo.innerHTML = `
                        <i class="fa-solid fa-clock"></i> Last updated: ${new Date(res.updated_at).toLocaleString()}
                    `;
                }

                this._updateEnableStatusText();
            } else {
                Toast.error(res.message || 'Failed to load alert settings');
            }
        } catch (err) {
            console.error('Failed to load alert settings:', err);
            Toast.error('Failed to load alert settings');
        } finally {
            this.alertSettings.isLoading = false;
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Settings';
        }
    }

    _updateEnableStatusText() {
        const enableToggle = document.getElementById('enableAlertsToggle');
        const statusText = document.getElementById('enableStatusText');
        if (!enableToggle || !statusText) return;

        if (enableToggle.checked) {
            statusText.textContent = 'Alerts are enabled';
            statusText.style.color = 'var(--success-600)';
        } else {
            statusText.textContent = 'Alerts are disabled';
            statusText.style.color = 'var(--neutral-600)';
        }
    }

    _attachAlertSettingsEvents() {
        const enableToggle = document.getElementById('enableAlertsToggle');
        const webhookUrlInput = document.getElementById('webhookUrlInput');
        const webhookUrlMasked = document.getElementById('webhookUrlMasked');
        const webhookActions = document.getElementById('webhookActions');
        const repeatIntervalInput = document.getElementById('repeatIntervalInput');
        const saveBtn = document.getElementById('saveSettingsBtn');
        const testBtn = document.getElementById('testMessageBtn');
        const replaceWebhookBtn = document.getElementById('replaceWebhookBtn');
        const clearWebhookBtn = document.getElementById('clearWebhookBtn');
        const testResult = document.getElementById('testResult');
        const form = document.getElementById('alertSettingsForm');

        if (!form) {
            return;
        }

        // Enable toggle change
        enableToggle?.addEventListener('change', () => {
            this._updateEnableStatusText();
        });

        // Replace webhook button
        replaceWebhookBtn?.addEventListener('click', () => {
            webhookUrlInput.style.display = 'block';
            webhookUrlInput.value = '';
            webhookUrlInput.focus();
            webhookUrlMasked.style.display = 'none';
            webhookActions.style.display = 'none';
        });

        // Clear webhook button
        clearWebhookBtn?.addEventListener('click', () => {
            webhookUrlInput.style.display = 'block';
            webhookUrlInput.value = '';
            webhookUrlMasked.style.display = 'none';
            webhookActions.style.display = 'none';
            Toast.info('Webhook will be cleared when you save');
        });

        // Save Settings button (changed from form submit to button click)
        if (saveBtn) {
            saveBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this._saveAlertSettings();
            });
        } else {
            Toast.error('Save button not found - please refresh the page');
        }

        // Test message button
        if (testBtn) {
            testBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this._sendTestAlertMessage();
            });
        }
    }

    async _saveAlertSettings() {
        if (this.alertSettings.isLoading) {
            return;
        }

        const enableToggle = document.getElementById('enableAlertsToggle');
        const webhookUrlInput = document.getElementById('webhookUrlInput');
        const webhookUrlMasked = document.getElementById('webhookUrlMasked');
        const webhookActions = document.getElementById('webhookActions');
        const repeatIntervalInput = document.getElementById('repeatIntervalInput');
        const saveBtn = document.getElementById('saveSettingsBtn');

        // Client-side validation
        const enabled = enableToggle?.checked ?? false;
        const webhookUrl = webhookUrlInput?.value.trim() ?? '';
        const repeatMinutes = parseInt(repeatIntervalInput?.value) || 0;

        // Validation 1: Cannot enable without webhook
        if (enabled && !webhookUrl && webhookUrlMasked?.style.display === 'none') {
            Toast.error('Cannot enable alerts without a webhook URL');
            return;
        }

        // Validation 2: Webhook URL format
        if (webhookUrl && !this._validateWebhookUrl(webhookUrl)) {
            Toast.error('Invalid webhook URL. Must be https://chat.googleapis.com/v1/spaces/... with key and token parameters');
            return;
        }

        // Validation 3: Repeat interval range
        if (isNaN(repeatMinutes) || repeatMinutes < 1 || repeatMinutes > 10080) {
            Toast.error('Repeat interval must be between 1 and 10080 minutes (1 week)');
            return;
        }

        // Validation 4: Webhook URL length
        if (webhookUrl && webhookUrl.length > 2048) {
            Toast.error('Webhook URL is too long (max 2048 characters)');
            return;
        }

        this.alertSettings.isLoading = true;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            const data = {
                enabled: enabled,
                alert_repeat_minutes: repeatMinutes
            };

            // Only include webhook_url if the input is visible and has a value
            if (webhookUrlInput.style.display !== 'none' && webhookUrl) {
                data.webhook_url = webhookUrl;
            }

            // If clear button was clicked (input is visible but empty), clear the webhook
            if (webhookUrlInput.style.display !== 'none' && !webhookUrl && webhookActions.style.display === 'none') {
                data.clear_webhook = true;
            }

            const res = await API.updateAlertSettings(data);

            if (res.status === 'success') {
                Toast.success('Alert settings saved successfully');
                await this._loadAlertSettings();
            } else {
                Toast.error(res.message || 'Failed to save settings');
            }
        } catch (err) {
            console.error('Failed to save alert settings:', err);
            Toast.error('Failed to save settings: ' + (err.message || 'Network error'));
        } finally {
            this.alertSettings.isLoading = false;
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Settings';
        }
    }

    async _sendTestAlertMessage() {
        if (this.alertSettings.isTesting) return;

        const webhookUrlInput = document.getElementById('webhookUrlInput');
        const testBtn = document.getElementById('testMessageBtn');
        const testResult = document.getElementById('testResult');

        this.alertSettings.isTesting = true;
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        testResult.style.display = 'none';

        try {
            const webhookUrl = webhookUrlInput.value.trim() || null;

            const res = await API.testAlertMessage({ webhook_url: webhookUrl });

            testResult.style.display = 'block';

            if (res.ok) {
                testResult.style.background = '#d4edda';
                testResult.style.border = '1px solid #c3e6cb';
                testResult.style.color = '#155724';
                testResult.innerHTML = `
                    <strong><i class="fa-solid fa-check-circle"></i> Test Successful</strong><br>
                    HTTP Status: ${res.http_status}<br>
                    <small>Check your Google Chat space for the test message.</small>
                `;
                Toast.success('Test message sent successfully');
            } else {
                testResult.style.background = '#f8d7da';
                testResult.style.border = '1px solid #f5c6cb';
                testResult.style.color = '#721c24';
                testResult.innerHTML = `
                    <strong><i class="fa-solid fa-exclamation-circle"></i> Test Failed</strong><br>
                    HTTP Status: ${res.http_status}<br>
                    Error: ${res.error_summary || 'Unknown error'}
                `;
                Toast.error('Test message failed');
            }
        } catch (err) {
            console.error('Failed to send test message:', err);
            testResult.style.display = 'block';
            testResult.style.background = '#f8d7da';
            testResult.style.border = '1px solid #f5c6cb';
            testResult.style.color = '#721c24';
            testResult.innerHTML = `
                <strong><i class="fa-solid fa-exclamation-circle"></i> Test Failed</strong><br>
                Error: ${err.message || 'Network error'}
            `;
            Toast.error('Failed to send test message');
        } finally {
            this.alertSettings.isTesting = false;
            testBtn.disabled = false;
            testBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test Message';
        }
    }

    _validateWebhookUrl(url) {
        try {
            const parsed = new URL(url);

            if (parsed.protocol !== 'https:') {
                return false;
            }

            if (parsed.hostname !== 'chat.googleapis.com') {
                return false;
            }

            if (!parsed.pathname.startsWith('/v1/spaces/')) {
                return false;
            }

            const params = new URLSearchParams(parsed.search);
            if (!params.has('key') || !params.has('token')) {
                return false;
            }

            if (url.length > 2048) {
                return false;
            }

            return true;
        } catch (e) {
            return false;
        }
    }
}

module.exports = NotsView;