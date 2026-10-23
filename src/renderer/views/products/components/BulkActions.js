const Toast = require('../../../components/Toast.js');

class BulkActions {
    constructor(products) {
        this.products = products;
        this.state = products.state;
    }

    render() {
        const container = document.getElementById('bulkActionsContainer');
        if (!container) return;
        container.innerHTML = `
            <div id="selectionActions" class="selection-actions" style="
                display: none;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
                background: #f0f6fc;
                border: 1px solid #c8e1ff;
                border-radius: 6px;
                padding: 6px 12px;
                margin-top: 8px;
                font-size: 13px;
            ">
                <span id="selectionCount" style="font-weight: 600; color: #2271b1;">0 items selected</span>
                <button class="btn btn-sm" id="exportSelectedBtn" style="
                    background: #2271b1;
                    color: white;
                    border: none;
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <i class="fa-solid fa-file-csv"></i> Export Selected (CSV)
                </button>
                <button class="btn btn-sm btn-secondary" id="clearSelectionBtn" style="
                    background: #ffffff;
                    border: 1px solid #c3c4c7;
                    color: #50575e;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                ">
                    Clear
                </button>
            </div>
        `;

        this.attachEvents();
    }

    update(count) {
        const actionsDiv = document.getElementById('selectionActions');
        const countSpan = document.getElementById('selectionCount');

        if (count > 0) {
            if (actionsDiv) actionsDiv.style.display = 'flex';
            if (countSpan) countSpan.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        } else {
            if (actionsDiv) actionsDiv.style.display = 'none';
        }
    }

    attachEvents() {
        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
            this.products.clearSelection();
        });

        document.getElementById('exportSelectedBtn')?.addEventListener('click', () => {
            const selected = Array.from(this.products.selectedProducts.values());
            if (selected.length === 0) {
                Toast.error('No products selected');
                return;
            }

            const headers = ['ID', 'Name', 'SKU', 'Category', 'Price (Frw)', 'WC Stock', 'Local Stock', 'Status', 'Date Created'];
            const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
            const rows = selected.map(p => [
                p.id || '',
                escapeCsv(p.name),
                escapeCsv(p.sku),
                escapeCsv(p.category),
                p.price || 0,
                p.wc_stock_quantity || 0,
                p.stock_quantity || 0,
                p.status || '',
                p.date_created || p.created_at || ''
            ].join(','));

            const csvContent = [headers.join(','), ...rows].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Selected_Products_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            Toast.success(`Exported ${selected.length} selected product${selected.length !== 1 ? 's' : ''} to CSV`);
        });
    }
}

module.exports = BulkActions;
