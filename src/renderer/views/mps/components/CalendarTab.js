const { API, Toast, esc, today, statusLabel } = require('../helpers.js');
const Calendar = require('../../../components/Calendar.js');
const Button = require('../../../components/Button.js');

module.exports = {
    async loadCalendar() {
        const panel = document.getElementById('mpsPanel');
        if (!panel) return;
        this.calendarDate = this.calendarDate || `${this.calendarMonth}-01`;
        this.calendarView = this.calendarView || 'month';
        this.calendarMonth = this.calendarDate.slice(0, 7);
        const range = Calendar.viewRange(this.calendarDate, this.calendarView);
        if (!range) return;
        const {from, to} = range;
        this.calendarRange = {from, to};
        const token = ++this.calendarRequestToken;
        panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading calendar...</div>';
        const dateText = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const requestRanges = [];
        const rangeEnd = new Date(`${to}T12:00:00`);
        let cursor = new Date(`${from}T12:00:00`);
        while (cursor <= rangeEnd) {
            const chunkEnd = new Date(cursor);
            chunkEnd.setDate(chunkEnd.getDate() + 41);
            if (chunkEnd > rangeEnd) chunkEnd.setTime(rangeEnd.getTime());
            requestRanges.push({from: dateText(cursor), to: dateText(chunkEnd)});
            cursor = new Date(chunkEnd);
            cursor.setDate(cursor.getDate() + 1);
        }
        const results = await Promise.all(requestRanges.map(chunk => API.mpsGetCalendarEvents(chunk.from, chunk.to)));
        if (token !== this.calendarRequestToken || !document.getElementById('mpsPanel')) return;
        const failedResult = results.find(result => result.status !== 'success');
        if (failedResult) {
            panel.innerHTML = `<div class="mps-empty">${esc(failedResult.message || 'Could not load calendar events.')}</div>`;
            return;
        }
        const events = results.flatMap(result => result.events || []);
        panel.innerHTML = Calendar.html({
            month: this.calendarMonth,
            selectedDate: this.calendarDate,
            view: this.calendarView,
            maxVisibleEvents: this.calendarView === 'week' ? Number.MAX_SAFE_INTEGER : 2,
            showMoreThreshold: this.calendarView === 'week' ? 6 : 2,
            moreButtonLabel: this.calendarView === 'week'
                ? count => `View all ${count} items`
                : (count, visibleCount) => `Show ${count - visibleCount} more`,
            events,
            today: today(),
            className: 'mps-calendar',
            legend: [{key: 'reorder', label: 'Reorder date'}, {key: 'po', label: 'Purchase order ETA'}],
            getDate: event => event.event_date,
            getEventClass: event => event.type === 'purchase_order' ? 'po' : 'reorder',
            daySummary: items => {
                const purchaseOrders = items.filter(item => item.type === 'purchase_order').length;
                return `${items.length} item${items.length === 1 ? '' : 's'} · ${purchaseOrders} PO · ${items.length - purchaseOrders} reorder`;
            },
            renderEvent: event => event.type === 'purchase_order'
                ? `<strong><i class="fa-solid fa-truck" aria-hidden="true"></i> ${esc(event.title)}</strong><span>${esc(event.detail || 'Unassigned')} · ${Number(event.quantity || 0).toLocaleString()} due</span>`
                : `<strong><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> ${esc(event.sku || event.title)}</strong><span>Reorder ${Number(event.quantity || 0).toLocaleString()} · ${esc(statusLabel(event.status))}</span>`
        });
        if (this.calendarUnbind) this.calendarUnbind();
        this.calendarUnbind = Calendar.bind(panel, {
            events,
            getDate: event => event.event_date,
            onPrevious: () => this.changeCalendarMonth(-1),
            onNext: () => this.changeCalendarMonth(1),
            onToday: () => { this.calendarDate = today(); this.calendarMonth = this.calendarDate.slice(0, 7); this.loadCalendar(); },
            onDateChange: date => { if (date) { this.calendarDate = date; this.calendarMonth = date.slice(0, 7); this.loadCalendar(); } },
            onViewChange: view => { this.calendarView = view; this.loadCalendar(); },
            onMore: (date, dayEvents) => this.showCalendarDayEvents(date, dayEvents),
            onEvent: event => event.type === 'purchase_order'
                ? this.openCalendarPurchaseOrder(Number(event.purchase_order_id))
                : this.showProduct(event.product_id)
        });
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
        overlay.innerHTML = `<section class="mps-dialog mps-calendar-day-dialog"><header><div><small>${events.length} calendar items</small><h2>${esc(dateLabel)}</h2></div><div class="mps-calendar-dialog-actions">${Button.html({id: 'mpsCalendarExport', text: 'Export CSV', icon: 'fa-solid fa-file-csv', variant: 'outline', size: 'sm', className: 'mps-brand-outline', ariaLabel: 'Export this day calendar events to CSV'})}<button class="mps-close" type="button" aria-label="Close">&times;</button></div></header><div class="mps-calendar-day-list">${eventRows}</div></section>`;
        const close = () => overlay.remove();
        overlay.querySelector('.mps-close')?.addEventListener('click', close);
        overlay.querySelector('#mpsCalendarExport')?.addEventListener('click', () => {
            const csvValue = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
            const rows = [
                ['Date', 'Type', 'SKU / Reference', 'Product / Order', 'Quantity', 'Status', 'Details'],
                ...events.map(event => event.type === 'purchase_order'
                    ? [dateKey, 'Purchase order', event.reference || event.title, event.title, event.quantity, statusLabel(event.status), event.detail || '']
                    : [dateKey, 'Reorder', event.sku, event.title, event.quantity, statusLabel(event.status), ''])
            ];
            const csv = `\uFEFF${rows.map(row => row.map(csvValue).join(',')).join('\r\n')}`;
            const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
            const link = document.createElement('a');
            link.href = url;
            link.download = `calendar-${dateKey}.csv`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.querySelectorAll('[data-calendar-product]').forEach(button => button.addEventListener('click', () => { const id = button.dataset.calendarProduct; close(); this.showProduct(id); }));
        overlay.querySelectorAll('[data-calendar-po]').forEach(button => button.addEventListener('click', () => { const id = Number(button.dataset.calendarPo); close(); this.openCalendarPurchaseOrder(id); }));
        document.body.append(overlay);
    },

    changeCalendarMonth(offset) {
        const date = new Date(`${this.calendarDate}T12:00:00`);
        if (this.calendarView === 'week') {
            date.setDate(date.getDate() + offset * 7);
        } else {
            const day = date.getDate();
            date.setDate(1);
            date.setMonth(date.getMonth() + offset);
            const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
            date.setDate(Math.min(day, lastDay));
        }
        this.calendarDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        this.calendarMonth = this.calendarDate.slice(0, 7);
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
