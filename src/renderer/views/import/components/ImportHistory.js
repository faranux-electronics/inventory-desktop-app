const Toast = require('../../../components/Toast.js');
const API = require('../../../services/api.js');
const Modal = require('../../../components/Modal.js');
const Button = require('../../../components/Button.js');
const Input = require('../../../components/Input.js');
const Table = require('../../../components/Table.js');
const FilterBar = require('../../../components/FilterBar.js');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

class ImportHistory {
    constructor(parentView) {
        this.parent = parentView;
        this.historyLogs = [];
        this.defaultDateRange = null;
    }

    render(container) {
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 3);
        const toDateInput = date => {
            const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            return local.toISOString().slice(0, 10);
        };
        this.defaultDateRange = {start: toDateInput(startDate), end: toDateInput(endDate)};
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: var(--theme-text-primary);">Recent Imports</h3>
                    <small class="text-muted" id="historyRangeLabel">Showing imports from the last three months</small>
                </div>

                ${FilterBar.html({className: 'import-history-filter-bar', ariaLabel: 'Filter import history', content: `
                    ${Input.html({type: 'date', id: 'historyStartDate', value: this.defaultDateRange.start, className: 'import-history-filter-control', ariaLabel: 'Start date'})}
                    <span style="color: var(--palette-hex-a7aaad); font-size: 12px;">to</span>
                    ${Input.html({type: 'date', id: 'historyEndDate', value: this.defaultDateRange.end, className: 'import-history-filter-control', ariaLabel: 'End date'})}

                    ${Button.html({id: 'filterHistoryBtn', text: 'Filter', icon: 'fa-solid fa-filter', variant: 'primary', size: 'md'})}
                    ${Button.html({id: 'exportHistoryBtn', text: 'Export Page', icon: 'fa-solid fa-file-csv', variant: 'outline', size: 'md'})}
                `})}
            </div>

