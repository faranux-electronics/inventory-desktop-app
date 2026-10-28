const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

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
            sort_by: this.sortBy,
            sort_order: this.sortOrder
        };
    },

    resultsCacheKey() {
        return {...this.activeFilters(), page: this.page, per_page: this.perPage};
    },

    summaryFilters() {
        const {search, ...filters} = this.activeFilters();
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
            this.addContextualHelp('planning');
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
            this.decorateSortableTable(table.querySelector('.mps-table'), ['name','status','current_stock','incoming','avg_window','buffer','reorder_qty','order_by_date','order_value'], 'planning', this.sortBy, this.sortOrder);
        }

        const pag = document.getElementById('mpsResultsPagination');
        if (pag) pag.innerHTML = this.paginationHtml();
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
        return `<div class="mps-loading mps-summary-loading" aria-busy="true" aria-live="polite">
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Building summary…
            <div class="mps-summary-progress"><div><b id="mpsSummaryProgressBar" style="width:5%"></b></div>
            <span id="mpsSummaryProgressText">Loading planner results…</span>
            <button id="mpsSummaryCancel" class="btn btn-ghost btn-sm" type="button"><i class="fa-solid fa-xmark"></i> Cancel</button></div>
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
            await Promise.all([this.ensureSuppliers(), this.ensureCategories()]);

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
            this.addContextualHelp('summary');
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
        const estimated = Number(overview.estimated_products || 0);

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
        const timelineItems = [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 10).map(([key, value]) => ({label: key.slice(5), value}));
        const topItems = (top.length ? top : [...rows].sort((a, b) => Number(b.order_value || 0) - Number(a.order_value || 0)).slice(0, 10))
            .map(row => ({label: row.name || row.sku || `#${row.product_id}`, value: Number(row.order_value || 0), productId: row.product_id}));

        return {
            overview, products, toOrder, units, orderValue, estimated,
            statusSegments, valueSegments, unitSegments, coverItems,
            supplierItems, categoryItems, timelineItems, topItems,
            total: Number(this.summary?.total || 0),
            loaded: rows.length,
            capped: !!this.summary?.capped,
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
            return `Sales refresh running · ${done} month${done === 1 ? '' : 's'} done${current} · started ${stamp(refresh?.started_at)}`;
        }
        if (state === 'success') {
            const parts = ['Latest sales refresh', stamp(refresh?.finished_at || refresh?.updated_at || fallbackDate), range];
            const months = windows || Number(refresh?.months_done || 0);
            const orders = Number(totals.orders_counted || 0);
            const rows = Number(totals.rows_written || 0);
            if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`);
            parts.push(`${num(orders)} order${orders === 1 ? '' : 's'}`, `${num(rows)} row${rows === 1 ? '' : 's'}`);
            const skipped = Number(totals.unknown_product_count || 0);
            const refundErrors = Number(totals.refund_errors || 0);
            if (skipped) parts.push(`${num(skipped)} unknown product${skipped === 1 ? '' : 's'} skipped`);
            if (refundErrors) parts.push(`${num(refundErrors)} refund error${refundErrors === 1 ? '' : 's'}`);
            return parts.filter(Boolean).join(' · ');
        }
        if (state === 'error') {
            return ['Last sales refresh failed', stamp(refresh?.finished_at || refresh?.updated_at), refresh?.message || 'Unknown error'].filter(Boolean).join(' · ');
        }
        return fallbackDate ? `Latest sales refresh · ${stamp(fallbackDate)}` : 'No sales refresh recorded yet.';
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
        const measured = Math.max(0, d.products - d.estimated);
        const estimateSegments = [
            {label: 'Estimated', value: d.estimated, color: '#ca8a04'},
            {label: 'Measured', value: measured, color: '#059669'}
        ].filter(s => s.value > 0);
        const sampled = d.loaded < d.total;
        const sampleScope = sampled ? `Sample · ${num(d.loaded)} of ${num(d.total)}` : 'All products';
        const scopeNote = d.loaded
            ? (sampled ? `Detail charts: ${num(d.loaded)} of ${num(d.total)} products · status/value totals: all ${num(d.total)}` : `All ${num(d.total)} products charted`)
            : 'No products match the current filters';
        const chartLimitOptions = [[5, 'Up to 1,000'], [10, 'Up to 2,000'], [25, 'Up to 5,000'], [0, 'All products']]
            .map(([pages, label]) => `<option value="${pages}" ${Number(this.summaryPageCap) === pages ? 'selected' : ''}>${label}</option>`).join('');
        const cards = [
            ['Products planned', num(d.products), 'fa-boxes-stacked', 'Total products included in the current planner results and summary.'],
            ['Need replenishment', num(d.toOrder), 'fa-triangle-exclamation', 'Products that need replenishment based on the latest run.'],
            ['Suggested units', num(d.units), 'fa-cart-flatbed', 'Total suggested units to order across products that need replenishment.'],
            ['Order now', num(o.order_now), 'fa-clock', 'Products flagged as needing to order now in the latest run.'],
            ['Reorder value', money(d.orderValue), 'fa-coins', 'Estimated reorder value (suggested units × cost) from the latest run.'],
            ['Estimated products', num(d.estimated), 'fa-chart-simple', 'Products using estimated demand (no measured sales history) in the latest run.']
        ].map(([label, value, icon]) => `<article class="mps-stat"><span class="mps-stat-icon"><i class="fa-solid ${icon}"></i></span><span class="mps-stat-label">${label}</span><strong>${value}</strong></article>`).join('');

        return `<div class="mps-stats" id="mpsSummaryStats">${cards}</div>
            <div class="mps-run-meta" id="mpsSummaryMeta">${o.run ? `Latest run #${esc(o.run.id)} · ${esc(o.run.as_of_date)} · ${num(d.products)} products` : 'No completed planner run yet.'} · ${num(d.estimated)} estimated</div>
            <div class="mps-run-meta mps-sales-refresh-meta" id="mpsSalesRefreshMeta">${esc(this.salesRefreshMetaText(null, o.sales_last_refresh))}</div>
            <div class="mps-toolbar mps-toolbar-advanced"><div class="mps-filter-controls mps-filter-grid">${this.filterControlsHtml({includeSearch: false})}<label class="mps-chart-limit">Detail chart sample<select id="mpsChartLimit" aria-label="Detail chart sample size">${chartLimitOptions}</select></label></div><span class="mps-total" id="mpsSummaryTotal" aria-live="polite">${esc(scopeNote)}</span></div>
            <div id="mpsSummaryContent">
            <div class="mps-charts-grid">
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Status distribution</h2><p>All products · by planner status</p></div><span>${num(statusTotal)}</span></div>
                    <div class="mps-status-chart">${donutChart(d.statusSegments, num(statusTotal), 'products', 'Status distribution')}<div class="mps-legend">${legendHtml(d.statusSegments, statusTotal) || '<p class="mps-chart-empty">Run the planner to see status distribution.</p>'}</div></div>
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Estimated vs measured</h2><p>All products · demand signal quality</p></div><span>${num(d.products)}</span></div>
                    <div class="mps-status-chart">${donutChart(estimateSegments, `${d.products ? Math.round(measured / d.products * 100) : 0}%`, 'measured', 'Estimated versus measured products')}<div class="mps-legend">${legendHtml(estimateSegments, d.products) || '<p class="mps-chart-empty">No data yet.</p>'}</div></div>
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Reorder value by status</h2><p>All products · value by status</p></div><span>${money(valueTotal)}</span></div>
                    ${hBars(d.valueSegments, {formatter: value => `${shortNum(value)} RWF`, empty: 'No reorder value in the latest run.', ariaLabel: 'Reorder value by status'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Suggested units by status</h2><p>All products · units by status</p></div><span>${num(d.units)}</span></div>
                    ${hBars(d.unitSegments, {formatter: num, empty: 'No replenishment units in the latest run.', ariaLabel: 'Suggested units by status'})}
                </section>
                <section class="mps-chart-card mps-chart-wide">
                    <div class="mps-chart-head"><div><h2>Top products by order value</h2><p>Top 10 by value</p></div><span>${num(d.topItems.length)}</span></div>
                    ${hBars(d.topItems, {formatter: value => `${shortNum(value)} RWF`, empty: 'No products with an order value.', ariaLabel: 'Top products by order value'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Coverage risk</h2><p>Days of cover · ${sampleScope}</p></div><span>${num(d.loaded)}</span></div>
                    ${columnChart(d.coverItems, {formatter: num, empty: 'No days-of-cover data.', ariaLabel: 'Coverage risk by days of cover'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Supplier contribution</h2><p>Order value by supplier · ${sampleScope}</p></div><span>${num(d.supplierItems.length)}</span></div>
                    ${hBars(d.supplierItems, {formatter: value => `${shortNum(value)} RWF`, empty: 'No supplier data in the sampled products.', ariaLabel: 'Order value by supplier'})}
                </section>
                <section class="mps-chart-card">
                    <div class="mps-chart-head"><div><h2>Category mix</h2><p>Products by category · ${sampleScope}</p></div><span>${num(d.categoryItems.length)}</span></div>
                    ${hBars(d.categoryItems, {formatter: num, empty: 'No category data in the sampled products.', ariaLabel: 'Products by category'})}
                </section>
                <section class="mps-chart-card mps-chart-wide">
                    <div class="mps-chart-head"><div><h2>Order-by timeline</h2><p>Products due per week · ${sampleScope}</p></div><span>${num(d.timelineItems.length)} weeks</span></div>
                    ${columnChart(d.timelineItems, {formatter: num, empty: 'No order-by dates in the sampled products.', ariaLabel: 'Products due to be ordered per week'})}
                </section>
            </div>
            ${d.capped ? `<p class="mps-run-meta">Detail charts are based on the first ${num(d.pagesLoaded * this.summaryPerPage)} products (earliest order-by dates) to keep loading bounded. Status and value totals use all products.</p>` : ''}
            </div>`;
    },

    attachSummaryEvents() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        this.bindFilterEvents(() => this.loadSummary({patch: true}));
        panel.onclick = event => {
            const productButton = event.target.closest('.mps-product-link');
            if (productButton) this.showProduct(productButton.dataset.product);
        };
    },

    filterControlsHtml({includeSearch = true} = {}) {
        const supplierOptions = (this.suppliersList || []).map(s => `<option value="${esc(s.id)}" ${String(this.filters.supplier) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
        const currentCategory = this.filters.category;
        const categoryOptions = (this.categoriesList || []).map(c => `<option value="${esc(c)}" ${c === currentCategory ? 'selected' : ''}>${esc(c)}</option>`).join('');
        const legacyCategory = currentCategory && !(this.categoriesList || []).includes(currentCategory)
            ? `<option value="${esc(currentCategory)}" selected>${esc(currentCategory)}</option>` : '';
        const dateField = (id, label, value, tip) => `<span class="mps-date-field ${value ? '' : 'mps-field-empty'}">
            <input id="${id}" type="date" value="${esc(value)}" placeholder="${esc(label)}" aria-label="${esc(label)}">
            <span class="mps-field-hint" aria-hidden="true">${esc(label)}</span>
        </span>`;
        const search = includeSearch ? `<input id="mpsSearch" type="search" placeholder="Search products or SKU" value="${esc(this.filters.search)}" aria-label="Search products or SKU">` : '';
        return `${search}
            <select id="mpsStatus" aria-label="Filter by status"><option value="">All statuses</option>${['reorder','stockout_risk','overstock','dead','new','ok','excluded'].map(s => `<option value="${s}" ${this.filters.status === s ? 'selected' : ''}>${esc(statusLabel(s))}</option>`).join('')}</select>
            <select id="mpsCategory" aria-label="Filter by category"><option value="">All categories</option>${legacyCategory}${categoryOptions}</select>
            <select id="mpsSupplier" aria-label="Filter by supplier"><option value="">All suppliers</option>${supplierOptions}</select>
            ${dateField('mpsStockoutDate', 'Stockout before', this.filters.stockout_date, 'Show products expected to stock out before this date')}
            ${dateField('mpsOrderByDate', 'Order by date', this.filters.order_by_date, 'Show products that need to be ordered by this date')}
            <input id="mpsMaxDaysCover" type="number" min="0" placeholder="Max days cover" value="${esc(this.filters.max_days_of_cover)}" aria-label="Max days of cover">
            <label class="mps-check" title="Only show products with estimated demand"><input id="mpsEstimatedOnly" type="checkbox" aria-label="Estimated only" ${this.filters.estimated_only ? 'checked' : ''}><span>Estimated</span></label>`;
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
        document.getElementById('mpsChartLimit')?.addEventListener('change', event => {
            this.summaryPageCap = Number(event.target.value);
            this.page = 1;
            scheduleApply();
        });
    },

    planningHtml() {
        const total = Number(this.results?.total || 0);
        return `<div class="mps-toolbar mps-toolbar-advanced"><div class="mps-filter-controls mps-filter-grid">${this.filterControlsHtml()}</div><span class="mps-total" id="mpsResultsTotal" aria-live="polite">${total.toLocaleString()} products</span><button id="mpsExport" class="btn btn-ghost btn-sm" aria-label="Export filtered results to CSV"><i class="fa-solid fa-file-csv" aria-hidden="true"></i> Export CSV</button></div>
            <div id="mpsResultsTable" aria-live="polite">${this.resultsTableHtml()}</div>
            <footer id="mpsResultsPagination" aria-live="polite">${this.paginationHtml()}</footer>`;
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

    ordersPaginationHtml(total) {
        const perPage = 25;
        if (!total) return '';
        const pages = Math.max(1, Math.ceil(total / perPage));
        const page = this.ordersPage;
        const start = (page - 1) * perPage + 1;
        const end = Math.min(page * perPage, total);
        const first = Math.max(1, Math.min(page - 1, pages - 2));
        const last = Math.min(pages, first + 2);
        let buttons = first > 1 ? '<span class="mps-page-gap">...</span>' : '';
        for (let i = first; i <= last; i++) buttons += `<button class="page-btn ${i === page ? 'active' : ''}" data-orders-page="${i}">${i}</button>`;
        if (last < pages) buttons += '<span class="mps-page-gap">...</span>';
        return `<div class="pagination mps-pagination"><div class="pagination-info">Showing ${start} - ${end} of ${total.toLocaleString()} purchase orders</div><div class="pagination-controls">
            <button class="page-btn" data-orders-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Prev</button>
            ${buttons}
            <button class="page-btn" data-orders-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>
        </div></div>`;
    },

    resultsTableHtml() {
        const rows = this.results?.data || [];
        if (!rows.length) {
            return '<div class="mps-empty-card">No planner results found for the current filters.</div>';
        }

        const body = rows.map(row => `
            <tr>
                <td>
                    <button class="mps-product-link" data-product="${Number(row.product_id)}">${esc(row.name)}</button>
                    <small>${esc(row.sku || '—')}</small>
                </td>
                <td><span class="mps-status mps-status-${esc(row.status)}">${esc(statusLabel(row.status))}</span></td>
                <td class="mps-num">${Number(row.current_stock || 0).toLocaleString()}</td>
                <td class="mps-num">${Number(row.incoming || 0).toLocaleString()}</td>
                <td class="mps-num">${esc(row.avg_window)}</td>
                <td class="mps-num">${esc(row.buffer)}</td>
                <td class="mps-num mps-qty">${Number(row.reorder_qty || 0).toLocaleString()}</td>
                <td>${esc(row.order_by_date || '—')}</td>
                <td class="mps-num">${money(row.order_value)}</td>
            </tr>`).join('');

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
        return `<div class="mps-table-wrap wp-list-table-wrapper"><table class="mps-table wp-list-table widefat striped posts"><thead><tr><th class="mps-has-tooltip" data-tooltip="${esc(tips.Product)}">Product</th><th class="mps-has-tooltip" data-tooltip="${esc(tips.Status)}">Status</th><th class="mps-num mps-has-tooltip" data-tooltip="${esc(tips.Stock)}">Stock</th><th class="mps-num mps-has-tooltip" data-tooltip="${esc(tips.Incoming)}">Incoming</th><th class="mps-num mps-has-tooltip" data-tooltip="${esc(tips['Avg / bucket'])}">Avg / bucket</th><th class="mps-num mps-has-tooltip" data-tooltip="${esc(tips.Buffer)}">Buffer</th><th class="mps-num mps-has-tooltip" data-tooltip="${esc(tips.Reorder)}">Reorder</th><th class="mps-has-tooltip" data-tooltip="${esc(tips['Order by'])}">Order by</th><th class="mps-num mps-has-tooltip" data-tooltip="${esc(tips.Value)}">Value</th></tr></thead><tbody>${body}</tbody></table></div>`;
    },

    paginationHtml() {
        const total = Number(this.results?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / this.perPage));
        if (!total) return '';

        const start = (this.page - 1) * this.perPage + 1;
        const end = Math.min(this.page * this.perPage, total);
        const maxPages = 3;
        let startPage = Math.max(1, this.page - Math.floor(maxPages / 2));
        const endPage = Math.min(totalPages, startPage + maxPages - 1);
        if (endPage - startPage < maxPages - 1) startPage = Math.max(1, endPage - maxPages + 1);

        let pageButtons = '';
        if (startPage > 1) {
            pageButtons += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) pageButtons += `<span class="mps-page-gap">…</span>`;
        }
        for (let i = startPage; i <= endPage; i++) {
            pageButtons += `<button class="page-btn ${i === this.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) pageButtons += `<span class="mps-page-gap">…</span>`;
            pageButtons += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        return `<div class="pagination"><div class="pagination-info">Showing ${start} - ${end} of ${total.toLocaleString()} products</div><div class="pagination-controls">
            <button class="page-btn" data-page="${this.page - 1}" ${this.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Prev</button>
            ${pageButtons}
            <button class="page-btn" data-page="${this.page + 1}" ${this.page >= totalPages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>
        </div></div>`;
    },

    attachPlanningEvents() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;

        this.decorateSortableTable(panel.querySelector('#mpsResultsTable .mps-table'), ['name','status','current_stock','incoming','avg_window','buffer','reorder_qty','order_by_date','order_value'], 'planning', this.sortBy, this.sortOrder);
        this.bindFilterEvents(() => this.refreshResults());
        document.getElementById('mpsExport')?.addEventListener('click', event => this.exportFilteredResults(event.currentTarget));

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
            const productButton = event.target.closest('.mps-product-link');
            if (productButton) this.showProduct(productButton.dataset.product);
        };
    },

    async exportFilteredResults(button) {
        const filters = this.activeFilters();
        button.disabled = true;
        const oldLabel = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting… <span id="mpsExportProgress">0%</span>';

        if (this.exportAbortController) {
            this.exportAbortController.abort();
        }
        this.exportAbortController = new AbortController();
        const controller = this.exportAbortController;

        const cancelButton = document.createElement('button');
        cancelButton.className = 'btn btn-ghost btn-sm';
        cancelButton.style.marginLeft = '8px';
        cancelButton.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel';
        if (button.parentNode) {
            button.parentNode.insertBefore(cancelButton, button.nextSibling);
        }

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
            if (cancelButton.parentNode) {
                cancelButton.remove();
            }
            if (this.exportAbortController === controller) this.exportAbortController = null;
        }
    }
};
