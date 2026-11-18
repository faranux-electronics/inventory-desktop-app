const API = require('../../services/api.js');
const PageHeader = require('../../components/PageHeader.js');
const Input = require('../../components/Input.js');
const Button = require('../../components/Button.js');
const Select = require('../../components/Select.js');
const FilterBar = require('../../components/FilterBar.js');

class LogsView {
    constructor(app) {
        this.app = app;
        this.page = 1;
        this.searchQuery = '';
        this.filters = {category: '', level: '', startDate: '', endDate: ''};
        this.isLoading = false;
        this.hasMore = true;
        this.currentUser = JSON.parse(localStorage.getItem('faranux_user')) || {};
    }

    async render() {
        const content = document.getElementById('content');
        content.dataset.view = 'logs';

        content.innerHTML = `
            ${PageHeader.html({
                title: 'System Logs',
                icon: 'fa-solid fa-terminal',
                subtitle: 'Audit trail & system activity',
                actions: Input.html({type: 'search', id: 'logSearch', placeholder: 'Search actions, details, categories...', value: this.searchQuery, ariaLabel: 'Search system logs', className: 'logs-search-input'}),
                className: 'page-header-surface logs-page-header'
            })}

            <div class="logs-container">
                ${FilterBar.html({className: 'logs-filters', ariaLabel: 'Filter system logs', content: `
                    ${Select.html({id: 'logCategoryFilter', ariaLabel: 'Filter by category', value: this.filters.category, className: 'logs-filter-control', options: [{value: '', label: 'All categories'}, ...['AUTH', 'USER', 'INVENTORY', 'TRANSFER', 'ORDER', 'SYSTEM', 'ALERT'].map(category => ({value: category, label: category}))]})}
                    ${Select.html({id: 'logLevelFilter', ariaLabel: 'Filter by severity', value: this.filters.level, className: 'logs-filter-control', options: [{value: '', label: 'All levels'}, ...['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map(level => ({value: level, label: level}))]})}
                    ${Input.html({type: 'date', id: 'logStartDate', value: this.filters.startDate, ariaLabel: 'Start date', className: 'logs-filter-control'})}
                    ${Input.html({type: 'date', id: 'logEndDate', value: this.filters.endDate, ariaLabel: 'End date', className: 'logs-filter-control'})}
                    <div class="logs-filter-actions">
                        ${Button.html({text: 'Apply', id: 'applyLogFiltersBtn', variant: 'primary', size: 'md'})}
                        ${Button.html({text: 'Clear', id: 'clearLogFiltersBtn', variant: 'outline', size: 'md'})}
                    </div>
                `})}
                <div id="logsChatArea" class="logs-chat-area">
                    </div>

                <div class="logs-footer">
                    ${Button.html({text: 'Load Older Logs', icon: 'fa-solid fa-clock-rotate-left', id: 'loadMoreLogsBtn', variant: 'secondary', className: 'logs-load-more-btn'})}
                </div>
            </div>
        `;

        await this.init();
    }

    async init() {
        this.chatArea = document.getElementById('logsChatArea');
        this.searchInput = document.getElementById('logSearch');
        this.loadMoreBtn = document.getElementById('loadMoreLogsBtn');
        this.categoryFilter = document.getElementById('logCategoryFilter');
        this.levelFilter = document.getElementById('logLevelFilter');
        this.startDateFilter = document.getElementById('logStartDate');
        this.endDateFilter = document.getElementById('logEndDate');
        this.loadMoreBtn.style.display = 'none';

        this.searchDebounce = null;
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounce);
            this.searchDebounce = setTimeout(() => {
                this.searchQuery = e.target.value;
                this.page = 1;
                this.hasMore = true;
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

        document.getElementById('applyLogFiltersBtn').addEventListener('click', () => this.applyFilters());
        document.getElementById('clearLogFiltersBtn').addEventListener('click', () => this.clearFilters());

        await this.loadLogs();
    }

    applyFilters() {
        clearTimeout(this.searchDebounce);
        this.searchQuery = this.searchInput.value.trim();
        this.filters = {
            category: this.categoryFilter.value,
            level: this.levelFilter.value,
            startDate: this.startDateFilter.value,
            endDate: this.endDateFilter.value
        };
        this.page = 1;
        this.hasMore = true;
        this.chatArea.innerHTML = '';
        return this.loadLogs();
    }

    clearFilters() {
        clearTimeout(this.searchDebounce);
        this.categoryFilter.value = '';
        this.levelFilter.value = '';
        this.startDateFilter.value = '';
        this.endDateFilter.value = '';
        this.searchQuery = '';
        this.searchInput.value = '';
        this.page = 1;
        this.hasMore = true;
        this.filters = {category: '', level: '', startDate: '', endDate: ''};
        this.chatArea.innerHTML = '';
        return this.loadLogs();
    }

    async loadLogs(append = false) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.loadMoreBtn.disabled = true;
        this.loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        try {
            const res = await API.getAuditLogs(this.searchQuery, this.page, this.filters.startDate, this.filters.endDate, this.filters.category, this.filters.level);

            if (res.status === 'success') {
                // FIX: Grab data and pagination directly from the root response object
                const logs = res.data;
                this.hasMore = this.page < res.pagination.pages;

                this.renderChatBubbles(logs, append);

                this.loadMoreBtn.style.display = this.hasMore ? 'inline-flex' : 'none';
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