            ${Table.html({
                headers: [
                    {label: 'Performed By', width: '24%'},
                    {label: 'Mode', width: '15%'},
                    {label: 'Items', width: '10%'},
                    {label: 'Date & Time', width: '26%'},
                    {label: 'Actions', width: '25%', className: 'text-right'}
                ],
                body: '<tr><td colspan="5" class="text-center p-lg text-muted">Loading history...</td></tr>',
                bodyId: 'historyTableBody',
                className: 'import-history-list-table',
                wrapperClass: 'import-history-table-wrapper',
                ariaLabel: 'Import history'
            })}
            <div id="historyPagination"></div>
        `;
        this.attachEvents(container);
    }

    attachEvents(container) {
        container.querySelector('#filterHistoryBtn').addEventListener('click', () => {
            this.updateRangeLabel();
            this.loadHistory(1);
        });
        container.querySelector('#exportHistoryBtn').addEventListener('click', () => this.exportHistoryCSV());
    }

    updateRangeLabel() {
        const label = document.getElementById('historyRangeLabel');
        if (!label) return;
        const start = document.getElementById('historyStartDate')?.value || '';
        const end = document.getElementById('historyEndDate')?.value || '';
        const formatDate = value => {
            if (!value) return '';
            const [year, month, day] = value.split('-').map(Number);
            return new Date(year, month - 1, day).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        };

        if (start && end) label.textContent = `Showing imports from ${formatDate(start)} to ${formatDate(end)}`;
        else if (start) label.textContent = `Showing imports from ${formatDate(start)} onward`;
        else if (end) label.textContent = `Showing imports through ${formatDate(end)}`;
        else label.textContent = 'Showing imports from all dates';
    }

    async loadHistory(page = 1) {
        const tbody = document.getElementById('historyTableBody');
        const paginationContainer = document.getElementById('historyPagination');
        if (!tbody || !paginationContainer) return;

        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-lg text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Fetching records...</td></tr>';

        const startDate = document.getElementById('historyStartDate').value;
        let endDate = document.getElementById('historyEndDate').value;
        const selectedEndDate = endDate;
        const isDefaultRange = startDate === this.defaultDateRange?.start && selectedEndDate === this.defaultDateRange?.end;
        if (endDate) endDate += ' 23:59:59';

        try {
            const res = await API.getStockImportLogs(page, startDate, endDate);

            if (res.status === 'success') {
                let logs = Array.isArray(res.data) ? res.data : (res.data.data || []);
                let showingLatestFallback = false;
                if (logs.length === 0 && page === 1 && isDefaultRange) {
                    const latestRes = await API.getStockImportLogs(1);
                    if (latestRes.status === 'success') {
                        const latestLogs = Array.isArray(latestRes.data) ? latestRes.data : (latestRes.data?.data || []);
                        if (latestLogs.length > 0) {
                            logs = [latestLogs[0]];
                            showingLatestFallback = true;
                        }
                    }
                }
                this.historyLogs = logs;

                const rangeLabel = document.getElementById('historyRangeLabel');
                if (rangeLabel && showingLatestFallback) {
                    rangeLabel.textContent = 'No imports in the last three months; showing the latest import.';
                } else if (rangeLabel && isDefaultRange) {
                    rangeLabel.textContent = 'Showing imports from the last three months';
                }

                if (logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-lg text-muted" style="background: var(--palette-hex-f9f9f9);">No import history found for this period.</td></tr>';
                    paginationContainer.innerHTML = '';
                    return;
                }

                const locMap = {};
                this.parent.locationsCache.forEach(l => {
                    locMap[String(l.id)] = l.name;
                });

                tbody.innerHTML = logs.map((log, logIndex) => {
                    const date = new Date(log.created_at).toLocaleString();

                    const detailsText = String(log.details || '');
                    let affectedItems = [];
                    let importMode = '';
                    if (log.metadata) {
                        try {
                            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                            affectedItems = Array.isArray(meta?.imported_items) ? meta.imported_items : [];
                            importMode = meta?.mode || '';
                        } catch (e) {}
                    }
                    if (!importMode) importMode = log.details?.match(/\bMode:\s*(add|replace)\b/i)?.[1] || '';
                    const normalizedMode = String(importMode).toLowerCase();
                    const modeLabel = normalizedMode === 'replace' ? 'Replace'
                        : normalizedMode === 'add' ? 'Add' : 'Unknown';
                    let importSource = '';
                    try {
                        const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                        importSource = meta?.source === 'MPS purchase order receipt' ? 'MPS' : '';
                    } catch (e) {}
                    const modeClass = normalizedMode === 'replace' ? 'import-history-mode--replace'
                        : normalizedMode === 'add' ? 'import-history-mode--add' : 'import-history-mode--unknown';
                    const affectedItemsButton = affectedItems.length
                        ? Button.html({
                            text: '',
                            icon: 'fa-solid fa-table-list',
                            variant: 'outline',
                            size: 'md',
                            className: 'import-affected-items-button',
                            title: `View ${affectedItems.length} affected item${affectedItems.length !== 1 ? 's' : ''}`,
                            ariaLabel: `View ${affectedItems.length} affected item${affectedItems.length !== 1 ? 's' : ''}`,
                            dataAttributes: {'data-import-items-index': logIndex}
                        })
                        : '<span class="text-muted">No item details</span>';
                    const exportItemsButton = affectedItems.length
                        ? Button.html({
                            text: '',
                            icon: 'fa-solid fa-file-csv',
                            variant: 'outline',
                            size: 'md',
                            className: 'import-affected-items-export-button',
                            title: `Export ${affectedItems.length} affected item${affectedItems.length !== 1 ? 's' : ''}`,
                            ariaLabel: `Export ${affectedItems.length} affected item${affectedItems.length !== 1 ? 's' : ''}`,
                            dataAttributes: {'data-import-export-index': logIndex}
                        })
                        : '';

                    return `
                        <tr>
                            <td class="import-history-user" data-label="Performed By">
                                ${escapeHtml(log.user_name || 'System User')}
                            </td>
                            <td data-label="Mode"><span class="import-history-mode ${modeClass}"${importSource ? ` title="${escapeHtml(importSource)}"` : ''}>${escapeHtml(importSource ? `${importSource} - ${modeLabel}` : modeLabel)}</span></td>
                            <td class="import-history-item-count" data-label="Items">${affectedItems.length}</td>
                            <td class="import-history-date" data-label="Date & Time">${escapeHtml(date)}</td>
                            <td class="import-history-actions text-right" data-label="Actions"><div class="import-history-row-actions">${affectedItemsButton}${exportItemsButton}</div></td>
                        </tr>
                    `;
                }).join('');

                tbody.querySelectorAll('[data-import-items-index]').forEach(button => {
                    button.addEventListener('click', () => {
                        const log = this.historyLogs[Number(button.dataset.importItemsIndex)];
                        if (log) this.openAffectedItems(log);
                    });
                });
                tbody.querySelectorAll('[data-import-export-index]').forEach(button => {
                    button.addEventListener('click', () => {
                        const log = this.historyLogs[Number(button.dataset.importExportIndex)];
                        if (!log) return;
                        try {
                            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                            const items = Array.isArray(meta?.imported_items) ? meta.imported_items : [];
                            this.exportAffectedItemsCSV(log, items);
                        } catch (error) {
                            Toast.error('Could not read the affected item details.');
                        }
                    });
                });

                if (res.pagination && res.pagination.pages > 1) {
                    const p = res.pagination;
                    paginationContainer.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;">
                            <span class="text-sm text-muted">Showing page <b>${p.page}</b> of <b>${p.pages}</b> (Total records: ${p.total})</span>
                            <div style="display: flex; gap: 8px;">
                                ${Button.html({text: 'Previous', icon: 'fa-solid fa-chevron-left', variant: 'outline', size: 'sm', className: 'btn-hist-page', disabled: p.page <= 1, dataAttributes: {'data-page': p.page - 1}})}
                                ${Button.html({text: 'Next', icon: 'fa-solid fa-chevron-right', variant: 'outline', size: 'sm', className: 'btn-hist-page', disabled: p.page >= p.pages, dataAttributes: {'data-page': p.page + 1}})}
                            </div>
                        </div>
                    `;

