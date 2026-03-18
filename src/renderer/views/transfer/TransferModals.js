const Toast = require('../../components/Toast.js');
const Modal = require('../../components/Modal.js');
const API = require('../../services/api.js');

class TransferModals {
    constructor(parentView) {
        this.parent = parentView;
    }

    getBadgeColor(status) {
        const map = { completed: 'success', pending: 'warning', rejected: 'error', canceled: 'neutral' };
        return map[status] || 'neutral';
    }

    async showReviewModal(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error(res.message);
        const data = res.data;

        const initiatedAtStr = new Date(data.created_at).toLocaleString();

        const itemsHtml = data.items.map(i => `
            <tr class="border-b border-neutral-200">
                <td class="py-sm">
                    <div class="font-semibold text-sm">${i.product_name}</div>
                    <div class="text-xs text-muted font-mono">${i.product_sku || ''}</div>
                </td>
                <td class="text-center font-bold" style="color: #2271b1;">${i.qty}</td>
                <td style="width: 100px;">
                    <input type="number" class="form-input form-input-sm recv-qty text-center font-bold" 
                           data-id="${i.id}" value="${i.qty}" min="0">
                </td>
                <td>
                    <input type="text" class="form-input form-input-sm" id="note-${i.id}" placeholder="Optional note if mismatched">
                </td>
            </tr>
        `).join('');

        Modal.open({
            title: `Confirm Receipt: ${batchId}`,
            size: 'lg',
            body: `
                <div class="mb-md flex gap-md p-md bg-neutral-50 rounded border border-neutral-200 relative">
                    <div class="flex-1"><span class="text-muted text-xs">SENDER</span><br><strong>${data.from_location}</strong></div>
                    <div class="flex-1"><span class="text-muted text-xs">DESTINATION</span><br><strong>${data.to_location}</strong></div>
                    <div class="text-right">
                        <span class="text-xs text-muted">Sent by: <strong>${data.initiated_by}</strong></span><br>
                        <span class="text-xs text-neutral-500"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</span>
                    </div>
                </div>
                
                <div class="alert bg-info-50 mb-md text-sm border border-info-200 p-sm rounded" style="color: #004085;">
                    <i class="fa-solid fa-circle-info" style="color: #004085;"></i>
                    Verify the quantities received. If the numbers mismatch, adjust them up or down. Inventory for both branches will balance automatically.
                </div>

                <div class="table-container" style="max-height: 400px; overflow-y:auto;">
                    <table class="w-full text-left">
                        <thead>
                            <tr>
                                <th class="pb-sm">Product</th>
                                <th class="text-center pb-sm">Sent</th>
                                <th class="text-center pb-sm">Received</th>
                                <th class="pb-sm">Issue Note</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
            `,
            confirmText: "Save & Complete",
            cancelText: "Close",
            onConfirm: async () => {
                const itemsData = [];
                let hasError = false;

                document.querySelectorAll('.recv-qty').forEach(inp => {
                    const id = inp.dataset.id;
                    const val = parseInt(inp.value);

                    if (val < 0 || isNaN(val)) {
                        Toast.error("Invalid quantity entered");
                        inp.classList.add('border-error');
                        hasError = true;
                    } else {
                        inp.classList.remove('border-error');
                    }

                    itemsData.push({
                        id: id,
                        received_qty: val,
                        note: document.getElementById(`note-${id}`).value.trim()
                    });
                });

                if (hasError) throw new Error("Validation Error");

                const result = await API.approveTransfer(batchId, 'approve', itemsData);
                if (result.status === 'success') {
                    Toast.success("Transfer confirmed and inventory updated!");
                    this.parent.loadTransfers(); // Refresh table
                } else {
                    Toast.error(result.message);
                    throw new Error();
                }
            }
        });
    }

    async showDetailsModal(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error(res.message);

        const data = res.data;
        const items = data.items;
        const firstItem = items[0] || {};

        const initiatedAtStr = new Date(data.created_at).toLocaleString();
        const approvedAtStr = firstItem.approved_at ? new Date(firstItem.approved_at).toLocaleString() : '';

        const itemsHtml = items.map(i => {
            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
            const qtyClass = diff < 0 ? 'text-error' : (diff > 0 ? 'text-warning' : 'text-success');

            return `
                <tr class="border-b border-neutral-100">
                    <td class="py-sm">
                        <div class="font-semibold text-sm">${i.product_name}</div>
                        <div class="text-xs text-muted font-mono">${i.product_sku || ''}</div>
                    </td>
                    <td class="text-center">${i.qty}</td>
                    <td class="text-center font-bold ${qtyClass}">
                        ${i.received_qty !== null ? i.received_qty : '-'}
                    </td>
                    <td class="text-sm text-muted">${i.note || '-'}</td>
                </tr>
            `;
        }).join('');

        let actionVerb = 'Handled';
        if (data.status === 'completed') actionVerb = 'Approved';
        if (data.status === 'rejected') actionVerb = 'Rejected';
        if (data.status === 'canceled') actionVerb = 'Canceled';

        Modal.open({
            title: `Details: ${batchId}`,
            size: 'lg',
            body: `
                <div class="mb-md flex justify-between p-md bg-neutral-50 rounded border border-neutral-200">
                    <div>
                        <p class="mb-xs"><strong>From:</strong> ${data.from_location}</p>
                        <p class="mb-xs"><strong>To:</strong> ${data.to_location}</p>
                        <p><strong>Status:</strong> <span class="badge badge-${this.getBadgeColor(data.status)}">${data.status.toUpperCase()}</span></p>
                    </div>
                    <div class="text-right text-sm text-neutral-700">
                        <div class="mb-sm">
                            <span class="text-muted">Sent by:</span> <strong>${data.initiated_by}</strong>
                            <div class="text-xs text-muted mt-xs"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</div>
                        </div>
                        ${data.status !== 'pending' ? `
                        <div>
                            <span class="text-muted">${actionVerb} by:</span> <strong>${data.approved_by || 'System'}</strong>
                            <div class="text-xs text-muted mt-xs"><i class="fa-regular fa-clock"></i> ${approvedAtStr}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="table-container">
                    <table class="w-full text-left">
                        <thead>
                            <tr>
                                <th class="pb-sm text-xs text-muted uppercase">Product</th>
                                <th class="text-center pb-sm text-xs text-muted uppercase">Sent</th>
                                <th class="text-center pb-sm text-xs text-muted uppercase">Received</th>
                                <th class="pb-sm text-xs text-muted uppercase">Notes</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
            `,
            confirmText: "Close",
            onConfirm: () => {}
        });
    }

    async handleCancel(batchId) {
        Modal.open({
            title: "Cancel Transfer",
            body: `
                <p class="mb-sm text-neutral-700">Are you sure you want to cancel this outgoing transfer? The reserved stock will be returned to your inventory.</p>
                <div class="form-group">
                    <label class="form-label">Reason (Optional)</label>
                    <textarea id="cancelReason" class="form-input" rows="2"></textarea>
                </div>
            `,
            confirmText: "Yes, Cancel",
            onConfirm: async () => {
                const reason = document.getElementById('cancelReason').value;
                const res = await API.cancelTransfer(batchId, reason);
                if (res.status === 'success') {
                    Toast.success("Transfer canceled successfully");
                    this.parent.loadTransfers(); // Refresh table
                } else {
                    Toast.error(res.message);
                    throw new Error();
                }
            }
        });
    }
}

module.exports = TransferModals;