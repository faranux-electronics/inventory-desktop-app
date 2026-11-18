const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('./helpers.js');
const PageHeader = require('../../components/PageHeader.js');
const Button = require('../../components/Button.js');
const Tabs = require('../../components/Tabs.js');

class MpsView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.tab = 'summary';
        this.pricingPage = 1;
        this.pricingPerPage = 25;
        this.pricingExchangeRate = null;
        this.pricingExchangeRatePromise = null;
        this.pricingStatus = 'all';
        this.pricingProfit = 'all';
        this.pricingFilterTimer = null;
        this.pricingRequestToken = 0;
        this.pricingSortBy = 'sku';
        this.pricingSortOrder = 'ASC';
        this.ordersPage = 1;
        this.ordersPerPage = 25;
        this.ordersSearch = '';
        this.ordersSearchTimer = null;
        this.ordersRequestToken = 0;
        this.ordersTrashView = false;
        this.ordersSortBy = 'reference';
        this.ordersSortOrder = 'ASC';
        this.calendarMonth = today().slice(0, 7);
        this.calendarDate = today();
        this.calendarView = 'month';
        this.calendarRequestToken = 0;
        this.calendarAvailabilityToken = 0;
        this.sortBy = 'order_by_date';
        this.sortOrder = 'ASC';
        this.page = 1;
        this.perPage = 25;
        this.filters = {
            search: '',
            status: '',
            category: '',
            supplier: '',
            stockout_date: '',
            order_by_date: '',
            max_days_of_cover: '',
            estimated_only: false,
            deviation: ''
        };
        this.isWriter = ['admin', 'manager', 'supply_chain_manager'].includes(this.state.getUser()?.role);
        this.abortController = null;
        this.resultsAbortController = null;
        this.summaryAbortController = null;
        this.exportAbortController = null;
        this.debounceTimer = null;
        this.requestToken = 0;
        this.resultsRequestToken = 0;
        this.summaryRequestToken = 0;
        this.suppliersList = [];
        this.categoriesList = [];
        this._hasLoadedPlanning = false;
        this.summaryPageCap = 0;
        this.summaryPerPage = 200;
        this.salesTrackerTimer = null;
        this.salesTrackerToken = 0;
    }

    cancelSalesRefreshTracker() {
        clearTimeout(this.salesTrackerTimer);
        this.salesTrackerTimer = null;
        this.salesTrackerToken++;
    }

    cancelInFlight() {
        clearTimeout(this.debounceTimer);
        clearTimeout(this.ordersSearchTimer);
        clearTimeout(this.pricingFilterTimer);
        this.pricingRequestToken++;
        this.ordersRequestToken++;
        this.debounceTimer = null;
        this.cancelSalesRefreshTracker();
        this.abortController?.abort();
        this.resultsAbortController?.abort();
        this.summaryAbortController?.abort();
        this.exportAbortController?.abort();
        this.abortController = this.resultsAbortController = this.summaryAbortController = this.exportAbortController = null;
        this.requestToken++;
        this.resultsRequestToken++;
        this.summaryRequestToken++;
        this.calendarRequestToken++;
    }

    activateTab(name) {
        this.tab = name;
        document.querySelectorAll('.mps-tabs button').forEach(tab => {
            const active = tab.dataset.tab === name;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
    }

    render() {
        this.isWriter = ['admin', 'manager', 'supply_chain_manager'].includes(this.state.getUser()?.role);
        const content = document.getElementById('content');
        const user = this.state.getUser();
        const canRestore = this._suspendedContent
            && this._suspendedUserId === user?.id
            && this._suspendedRole === user?.role;
        if (canRestore && content) {
            content.dataset.view = 'mps';
            content.replaceChildren(this._suspendedContent);
            this._suspendedContent = null;
            this._suspendedUserId = null;
            this._suspendedRole = null;
            const panel = document.getElementById('mpsPanel');
            if (panel?.querySelector('.mps-loading, [aria-busy="true"]')) this.loadTab();
            return;
        }
        this._suspendedContent = null;
        this._suspendedUserId = null;
        this._suspendedRole = null;
        content.dataset.view = 'mps';
        this.cancelInFlight();
        this._hasLoadedPlanning = false;
        const actions = [
            this.isWriter ? Button.html({id: 'mpsRefreshSales', text: 'Refresh sales', icon: 'fa-solid fa-rotate', variant: 'outline', size: 'md', ariaLabel: 'Refresh sales data'}) : '',
            this.isWriter ? Button.html({id: 'mpsRun', text: 'Run planner', icon: 'fa-solid fa-play', variant: 'primary', size: 'md', ariaLabel: 'Run MPS planner'}) : ''
        ].join('');
        const tabs = Tabs.html({className: 'mps-tabs', activeId: 'summary', tabs: [
            {key: 'summary', label: 'Summary', role: 'tab', ariaControls: 'mpsPanel'},
            {key: 'planning', label: 'Planning', role: 'tab', ariaControls: 'mpsPanel'},
            {key: 'calendar', label: 'Calendar', role: 'tab', ariaControls: 'mpsPanel', className: 'mps-calendar-tab', hidden: true},
            {key: 'pricing', label: 'Part pricing', role: 'tab', ariaControls: 'mpsPanel'},
            {key: 'orders', label: 'Purchase orders', role: 'tab', ariaControls: 'mpsPanel'},
            {key: 'settings', label: 'Settings', role: 'tab', ariaControls: 'mpsPanel'}
        ]});
        document.getElementById('content').innerHTML = `
            <section class="mps-page" aria-live="polite">
                ${PageHeader.html({title: 'Master Planner', icon: 'fa-solid fa-chart-line', subtitle: 'Demand outlook, suggested reorders and purchase orders in one place.', className: 'mps-page-header page-header-surface', actions: `<div class="mps-actions">${actions}</div>`})}
                <div class="mps-tabbar"><nav role="tablist" aria-label="MPS tabs">${tabs}</nav></div>
                <div class="wrap" style="max-width:100%;position:relative;">
                    <div id="mpsPanel" role="tabpanel" aria-live="polite"><div class="mps-loading" aria-busy="true"><i class="fa-solid fa-spinner fa-spin"></i> Loading planner data...</div></div>
                </div>
            </section>`;
        document.querySelectorAll('.mps-tabs button').forEach(button => {
            if (button._mpsTabBound) return;
            button._mpsTabBound = true;
            button.addEventListener('click', () => {
                this.activateTab(button.dataset.tab);
                this.loadTab();
            });
        });
        document.getElementById('mpsRun')?.addEventListener('click', () => this.runPlanner());
        document.getElementById('mpsRefreshSales')?.addEventListener('click', () => this.refreshSales());
        document.getElementById('mpsAskAI')?.addEventListener('click', () => {
            const chartQuestion = this.tab === 'summary' && this.summary ? this.summaryChartExplanationPrompt() : '';
            this.openAIChat(chartQuestion, chartQuestion ? 'Explain the summary charts' : '', this.buildAIChatContext());
        });
        this.updateCalendarTabVisibility();
        this.loadTab();
    }

    suspend() {
        const content = document.getElementById('content');
        if (!content || content.dataset.view !== 'mps') return;
        const user = this.state.getUser();
        this._suspendedUserId = user?.id ?? null;
        this._suspendedRole = user?.role ?? null;
        this.cancelInFlight();
        document.querySelectorAll('.mps-overlay').forEach(overlay => overlay.remove());
        this._suspendedContent = document.createDocumentFragment();
        while (content.firstChild) this._suspendedContent.appendChild(content.firstChild);
    }

    async updateCalendarTabVisibility() {
        const tab = document.querySelector('.mps-calendar-tab');
        if (!tab) return;
        const token = ++this.calendarAvailabilityToken;
        const result = await API.mpsCalendarHasEvents();
        if (token !== this.calendarAvailabilityToken || !document.querySelector('.mps-calendar-tab')) return;
        // Keep the tab available if the availability check fails; only hide it on a confirmed empty result.
        if (result.status !== 'success') {
            tab.hidden = false;
            return;
        }
        const hasEvents = Boolean(result.has_events);
        tab.hidden = !hasEvents;
        if (!hasEvents && this.tab === 'calendar') {
            this.tab = 'summary';
            this.activateTab('summary');
            this.loadSummary();
        }
    }

    async loadTab() {
        this.cancelInFlight();
        this._hasLoadedPlanning = false;
        const activeTab = this.tab;
        if (activeTab === 'summary') await this.loadSummary();
        else if (activeTab === 'planning') await this.loadPlanning();
        else if (activeTab === 'calendar') await this.loadCalendar();
        else if (activeTab === 'pricing') await this.loadPricing();
        else if (activeTab === 'orders') await this.loadOrders();
        else await this.loadSettings();
    }

    async runPlanner() {
        const button = document.getElementById('mpsRun'); if (button) button.disabled = true;
        const result = await API.mpsRun();
        if (result.status === 'success') {
            if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
            Toast.success(`Planner run completed for ${result.products} products.`);
            this.page = 1;
            this.updateCalendarTabVisibility();
            this.activateTab('summary');
            await this.loadTab();
        }
        else Toast.error(result.message || 'Planner run failed.');
        if (button) button.disabled = false;
    }

    openDialog({title, body, confirmText = 'Save', cancelText = 'Cancel', busyText = 'Saving...', confirmClass = 'mps-btn-primary', onConfirm}) {
        const overlay = document.createElement('div');
        overlay.className = 'mps-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `<section class="mps-dialog mps-form-dialog">
            <header><div><h2>${esc(title)}</h2></div><button class="mps-close" type="button" aria-label="Close">&times;</button></header>
            <form class="mps-dialog-form" novalidate>
                ${body}
                <div class="mps-dialog-actions">${cancelText ? Button.html({text: cancelText, variant: 'secondary', size: 'md', type: 'button', dataAttributes: {'data-dialog-cancel': ''}}) : ''}${Button.html({text: confirmText, variant: confirmClass.includes('danger') ? 'danger' : 'primary', size: 'md', type: 'submit', className: confirmClass})}</div>
            </form>
        </section>`;
        document.body.appendChild(overlay);
        const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
        const onKey = event => { if (event.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.mps-close').addEventListener('click', close);
        overlay.querySelector('[data-dialog-cancel]')?.addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.querySelectorAll('.mps-table, .mps-projection').forEach(table => this.enableClientTableSorting(table));

        const form = overlay.querySelector('form');
        const submit = form.querySelector('button[type="submit"]');
        const restore = () => {
            submit.disabled = false;
            submit.innerHTML = esc(confirmText);
        };
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (submit.disabled) return;
            submit.disabled = true;
            submit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(busyText)}`;
            try {
                const shouldClose = await onConfirm(overlay);
                if (shouldClose === false) return restore();
                close();
            } catch (error) {
                Toast.error(error.message || 'The action could not be completed.');
                restore();
            }
        });
        overlay.querySelector('input:not([type="hidden"]),select,textarea')?.focus();
        return overlay;
    }

    confirmDialog({title, message, confirmText = 'Confirm', busyText = 'Working...', onConfirm}) {
        return this.openDialog({
            title,
            confirmText,
            busyText,
            confirmClass: 'btn-danger',
            body: `<p class="mps-modal-note">${esc(message)}</p>`,
            onConfirm
        });
    }

    refreshSales() {
        this.openDialog({
            title: 'Refresh sales',
            confirmText: 'Refresh sales',
            busyText: 'Refreshing sales...',
            body: `<div class="mps-form-grid">
                <label>From date<input id="mpsRefreshFrom" type="date" value="${daysAgo(45)}" required></label>
                <label>Through date<input id="mpsRefreshTo" type="date" value="${today()}" required></label>
            </div>
            <p class="mps-modal-note">Rebuilds WooCommerce sales for this range. Dates before the sales sync start date are skipped.</p>`,
            onConfirm: async overlay => {
                const from = overlay.querySelector('#mpsRefreshFrom').value;
                const to = overlay.querySelector('#mpsRefreshTo').value;
                if (!from || !to) { Toast.error('Choose both dates.'); return false; }
                if (to < from) { Toast.error('The through date must be on or after the from date.'); return false; }
                const started = await API.mpsRefreshSales(from, to);
                if (started.status !== 'success') { Toast.error(started.message || 'Sales refresh could not start.'); return false; }
                this.startSalesRefreshTracker();
                const result = await this.pollSalesRefresh(overlay);
                if (!result) return false;
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                const totals = result.totals || {};
                const resultWindows = Array.isArray(result.windows) ? result.windows : [];
                const windows = resultWindows.length;
                const refreshedFrom = resultWindows[0]?.from || result.from || from;
                const refreshedTo = resultWindows[windows - 1]?.to || result.to || to;
                const summary = [
                    `${num(totals.orders_counted)} orders`,
                    `${num(totals.rows_written)} rows`,
                    `${num(totals.units_sold)} units`
                ].join(', ');
                Toast.show(`Sales rebuilt ${esc(refreshedFrom)} to ${esc(refreshedTo)}: ${summary} across ${windows} month${windows === 1 ? '' : 's'}. Run the planner to update results.`, 'success', 6000);
                const skipped = Number(totals.unknown_product_count || 0);
                const refundErrors = Number(totals.refund_errors || 0);
                if (skipped || refundErrors) {
                    const warnings = [];
                    if (skipped) warnings.push(`${num(skipped)} unknown products skipped`);
                    if (refundErrors) warnings.push(`${num(refundErrors)} refund errors`);
                    Toast.warning(`Sales rebuilt with warnings: ${warnings.join(', ')}.`);
                }
                this.loadTab();
                return true;
            }
        });
    }

    async pollSalesRefresh(overlay) {
        const submit = overlay.querySelector('button[type="submit"]');
        const deadline = Date.now() + 60 * 60 * 1000;
        let failures = 0;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (!overlay.isConnected) return null;
            const result = await API.mpsRefreshSalesStatus();
            if (result.status !== 'success') {
                failures += 1;
                if (failures >= 3) {
                    Toast.error(result.message || 'Could not read the sales refresh status.');
                    return null;
                }
                continue;
            }
            failures = 0;
            const refresh = result.refresh || {};
            if (refresh.state === 'running') {
                const done = Number(refresh.months_done || 0);
                if (submit) submit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Refreshing sales${done ? ` (${done} month${done === 1 ? '' : 's'} done)` : '...'}`;
                continue;
            }
            if (refresh.state === 'success') return refresh;
            Toast.error(refresh.message || 'Sales refresh failed.');
            return null;
        }
        Toast.error('Sales refresh is taking too long. Check the backend log.');
        return null;
    }

    buildAIChatContext() {
        const tab = ['summary', 'planning', 'calendar', 'pricing'].includes(this.tab) ? this.tab : 'summary';
        if (tab === 'summary') return {tab, filters: this.summaryFilters?.() || {}};
        if (tab === 'planning') return {tab, filters: this.activeFilters?.() || {}};
        if (tab === 'calendar') return {tab, view: this.calendarView || 'month', selected_date: this.calendarDate || today(), ...(this.calendarRange || {})};
        return {tab, page: this.pricingPage || 1, filters: {search: this.pricingSearch || '', product_status: this.pricingStatus || 'all', profit: this.pricingProfit || 'all', sort_by: this.pricingSortBy || 'sku', sort_order: this.pricingSortOrder || 'ASC'}};
    }
    openAIChat(initialQuestion = '', initialLabel = '', tabContext = this.buildAIChatContext()) {
        const labels = {summary: 'Summary', planning: 'Planning', calendar: 'Calendar', pricing: 'Part pricing'};
        const topics = {summary: ['Summary trends and risks', 'Products that need attention', 'Reorder outlook'], planning: ['Why a product needs reordering', 'Which products to prioritize', 'Stock coverage and incoming stock'], calendar: ['Upcoming reorder dates', 'Purchase order ETAs', 'Dates with overlapping supply risks'], pricing: ['Products below the margin target', 'Negative-margin products', 'How VAT and CIT affect a price']};
        const tabLabel = labels[tabContext.tab] || 'Master Planner';
        const topicList = (topics[tabContext.tab] || topics.summary).map(topic => `<li>${esc(topic)}</li>`).join('');
        const overlay = document.createElement('div');
        overlay.className = 'mps-overlay mps-ai-chat-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'AI Chat');
        overlay.innerHTML = `
            <section class="mps-dialog mps-ai-chat-dialog">
                <header>
                    <div><small>Master Planner assistant | ${esc(tabLabel)}</small><h2>Ask AI</h2></div>
                    <button class="mps-close" aria-label="Close">&#215;</button>
                </header>
                <div class="mps-chat-container">
                    <div class="mps-chat-messages" id="mpsChatMessages">
                        <div class="mps-chat-message mps-chat-ai">
                            <div class="mps-chat-avatar"><i class="fa-solid fa-robot"></i></div>
                            <div class="mps-chat-content">
                                <p>I can help with the current ${esc(tabLabel)} view, using its current data and filters.</p><p>For example, ask about:</p>
                                <ul>
                                    ${topicList}
                                </ul>
                                <p><small>Ask a follow-up or refer to products and dates visible in this tab.</small></p>
                            </div>
                        </div>
                    </div>
                    <div class="mps-chat-input-area">
                        <textarea id="mpsChatInput" placeholder="Ask about the current ${esc(tabLabel)} view..." rows="2" maxlength="2000"></textarea>
                        <button class="btn btn-primary btn-sm" id="mpsChatSend"><i class="fa-solid fa-paper-plane"></i> Send</button>
                    </div>
                </div>
            </section>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.mps-close').onclick = () => overlay.remove();
        overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };

        const messagesContainer = overlay.querySelector('#mpsChatMessages');
        const input = overlay.querySelector('#mpsChatInput');
        const sendBtn = overlay.querySelector('#mpsChatSend');
        const conversation = [];

        const addMessage = (content, isUser = false) => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `mps-chat-message ${isUser ? 'mps-chat-user' : 'mps-chat-ai'}`;
            msgDiv.innerHTML = `
                <div class="mps-chat-avatar"><i class="fa-solid ${isUser ? 'fa-user' : 'fa-robot'}"></i></div>
                <div class="mps-chat-content">${content}</div>
            `;
            messagesContainer.appendChild(msgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        };

        const addLoading = () => {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'mps-chat-message mps-chat-ai mps-chat-loading';
            loadingDiv.id = 'mpsChatLoading';
            loadingDiv.innerHTML = `
                <div class="mps-chat-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="mps-chat-content"><i class="fa-solid fa-spinner fa-spin"></i> Thinking...</div>
            `;
            messagesContainer.appendChild(loadingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        };

        const removeLoading = () => {
            const loading = messagesContainer.querySelector('#mpsChatLoading');
            if (loading) loading.remove();
        };

        const sendMessage = async (requestQuestion = '', displayQuestion = '') => {
            const question = requestQuestion || input.value.trim();
            const visibleQuestion = displayQuestion || input.value.trim();
            if (!question) return;

            addMessage(esc(visibleQuestion), true);
            input.value = '';
            input.style.height = 'auto';
            addLoading();
            sendBtn.disabled = true;

            const history = conversation.slice(-12);
            conversation.push({role: 'user', content: question});

            try {
                const res = await API.mpsAIChat(question, history, tabContext);
                removeLoading();

                if (res.status === 'success') {
                    const response = res.response || 'No response from AI.';
                    addMessage(esc(response));
                    conversation.push({role: 'assistant', content: response});
                } else {
                    addMessage(`<div class="mps-chat-error"><i class="fa-solid fa-circle-exclamation"></i> ${esc(res.error || res.message || 'Could not get AI response.')}${res.quota_exceeded ? ' <small>(Daily limit reached)</small>' : ''}</div>`);
                    if (res.quota_exceeded) {
                        Toast.error('Daily AI limit has been reached. Try again after it resets.');
                    }
                }
            } catch (e) {
                removeLoading();
                addMessage(`<div class="mps-chat-error"><i class="fa-solid fa-circle-exclamation"></i> ${esc(e.message || 'AI service unavailable.')}</div>`);
                Toast.error(e.message || 'AI service unavailable.');
            } finally {
                sendBtn.disabled = false;
                input.focus();
            }
        };

        sendBtn.onclick = sendMessage;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        if (initialQuestion) {
            input.value = initialQuestion;
            sendMessage(initialQuestion, initialLabel);
        } else {
            setTimeout(() => input.focus(), 100);
        }
    }
}

Object.assign(MpsView.prototype, require('./components/PlanningTab.js'), require('./components/ProductDetail.js'), require('./components/PurchaseOrdersTab.js'), require('./components/SettingsTab.js'), require('./components/CalendarTab.js'), require('./components/PricingTab.js'), require('./components/WorkbookImport.js'));

module.exports = MpsView;
