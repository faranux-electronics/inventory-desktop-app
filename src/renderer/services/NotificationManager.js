const {ipcRenderer} = require('electron');
const API = require('./api.js');

class NotificationManager {
    constructor(sidebarInstance) {
        this.sidebar = sidebarInstance;
        this.pollingInterval = null;
        this.lastNotificationCount = 0;

        // Default sound setting
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
                const newCount = res.unread_count || 0;

                // Update the sidebar badge visually
                this.sidebar.updateBadgeCount(newCount);

                // If count went up, we have new notifications! Alert the user.
                if (newCount > this.lastNotificationCount) {
                    this.triggerAlert(res.data[0]);
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
            audio.play().catch(err => console.warn("Audio play blocked by browser:", err));
        }

        // 2. Trigger OS Desktop Notification
        const title = "Faranux MIS";
        const body = latestNotification ? latestNotification.formatted_message : "You have new notifications.";

        const myNotification = new window.Notification(title, {
            body: body,
            icon: 'src/assets/logo1.png' // Make sure path matches your build
        });

        // Tell main process to show window when notification is clicked
        myNotification.onclick = () => {
            ipcRenderer.send('show-window');
        };
    }

    setSoundPreference(fileName) {
        this.selectedSound = fileName;
        localStorage.setItem('notification_sound', fileName);
        new Audio(`src/assets/sounds/${fileName}`).play();
    }
}

module.exports = NotificationManager;