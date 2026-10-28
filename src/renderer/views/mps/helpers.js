const API = require('../../services/api.js');
const Toast = require('../../components/Toast.js');

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today = () => isoDate(new Date());
const daysAgo = days => { const d = new Date(); d.setDate(d.getDate()-days); return isoDate(d); };
const money = value => value == null ? '—' : `${Number(value).toLocaleString()} RWF`;
const statusLabel = value => String(value || 'unknown').replace(/_/g, ' ');
const num = value => Number(value || 0).toLocaleString();
const qty = value => Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 1});
const monthLabel = value => {
    const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
        ? String(value || '').slice(0, 7)
        : date.toLocaleDateString(undefined, {month: 'short', year: 'numeric'});
};
const shortNum = value => {
    const v = Number(value || 0);
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return String(Math.round(v));
};
const CHART_COLORS = ['#be123c', '#ea580c', '#2563eb', '#7c3aed', '#0891b2', '#059669', '#ca8a04', '#db2777', '#78716c', '#0f766e'];
const STATUS_COLORS = {stockout_risk:'#be123c',reorder:'#ea580c',new:'#2563eb',overstock:'#7c3aed',dead:'#78716c',ok:'#059669',excluded:'#d6d3d1'};
const STATUS_ORDER = ['stockout_risk', 'reorder', 'new', 'overstock', 'dead', 'ok', 'excluded'];
const FILTER_DEBOUNCE_MS = 500;

function donutChart(segments, centerStrong, centerSmall, ariaLabel) {
    const total = segments.reduce((sum, s) => sum + Number(s.value || 0), 0);
    let offset = 0;
    const stops = segments.map(s => {
        const val = Number(s.value || 0);
        const start = offset;
        offset += total ? val / total * 100 : 0;
        return `${s.color} ${start.toFixed(2)}% ${offset.toFixed(2)}%`;
    });
    const bg = total ? `conic-gradient(${stops.join(',')})` : 'conic-gradient(#e7e5e4 0% 100%)';
    return `<div class="mps-chart-donut" role="img" aria-label="${esc(ariaLabel || '')}" style="--mps-donut:${bg}"><div><strong>${esc(centerStrong)}</strong><small>${esc(centerSmall || '')}</small></div></div>`;
}

function legendHtml(segments, total, valueFormatter = num) {
    return segments.map(s => {
        const share = total ? Math.round(Number(s.value || 0) / total * 100) : 0;
        return `<div class="mps-legend-row"><span class="mps-legend-label"><i style="--mps-status-color:${s.color}"></i>${esc(s.label)}</span><span>${valueFormatter(s.value)} <small>${share}%</small></span></div>`;
    }).join('');
}

function hBars(items, options = {}) {
    const {formatter = num, empty = 'No data', maxItems = 8, ariaLabel = ''} = options;
    const list = items.filter(i => Number(i.value) > 0).sort((a, b) => Number(b.value) - Number(a.value)).slice(0, maxItems);
    if (!list.length) return `<p class="mps-chart-empty">${esc(empty)}</p>`;
    const max = Math.max(...list.map(i => Number(i.value) || 0), 1);
    return `<div class="mps-hbars" role="img" aria-label="${esc(ariaLabel)}">${list.map((i, idx) => `
        <div class="mps-hbar"><div class="mps-hbar-label" title="${esc(i.label)}">${esc(i.label)}</div>
        <div class="mps-hbar-track"><b style="width:${Math.max(2, Number(i.value) / max * 100)}%;background:${i.color || CHART_COLORS[idx % CHART_COLORS.length]}"></b></div>
        <span>${esc(formatter(i.value))}</span></div>`).join('')}</div>`;
}

function columnChart(items, options = {}) {
    const {formatter = num, empty = 'No data', ariaLabel = ''} = options;
    const list = items.filter(i => Number(i.value) > 0);
    if (!list.length) return `<p class="mps-chart-empty">${esc(empty)}</p>`;
    const max = Math.max(...list.map(i => Number(i.value) || 0), 1);
    return `<div class="mps-columns" role="img" aria-label="${esc(ariaLabel)}">${list.map((i, idx) => `
        <div class="mps-column" title="${esc(i.label)}: ${esc(formatter(i.value))}"><span>${esc(formatter(i.value))}</span>
        <i><b style="height:${Math.max(3, Number(i.value) / max * 100)}%;background:${i.color || CHART_COLORS[idx % CHART_COLORS.length]}"></b></i>
        <small>${esc(i.label)}</small></div>`).join('')}</div>`;
}


module.exports = { API, Toast, esc, isoDate, today, daysAgo, money, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart };
