const API = require('../../services/api.js');

class LogsView {
    constructor(app) {
        this.app = app;
        this.page = 1;
        this.searchQuery = '';
        this.isLoading = false;
        this.hasMore = true;
        this.currentUser = JSON.parse(localStorage.getItem('faranux_user')) || {};
    }

    async render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="logs-container">
                <div class="logs-header">
                    <div class="logs-title-wrap">
                        <h2 class="logs-title"><i class="fa-solid fa-terminal"></i> System Logs</h2>
                        <span class="logs-subtitle">Audit trail & system activity</span>
                    </div>
                    <div>
                        <input type="text" id="logSearch" placeholder="Search Actions (e.g. LOGIN)..." class="logs-search-input">
                    </div>
                </div>

                <div id="logsChatArea" class="logs-chat-area">
                    </div>

                <div class="logs-footer">
                    <button id="loadMoreLogsBtn" class="btn btn-secondary" style="display: none;">
                        <i class="fa-solid fa-clock-rotate-left"></i> Load Older Logs
                    </button>
                </div>
            </div>
        `;

        await this.init();
    }

    async init() {
        this.chatArea = document.getElementById('logsChatArea');
        this.searchInput = document.getElementById('logSearch');
        this.loadMoreBtn = document.getElementById('loadMoreLogsBtn');

        let searchTimeout;
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value;
                this.page = 1;
                this.chatArea.innerHTML = '';
                this.loadLogs();
            }, 500);
        });

        this.loadMoreBtn.addEventListener('click', () => {
            if (!this.isLoading && this.hasMore) {
                this.page++;
                this.loadLogs(true);
            }
        });

        await this.loadLogs();
    }

    async loadLogs(append = false) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.loadMoreBtn.disabled = true;
        this.loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        try {
            const res = await API.getAuditLogs(this.searchQuery, this.page);

            if (res.status === 'success') {
                // FIX: Grab data and pagination directly from the root response object
                const logs = res.data;
                this.hasMore = this.page < res.pagination.pages;

                this.renderChatBubbles(logs, append);

                this.loadMoreBtn.style.display = this.hasMore ? 'inline-block' : 'none';
            }
        } catch (err) {
            console.error("Failed to load logs", err);
        } finally {
            this.isLoading = false;
            this.loadMoreBtn.disabled = false;
            this.loadMoreBtn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Load Older Logs';
        }
    }

    renderChatBubbles(logs, append) {
        let html = '';

        logs.forEach(log => {
            const isMe = log.user_id === this.currentUser.id;
            const isSystem = !log.user_id || log.user_name === 'System Account (SYS)';

            // Map severity to standard CSS variables
            let levelColor = 'var(--info-500)';
            if (log.level === 'WARNING') levelColor = 'var(--warning-500)';
            if (log.level === 'ERROR' || log.level === 'CRITICAL') levelColor = 'var(--error-500)';

            const alignmentClass = isMe ? 'is-me' : 'is-other';
            const avatarIcon = isSystem ? 'fa-robot' : 'fa-user';
            const displayName = isSystem ? 'System' : (log.user_name || 'Unknown User');

            html += `
                <div class="log-entry ${alignmentClass}">
                    <div class="log-meta">
                        <i class="fa-solid ${avatarIcon}"></i> 
                        ${displayName} • ${new Date(log.created_at).toLocaleString()}
                    </div>
                    
                    <div class="log-bubble">
                        <div class="log-action-row">
                            <span class="log-category-badge" style="background: ${levelColor};">
                                ${log.category}
                            </span>
                            <strong class="log-action-text">${log.action}</strong>
                        </div>
                        
                        <div class="log-details">
                            ${log.details ? log.details : '<i>No additional details</i>'}
                        </div>
                        
                        ${log.ip_address && log.ip_address !== 'unknown' ? `
                            <div class="log-ip">
                                IP: ${log.ip_address}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        if (append) {
            this.chatArea.insertAdjacentHTML('beforeend', html);
        } else {
            this.chatArea.innerHTML = html;
        }
    }
}

module.exports = LogsView;