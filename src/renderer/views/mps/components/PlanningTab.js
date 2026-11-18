const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');
const Input = require('../../../components/Input.js');
const Select = require('../../../components/Select.js');
const Button = require('../../../components/Button.js');
const FilterBar = require('../../../components/FilterBar.js');
const Table = require('../../../components/Table.js');
const Card = require('../../../components/Card.js');
const ChartCard = require('../../../components/ChartCard.js');
const Pagination = require('../../../components/Pagination.js');

module.exports = {
    activeFilters() {
        return {
            search: this.filters.search,
            status: this.filters.status,
            category: this.filters.category,
            supplier_id: this.filters.supplier,
            stockout_before: this.filters.stockout_date,
            order_by_before: this.filters.order_by_date,
            max_days_cover: this.filters.max_days_of_cover,
            only_estimated: this.filters.estimated_only ? 1 : 0,
            deviation: this.filters.deviation,
            sort_by: this.sortBy,
            sort_order: this.sortOrder
        };
    },

    resultsCacheKey() {
        return {...this.activeFilters(), page: this.page, per_page: this.perPage};
    },

    summaryFilters() {
        const {search, deviation, ...filters} = this.activeFilters();
        return filters;
    },

    async ensureSuppliers() {
        if (this.suppliersList && this.suppliersList.length) return;
        try {
            const res = await API.mpsGetSuppliers();
            if (res.status === 'success') this.suppliersList = res.data || [];
        } catch (e) {}
    },

    async ensureCategories() {
        if (this.categoriesList && this.categoriesList.length) return;
        try {
            const res = await API.getCategories();
            if (res.status === 'success') this.categoriesList = res.data || [];
        } catch (e) {}
    },

    async loadPlanning() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;

        if (this.abortController) this.abortController.abort();
        const controller = new AbortController();
        this.abortController = controller;
        const currentToken = ++this.requestToken;

        panel.innerHTML = '<div class="mps-loading" aria-busy="true" aria-live="polite"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading results…</div>';

        const cachedResults = this.state.getMpsCached ? this.state.getMpsCached('results', this.resultsCacheKey(), 60000) : null;

        try {
            await Promise.all([this.ensureSuppliers(), this.ensureCategories()]);

            const results = cachedResults || await API.mpsGetResults({
                ...this.activeFilters(),
                page: this.page,
                per_page: this.perPage
            }, controller.signal);

            if (currentToken !== this.requestToken) return;
            if (!document.getElementById('mpsPanel')) return;
            if (results.status !== 'success') {
                panel.innerHTML = `<div class="mps-empty" role="alert">${esc(results.message || 'Could not load planner results. Confirm the backend migration has been applied.')}</div>`;
                panel.setAttribute('aria-busy', 'false');
                return;
            }

            if (!cachedResults && this.state.setMpsCached) this.state.setMpsCached('results', this.resultsCacheKey(), results);

            this.results = results;
            this._hasLoadedPlanning = true;
            panel.innerHTML = this.planningHtml();
            panel.setAttribute('aria-busy', 'false');
            this.attachPlanningEvents();
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (currentToken !== this.requestToken) return;
            if (!document.getElementById('mpsPanel')) return;
            panel.innerHTML = `<div class="mps-empty" role="alert">${esc(error.message || 'Could not load planner results.')}</div>`;
            panel.setAttribute('aria-busy', 'false');
        } finally {
            if (this.abortController === controller) this.abortController = null;
        }
    },

    async refreshResults() {
        const panel = document.getElementById('mpsPanel');
        if (!panel || !this._hasLoadedPlanning) return this.loadPlanning();

        if (this.resultsAbortController) this.resultsAbortController.abort();
        const controller = new AbortController();
        this.resultsAbortController = controller;
        const token = ++this.resultsRequestToken;

        const cached = this.state.getMpsCached ? this.state.getMpsCached('results', this.resultsCacheKey(), 60000) : null;

        this.setResultsBusy(true);
        try {
            let results = cached;
            if (!results) {
                results = await API.mpsGetResults({
                    ...this.activeFilters(),
                    page: this.page,
                    per_page: this.perPage
                }, controller.signal);
                if (!cached && results.status === 'success' && this.state.setMpsCached) {
                    this.state.setMpsCached('results', this.resultsCacheKey(), results);
                }
            }

            if (token !== this.resultsRequestToken) return;
            if (!document.getElementById('mpsPanel')) return;
            if (results.status !== 'success') {
                this.setResultsBusy(false);
                Toast.error(results.message || 'Could not load planner results.');
                return;
            }

            this.results = results;
            this.patchResults();
            this.setResultsBusy(false);
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (token !== this.resultsRequestToken) return;
            this.setResultsBusy(false);
            Toast.error(error.message || 'Could not load planner results.');
        } finally {
            if (this.resultsAbortController === controller) this.resultsAbortController = null;
        }
    },

    setResultsBusy(busy) {
        const table = document.getElementById('mpsResultsTable');
        if (!table) return;
        table.classList.toggle('mps-busy', busy);
        if (busy) table.setAttribute('aria-busy', 'true');
        else table.removeAttribute('aria-busy');
    },

    patchResults() {
        const total = Number(this.results?.total || 0);
        const totalEl = document.getElementById('mpsResultsTotal');
        if (totalEl) totalEl.textContent = `${total.toLocaleString()} products`;

        const table = document.getElementById('mpsResultsTable');
        if (table) {
            table.innerHTML = this.resultsTableHtml();
            const planningTable = table.querySelector('.mps-table');
            this.decorateSortableTable(planningTable, this.planningSortKeys(), 'planning', this.sortBy, this.sortOrder);
            this.preparePlanningTable(planningTable);
            this.syncPlanningBulkBar(table);
        }

        this.renderPlanningPagination();
    },

    patchSummary() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        const template = document.createElement('template');
        template.innerHTML = this.summaryHtml();
        const fresh = template.content;
        ['#mpsSummaryStats', '#mpsSummaryMeta', '#mpsSummaryTotal', '#mpsSummaryContent'].forEach(selector => {
            const current = panel.querySelector(selector);
            const next = fresh.querySelector(selector);
            if (current && next) current.replaceWith(next);
        });
    },

    summaryCacheKey() {
        return {...this.summaryFilters(), cap: this.summaryPageCap, per_page: this.summaryPerPage};
    },

    summaryLoadingHtml() {
        const statSkeletons = Array.from({length: 6}, () => `<div class="mps-skeleton-stat"><span class="mps-skeleton mps-skeleton-icon"></span><div><span class="mps-skeleton mps-skeleton-label"></span><span class="mps-skeleton mps-skeleton-value"></span></div></div>`).join('');
        const chartSkeletons = Array.from({length: 9}, (_, index) => `<div class="mps-skeleton-chart${index === 4 || index === 8 ? ' mps-skeleton-wide' : ''}"><span class="mps-skeleton mps-skeleton-heading"></span><span class="mps-skeleton mps-skeleton-subheading"></span><div class="mps-skeleton-chart-body"><span class="mps-skeleton mps-skeleton-plot"></span><div><span class="mps-skeleton mps-skeleton-legend"></span><span class="mps-skeleton mps-skeleton-legend"></span><span class="mps-skeleton mps-skeleton-legend"></span></div></div></div>`).join('');
        return `<div class="mps-summary-loading" aria-busy="true" aria-live="polite">
            <div class="mps-summary-loading-heading"><div><strong>Building summary</strong><span id="mpsSummaryProgressText" role="status">Loading planner results…</span></div>${Button.html({id: 'mpsSummaryCancel', text: 'Cancel', icon: 'fa-solid fa-xmark', variant: 'outline', size: 'sm'})}</div>
            <div class="mps-summary-progress"><div><b id="mpsSummaryProgressBar" style="width:5%"></b></div></div>
            <div class="mps-skeleton-stats" aria-hidden="true">${statSkeletons}</div>
            <div class="mps-skeleton-meta" aria-hidden="true"><span class="mps-skeleton"></span><span class="mps-skeleton"></span></div>
            <div class="mps-skeleton-filters" aria-hidden="true">${Array.from({length: 5}, () => '<span class="mps-skeleton"></span>').join('')}</div>
            <div class="mps-skeleton-charts" aria-hidden="true">${chartSkeletons}</div>
        </div>`;
    },

    updateSummaryProgress(done, total) {
        const bar = document.getElementById('mpsSummaryProgressBar');
        const text = document.getElementById('mpsSummaryProgressText');
        const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
        if (bar) bar.style.width = `${Math.max(5, pct)}%`;
        if (text) text.textContent = `Loading planner results… ${pct}%`;
    },

    async loadSummary({patch = false} = {}) {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;

        const preserveFilters = patch && !!document.getElementById('mpsSummaryContent');
        if (this.summaryAbortController) this.summaryAbortController.abort();
        const controller = new AbortController();
        this.summaryAbortController = controller;
        const token = ++this.summaryRequestToken;

        if (preserveFilters) {
            panel.setAttribute('aria-busy', 'true');
            document.getElementById('mpsSummaryContent')?.classList.add('mps-busy');
        } else {
            panel.innerHTML = this.summaryLoadingHtml();
            document.getElementById('mpsSummaryCancel')?.addEventListener('click', () => controller.abort());
        }

        const filters = this.summaryFilters();
        const cachedOverview = this.state.getMpsCached ? this.state.getMpsCached('overview', filters, 120000) : null;
        const cachedSummary = this.state.getMpsCached ? this.state.getMpsCached('summary', this.summaryCacheKey(), 120000) : null;

        try {
            await Promise.all([this.ensureSuppliers(), this.ensureCategories(), this.ensurePricingExchangeRate()]);

            const overview = cachedOverview || await API.mpsGetOverview(filters, controller.signal);
            if (token !== this.summaryRequestToken) return;
            if (!overview || overview.status !== 'success') {
                if (preserveFilters) {
                    document.getElementById('mpsSummaryContent')?.classList.remove('mps-busy');
                    panel.setAttribute('aria-busy', 'false');
                    Toast.error(overview?.message || 'Could not load the planner overview.');
                    return;
                }
                panel.innerHTML = `<div class="mps-empty" role="alert">${esc(overview?.message || 'Could not load the planner overview.')}</div>`;
                panel.setAttribute('aria-busy', 'false');
                return;
            }

            let bundle = cachedSummary;
            if (!bundle) {
                bundle = await this.fetchSummarySample(filters, token, controller.signal);
                if (!bundle) return;
                if (this.state.setMpsCached) this.state.setMpsCached('summary', this.summaryCacheKey(), bundle);
            }

            if (!cachedOverview && this.state.setMpsCached) this.state.setMpsCached('overview', filters, overview);
            if (token !== this.summaryRequestToken) return;
            if (!document.getElementById('mpsPanel')) return;

            this.summary = {...bundle, overview};
            if (preserveFilters) {
                this.patchSummary();
            } else {
                panel.innerHTML = this.summaryHtml();
                this.attachSummaryEvents();
                this.startSalesRefreshTracker();
            }
            panel.setAttribute('aria-busy', 'false');
        } catch (error) {
            if (error.name === 'AbortError') {
                if (token !== this.summaryRequestToken) return;
                if (!document.getElementById('mpsPanel')) return;
                if (preserveFilters) {
                    document.getElementById('mpsSummaryContent')?.classList.remove('mps-busy');
                    panel.setAttribute('aria-busy', 'false');
                    return;
                }
                panel.innerHTML = `<div class="mps-empty" role="status">Summary build cancelled. <button class="btn btn-ghost btn-sm" type="button" id="mpsSummaryRetry"><i class="fa-solid fa-rotate-right"></i> Retry</button></div>`;
                panel.setAttribute('aria-busy', 'false');
                document.getElementById('mpsSummaryRetry')?.addEventListener('click', () => this.loadSummary());
                return;
            }
            if (token !== this.summaryRequestToken) return;
            if (!document.getElementById('mpsPanel')) return;
            if (preserveFilters) {
                document.getElementById('mpsSummaryContent')?.classList.remove('mps-busy');
                panel.setAttribute('aria-busy', 'false');
                Toast.error(error.message || 'Could not build the summary.');
                return;
            }
            panel.innerHTML = `<div class="mps-empty" role="alert">${esc(error.message || 'Could not build the summary.')}</div>`;
            panel.setAttribute('aria-busy', 'false');
        } finally {
            if (this.summaryAbortController === controller) this.summaryAbortController = null;
        }
    },

    async ensurePricingExchangeRate() {
        if (Number(this.pricingExchangeRate) > 0) return this.pricingExchangeRate;
        if (!this.pricingExchangeRatePromise) {
            this.pricingExchangeRatePromise = API.mpsGetSettings()
                .then(result => {
                    const rate = Number(result?.settings?.pricing_exchange_rate);
                    this.pricingExchangeRate = result?.status === 'success' && rate > 0 ? rate : 1500;
                    return this.pricingExchangeRate;
                })
                .catch(() => {
                    this.pricingExchangeRate = 1500;
                    return this.pricingExchangeRate;
                })
                .finally(() => { this.pricingExchangeRatePromise = null; });
        }
        return this.pricingExchangeRatePromise;
    },

    async fetchSummarySample(filters, token, signal) {
        const per = this.summaryPerPage;

        const first = await API.mpsGetResults({...filters, page: 1, per_page: per}, signal);
        if (first.status !== 'success') throw new Error(first.message || 'Could not load planner results.');

        const rows = [...(first.data || [])];
        const total = Number(first.total || 0);
        const allPages = Math.max(1, Math.ceil(total / per));
        const maxPages = this.summaryPageCap > 0
            ? Math.max(1, Math.min(allPages, this.summaryPageCap))
            : allPages;
        this.updateSummaryProgress(1, maxPages + 1);

        const topRes = await API.mpsGetResults({...filters, page: 1, per_page: 10, sort_by: 'order_value', sort_order: 'DESC'}, signal);
        const top = topRes.status === 'success' ? (topRes.data || []) : [];
        this.updateSummaryProgress(2, maxPages + 1);

        let nextPage = 2;
        const worker = async () => {
            while (nextPage <= maxPages) {
                const page = nextPage++;
                if (token !== this.summaryRequestToken) return;
                const res = await API.mpsGetResults({...filters, page, per_page: per}, signal);
                if (res.status === 'success') rows.push(...(res.data || []));
                this.updateSummaryProgress(page + 1, maxPages + 1);
            }
        };
        await Promise.all([worker(), worker(), worker()]);

        return {rows, top, total, pagesLoaded: maxPages, capped: maxPages < allPages};
    },

    summaryData() {
        const overview = this.summary?.overview || {};
        const statuses = overview.by_status || {};
        const rows = this.summary?.rows || [];
        const top = this.summary?.top || [];

        const products = Object.values(statuses).reduce((sum, row) => sum + Number(row.products || 0), 0);
        const toOrder = Number(statuses.reorder?.products || 0) + Number(statuses.stockout_risk?.products || 0);
        const units = Number(statuses.reorder?.reorder_units || 0) + Number(statuses.stockout_risk?.reorder_units || 0);
        const orderValue = Object.values(statuses).reduce((sum, row) => sum + Number(row.order_value || 0), 0);
        const proratedHistory = Number(overview.prorated_history_products ?? overview.estimated_products ?? 0);
        const deviationStock = overview.deviation_stock || {};
        const deviationStockItems = [
            {label: `Declining demand · ${num(deviationStock.negative?.products || 0)} products`, value: Number(deviationStock.negative?.stock || 0), color: 'var(--palette-hex-be123c)'},
            {label: `Rising demand · ${num(deviationStock.positive?.products || 0)} products`, value: Number(deviationStock.positive?.stock || 0), color: 'var(--palette-hex-047857)'}
        ];

        const statusSegments = STATUS_ORDER.map(key => ({label: statusLabel(key), value: Number(statuses[key]?.products || 0), color: STATUS_COLORS[key]})).filter(s => s.value > 0);
        const valueSegments = STATUS_ORDER.map(key => ({label: statusLabel(key), value: Number(statuses[key]?.order_value || 0), color: STATUS_COLORS[key]})).filter(s => s.value > 0);
        const unitSegments = STATUS_ORDER.map(key => ({label: statusLabel(key), value: Number(statuses[key]?.reorder_units || 0), color: STATUS_COLORS[key]})).filter(s => s.value > 0);

        const coverDefs = [
            ['Out of stock', v => v <= 0],
            ['1-7 days', v => v > 0 && v <= 7],
            ['8-14 days', v => v > 7 && v <= 14],
            ['15-30 days', v => v > 14 && v <= 30],
            ['31-60 days', v => v > 30 && v <= 60],
            ['60+ days', v => v > 60]
        ];
        const coverItems = coverDefs.map(([label, test], idx) => ({
            label,
            value: rows.filter(row => { const d = Number(row.days_of_cover); return row.days_of_cover !== null && row.days_of_cover !== '' && Number.isFinite(d) && test(d); }).length,
            color: CHART_COLORS[idx % CHART_COLORS.length]
        })).filter(item => item.value > 0);

        const supplierMap = new Map();
        const categoryMap = new Map();
        const weekly = new Map();
        rows.forEach(row => {
            const supplier = row.supplier_name || 'Unassigned';
            supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + Number(row.order_value || 0));
            const category = row.category || 'Uncategorized';
            categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
            if (row.order_by_date) {
                const date = new Date(`${row.order_by_date}T00:00:00`);
                if (!Number.isNaN(date.getTime())) {
                    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
                    const key = isoDate(date);
                    weekly.set(key, (weekly.get(key) || 0) + 1);
                }
            }
        });
        const supplierItems = [...supplierMap.entries()].map(([label, value]) => ({label, value}));
        const categoryItems = [...categoryMap.entries()].map(([label, value]) => ({label, value}));
        const timelineItems = [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 10).map(([key, value]) => {
            const date = new Date(`${key}T00:00:00`);
            return {
                label: date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'}),
                title: `Week starting ${key}: ${num(value)} products due to order`,
                value
            };
        });
        const topItems = (top.length ? top : [...rows].sort((a, b) => Number(b.order_value || 0) - Number(a.order_value || 0)).slice(0, 10))
            .map(row => ({label: row.name || row.sku || `#${row.product_id}`, value: Number(row.order_value || 0), productId: row.product_id}));

        return {
            overview, products, toOrder, units, orderValue, proratedHistory,
            deviationStockItems,
            statusSegments, valueSegments, unitSegments, coverItems,
            supplierItems, categoryItems, timelineItems, topItems,
            total: Number(this.summary?.total || 0),
            loaded: rows.length,
            capped: !!this.summary?.capped,
            timelineWeekCount: weekly.size,
            pagesLoaded: Number(this.summary?.pagesLoaded || 1)
        };
    },

    salesRefreshMetaText(refresh = null, fallbackDate = null) {
        const state = String(refresh?.state || '');
        const stamp = value => {
            const text = String(value || '');
            return text ? text.replace('T', ' ').slice(0, 16) : '';
        };
        const totals = refresh?.totals || {};
        const windowList = Array.isArray(refresh?.windows) ? refresh.windows : [];
        const windows = windowList.length;
        const effectiveFrom = windowList[0]?.from || refresh?.from;
        const effectiveTo = windowList[windows - 1]?.to || refresh?.to;
        const range = effectiveFrom && effectiveTo ? `${effectiveFrom} to ${effectiveTo}` : '';
        if (state === 'running') {
            const done = Number(refresh?.months_done || 0);
            const current = refresh?.current_from && refresh?.current_to ? ` · ${refresh.current_from} to ${refresh.current_to}` : '';
            return `Running · ${done} month${done === 1 ? '' : 's'} complete${current} · started ${stamp(refresh?.started_at)}`;
        }
        if (state === 'success') {
            const parts = [stamp(refresh?.finished_at || refresh?.updated_at || fallbackDate), range];
            const months = windows || Number(refresh?.months_done || 0);
            const orders = Number(totals.orders_counted || 0);
            const rows = Number(totals.rows_written || 0);
            if (months) parts.push(`${months} mo`);
            parts.push(`${num(orders)} order${orders === 1 ? '' : 's'}`, `${num(rows)} row${rows === 1 ? '' : 's'}`);
            const skipped = Number(totals.unknown_product_count || 0);
            const refundErrors = Number(totals.refund_errors || 0);
            if (skipped) parts.push(`${num(skipped)} unknown`);
            if (refundErrors) parts.push(`${num(refundErrors)} refund error${refundErrors === 1 ? '' : 's'}`);
            return parts.filter(Boolean).join(' · ');
        }
        if (state === 'error') {
            return ['Failed', stamp(refresh?.finished_at || refresh?.updated_at), refresh?.message || 'Unknown error'].filter(Boolean).join(' · ');
        }
        return fallbackDate ? stamp(fallbackDate) : 'No refresh recorded';
    },

    summaryChartExplanationPrompt() {
        const data = this.summaryData();
        const topValues = items => [...items].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5).map(item => ({label: String(item.label).slice(0, 70), value: Number(item.value)}));
        const context = {
            products: data.products,
            productsWithAdjustedSalesHistory: data.proratedHistory,
            productsNeedingReplenishment: data.toOrder,
            suggestedUnits: data.units,
            suggestedReorderValueRwf: data.orderValue,
            productsByPlannerStatus: data.statusSegments.map(item => ({status: item.label, products: item.value})),
            reorderValueRwfByStatus: data.valueSegments.map(item => ({status: item.label, valueRwf: item.value})),
            suggestedUnitsByStatus: data.unitSegments.map(item => ({status: item.label, units: item.value})),
            productsByDaysOfCover: data.coverItems.map(item => ({dayRange: item.label, products: item.value})),
            topProductsByReorderValue: data.topItems.slice(0, 5).map(item => ({product: String(item.label).slice(0, 70), valueRwf: item.value})),
            topSuppliersByReorderValueRwf: topValues(data.supplierItems),
            topCategoriesByProductCount: topValues(data.categoryItems),
            totalWeeksWithSuggestedOrders: data.timelineWeekCount,
            productsDueByWeekStarting: data.timelineItems.map(item => ({weekStarting: item.title, products: item.value}))
        };
        return `Explain each Master Planner chart in plain language for a non-technical user. Define the terms, distinguish product counts and unit counts from estimated RWF values, and point out only patterns supported by the supplied figures. Adjusted sales history means some multi-day sales totals were distributed across the planner periods they cover. This does not mean history is missing or demand was invented. Products with no recorded sales receive zero demand. New products with some sales may use their to-date average when a complete history window is not yet available. Do not infer causes or recommend actions without evidence. Summary data: ${JSON.stringify(context)}`;
    },

    startSalesRefreshTracker() {
        this.cancelSalesRefreshTracker();
        const token = this.salesTrackerToken;
        const tick = async () => {
            if (token !== this.salesTrackerToken) return;
            if (!document.getElementById('mpsSalesRefreshMeta')) return;
            let refresh = null;
            try {
                const result = await API.mpsRefreshSalesStatus();
                if (result?.status === 'success') refresh = result.refresh;
            } catch (error) {
                return;
            }
            if (token !== this.salesTrackerToken) return;
            const target = document.getElementById('mpsSalesRefreshMeta');
            if (!target) return;
            target.textContent = this.salesRefreshMetaText(refresh, this.summary?.overview?.sales_last_refresh);
            target.title = target.textContent;
            if (refresh?.state === 'running') {
                this.salesTrackerTimer = setTimeout(tick, 3000);
            }
        };
        tick();
    },

    summaryHtml() {
        const d = this.summaryData();
        const o = d.overview || {};
        const statusTotal = d.statusSegments.reduce((sum, s) => sum + s.value, 0);
        const valueTotal = d.valueSegments.reduce((sum, s) => sum + s.value, 0);
        const coverageCount = d.coverItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
        const supplierCount = d.supplierItems.filter(item => Number(item.value) > 0).length;
        const categoryCount = d.categoryItems.length;
        const sortedCategories = [...d.categoryItems].sort((a, b) => Number(b.value) - Number(a.value));
        const categorySegments = sortedCategories
            .slice(0, 5)
            .map((item, index) => ({...item, color: CHART_COLORS[index % CHART_COLORS.length]}));
        const otherCategoryProducts = sortedCategories.slice(5).reduce((sum, item) => sum + Number(item.value || 0), 0);
        if (otherCategoryProducts > 0) categorySegments.push({label: 'Other categories', value: otherCategoryProducts, color: 'var(--palette-hex-78716c)'});
        const categoryTotal = categorySegments.reduce((sum, item) => sum + Number(item.value || 0), 0);
        const chartCard = options => ChartCard.html(options);
        const chartTitle = (id, title, caption) => ChartCard.heading({id, title, caption});
        const noProration = Math.max(0, d.products - d.proratedHistory);
        const historyProrationSegments = [
            {label: 'Adjusted history', value: d.proratedHistory, color: 'var(--palette-hex-ca8a04)'},
            {label: 'No adjustment needed', value: noProration, color: 'var(--palette-hex-78716c)'}
        ].filter(s => s.value > 0);
        const sampled = d.loaded < d.total;
        const scopeNote = d.loaded
            ? (sampled ? `Detail charts: ${num(d.loaded)} of ${num(d.total)} products · status/value totals: all ${num(d.total)}` : `All ${num(d.total)} products charted`)
            : 'No products match the current filters';
        const exchangeRate = Number(this.pricingExchangeRate) > 0 ? Number(this.pricingExchangeRate) : 1500;
        const cards = [
            {label: 'Products planned', value: num(d.products), icon: 'fa-boxes-stacked', description: 'Total products included in the current planner results and summary.'},
            {label: 'Need replenishment', value: num(d.toOrder), icon: 'fa-triangle-exclamation', description: 'Products that need replenishment based on the latest run.'},
            {label: 'Suggested units', value: num(d.units), icon: 'fa-cart-flatbed', description: 'Total suggested units to order across products that need replenishment.'},
            {label: 'Order now', value: num(o.order_now), icon: 'fa-clock', description: 'Products flagged as needing to order now in the latest run.'},
            {label: 'Reorder value', value: `RWF ${shortNum(d.orderValue)}`, secondary: `USD $${shortNum(d.orderValue / exchangeRate)}`, icon: 'fa-coins', description: 'Estimated reorder value in RWF and USD using the configured exchange rate.'},
            {label: 'Adjusted history', value: num(d.proratedHistory), icon: 'fa-chart-simple', description: 'Some multi-day sales totals were distributed across the planner periods they cover. This does not indicate missing history or low confidence from short history.'}
        ].map(card => Card.html({tagName: 'article', className: 'mps-stat', content: `<span class="mps-stat-icon"><i class="fa-solid ${card.icon}" aria-hidden="true"></i></span><div class="mps-stat-content"><span class="mps-stat-label" title="${esc(card.description)}">${esc(card.label)}</span><strong>${esc(card.value)}</strong>${card.secondary ? `<small class="mps-stat-secondary">${esc(card.secondary)}</small>` : ''}</div>`})).join('');

        return `<div class="mps-stats" id="mpsSummaryStats">${cards}</div>
            <div class="mps-summary-meta">
                <div class="mps-summary-meta-item"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><strong>Latest run</strong><span id="mpsSummaryMeta">${o.run ? `#${esc(o.run.id)} · ${esc(o.run.as_of_date)} · ${num(d.products)} products · ${num(d.proratedHistory)} with adjusted history` : `No completed run · ${num(d.proratedHistory)} with adjusted history`}</span></div>
                <div class="mps-summary-meta-item mps-summary-meta-refresh"><i class="fa-solid fa-rotate" aria-hidden="true"></i><strong>Sales refresh</strong><span class="mps-summary-meta-value" id="mpsSalesRefreshMeta" title="${esc(this.salesRefreshMetaText(null, o.sales_last_refresh))}">${esc(this.salesRefreshMetaText(null, o.sales_last_refresh))}</span></div>
            </div>
            ${FilterBar.html({className: 'mps-toolbar mps-toolbar-advanced mps-summary-filterbar', ariaLabel: 'Summary filters', content: `
                <div class="mps-filter-controls mps-filter-grid">${this.filterControlsHtml({includeSearch: false, includeDeviation: false})}</div>
                <div class="mps-summary-options">
                    <span class="mps-total" id="mpsSummaryTotal" aria-live="polite">${esc(scopeNote)}</span>
                </div>
            `})}
            <div id="mpsSummaryContent">
            <div class="mps-charts-grid">
            <div class="mps-chart-pies${d.proratedHistory > 0 ? ' mps-chart-pies-has-proration' : ''}">
                ${chartCard({id: 'status', title: 'Products by planner status', caption: 'Each slice counts products. Stockout risk means stock may run out before replenishment. Reorder means stock is below buffer. Overstock is above the cover limit; New is in its new-product window; Dead has no recent sales; OK has no current flag; Excluded products are omitted from planning.', metric: `${num(statusTotal)} products`, className: 'mps-chart-pie', content: statusTotal > 0
                        ? `<div class="mps-status-chart">${donutChart(d.statusSegments, num(statusTotal), 'products', 'Status distribution')}<div class="mps-legend">${legendHtml(d.statusSegments, statusTotal)}</div></div>`
                        : '<p class="mps-chart-empty">No products match the current filters.</p>'})}
                ${d.proratedHistory > 0 ? `<section class="mps-chart-card mps-chart-pie">
                    <div class="mps-chart-head">${chartTitle('demand', 'Adjusted sales history', 'Counts products with multi-day sales totals distributed across the planner periods they cover. This is not a sales-coverage measure. Products with no recorded sales receive zero demand; new products with some sales can use their to-date average until a complete history window is available.')}
                        <span>${num(d.proratedHistory)} products flagged</span></div>
                    <div class="mps-status-chart">${donutChart(historyProrationSegments, `${d.products ? Math.round(d.proratedHistory / d.products * 100) : 0}%`, 'adjusted', 'Products whose sales history was adjusted across planner periods')}<div class="mps-legend">${legendHtml(historyProrationSegments, d.products)}</div></div>
                </section>` : ''}
                <section class="mps-chart-card mps-chart-pie">
                    <div class="mps-chart-head">${chartTitle('category', 'Products by category', 'This pie shows the top 5 categories separately and combines the rest as Other categories. Products without a category appear under Uncategorized.')}
                        <span>${categoryCount > 5 ? `Top 5 + other · ${num(categoryCount)} categories` : `${num(categoryCount)} categories`}</span></div>
                    ${d.products > 0
                        ? `<div class="mps-status-chart">${donutChart(categorySegments, num(categoryTotal), 'products', 'Product counts by category')}<div class="mps-legend">${legendHtml(categorySegments, categoryTotal)}</div></div>`
                        : '<p class="mps-chart-empty">No products match the current filters.</p>'}
                </section>
            </div>
            <div class="mps-chart-columns mps-chart-horizontal-columns${d.products === 0 ? ' mps-chart-empty-columns' : ''}">
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('reorder-cost-status', 'Estimated reorder cost by status', 'Bars show the estimated purchase cost in RWF for suggested order quantities, grouped by planner status.')}
                        <span>${money(valueTotal)}</span></div>
                    ${hBars(d.valueSegments, {formatter: value => `${shortNum(value)} RWF`, empty: 'No reorder value in the latest run.', ariaLabel: 'Reorder value by status'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('suggested-units', 'Suggested units to purchase', 'Bars show the total number of units recommended for purchase, grouped by planner status.')}
                        <span>${num(d.units)} units</span></div>
                    ${hBars(d.unitSegments, {formatter: num, empty: 'No replenishment units in the latest run.', ariaLabel: 'Suggested units by status'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('top-products', 'Products with the highest reorder cost', 'Shows up to 8 products with the highest estimated purchase cost for their recommended order quantity. Amounts are in RWF.')}
                        <span>${num(Math.min(8, d.topItems.length))} products shown</span></div>
                    ${hBars(d.topItems, {formatter: value => `${shortNum(value)} RWF`, empty: 'No products with an order value.', ariaLabel: 'Top products by order value'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('supplier-cost', 'Estimated reorder cost by supplier', 'Shows the top 8 suppliers by suggested order cost in RWF. Products without a supplier are grouped under Unassigned.')}
                        <span>${num(Math.min(8, supplierCount))} of ${num(supplierCount)} suppliers</span></div>
                    ${hBars(d.supplierItems, {formatter: value => `${shortNum(value)} RWF`, empty: 'No supplier reorder costs in the current results.', ariaLabel: 'Estimated reorder cost by supplier'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('stock-by-deviation', 'Stock by demand trend', 'Shows current on-hand stock for all filtered products. Negative deviation means recent demand is below the all-history rate; positive deviation means recent demand is above it. Product counts are included in each label.')}
                        <span>${num(d.deviationStockItems.reduce((sum, item) => sum + item.value, 0))} units on hand</span></div>
                    ${hBars(d.deviationStockItems, {formatter: num, empty: 'No products have a positive or negative demand deviation.', ariaLabel: 'Current stock for products with declining or rising demand'})}
                </section>
            </div>
            <div class="mps-chart-columns mps-chart-vertical-columns">
                <div class="mps-chart-column">
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('stock-cover', 'Estimated stock cover', 'Days of cover is current stock plus incoming orders divided by forecast daily demand. Bars count products in each day range.')}
                        <span>${num(coverageCount)} products</span></div>
                    ${columnChart(d.coverItems, {formatter: num, empty: 'No days-of-cover data.', ariaLabel: 'Coverage risk by days of cover'})}
                </section>
                </div>
                <div class="mps-chart-column">
                <section class="mps-chart-card">
                    <div class="mps-chart-head">${chartTitle('order-timeline', 'Suggested order dates by week', 'Each bar counts products due to be ordered in that week. Dates mark Monday, the week start. Only the first 10 weeks are shown.')}
                        <span>${num(d.timelineItems.length)} of ${num(d.timelineWeekCount)} weeks</span></div>
                    ${columnChart(d.timelineItems, {formatter: num, empty: 'No products have a suggested order date in the current results.', ariaLabel: 'Number of products due to be ordered each week'})}
                </section>
                </div>
            </div>
            </div>
            ${d.capped ? `<p class="mps-run-meta">Detail charts are based on the first ${num(d.pagesLoaded * this.summaryPerPage)} products (earliest order-by dates) to keep loading bounded. Status and value totals use all products.</p>` : ''}
            </div>`;
    },

    attachSummaryEvents() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        this.bindFilterEvents(() => this.loadSummary({patch: true}));
        panel.onclick = event => {
            const infoButton = event.target.closest('[data-chart-info]');
            if (infoButton) {
                const captionId = infoButton.dataset.chartInfo;
                const caption = panel.querySelector(`#${captionId}`);
                const wasOpen = caption && !caption.hidden;
                panel.querySelectorAll('.mps-chart-caption').forEach(item => { item.hidden = true; });
                panel.querySelectorAll('[data-chart-info]').forEach(button => button.setAttribute('aria-expanded', 'false'));
                if (caption && !wasOpen) {
                    caption.hidden = false;
                    infoButton.setAttribute('aria-expanded', 'true');
                }
                return;
            }
            const productButton = event.target.closest('.mps-product-link');
            if (productButton) this.showProduct(productButton.dataset.product);
        };
        const bindExport = (selector, action, successMessage, errorMessage) => {
            const button = panel.querySelector(selector);
            if (!button) return;
            button.addEventListener('click', async () => {
                const label = button.innerHTML;
                button.disabled = true;
                button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
                try {
                    const result = await action();
                    if (result?.status === 'success') Toast.success(successMessage);
                    else throw new Error(result?.message || 'Export failed');
                } catch (error) {
                    Toast.error(error.message || errorMessage);
                } finally {
                    button.disabled = false;
                    button.innerHTML = label;
                }
            });
        };
    },

    filterControlsHtml({includeSearch = true, includeDeviation = true} = {}) {
        const currentCategory = this.filters.category;
        const categoryOptions = (this.categoriesList || []).map(category => ({value: category, label: category}));
        if (currentCategory && !categoryOptions.some(option => option.value === currentCategory)) categoryOptions.unshift({value: currentCategory, label: currentCategory});
        const dateField = (id, label, value) => `<span class="mps-date-field ${value ? '' : 'mps-field-empty'}">
            ${Input.html({id, type: 'date', value, ariaLabel: label})}
            <span class="mps-field-hint" aria-hidden="true">${esc(label)}</span>
        </span>`;
        const search = includeSearch ? Input.html({id: 'mpsSearch', type: 'search', placeholder: 'Search products or SKU', value: this.filters.search, ariaLabel: 'Search products or SKU'}) : '';
        return `${search}
            ${Select.html({id: 'mpsStatus', value: this.filters.status, ariaLabel: 'Filter by status', options: [{value: '', label: 'All statuses'}, ...['reorder','stockout_risk','overstock','dead','new','ok','excluded'].map(value => ({value, label: statusLabel(value)}))]})}
            ${Select.html({id: 'mpsCategory', value: currentCategory, ariaLabel: 'Filter by category', options: [{value: '', label: 'All categories'}, ...categoryOptions]})}
            ${Select.html({id: 'mpsSupplier', value: this.filters.supplier, ariaLabel: 'Filter by supplier', options: [{value: '', label: 'All suppliers'}, ...(this.suppliersList || []).map(supplier => ({value: supplier.id, label: supplier.name}))]})}
            ${includeDeviation ? Select.html({id: 'mpsDeviation', value: this.filters.deviation, ariaLabel: 'Filter by demand deviation', options: [{value: '', label: 'All deviations'}, {value: 'negative', label: 'Negative deviation'}, {value: 'zero', label: 'No change'}, {value: 'positive', label: 'Positive deviation'}]}) : ''}
            ${dateField('mpsStockoutDate', 'Stockout before', this.filters.stockout_date, 'Show products expected to stock out before this date')}
            ${dateField('mpsOrderByDate', 'Order by date', this.filters.order_by_date, 'Show products that need to be ordered by this date')}
            ${Input.html({id: 'mpsMaxDaysCover', type: 'number', min: 0, placeholder: 'Max days cover', value: this.filters.max_days_of_cover, ariaLabel: 'Max days of cover'})}
            <label class="mps-check" title="Some multi-day sales totals were distributed across the planner periods they cover"><input id="mpsEstimatedOnly" type="checkbox" aria-label="Adjusted sales history only" ${this.filters.estimated_only ? 'checked' : ''}><span>Adjusted history</span></label>`;
    },

    bindFilterEvents(apply) {
        const scheduleApply = () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(apply, FILTER_DEBOUNCE_MS);
        };
        document.getElementById('mpsSearch')?.addEventListener('input', event => { this.filters.search = event.target.value; this.page = 1; scheduleApply(); });
        document.getElementById('mpsStatus')?.addEventListener('change', event => { this.filters.status = event.target.value; this.page = 1; scheduleApply(); });
        document.getElementById('mpsCategory')?.addEventListener('change', event => { this.filters.category = event.target.value; this.page = 1; scheduleApply(); });
        document.getElementById('mpsSupplier')?.addEventListener('change', event => { this.filters.supplier = event.target.value; this.page = 1; scheduleApply(); });
        document.getElementById('mpsDeviation')?.addEventListener('change', event => { this.filters.deviation = event.target.value; this.page = 1; scheduleApply(); });
        document.getElementById('mpsStockoutDate')?.addEventListener('change', event => {
            this.filters.stockout_date = event.target.value;
            event.target.closest('.mps-date-field')?.classList.toggle('mps-field-empty', !event.target.value);
            this.page = 1;
            scheduleApply();
        });
        document.getElementById('mpsOrderByDate')?.addEventListener('change', event => {
            this.filters.order_by_date = event.target.value;
            event.target.closest('.mps-date-field')?.classList.toggle('mps-field-empty', !event.target.value);
            this.page = 1;
            scheduleApply();
        });
        document.getElementById('mpsMaxDaysCover')?.addEventListener('input', event => { this.filters.max_days_of_cover = event.target.value; this.page = 1; scheduleApply(); });
        document.getElementById('mpsEstimatedOnly')?.addEventListener('change', event => { this.filters.estimated_only = event.target.checked; this.page = 1; scheduleApply(); });
    },

    planningHtml() {
        const total = Number(this.results?.total || 0);
        const run = this.results?.run;
        const exportDescription = run
            ? `Both exports use planner run #${run.id} as of ${run.as_of_date} and include all products, regardless of table filters. The forecast is an estimate; zero on-hand means physical stock ≤ 0, with incoming orders listed separately.`
            : 'Run the Master Planner to create these exports.';
        const exportSummary = run ? `Run #${run.id} · ${run.as_of_date} · all products; filters do not apply.` : 'Run the planner before exporting.';
        const exportsCard = Card.html({tagName: 'section', className: 'mps-planning-forecast', ariaLabel: 'Planning exports', content: `
                <div title="${esc(exportDescription)}"><h2>Planning exports</h2><p>${esc(exportSummary)}</p></div>
                <label><span>Forecast window</span>${Select.html({id: 'mpsStockoutMonths', value: 3, ariaLabel: 'Stockout forecast window', options: [{value: 2, label: 'Next 2 months'}, {value: 3, label: 'Next 3 months'}, {value: 6, label: 'Next 6 months'}]})}</label>
                ${Button.html({id: 'mpsExportStockout', text: 'Export forecast CSV', title: run ? 'Export projected stockouts from the latest completed planner run.' : 'Run the Master Planner before exporting a forecast.', icon: 'fa-solid fa-file-csv', variant: 'outline', size: 'sm', className: 'mps-brand-outline', disabled: !run})}
                ${Button.html({id: 'mpsExportOutOfStock', text: 'Export zero on-hand CSV', title: run ? 'Export products with zero or negative on-hand stock. Incoming purchase orders are listed separately.' : 'Run the Master Planner before exporting the zero on-hand list.', icon: 'fa-solid fa-file-csv', variant: 'outline', size: 'sm', className: 'mps-brand-outline', disabled: !run})}
            `});
        return `${FilterBar.html({className: 'mps-toolbar mps-toolbar-advanced', ariaLabel: 'Planning filters', content: `<div class="mps-filter-controls mps-filter-grid">${this.filterControlsHtml()}</div><span class="mps-total" id="mpsResultsTotal" aria-live="polite">${total.toLocaleString()} products</span>${Button.html({id: 'mpsExport', text: 'Export CSV', icon: 'fa-solid fa-file-csv', variant: 'outline', size: 'md', className: 'mps-brand-outline', ariaLabel: 'Export filtered results to CSV'})}`})}
            ${exportsCard}
            <div id="mpsResultsTable" aria-live="polite">${this.resultsTableHtml()}</div>
            <footer id="mpsResultsPagination" aria-live="polite"></footer>`;
    },

    decorateSortableTable(table, keys, group, sortBy, sortOrder) {
        if (!table) return;
        [...table.querySelectorAll('thead th')].forEach((th, index) => {
            const key = keys[index];
            if (!key) return;
            th.dataset.mpsSort = `${group}:${key}`;
            th.classList.add('mps-sortable');
            const active = sortBy === key;
            const icon = active ? (sortOrder === 'ASC' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
            th.insertAdjacentHTML('beforeend', ` <i class="fa-solid ${icon} mps-sort-icon${active ? ' active' : ''}" aria-hidden="true"></i>`);
        });
    },

    planningSortKeys() {
        const keys = ['name','status','current_stock','incoming','avg_window','buffer','reorder_qty','order_by_date','order_value'];
        return this.isWriter ? [null, ...keys] : keys;
    },

    preparePlanningTable(table) {
        if (!this.isWriter || !table) return;
        const th = table.querySelector('thead th.mps-col-select');
        if (th && !th.querySelector('input')) {
            th.innerHTML = '<input type="checkbox" id="mpsPlanningSelectAll" aria-label="Select all products on this page">';
        }
    },

    syncPlanningBulkBar(panel) {
        const bulkBar = panel?.querySelector('.mps-planning-bulk-bar');
        if (!bulkBar) return;
        const selectedCount = this.planningSelectedProducts?.size || 0;
        bulkBar.hidden = !selectedCount;
        const status = bulkBar.querySelector('[aria-live="polite"]');
        if (status) status.textContent = selectedCount ? `${selectedCount} selected` : 'Select products to add together';
        bulkBar.querySelectorAll('[data-add-selected-po], [data-custom-selected-po]').forEach(button => {
            button.disabled = !selectedCount;
            button.dataset.count = String(selectedCount);
        });
        const selectAll = panel.querySelector('#mpsPlanningSelectAll');
        const boxes = [...panel.querySelectorAll('[data-planning-select]')];
        if (selectAll && boxes.length) {
            const checkedCount = boxes.filter(box => box.checked).length;
            selectAll.checked = checkedCount === boxes.length;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
        }
    },

    enableClientTableSorting(table) {
        table?.querySelectorAll('thead th').forEach((th, index) => {
            if (!th.textContent.trim()) return;
            th.classList.add('mps-sortable');
            th.insertAdjacentHTML('beforeend', ' <i class="fa-solid fa-sort mps-sort-icon" aria-hidden="true"></i>');
            th.addEventListener('click', () => {
                const direction = th.dataset.sortDirection === 'ASC' ? 'DESC' : 'ASC';
                th.dataset.sortDirection = direction;
                const rows = [...(table.tBodies[0]?.rows || [])];
                const value = row => row.cells[index]?.querySelector('input,select')?.value ?? row.cells[index]?.textContent.trim() ?? '';
                rows.sort((a, b) => {
                    const av = String(value(a)).replace(/,/g, '').trim();
                    const bv = String(value(b)).replace(/,/g, '').trim();
                    const numeric = av !== '' && bv !== '' && Number.isFinite(Number(av)) && Number.isFinite(Number(bv));
                    const comparison = numeric ? Number(av) - Number(bv) : av.localeCompare(bv, undefined, {numeric: true, sensitivity: 'base'});
                    return (direction === 'ASC' ? 1 : -1) * comparison;
                });
                rows.forEach(row => table.tBodies[0].append(row));
                table.querySelectorAll('.mps-sort-icon').forEach(icon => { icon.className = 'fa-solid fa-sort mps-sort-icon'; });
                const icon = th.querySelector('.mps-sort-icon');
                if (icon) icon.className = `fa-solid ${direction === 'ASC' ? 'fa-sort-up' : 'fa-sort-down'} mps-sort-icon active`;
            });
        });
    },

    resultsTableHtml() {
        const rows = this.results?.data || [];
        if (!rows.length) {
            return '<div class="mps-empty-card">No planner results found for the current filters.</div>';
        }
        this.planningSelectedProducts ||= new Map();
        const selectedCount = this.planningSelectedProducts.size;

        const body = rows.map(row => {
            const statusClass = String(row.status || 'unknown').replace(/[^a-z0-9_-]/gi, '') || 'unknown';
            const stock = Number(row.current_stock || 0);
            const reorderQty = Number(row.reorder_qty || 0);
            return `
            <tr class="mps-planning-row mps-planning-row-${statusClass}">
                ${this.isWriter ? `<td class="mps-planning-select-cell"><label class="mps-planning-select"><input type="checkbox" data-planning-select="${Number(row.product_id)}" ${this.planningSelectedProducts.has(Number(row.product_id)) ? 'checked' : ''} aria-label="Select ${esc(row.sku || row.name)} for a purchase order"></label></td>` : ''}
                <td class="mps-planning-product-cell">
                    <div class="mps-planning-product-main">
                        <button class="mps-product-link" data-product="${Number(row.product_id)}" title="${esc(row.name)}">${esc(row.name)}</button>
                        <div class="mps-planning-product-meta">
                            <small>${esc(row.sku || '—')}</small>
                            ${this.isWriter ? `<span class="mps-planning-po-actions">${Button.html({text: 'Add to draft', variant: 'ghost', size: 'sm', className: 'mps-planning-po-text', title: `Add ${row.sku || row.name} to a purchase order draft`, ariaLabel: `Add ${row.sku || row.name} to a purchase order draft`, dataAttributes: {'data-add-po-draft': Number(row.product_id)}})}${Button.html({text: 'Custom add', variant: 'ghost', size: 'sm', className: 'mps-planning-po-text', title: `Choose the draft and quantity for ${row.sku || row.name}`, ariaLabel: `Custom add ${row.sku || row.name} to a purchase order draft`, dataAttributes: {'data-custom-po-add': Number(row.product_id)}})}</span>` : ''}
                        </div>
                        ${Number(row.is_estimated) ? '<small class="mps-history-prorated" title="Some multi-day sales totals were distributed across the planner periods they cover">Adjusted sales history</small>' : ''}
                    </div>
                </td>
                <td class="mps-planning-status-cell"><span class="mps-status mps-status-${esc(row.status)}">${esc(statusLabel(row.status))}</span></td>
                <td class="mps-num${stock <= 0 ? ' mps-negative' : ''}">${stock.toLocaleString()}</td>
                <td class="mps-num">${Number(row.incoming || 0).toLocaleString()}</td>
                <td class="mps-num">${esc(row.avg_window)}</td>
                <td class="mps-num">${esc(row.buffer)}</td>
                <td class="mps-num mps-qty">${reorderQty.toLocaleString()}</td>
                <td class="mps-planning-date">${esc(row.order_by_date || '—')}</td>
                <td class="mps-num mps-planning-value">${money(row.order_value)}</td>
            </tr>`;
        }).join('');

        const tips = {
            'Product': 'Product name (click to view details)',
            'Status': 'Planner status',
            'Stock': 'Current stock on hand',
            'Incoming': 'Incoming stock from open purchase orders',
            'Avg / bucket': 'Average demand per bucket (history window)',
            'Buffer': 'Safety/buffer quantity',
            'Reorder': 'Suggested reorder quantity',
            'Order by': 'Suggested order-by date',
            'Value': 'Suggested reorder value'
        };
        const headers = [
            ...(this.isWriter ? [{label: '', className: 'mps-col-select', title: 'Select products'}] : []),
            {label: 'Product', className: 'mps-has-tooltip mps-col-product', title: tips.Product, dataAttributes: {'data-tooltip': tips.Product}},
            {label: 'Status', className: 'mps-has-tooltip mps-planning-status-col', title: tips.Status, dataAttributes: {'data-tooltip': tips.Status}},
            {label: 'Stock', className: 'mps-num mps-has-tooltip mps-col-stock', title: tips.Stock, dataAttributes: {'data-tooltip': tips.Stock}},
            {label: 'Incoming', className: 'mps-num mps-has-tooltip mps-col-incoming', title: tips.Incoming, dataAttributes: {'data-tooltip': tips.Incoming}},
            {label: 'Avg / bucket', className: 'mps-num mps-has-tooltip mps-col-avg', title: tips['Avg / bucket'], dataAttributes: {'data-tooltip': tips['Avg / bucket']}},
            {label: 'Buffer', className: 'mps-num mps-has-tooltip mps-col-buffer', title: tips.Buffer, dataAttributes: {'data-tooltip': tips.Buffer}},
            {label: 'Reorder', className: 'mps-num mps-has-tooltip mps-col-reorder', title: tips.Reorder, dataAttributes: {'data-tooltip': tips.Reorder}},
            {label: 'Order by', className: 'mps-planning-date mps-has-tooltip mps-col-orderby', title: tips['Order by'], dataAttributes: {'data-tooltip': tips['Order by']}},
            {label: 'Value', className: 'mps-num mps-planning-value mps-has-tooltip mps-col-value', title: tips.Value, dataAttributes: {'data-tooltip': tips.Value}}
        ];
        const table = Table.html({wrapperClass: 'mps-table-wrap wp-list-table-wrapper', className: `mps-table mps-planning-table wp-list-table widefat striped posts${this.isWriter ? ' mps-planning-table-select' : ''}`, ariaLabel: 'Planning recommendations', body, headers});
        return `${this.isWriter ? `<div class="mps-planning-bulk-bar"${selectedCount ? '' : ' hidden'}><span aria-live="polite">${selectedCount ? `${selectedCount} selected` : 'Select products to add together'}</span>${Button.html({text: 'Add to draft', variant: 'outline', size: 'sm', className: 'mps-brand-outline', dataAttributes: {'data-add-selected-po': '', 'data-count': selectedCount}, disabled: !selectedCount})}${Button.html({text: 'Custom add', variant: 'outline', size: 'sm', className: 'mps-brand-outline', dataAttributes: {'data-custom-selected-po': '', 'data-count': selectedCount}, disabled: !selectedCount})}</div>` : ''}${table}`;
    },

    renderPlanningPagination() {
        const container = document.getElementById('mpsResultsPagination');
        if (!container) return;
        Pagination.render(container, {
            page: this.page, total: Number(this.results?.total || 0), pageSize: this.perPage,
            pageSizes: [25, 50, 100], pageSizeId: 'mpsPlanningPageSize', itemLabel: 'products',
            onPageChange: page => { this.page = page; this.refreshResults(); },
            onPageSizeChange: size => { this.perPage = size; this.page = 1; this.refreshResults(); }
        });
    },

    attachPlanningEvents() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;

        const planningTable = panel.querySelector('#mpsResultsTable .mps-table');
        this.decorateSortableTable(planningTable, this.planningSortKeys(), 'planning', this.sortBy, this.sortOrder);
        this.preparePlanningTable(planningTable);
        this.syncPlanningBulkBar(panel);
        this.renderPlanningPagination();
        this.bindFilterEvents(() => this.refreshResults());
        document.getElementById('mpsExport')?.addEventListener('click', event => this.exportFilteredResults(event.currentTarget));
        panel.querySelector('#mpsExportStockout')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            const months = Number(panel.querySelector('#mpsStockoutMonths')?.value || 3);
            const label = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Exporting...';
            try {
                const result = await API.mpsExportStockoutForecast(months, `mps-stockout-forecast-${months}m-${today()}.csv`);
                if (result?.status === 'success') Toast.success(`Stockout forecast exported from planner run #${this.results?.run?.id || ''}.`);
                else throw new Error(result?.message || 'Export failed');
            } catch (error) {
                Toast.error(error.message || 'Could not export the stockout forecast.');
            } finally {
                button.disabled = false;
                button.innerHTML = label;
            }
        });
        panel.querySelector('#mpsExportOutOfStock')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            const label = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Exporting...';
            try {
                const result = await API.mpsExportOutOfStock(`mps-zero-on-hand-${today()}.csv`);
                if (result?.status === 'success') Toast.success(`Zero on-hand list exported from planner run #${this.results?.run?.id || ''}.`);
                else throw new Error(result?.message || 'Export failed');
            } catch (error) {
                Toast.error(error.message || 'Could not export the zero on-hand list.');
            } finally {
                button.disabled = false;
                button.innerHTML = label;
            }
        });

        panel.onclick = event => {
            const sortHeader = event.target.closest('th[data-mps-sort]');
            if (sortHeader?.dataset.mpsSort.startsWith('planning:')) {
                const key = sortHeader.dataset.mpsSort.split(':')[1];
                this.sortOrder = this.sortBy === key && this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
                this.sortBy = key;
                this.page = 1;
                this.refreshResults();
                return;
            }
            const pageButton = event.target.closest('.page-btn[data-page]');
            if (pageButton) {
                const nextPage = Number(pageButton.dataset.page);
                if (!Number.isNaN(nextPage) && nextPage !== this.page) {
                    this.page = nextPage;
                    this.refreshResults();
                }
                return;
            }
            const addToDraftButton = event.target.closest('[data-add-po-draft]');
            const customAddButton = event.target.closest('[data-custom-po-add]');
            const selectAllBox = event.target.closest('#mpsPlanningSelectAll');
            if (selectAllBox) {
                this.planningSelectedProducts ||= new Map();
                const checked = selectAllBox.checked;
                (this.results?.data || []).forEach(product => {
                    const productId = Number(product.product_id);
                    if (checked) this.planningSelectedProducts.set(productId, product);
                    else this.planningSelectedProducts.delete(productId);
                });
                panel.querySelectorAll('[data-planning-select]').forEach(box => { box.checked = checked; });
                this.syncPlanningBulkBar(panel);
                return;
            }
            const selectionBox = event.target.closest('[data-planning-select]');
            if (selectionBox) {
                this.planningSelectedProducts ||= new Map();
                const productId = Number(selectionBox.dataset.planningSelect);
                const product = (this.results?.data || []).find(item => Number(item.product_id) === productId);
                if (selectionBox.checked && product) this.planningSelectedProducts.set(productId, product);
                else this.planningSelectedProducts.delete(productId);
                this.syncPlanningBulkBar(panel);
                return;
            }
            const addSelectedButton = event.target.closest('[data-add-selected-po]');
            const customSelectedButton = event.target.closest('[data-custom-selected-po]');
            if (addSelectedButton || customSelectedButton) {
                this.addSelectedPlanningProductsToDraft(addSelectedButton || customSelectedButton, Boolean(customSelectedButton));
                return;
            }
            if (addToDraftButton || customAddButton) {
                const targetButton = addToDraftButton || customAddButton;
                const productId = Number(targetButton.dataset.addPoDraft || targetButton.dataset.customPoAdd);
                const product = (this.results?.data || []).find(item => Number(item.product_id) === productId);
                if (!product) return;
                this.addPlanningProductToDraft(product, targetButton, Boolean(customAddButton));
                return;
            }
            const productButton = event.target.closest('.mps-product-link');
            if (productButton) this.showProduct(productButton.dataset.product);
        };
    },

    async addPlanningProductToDraft(product, button = null, custom = false) {
        const sku = String(product.sku || '').trim();
        if (!sku) return Toast.error('This product needs a SKU before it can be added to a purchase order.');
        const suggestedQty = Math.max(1, Number(product.reorder_qty || 0));
        const line = {sku, name: product.name || '', qty_ordered: suggestedQty, unit_cost: product.cost_price == null ? null : Number(product.cost_price)};
        const oldMarkup = button?.innerHTML;
        if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>'; }
        try {
            const result = await API.mpsGetPurchaseOrders({status: 'draft', page: 1, per_page: 1000, sort_by: 'priority', sort_order: 'ASC'});
            if (result.status !== 'success') { Toast.error(result.message || 'Could not load draft purchase orders.'); return; }
            const drafts = result.data || [];
            const priorityOrder = (a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id);
            drafts.sort(priorityOrder);
            if (!drafts.length) {
                if (!custom) {
                    await this.openPurchaseOrderEditor(null, [line], {
                        supplier_id: product.supplier_id || null,
                        freight_mode: 'air'
                    });
                    return;
                }
            } else if (drafts.length === 1) {
                if (!custom) {
                    await this.appendProductToDraftPurchaseOrder(drafts[0], line);
                    return;
                }
            } else if (!custom) {
                await this.appendProductToDraftPurchaseOrder(drafts[0], line);
                return;
            }
            const optionsFor = mode => drafts.filter(po => po.freight_mode === mode).map(po => `<option value="${Number(po.id)}">${esc(po.reference)} · Priority ${Number(po.priority || 0)}</option>`).join('');
            const overlay = this.openDialog({
                title: 'Custom add to purchase order',
                confirmText: 'Add product',
                busyText: 'Adding product...',
                body: `<p class="mps-modal-note">Choose a draft purchase order or create a new one for ${esc(product.name || sku)} (${esc(sku)}).</p>
                    <label class="mps-form-field"><span>Quantity</span><input id="mpsCustomPoQty" type="number" min="1" step="1" value="${suggestedQty}" required></label>
                    <label class="mps-form-field"><span>Purchase route</span><select id="mpsCustomPoRoute" class="form-select"><option value="air">Imported · Air</option><option value="sea">Imported · Sea</option><option value="local">Local</option></select></label>
                    <label class="mps-form-field"><span>Destination</span><select id="mpsAddToDraftTarget" class="form-select" required></select></label>`,
                onConfirm: async overlay => {
                    const qtyInput = overlay.querySelector('#mpsCustomPoQty');
                    const quantity = Number(qtyInput?.value);
                    if (!Number.isInteger(quantity) || quantity < 1) { Toast.error('Enter a positive whole-number quantity.'); qtyInput?.focus(); return false; }
                    line.qty_ordered = quantity;
                    const freightMode = overlay.querySelector('#mpsCustomPoRoute').value;
                    const targetId = overlay.querySelector('#mpsAddToDraftTarget').value;
                    if (targetId === 'new') return this.createPlanningPurchaseOrder(product, line, freightMode);
                    const po = drafts.find(item => Number(item.id) === Number(targetId));
                    if (!po) { Toast.error('Select a draft purchase order or choose create new.'); return false; }
                    return this.appendProductToDraftPurchaseOrder(po, line);
                }
            });
            const routeSelect = overlay.querySelector('#mpsCustomPoRoute');
            const destination = overlay.querySelector('#mpsAddToDraftTarget');
            const updateDestinations = () => {
                const mode = routeSelect.value;
                const routeLabel = mode === 'local' ? 'local' : `${mode} import`;
                destination.innerHTML = `<option value="">Choose an existing draft or create one</option>${optionsFor(mode)}<option value="new">Create new ${routeLabel} draft</option>`;
            };
            routeSelect.addEventListener('change', updateDestinations);
            updateDestinations();
        } catch (error) {
            Toast.error(error.message || 'Could not add the product to a draft purchase order.');
        } finally {
            if (button?.isConnected) { button.disabled = false; button.innerHTML = oldMarkup; }
        }
    },

    async createPlanningPurchaseOrder(product, lineOrLines, freightMode, supplierId = null) {
        const lines = Array.isArray(lineOrLines) ? lineOrLines : [lineOrLines];
        const result = await API.mpsSavePurchaseOrder({
            reference: '', supplier_id: product?.supplier_id || supplierId || null, freight_mode: freightMode,
            currency: 'RWF', status: 'draft', lines: lines.map(line => ({
                sku: line.sku, qty_ordered: line.qty_ordered,
                unit_cost: line.unit_cost == null ? null : Number(Number(line.unit_cost).toFixed(2))
            }))
        });
        if (result.status !== 'success') {
            const unmatched = result.unmatched?.length ? ` Unmatched: ${result.unmatched.join(', ')}` : '';
            Toast.error((result.message || 'Could not create the purchase order draft.') + unmatched);
            return false;
        }
        if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
        Toast.success(`Created a new ${freightMode} draft with ${lines.length} product(s).`);
        this.updateCalendarTabVisibility();
        this.refreshResults();
        return true;
    },

    async addSelectedPlanningProductsToDraft(button = null, custom = false) {
        const selected = [...(this.planningSelectedProducts?.values() || [])];
        if (!selected.length) return;
        const invalid = selected.filter(product => !String(product.sku || '').trim());
        if (invalid.length) return Toast.error(`${invalid.length} selected product(s) need a SKU before they can be added to a purchase order.`);
        const oldMarkup = button?.innerHTML;
        if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Adding...'; }
        try {
            const result = await API.mpsGetPurchaseOrders({status: 'draft', page: 1, per_page: 1000, sort_by: 'priority', sort_order: 'ASC'});
            if (result.status !== 'success') return Toast.error(result.message || 'Could not load draft purchase orders.');
            const drafts = result.data || [];
            drafts.sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id));
            if (!drafts.length && !custom) {
                const lines = selected.map(product => ({sku: String(product.sku).trim(), name: product.name || '', qty_ordered: Math.max(1, Number(product.reorder_qty || 0)), unit_cost: product.cost_price == null ? null : Number(product.cost_price)}));
                await this.openPurchaseOrderEditor(null, lines, {freight_mode: 'air', onSaved: () => this.planningSelectedProducts.clear()});
                return;
            }
            if (custom) {
                const quantityFields = selected.map((product, index) => `<label class="mps-form-field"><span>${esc(product.sku)} · ${esc(product.name || '')}</span><input data-custom-bulk-qty="${index}" type="number" min="1" step="1" value="${Math.max(1, Number(product.reorder_qty || 0))}" required></label>`).join('');
                const optionsFor = mode => drafts.filter(po => po.freight_mode === mode).map(po => `<option value="${Number(po.id)}">${esc(po.reference)} · Priority ${Number(po.priority || 0)}</option>`).join('');
                const overlay = this.openDialog({
                    title: 'Custom add selected products', confirmText: 'Add products', busyText: 'Adding products...',
                    body: `<p class="mps-modal-note">Set a quantity for each product, then choose a route and draft.</p><div class="mps-custom-bulk-quantities">${quantityFields}</div>
                        <label class="mps-form-field"><span>Purchase route</span><select id="mpsCustomPoRoute" class="form-select"><option value="air">Imported · Air</option><option value="sea">Imported · Sea</option><option value="local">Local</option></select></label>
                        <label class="mps-form-field"><span>Destination</span><select id="mpsAddToDraftTarget" class="form-select" required></select></label>`,
                    onConfirm: async dialog => {
                        const lines = selected.map((product, index) => ({sku: String(product.sku).trim(), name: product.name || '', qty_ordered: Number(dialog.querySelector(`[data-custom-bulk-qty="${index}"]`)?.value), unit_cost: product.cost_price == null ? null : Number(product.cost_price)}));
                        if (lines.some(line => !Number.isInteger(line.qty_ordered) || line.qty_ordered < 1)) { Toast.error('Enter a positive whole-number quantity for each product.'); return false; }
                        const mode = dialog.querySelector('#mpsCustomPoRoute').value;
                        const targetId = dialog.querySelector('#mpsAddToDraftTarget').value;
                        let saved;
                        if (targetId === 'new') {
                            const suppliers = [...new Set(selected.map(product => Number(product.supplier_id || 0)).filter(Boolean))];
                            saved = await this.createPlanningPurchaseOrder(null, lines, mode, suppliers.length === 1 ? suppliers[0] : null);
                        } else {
                            const po = drafts.find(item => Number(item.id) === Number(targetId));
                            if (!po) { Toast.error('Select a draft purchase order or choose create new.'); return false; }
                            saved = await this.appendProductsToDraftPurchaseOrder(po, lines);
                        }
                        if (saved) { this.planningSelectedProducts.clear(); this.refreshResults(); }
                        return saved;
                    }
                });
                const routeSelect = overlay.querySelector('#mpsCustomPoRoute');
                const destination = overlay.querySelector('#mpsAddToDraftTarget');
                const updateDestinations = () => {
                    const mode = routeSelect.value;
                    const routeLabel = mode === 'local' ? 'local' : `${mode} import`;
                    destination.innerHTML = `<option value="">Choose an existing draft or create one</option>${optionsFor(mode)}<option value="new">Create new ${routeLabel} draft</option>`;
                };
                routeSelect.addEventListener('change', updateDestinations);
                updateDestinations();
                return;
            }
            const lines = selected.map(product => ({sku: String(product.sku).trim(), name: product.name || '', qty_ordered: Math.max(1, Number(product.reorder_qty || 0)), unit_cost: product.cost_price == null ? null : Number(product.cost_price)}));
            const saved = await this.appendProductsToDraftPurchaseOrder(drafts[0], lines, {refresh: false, notify: false});
            if (!saved) return;
            selected.forEach(product => this.planningSelectedProducts.delete(Number(product.product_id)));
            this.refreshResults();
            Toast.success(`Added ${selected.length} selected product(s) to ${drafts[0].reference}.`);
        } catch (error) {
            Toast.error(error.message || 'Could not add selected products to a draft.');
        } finally {
            if (button?.isConnected) { button.disabled = false; button.innerHTML = oldMarkup; }
        }
    },

    async appendProductToDraftPurchaseOrder(po, line, {refresh = true, notify = true} = {}) {
        return this.appendProductsToDraftPurchaseOrder(po, [line], {refresh, notify});
    },

    async appendProductsToDraftPurchaseOrder(po, newLines, {refresh = true, notify = true} = {}) {
        const detail = await API.mpsGetPurchaseOrder(Number(po.id));
        if (detail.status !== 'success') { Toast.error(detail.message || 'Could not load the selected draft.'); return false; }
        const header = detail.purchase_order || {};
        if (header.status !== 'draft') { Toast.error('This purchase order is no longer a draft. Refresh the list and choose another draft.'); return false; }
        const existingLines = detail.lines || [];
        const exchangeRate = String(header.currency || 'RWF').toUpperCase() === 'USD' ? await this.ensurePricingExchangeRate() : 1;
        const bySku = new Map(existingLines.map(item => [String(item.sku || '').trim().toUpperCase(), {
            sku: item.sku, qty_ordered: Number(item.qty_ordered || 0), unit_cost: item.unit_cost == null ? null : Number(item.unit_cost)
        }]));
        for (const line of newLines) {
            const key = String(line.sku || '').trim().toUpperCase();
            const unitCost = line.unit_cost == null ? null : Number((line.unit_cost / exchangeRate).toFixed(2));
            const current = bySku.get(key);
            if (current) {
                current.qty_ordered += Number(line.qty_ordered || 0);
                if (current.unit_cost == null) current.unit_cost = unitCost;
            } else {
                bySku.set(key, {sku: line.sku, qty_ordered: Number(line.qty_ordered || 0), unit_cost: unitCost});
            }
        }
        const lines = [...bySku.values()];
        const result = await API.mpsSavePurchaseOrder({
            id: Number(header.id), reference: header.reference, supplier_id: header.supplier_id || null,
            freight_mode: header.freight_mode, currency: header.currency || 'RWF', eta_date: header.eta_date || null,
            ordered_at: header.ordered_at || null, status: 'draft', receive_location_id: header.receive_location_id || null,
            note: header.note || '', lines
        });
        if (result.status !== 'success') {
            const unmatched = result.unmatched?.length ? ` Unmatched: ${result.unmatched.join(', ')}` : '';
            Toast.error((result.message || 'Could not update the purchase order draft.') + unmatched);
            return false;
        }
        if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
        if (notify) Toast.success(`Added ${newLines.map(line => line.sku).join(', ')} to ${header.reference}.`);
        if (refresh) {
            this.updateCalendarTabVisibility();
            this.refreshResults();
        }
        return true;
    },

    async exportFilteredResults(button) {
        const filters = this.activeFilters();
        button.disabled = true;
        const oldLabel = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting… <span id="mpsExportProgress">0%</span>';

        if (this.exportAbortController) this.exportAbortController.abort();
        this.exportAbortController = new AbortController();
        const controller = this.exportAbortController;

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-ghost btn-sm mps-export-cancel';
        cancelButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Cancel</span>';
        if (button.parentNode) button.parentNode.insertBefore(cancelButton, button.nextSibling);

        const progressEl = document.getElementById('mpsExportProgress');
        if (progressEl) progressEl.textContent = '10%';
        setTimeout(() => { if (progressEl && !controller.signal.aborted) progressEl.textContent = '50%'; }, 200);
        cancelButton.addEventListener('click', () => controller.abort());

        try {
            const filename = `mps-results-${this.filters.status || 'all'}-${today()}.csv`;
            const result = await API.mpsExportResults(filters, filename, controller.signal);
            if (progressEl) progressEl.textContent = '100%';
            if (result.status === 'success') {
                Toast.success('Export complete. The CSV file has been downloaded.');
            } else {
                throw new Error(result.message || 'Export failed');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                Toast.info('Export cancelled.');
            } else {
                Toast.error(error.message || 'Could not export planner results.');
            }
        } finally {
            button.disabled = false;
            button.innerHTML = oldLabel;
            if (cancelButton.parentNode) cancelButton.remove();
            if (this.exportAbortController === controller) this.exportAbortController = null;
        }
    }
};
