const { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    async loadCalendar() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        const [year, month] = this.calendarMonth.split('-').map(Number);
        const firstOfMonth = new Date(year, month - 1, 1, 12);
        const firstDay = new Date(year, month - 1, 1 - ((firstOfMonth.getDay() + 6) % 7), 12);
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 41);
        const from = isoDate(firstDay), to = isoDate(lastDay);
        const token = ++this.calendarRequestToken;
        panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading calendar...</div>';
        const result = await API.mpsGetCalendarEvents(from, to);
        if (token !== this.calendarRequestToken || !document.getElementById('mpsPanel')) return;
        if (result.status !== 'success') {
            panel.innerHTML = `<div class="mps-empty">${esc(result.message || 'Could not load calendar events.')}</div>`;
            this.addContextualHelp('calendar');
            return;
        }
        const eventsByDate = new Map();
        (result.events || []).forEach(event => {
            const key = String(event.event_date || '').slice(0, 10);
            if (!eventsByDate.has(key)) eventsByDate.set(key, []);
            eventsByDate.get(key).push(event);
        });
        const todayDate = today();
        const cells = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => `<div class="mps-calendar-weekday" role="columnheader">${day}</div>`);
        for (let i = 0; i < 42; i++) {
            const date = new Date(firstDay);
            date.setDate(firstDay.getDate() + i);
            const key = isoDate(date);
            const dayEvents = eventsByDate.get(key) || [];
            const eventHtml = dayEvents.map(event => event.type === 'purchase_order'
                ? `<button class="mps-calendar-event mps-calendar-po" data-calendar-po="${Number(event.purchase_order_id)}" title="${esc(event.title)} · ${esc(statusLabel(event.status))}"><strong><i class="fa-solid fa-truck" aria-hidden="true"></i> ${esc(event.title)}</strong><span>${esc(event.detail || 'Unassigned')} · ${Number(event.quantity || 0).toLocaleString()} due</span></button>`
                : `<button class="mps-calendar-event mps-calendar-reorder" data-calendar-product="${Number(event.product_id)}" title="${esc(event.title)} · ${esc(event.sku)}"><strong><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> ${esc(event.sku || event.title)}</strong><span>Reorder ${Number(event.quantity || 0).toLocaleString()} · ${esc(statusLabel(event.status))}</span></button>`).join('');
            cells.push(`<div class="mps-calendar-day${date.getMonth() === month - 1 ? '' : ' outside'}${key === todayDate ? ' today' : ''}" role="gridcell" aria-label="${esc(key)}"><div class="mps-calendar-date">${date.getDate()}</div><div class="mps-calendar-events">${eventHtml || '<span class="mps-calendar-empty">&nbsp;</span>'}</div></div>`);
        }
        panel.innerHTML = `<div class="mps-calendar-toolbar"><div class="mps-calendar-navigation"><button class="btn btn-sm btn-secondary" id="mpsCalendarPrev" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button><h2>${esc(firstOfMonth.toLocaleDateString(undefined, {month:'long',year:'numeric'}))}</h2><button class="btn btn-sm btn-secondary" id="mpsCalendarNext" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button><button class="btn btn-sm btn-secondary" id="mpsCalendarToday">Today</button></div><div class="mps-calendar-legend"><span><i class="mps-calendar-key mps-calendar-key-reorder"></i> Reorder date</span><span><i class="mps-calendar-key mps-calendar-key-po"></i> Purchase order ETA</span></div></div><div class="mps-calendar-scroll"><div class="mps-calendar-grid" role="grid" aria-label="Planner and purchase order calendar">${cells.join('')}</div></div>`;
        panel.querySelectorAll('.mps-calendar-day').forEach(day => {
            const eventList = day.querySelector('.mps-calendar-events');
            const events = [...(eventList?.querySelectorAll('.mps-calendar-event') || [])];
            if (!events.length) return;
            const poCount = events.filter(event => event.classList.contains('mps-calendar-po')).length;
            const reorderCount = events.length - poCount;
            day.querySelector('.mps-calendar-date')?.insertAdjacentHTML('afterend', `<div class="mps-calendar-count">${events.length} item${events.length === 1 ? '' : 's'} · ${poCount} PO · ${reorderCount} reorder</div>`);
            if (events.length <= 2) return;
            events.slice(2).forEach(event => { event.hidden = true; });
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'mps-calendar-more';
            more.textContent = `Show ${events.length - 2} more`;
            more.addEventListener('click', () => {
                const dateKey = day.getAttribute('aria-label');
                this.showCalendarDayEvents(dateKey, eventsByDate.get(dateKey) || []);
            });
            eventList.append(more);
        });
        panel.querySelector('#mpsCalendarPrev')?.addEventListener('click', () => this.changeCalendarMonth(-1));
        panel.querySelector('#mpsCalendarNext')?.addEventListener('click', () => this.changeCalendarMonth(1));
        panel.querySelector('#mpsCalendarToday')?.addEventListener('click', () => { this.calendarMonth = today().slice(0, 7); this.loadCalendar(); });
        panel.querySelectorAll('[data-calendar-product]').forEach(button => button.addEventListener('click', () => this.showProduct(button.dataset.calendarProduct)));
        panel.querySelectorAll('[data-calendar-po]').forEach(button => button.addEventListener('click', () => this.openCalendarPurchaseOrder(Number(button.dataset.calendarPo))));
        this.addContextualHelp('calendar');
    },

    showCalendarDayEvents(dateKey, events) {
        const date = new Date(`${dateKey}T12:00:00`);
        const dateLabel = Number.isNaN(date.getTime()) ? dateKey : date.toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
        const overlay = document.createElement('div');
        overlay.className = 'mps-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        const eventRows = events.map(event => event.type === 'purchase_order'
            ? `<button type="button" class="mps-calendar-event mps-calendar-po" data-calendar-po="${Number(event.purchase_order_id)}"><strong><i class="fa-solid fa-truck" aria-hidden="true"></i> ${esc(event.title)}</strong><span>${esc(event.detail || 'Unassigned')} · ${Number(event.quantity || 0).toLocaleString()} due · ${esc(statusLabel(event.status))}</span></button>`
            : `<button type="button" class="mps-calendar-event mps-calendar-reorder" data-calendar-product="${Number(event.product_id)}"><strong><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> ${esc(event.sku || event.title)}</strong><span>${esc(event.title)} · Reorder ${Number(event.quantity || 0).toLocaleString()} · ${esc(statusLabel(event.status))}</span></button>`).join('');
        overlay.innerHTML = `<section class="mps-dialog mps-calendar-day-dialog"><header><div><small>${events.length} calendar items</small><h2>${esc(dateLabel)}</h2></div><button class="mps-close" type="button" aria-label="Close">&times;</button></header><div class="mps-calendar-day-list">${eventRows}</div></section>`;
        const close = () => overlay.remove();
        overlay.querySelector('.mps-close')?.addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.querySelectorAll('[data-calendar-product]').forEach(button => button.addEventListener('click', () => { const id = button.dataset.calendarProduct; close(); this.showProduct(id); }));
        overlay.querySelectorAll('[data-calendar-po]').forEach(button => button.addEventListener('click', () => { const id = Number(button.dataset.calendarPo); close(); this.openCalendarPurchaseOrder(id); }));
        document.body.append(overlay);
    },

    changeCalendarMonth(offset) {
        const [year, month] = this.calendarMonth.split('-').map(Number);
        const date = new Date(year, month - 1 + offset, 1, 12);
        this.calendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        this.loadCalendar();
    },

    async openCalendarPurchaseOrder(id) {
        if (this.isWriter) return this.openPurchaseOrderEditor(id);
        const detail = await API.mpsGetPurchaseOrder(id);
        if (detail.status !== 'success') return Toast.error(detail.message || 'Could not load purchase order.');
        const po = detail.purchase_order;
        this.openDialog({
            title: `Purchase order ${esc(po.reference)}`,
            confirmText: 'Close',
            body: `<p>${esc(po.supplier_name || 'Unassigned supplier')} · ETA ${esc(po.eta_date || 'Not set')} · ${esc(statusLabel(po.status))}</p><div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Product</th><th>Ordered</th><th>Received</th></tr></thead><tbody>${(detail.lines || []).map(line => `<tr><td>${esc(line.sku)}</td><td>${esc(line.name)}</td><td>${Number(line.qty_ordered).toLocaleString()}</td><td>${Number(line.qty_received).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`,
            onConfirm: async () => true
        });
    }
};
