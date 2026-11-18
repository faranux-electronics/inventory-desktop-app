const Button = require('./Button.js');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

class Calendar {
    static viewRange(dateValue, view = 'month') {
        const selected = new Date(`${String(dateValue || '').slice(0, 10)}T12:00:00`);
        if (Number.isNaN(selected.getTime())) return null;
        if (view === 'week') {
            const fromDate = new Date(selected);
            fromDate.setDate(fromDate.getDate() - ((fromDate.getDay() + 6) % 7));
            const toDate = new Date(fromDate);
            toDate.setDate(toDate.getDate() + 6);
            return {from: formatDate(fromDate), to: formatDate(toDate)};
        }
        if (view === 'agenda') {
            const fromDate = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
            const toDate = new Date(selected.getFullYear(), selected.getMonth() + 3, 0, 12);
            return {from: formatDate(fromDate), to: formatDate(toDate)};
        }
        return Calendar.monthRange(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}`);
    }

    static monthRange(month) {
        const [year, monthNumber] = String(month || '').split('-').map(Number);
        if (!year || monthNumber < 1 || monthNumber > 12) return null;
        const firstOfMonth = new Date(year, monthNumber - 1, 1, 12);
        const firstDay = new Date(year, monthNumber - 1, 1 - ((firstOfMonth.getDay() + 6) % 7), 12);
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 41);
        return {from: formatDate(firstDay), to: formatDate(lastDay)};
    }

    /** Render a six-week month grid. Event markup and day summaries can be supplied by the calling view. */
    static html({
        month, selectedDate = '', view = 'month', events = [], today = '', className = 'app-calendar', legend = [],
        getDate = event => event.date,
        getEventClass = event => event.type || 'event',
        renderEvent = event => `<strong>${escapeHtml(event.title || 'Event')}</strong>`,
        daySummary = items => `${items.length} event${items.length === 1 ? '' : 's'}`,
        maxVisibleEvents = 2, showMoreThreshold = maxVisibleEvents,
        moreButtonLabel = (count, visibleCount) => `Show ${count - visibleCount} more`
    } = {}) {
        const dateValue = selectedDate || (month ? `${month}-01` : '');
        const [year, monthNumber, selectedDay = 1] = String(dateValue).split('-').map(Number);
        if (!year || monthNumber < 1 || monthNumber > 12) return '';
        const monthStart = new Date(year, monthNumber - 1, 1, 12);
        const isWeekView = view === 'week';
        const isAgendaView = view === 'agenda';
        const selected = new Date(year, monthNumber - 1, selectedDay, 12);
        const firstDay = isWeekView
            ? new Date(year, monthNumber - 1, selectedDay - ((selected.getDay() + 6) % 7), 12)
            : new Date(year, monthNumber - 1, 1 - ((monthStart.getDay() + 6) % 7), 12);
        const byDate = new Map();
        events.forEach((event, index) => {
            const key = String(getDate(event) || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
            if (!byDate.has(key)) byDate.set(key, []);
            byDate.get(key).push({event, index});
        });

        const header = `<div class="${className}-toolbar"><div class="${className}-navigation">
            ${Button.html({text: 'Today', variant: 'outline', size: 'sm', className: 'mps-brand-outline', dataAttributes: {'data-calendar-today': ''}})}
            ${Button.html({icon: 'fa-solid fa-chevron-left', variant: 'outline', size: 'sm', className: 'mps-brand-outline', ariaLabel: 'Previous period', dataAttributes: {'data-calendar-prev': ''}})}
            ${Button.html({icon: 'fa-solid fa-chevron-right', variant: 'outline', size: 'sm', className: 'mps-brand-outline', ariaLabel: 'Next period', dataAttributes: {'data-calendar-next': ''}})}
            <input class="${className}-date-input" type="date" value="${formatDate(selected)}" aria-label="Choose calendar date" data-calendar-date>
            <div class="${className}-view-switch" role="group" aria-label="Calendar view">
                <button type="button" class="btn btn-sm btn-outline mps-brand-outline${isWeekView ? ' active' : ''}" data-calendar-view="week" aria-pressed="${isWeekView}">Week</button>
                <button type="button" class="btn btn-sm btn-outline mps-brand-outline${view === 'month' ? ' active' : ''}" data-calendar-view="month" aria-pressed="${view === 'month'}">Month</button>
                <button type="button" class="btn btn-sm btn-outline mps-brand-outline${isAgendaView ? ' active' : ''}" data-calendar-view="agenda" aria-pressed="${isAgendaView}">Agenda</button>
            </div>
        </div><div class="${className}-legend">${legend.map(item => `<span><i class="${className}-key ${className}-key-${escapeHtml(item.key || '')}" aria-hidden="true"></i>${escapeHtml(item.label)}</span>`).join('')}</div></div>`;

        const cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            .map(day => `<div class="${className}-weekday" role="columnheader">${day}</div>`);
        for (let i = 0; i < (isWeekView ? 7 : 42); i++) {
            const date = new Date(firstDay);
            date.setDate(firstDay.getDate() + i);
            const key = formatDate(date);
            const dayEvents = byDate.get(key) || [];
            const summary = dayEvents.length ? `<div class="${className}-count">${escapeHtml(daySummary(dayEvents.map(item => item.event)))}</div>` : '';
            const visible = dayEvents.map(({event, index}, eventPosition) => {
                const type = String(getEventClass(event) || 'event').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
                const hidden = eventPosition >= maxVisibleEvents ? ' hidden' : '';
                return `<button type="button" class="${className}-event ${className}-${type}" data-calendar-event="${index}" title="${escapeHtml(event.title || '')}"${hidden}>${renderEvent(event)}</button>`;
            }).join('');
            const more = dayEvents.length > showMoreThreshold
                ? `<button type="button" class="${className}-more" data-calendar-more="${key}" aria-expanded="false">${escapeHtml(moreButtonLabel(dayEvents.length, Math.min(dayEvents.length, maxVisibleEvents)))}</button>`
                : '';
            const dayClass = `${className}-day${date.getMonth() === monthNumber - 1 ? '' : ' outside'}${key === today ? ' today' : ''}`;
            cells.push(`<div class="${dayClass}" role="gridcell" aria-label="${key}"><div class="${className}-date">${date.getDate()}</div>${summary}<div class="${className}-events">${visible || `<span class="${className}-empty">&nbsp;</span>`}</div>${more}</div>`);
        }
        if (isAgendaView) {
            const agendaRange = Calendar.viewRange(formatDate(selected), 'agenda');
            const days = [...byDate.entries()]
                .filter(([key]) => key >= agendaRange.from && key <= agendaRange.to)
                .sort(([a], [b]) => a.localeCompare(b));
            const agenda = days.length ? days.map(([key, items]) => {
                const date = new Date(`${key}T12:00:00`);
                const visibleItems = items.slice(0, 8);
                const eventButtons = visibleItems.map(({event, index}) => {
                    const type = String(getEventClass(event) || 'event').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
                    return `<button type="button" class="${className}-event ${className}-${type}" data-calendar-event="${index}" title="${escapeHtml(event.title || '')}">${renderEvent(event)}</button>`;
                }).join('');
                const more = items.length > visibleItems.length
                    ? `<button type="button" class="${className}-more" data-calendar-more="${key}" aria-expanded="false">Show ${items.length - visibleItems.length} more</button>`
                    : '';
                return `<section class="${className}-agenda-day"><h3>${escapeHtml(date.toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'}))}<span>${items.length} item${items.length === 1 ? '' : 's'}</span></h3><div class="${className}-agenda-events">${eventButtons}</div>${more}</section>`;
            }).join('') : `<p class="${className}-agenda-empty">No events scheduled for these three months.</p>`;
            const rangeLabel = `${new Date(`${agendaRange.from}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})} – ${new Date(`${agendaRange.to}T12:00:00`).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}`;
            return `${header}<div class="${className}-agenda" aria-label="Three month agenda"><p class="${className}-agenda-range">Next 3 months · ${escapeHtml(rangeLabel)}</p>${agenda}</div>`;
        }
        const gridLabel = isWeekView
            ? `Week of ${formatDate(firstDay)}`
            : `Calendar for ${monthStart.toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}`;
        return `${header}<div class="${className}-scroll"><div class="${className}-grid${isWeekView ? ' week-view' : ''}" role="grid" aria-label="${escapeHtml(gridLabel)}">${cells.join('')}</div></div>`;
    }

    /** Bind delegated navigation and event callbacks to the rendered calendar root. */
    static bind(root, {events = [], getDate = item => item.event_date || item.date, onPrevious, onNext, onToday, onDateChange, onViewChange, onEvent, onMore} = {}) {
        if (!root) return () => {};
        const click = event => {
            const button = event.target.closest('button');
            if (!button || !root.contains(button)) return;
            if (button.hasAttribute('data-calendar-prev')) onPrevious?.();
            else if (button.hasAttribute('data-calendar-next')) onNext?.();
            else if (button.hasAttribute('data-calendar-today')) onToday?.();
            else if (button.hasAttribute('data-calendar-event')) {
                const item = events[Number(button.dataset.calendarEvent)];
                if (item) onEvent?.(item);
            } else if (button.hasAttribute('data-calendar-more')) {
                onMore?.(button.dataset.calendarMore, events.filter(item => String(getDate(item) || '').slice(0, 10) === button.dataset.calendarMore));
            }
        };
        const change = event => {
            if (event.target.matches('[data-calendar-date]')) onDateChange?.(event.target.value);
        };
        const clickView = event => {
            const button = event.target.closest('[data-calendar-view]');
            if (button && root.contains(button)) onViewChange?.(button.dataset.calendarView);
        };
        root.addEventListener('click', click);
        root.addEventListener('click', clickView);
        root.addEventListener('change', change);
        return () => {
            root.removeEventListener('click', click);
            root.removeEventListener('click', clickView);
            root.removeEventListener('change', change);
        };
    }
}

module.exports = Calendar;
