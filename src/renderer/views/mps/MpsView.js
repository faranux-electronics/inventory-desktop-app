const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('./helpers.js');

class MpsView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.tab = 'summary';
        this.pricingPage = 1;
        this.pricingStatus = 'all';
        this.pricingFilterTimer = null;
        this.pricingRequestToken = 0;
        this.pricingSortBy = 'sku';
        this.pricingSortOrder = 'ASC';
        this.ordersPage = 1;
        this.ordersSearch = '';
        this.ordersSearchTimer = null;
        this.ordersRequestToken = 0;
        this.ordersTrashView = false;
        this.ordersSortBy = 'reference';
        this.ordersSortOrder = 'ASC';
        this.calendarMonth = today().slice(0, 7);
        this.calendarRequestToken = 0;
        this.calendarAvailabilityToken = 0;
        this.sortBy = 'order_by_date';
        this.sortOrder = 'ASC';
        this.page = 1;
        this.perPage = 50;
        this.filters = {
            search: '',
            status: '',
            category: '',
            supplier: '',
            stockout_date: '',
            order_by_date: '',
            max_days_of_cover: '',
            estimated_only: false
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
        this.summaryPageCap = 5;
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
        });
    }

    render() {
        this.isWriter = ['admin', 'manager', 'supply_chain_manager'].includes(this.state.getUser()?.role);
        this.cancelInFlight();
        this._hasLoadedPlanning = false;
        document.getElementById('content').innerHTML = `
            <section class="mps-page" aria-live="polite">
                <div class="page-header mb-md">
                    <div class="header-row mb-sm" style="display:flex;justify-content:flex-start;align-items:center;gap:15px;flex-wrap:wrap;">
                        <div class="mps-title-group">
                            <h1 class="page-title text-neutral-800 font-normal" style="font-size:23px;margin:0;">Master Planner</h1>
                            <p class="mps-subtitle">Demand outlook, suggested reorders and purchase orders in one place.</p>
                        </div>
                        <div class="mps-actions">${this.isWriter ? '<button class="btn btn-sm mps-btn-outline" id="mpsRefreshSales" aria-label="Refresh sales data"><i class="fa-solid fa-rotate"></i> Refresh sales</button><button class="btn btn-sm mps-btn-primary" id="mpsRun" aria-label="Run MPS planner"><i class="fa-solid fa-play"></i> Run planner</button>' : ''}</div>
                    </div>
                    <div class="mps-tabbar">
                        <nav class="mps-tabs" role="tablist" aria-label="MPS tabs"><button data-tab="summary" class="active" role="tab" aria-selected="true" aria-controls="mpsPanel">Summary</button><button data-tab="planning" role="tab" aria-selected="false" aria-controls="mpsPanel">Planning</button><button data-tab="calendar" class="mps-calendar-tab" role="tab" aria-selected="false" aria-controls="mpsPanel" hidden>Calendar</button><button data-tab="pricing" role="tab" aria-selected="false" aria-controls="mpsPanel">Part pricing</button><button data-tab="orders" role="tab" aria-selected="false" aria-controls="mpsPanel">Purchase orders</button><button data-tab="settings" role="tab" aria-selected="false" aria-controls="mpsPanel">Settings</button></nav>
                    </div>
                </div>
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
        this.updateCalendarTabVisibility();
        this.loadTab();
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
        if (this.tab === activeTab) this.addContextualHelp(activeTab);
    }

    addContextualHelp(tab) {
        const panel = document.getElementById('mpsPanel');
        if (!panel || panel.querySelector(`.mps-context-help[data-context-tab="${tab}"]`)) return;
        panel.querySelector('.mps-context-help')?.remove();
        const help = {
            summary: {
                title: 'Summary: planner health and priorities',
                text: 'See the latest planner totals, demand and stock risks, and products with the highest reorder value.',
                next: 'Check when sales were last refreshed, then run the planner before acting on new recommendations.',
                button: 'Review Planning', target: 'planning'
            },
            planning: {
                title: 'Planning: review product recommendations',
                text: 'Search, filter, and sort products by their stock and demand status. Open a product to see why it was recommended and edit its supplier, lead time, and usual purchase route.',
                next: 'After checking recommendations and product settings, create draft purchase orders from the reorder list.',
                button: 'Open Purchase Orders', target: 'orders'
            },
            calendar: {
                title: 'Calendar: follow reorder and arrival dates',
                text: 'Reorder markers show suggested order dates. PO markers show estimated arrival dates for active orders. Select an item to open its product or purchase order.',
                next: 'Review the matching order and update its status or receipt in Purchase Orders.',
                button: 'Open Purchase Orders', target: 'orders'
            },
            pricing: {
                title: 'Part Pricing: review costs and selling prices',
                text: 'Cost is the purchase cost. Calculated sale price is a recommendation from Settings; approved sale price is the price currently used by inventory. VAT, CIT, profit, and margin are calculated from these values.',
                next: 'Confirm the cost source and approved price before saving. Pricing changes update inventory cost or the MPS approved-price override.',
                button: 'Open Settings', target: 'settings'
            },
            orders: {
                title: 'Purchase Orders: create and track purchases',
                text: 'Create a PO manually, import one, or create drafts from reorder recommendations. Check the supplier, route, product lines, quantities, and ETA before moving an order forward.',
                next: 'Record received quantities and the receiving location when goods arrive. Trashed orders can be restored or permanently deleted from Trash.',
                button: 'Review Planning', target: 'planning'
            },
            settings: {
                title: 'Settings: control planner and pricing rules',
                text: 'Planner settings control the sales history and demand windows used for recommendations. Pricing settings control exchange rate, markup, VAT, and CIT calculations.',
                next: 'After changing planner assumptions, run the planner again and review the results before creating POs.',
                button: 'Open Summary', target: 'summary'
            }
        }[tab];
        if (!help) return;
        const details = document.createElement('details');
        details.className = 'mps-context-help';
        details.dataset.contextTab = tab;
        details.innerHTML = `<summary><i class="fa-solid fa-circle-question" aria-hidden="true"></i><span>${esc(help.title)}</span><span class="mps-context-hint">What should I do here?</span></summary><div class="mps-context-body"><p>${esc(help.text)}</p><p><strong>Next:</strong> ${esc(help.next)}</p><button class="btn btn-sm btn-secondary" type="button" data-context-target="${help.target}">${esc(help.button)}</button></div>`;
        panel.prepend(details);
        details.querySelector('[data-context-target]')?.addEventListener('click', () => {
            const target = details.querySelector('[data-context-target]')?.dataset.contextTarget;
            const navButton = document.querySelector(`.mps-tabs button[data-tab="${target}"]`);
            if (!navButton || navButton.hidden) return;
            this.activateTab(target);
            this.loadTab();
        });
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

    openDialog({title, body, confirmText = 'Save', busyText = 'Saving...', confirmClass = 'mps-btn-primary', onConfirm}) {
        const overlay = document.createElement('div');
        overlay.className = 'mps-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `<section class="mps-dialog mps-form-dialog">
            <header><div><h2>${esc(title)}</h2></div><button class="mps-close" type="button" aria-label="Close">&times;</button></header>
            <form class="mps-dialog-form" novalidate>
                ${body}
                <div class="mps-dialog-actions">
                    <button class="btn btn-sm btn-secondary" type="button" data-dialog-cancel>Cancel</button>
                    <button class="btn btn-sm ${confirmClass}" type="submit">${esc(confirmText)}</button>
                </div>
            </form>
        </section>`;
        document.body.appendChild(overlay);
        const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
        const onKey = event => { if (event.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.mps-close').addEventListener('click', close);
        overlay.querySelector('[data-dialog-cancel]').addEventListener('click', close);
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
}

Object.assign(MpsView.prototype, require('./components/PlanningTab.js'), require('./components/ProductDetail.js'), require('./components/PurchaseOrdersTab.js'), require('./components/SettingsTab.js'), require('./components/CalendarTab.js'), require('./components/PricingTab.js'), require('./components/WorkbookImport.js'));

module.exports = MpsView;
