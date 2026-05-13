const {ipcRenderer} = require('electron');
const path = require('path');
const API = require('./api.js');
const pkg = require('../../../package.json');

class NotificationManager {
    constructor(sidebarInstance) {
        this.sidebar = sidebarInstance;
        this.pollingInterval = null;
        this.lastNotificationCount = 0;
        this.isFirstLoad = true;
        this.seenNotificationIds = new Set();

        this.soundEnabled = localStorage.getItem('sound_enabled') !== 'false';
        this.selectedSound = localStorage.getItem('notification_sound') || 'message_notification.mp3';
    }

    startPolling(intervalMs = 30000) {
        this.fetchNotifications();
        this.pollingInterval = setInterval(() => this.fetchNotifications(), intervalMs);
    }

    stopPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
    }

    async fetchNotifications() {
        try {
            const res = await API.getNotifications();
            if (res.status === 'success') {
                const unreadItems = res.data
                    ? res.data.filter(n => n.is_read == 0 || n.is_read === false)
                    : [];
                const newCount = unreadItems.length;

                this.sidebar.updateBadgeCount(newCount);

                if (this.isFirstLoad) {
                    // Store all known IDs on startup
                    this.seenNotificationIds = new Set(res.data.map(n => String(n.id)));
                    this.lastNotificationCount = newCount;
                    this.isFirstLoad = false;

                    // Alert on startup if there are already unread notifications
                    if (newCount > 0) {
                        this.triggerAlert(unreadItems[0]);
                    }
                    return;
                }

                // Find truly NEW notifications (IDs we haven't seen before)
                const newUnread = unreadItems.filter(n => !this.seenNotificationIds.has(String(n.id)));

                if (newUnread.length > 0) {
                    this.triggerAlert(newUnread[0]);
                    // Mark these IDs as seen
                    newUnread.forEach(n => this.seenNotificationIds.add(String(n.id)));
                }

                this.lastNotificationCount = newCount;
            }
        } catch (e) {
            console.error("Failed to fetch notifications in background", e);
        }
    }

    triggerAlert(latestNotification) {
        // 1. Play Sound
        if (this.soundEnabled) {
            const audio = new Audio(`src/assets/sounds/${this.selectedSound}`);
            audio.play().catch(err => console.warn("Audio play blocked:", err));
        }

        // 2. Fire OS notification via Main Process (bypasses .asar limits)
        const title = pkg.productName || 'Faranux MIS';
        const body = latestNotification?.formatted_message || "You have new notifications.";

        ipcRenderer.send('show-os-notification', {title, body});
    }

    setSoundPreference(fileName) {
        this.selectedSound = fileName;
        localStorage.setItem('notification_sound', fileName);
        new Audio(`src/assets/sounds/${fileName}`).play();
    }
}

module.exports = NotificationManager;