                    paginationContainer.querySelectorAll('.btn-hist-page').forEach(btn => {
                        btn.addEventListener('click', () => {
                            if (!btn.disabled) this.loadHistory(parseInt(btn.dataset.page));
                        });
                    });
                } else {
                    paginationContainer.innerHTML = '';
                }
            } else {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center p-lg text-error">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-lg text-error">Failed to load history</td></tr>';
        }
    }

    openAffectedItems(log) {
        let meta;
        try {
            meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
        } catch (error) {
            return Toast.error('Could not read the affected item details.');
        }
        const items = Array.isArray(meta?.imported_items) ? meta.imported_items : [];
        if (!items.length) return Toast.error('No affected items are available for this import.');
        const mode = this.getImportMode(log, meta);
        const sourceLabel = meta?.source === 'MPS purchase order receipt' ? 'MPS purchase order receipt' : '';
        const quantityLabel = mode === 'replace' ? 'Replaced Qty' : mode === 'add' ? 'Added Qty' : 'Stock Change';

        Modal.open({
            title: `Affected Items - ${items.length}`,
            size: 'xl',
            confirmText: 'Close',
            cancelText: null,
            body: `
                <div class="import-affected-items-toolbar">
                    <span class="text-muted">${escapeHtml(sourceLabel || (mode === 'replace' ? 'Replace' : mode === 'add' ? 'Add' : 'Unknown') + ' mode')} - ${escapeHtml(log.action || 'Stock import')} - ${escapeHtml(new Date(log.created_at).toLocaleString())}</span>
                    ${Button.html({id: 'exportAffectedItemsBtn', text: 'Export Affected Items', icon: 'fa-solid fa-file-csv', variant: 'outline', size: 'md'})}
                </div>
                <div class="import-affected-items-table-scroll">
                    <table class="import-affected-items-table">
                        <thead><tr><th>SKU</th><th>Branch</th><th class="import-affected-number">Stock Before</th><th class="import-affected-number">${quantityLabel}</th><th class="import-affected-number">Stock After</th></tr></thead>
                        <tbody id="affectedItemsTableBody"></tbody>
                    </table>
                </div>
                <div id="affectedItemsPagination" class="import-history-pagination"></div>
            `
        });
        this.renderAffectedItemsPage(items, 1, mode);
        document.getElementById('exportAffectedItemsBtn')?.addEventListener('click', () => this.exportAffectedItemsCSV(log, items, mode));
    }

    getImportMode(log, metadata = null) {
        let meta = metadata;
        if (!meta) {
            try {
                meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
            } catch (error) {
                meta = null;
            }
        }
        const recordedMode = meta?.mode || String(log.details || '').match(/\bMode:\s*(add|replace)\b/i)?.[1] || '';
        const normalizedMode = String(recordedMode).toLowerCase();
        return normalizedMode === 'add' || normalizedMode === 'replace' ? normalizedMode : 'unknown';
    }

    renderAffectedItemsPage(items, page, mode = 'unknown') {
        const pageSize = 25;
        const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
        const safePage = Math.min(Math.max(1, page), pageCount);
        const tbody = document.getElementById('affectedItemsTableBody');
        const pagination = document.getElementById('affectedItemsPagination');
        if (!tbody || !pagination) return;

        const locations = new Map((this.parent.locationsCache || []).map(location => [String(location.id), location.name]));
        tbody.innerHTML = items.slice((safePage - 1) * pageSize, safePage * pageSize).map(item => {
            const branch = String(item.branch ?? '');
            const branchName = locations.get(branch) || 'Unknown Branch';
            const before = Number(item.old);
            const after = Number(item.new);
            const quantity = mode === 'replace' ? after : after - before;
            return `<tr>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(branchName)} [${escapeHtml(branch)}]</td>
                <td class="import-affected-number">${escapeHtml(before.toLocaleString())}</td>
                <td class="import-affected-number import-affected-change import-affected-change--${mode}">${escapeHtml(Number.isFinite(quantity) ? quantity.toLocaleString() : '')}</td>
                <td class="import-affected-number">${escapeHtml(after.toLocaleString())}</td>
            </tr>`;
        }).join('');

        if (pageCount > 1) {
            pagination.innerHTML = `<div class="import-affected-items-page-controls">
                <span class="text-sm text-muted">Page <b>${safePage}</b> of <b>${pageCount}</b> - ${items.length} items</span>
                <div>
                    ${Button.html({text: 'Previous', icon: 'fa-solid fa-chevron-left', variant: 'outline', size: 'sm', className: 'affected-items-page-btn', disabled: safePage <= 1, dataAttributes: {'data-page': safePage - 1}})}
                    ${Button.html({text: 'Next', icon: 'fa-solid fa-chevron-right', variant: 'outline', size: 'sm', className: 'affected-items-page-btn', disabled: safePage >= pageCount, dataAttributes: {'data-page': safePage + 1}})}
                </div>
            </div>`;
            pagination.querySelectorAll('.affected-items-page-btn').forEach(button => {
                button.addEventListener('click', () => this.renderAffectedItemsPage(items, Number(button.dataset.page), mode));
            });
        } else {
            pagination.innerHTML = `<div class="import-affected-items-page-controls"><span class="text-sm text-muted">${items.length} items</span></div>`;
        }
    }

    exportAffectedItemsCSV(log, items, mode = this.getImportMode(log)) {
        const locMap = new Map((this.parent.locationsCache || []).map(location => [String(location.id), location.name]));
        const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const quantityLabel = mode === 'replace' ? 'Replaced Quantity' : mode === 'add' ? 'Added Quantity' : 'Stock Change';
        const rows = [
            ['Date', 'User', 'Action', 'Mode', 'SKU', 'Branch Name', 'Branch ID', 'Stock Before', quantityLabel, 'Stock After'],
            ...items.map(item => {
                const before = Number(item.old);
                const after = Number(item.new);
                const quantity = mode === 'replace' ? after : after - before;
                return [
                    log.created_at,
                    log.user_name || 'System User',
                    log.action,
                    mode === 'replace' ? 'Replace' : mode === 'add' ? 'Add' : 'Unknown',
                    item.sku,
                    locMap.get(String(item.branch)) || 'Unknown Branch',
                    item.branch,
                    item.old,
                    Number.isFinite(quantity) ? quantity : '',
                    item.new
                ];
            })
        ];
        this.downloadCSV(rows.map(row => row.map(quote).join(',')).join('\n'), `Import_Affected_Items_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`);
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob(['\uFEFF', csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportHistoryCSV(logs = this.historyLogs) {
        if (!logs || logs.length === 0) {
            return Toast.error("No history to export.");
        }

        const locMap = {};
        this.parent.locationsCache.forEach(l => {
            locMap[String(l.id)] = l.name;
        });

        const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = [[
            'Date', 'User', 'Action', 'Mode', 'SKU', 'Branch Name', 'Branch ID',
            'Stock Before', 'Added / Replaced Quantity', 'Stock After'
        ]];

        logs.forEach(log => {
            let meta = null;
            try {
                meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
            } catch (e) {}
            const items = Array.isArray(meta?.imported_items) ? meta.imported_items : [];
            const mode = this.getImportMode(log, meta);
            const modeLabel = mode === 'replace' ? 'Replace' : mode === 'add' ? 'Add' : 'Unknown';

            if (!items.length) {
                rows.push([log.created_at, log.user_name || 'System User', log.action, modeLabel, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']);
                return;
            }

            items.forEach(item => {
                const before = Number(item.old);
                const after = Number(item.new);
                const quantity = mode === 'replace' ? after : after - before;
                rows.push([
                    log.created_at,
                    log.user_name || 'System User',
                    log.action,
                    modeLabel,
                    item.sku,
                    locMap[String(item.branch)] || 'Unknown',
                    item.branch,
                    item.old,
                    Number.isFinite(quantity) ? quantity : '',
                    item.new
                ]);
            });
        });

        const csvContent = rows.map(row => row.map(quote).join(',')).join('\r\n');
        this.downloadCSV(csvContent, `Stock_Import_History_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`);
    }
}

module.exports = ImportHistory;
