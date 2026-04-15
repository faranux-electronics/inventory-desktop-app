const Toast = require('../../../components/Toast.js');
const API = require('../../../services/api.js');

class ImportHistory {
    constructor(parentView) {
        this.parent = parentView;
        this.historyLogs = [];
    }

    render(container) {
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: #1d2327;">Recent Imports</h3>
                
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="date" id="historyStartDate" class="form-input" style="padding: 4px 8px; font-size: 12px; height: 30px;" title="Start Date">
                    <span style="color: #a7aaad; font-size: 12px;">to</span>
                    <input type="date" id="historyEndDate" class="form-input" style="padding: 4px 8px; font-size: 12px; height: 30px;" title="End Date">
                    
                    <button class="btn btn-sm btn-secondary" id="filterHistoryBtn" style="height: 30px; display: flex; align-items: center;">
                        <i class="fa-solid fa-filter mr-xs"></i> Filter
                    </button>
                    
                    <div style="width: 1px; height: 20px; background: #c3c4c7; margin: 0 4px;"></div>
                    
                    <button class="btn btn-sm" id="exportHistoryBtn" style="background: white; border: 1px solid #2271b1; color: #2271b1; padding: 4px 12px; font-weight: 500; height: 30px; display: flex; align-items: center;">
                        <i class="fa-solid fa-file-csv mr-xs"></i> Export Page
                    </button>
                </div>
            </div>
            
            <div style="background: white; border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                        <tr>
                            <th style="padding: 12px 16px; color: #2c3338; font-weight: 500;">Date & Time</th>
                            <th style="padding: 12px 16px; color: #2c3338; font-weight: 500;">Performed By</th>
                            <th style="padding: 12px 16px; color: #2c3338; font-weight: 500;">Import Details</th>
                        </tr>
                    </thead>
                    <tbody id="historyTableBody">
                        <tr><td colspan="3" class="text-center p-lg text-muted">Loading history...</td></tr>
                    </tbody>
                </table>
                <div id="historyPagination" style="background: #f8f9fa; border-top: 1px solid #c3c4c7;"></div>
            </div>
        `;
        this.attachEvents(container);
    }

    attachEvents(container) {
        container.querySelector('#filterHistoryBtn').addEventListener('click', () => this.loadHistory(1));
        container.querySelector('#exportHistoryBtn').addEventListener('click', () => this.exportHistoryCSV());
    }

    async loadHistory(page = 1) {
        const tbody = document.getElementById('historyTableBody');
        const paginationContainer = document.getElementById('historyPagination');

        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-lg text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Fetching records...</td></tr>';

        const startDate = document.getElementById('historyStartDate').value;
        let endDate = document.getElementById('historyEndDate').value;
        if (endDate) endDate += ' 23:59:59';

        try {
            const res = await API.getAuditLogs('STOCK_IMPORT', page, startDate, endDate);

            if (res.status === 'success') {
                let logs = Array.isArray(res.data) ? res.data : (res.data.data || []);
                logs = logs.filter(log => log.action === 'STOCK_IMPORT');
                this.historyLogs = logs;

                if (logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-lg text-muted" style="background: #f9f9f9;">No import history found for this period.</td></tr>';
                    paginationContainer.innerHTML = '';
                    return;
                }

                const locMap = {};
                this.parent.locationsCache.forEach(l => {
                    locMap[String(l.id)] = l.name;
                });

                tbody.innerHTML = logs.map(log => {
                    const date = new Date(log.created_at).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });

                    let detailsHtml = log.details || '';

                    if (log.metadata) {
                        try {
                            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                            if (meta && meta.imported_items && meta.imported_items.length > 0) {
                                const itemCount = meta.imported_items.length;
                                detailsHtml += `
                                <div style="margin-top: 10px;">
                                    <details style="background: white; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                        <summary style="padding: 8px 12px; background: #f8f9fa; cursor: pointer; font-weight: 600; color: #2271b1; font-size: 12px; border-bottom: 1px solid #e5e7eb; outline: none; user-select: none;">
                                            <i class="fa-solid fa-table-list mr-xs"></i> View ${itemCount} affected item${itemCount !== 1 ? 's' : ''}
                                        </summary>
                                        <div style="max-height: 250px; overflow-y: auto;">
                                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                                <thead style="background: white; position: sticky; top: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                                                    <tr>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; color: #50575e; font-weight: 600;">SKU</th>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; color: #50575e; font-weight: 600;">Branch</th>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #50575e; font-weight: 600;">Before</th>
                                                        <th style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #50575e; font-weight: 600;">After</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${meta.imported_items.map(item => {
                                    const bName = locMap[String(item.branch)] || 'Unknown Branch';
                                    return `
                                                        <tr class="hover:bg-neutral-50">
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; font-family: monospace; font-weight: 600; color: #2c3338;">${item.sku}</td>
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; color: #50575e;">${bName} [${item.branch}]</td>
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; text-align: right; color: #8c8f94;">${item.old}</td>
                                                            <td style="padding: 6px 10px; border-bottom: 1px solid #f0f0f1; text-align: right; color: #00a32a; font-weight: 600;">${item.new}</td>
                                                        </tr>
                                                        `;
                                }).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </details>
                                </div>`;
                            }
                        } catch (e) {
                        }
                    }

                    return `
                        <tr class="hover:bg-neutral-50" style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                            <td style="padding: 12px 16px; color: #50575e; white-space: nowrap; vertical-align: top;">${date}</td>
                            <td style="padding: 12px 16px; font-weight: 500; color: #2271b1; white-space: nowrap; vertical-align: top;">
                                <i class="fa-solid fa-user-shield text-xs mr-xs"></i> ${log.user_name || 'System User'}
                            </td>
                            <td style="padding: 12px 16px; color: #2c3338; vertical-align: top;">
                            <span style="background: #f0f6fb; color: #2271b1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 8px; border: 1px solid #c7dff3; display: inline-block; margin-bottom: 6px;">
                                ${log.action}
                            </span>
                                <div>${detailsHtml}</div>
                            </td>
                        </tr>
                    `;
                }).join('');

                if (res.pagination && res.pagination.pages > 1) {
                    const p = res.pagination;
                    paginationContainer.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;">
                            <span class="text-sm text-muted">Showing page <b>${p.page}</b> of <b>${p.pages}</b> (Total records: ${p.total})</span>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-sm btn-ghost btn-hist-page" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Previous</button>
                                <button class="btn btn-sm btn-ghost btn-hist-page" data-page="${p.page + 1}" ${p.page >= p.pages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right"></i></button>
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
                tbody.innerHTML = `<tr><td colspan="3" class="text-center p-lg text-error">${res.message}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-lg text-error">Failed to load history</td></tr>';
        }
    }

    exportHistoryCSV() {
        if (!this.historyLogs || this.historyLogs.length === 0) {
            return Toast.error("No history to export.");
        }

        const locMap = {};
        this.parent.locationsCache.forEach(l => {
            locMap[String(l.id)] = l.name;
        });

        let csvContent = "Date,User,Action,SKU,Branch Name,Branch ID,Stock Before,Stock After\n";

        this.historyLogs.forEach(log => {
            const date = log.created_at;
            const user = (log.user_name || 'System User').replace(/"/g, '""');
            const action = log.action;

            let hasItems = false;
            if (log.metadata) {
                try {
                    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
                    if (meta && meta.imported_items && meta.imported_items.length > 0) {
                        hasItems = true;
                        meta.imported_items.forEach(item => {
                            const cleanSku = `"${item.sku.replace(/"/g, '""')}"`;
                            const bName = locMap[String(item.branch)] || 'Unknown';
                            csvContent += `"${date}","${user}","${action}",${cleanSku},"${bName}",${item.branch},${item.old},${item.new}\n`;
                        });
                    }
                } catch (e) {
                }
            }

            if (!hasItems) {
                csvContent += `"${date}","${user}","${action}","N/A","N/A","N/A","N/A","N/A"\n`;
            }
        });

        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `Stock_Import_History_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

module.exports = ImportHistory;