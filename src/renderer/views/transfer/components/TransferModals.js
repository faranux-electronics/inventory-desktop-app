const Toast = require('../../../components/Toast.js');
const Modal = require('../../../components/Modal.js');
const API = require('../../../services/api.js');

// FIX: Escape helper prevents XSS from server-supplied strings inserted into innerHTML.
function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

        const initiatedAtStr = esc(new Date(data.created_at).toLocaleString());

        // FIX: Use a unique wrapper ID so onConfirm can scope its queries to this
        // modal's body only, rather than searching the entire document.
        const modalBodyId = `review-modal-body-${esc(batchId)}`;

        // Removed the filter so canceled items appear in the list
        const items = data.items || [];

        const itemsHtml = items.map(i => {
            const isCanceled = i.status === 'canceled';
            
            const rowStyle = isCanceled ? 'background-color: rgba(0,0,0,0.02);' : '';
            const canceledCellStyle = isCanceled ? 'opacity: 0.5; text-decoration: line-through;' : '';
            
            // If canceled, do not render input fields so they aren't processed on submit
            const recvHtml = isCanceled 
                ? `<span style="${canceledCellStyle}">—</span>`
                : `<input type="number" class="form-input form-input-sm recv-qty text-center font-bold" data-id="${esc(i.id)}" value="${parseInt(i.qty) || 0}" min="0">`;
                
            const noteHtml = isCanceled
                ? `<span style="font-style:italic; color:var(--neutral-400); opacity:0.8;"><strong>(Canceled)</strong> ${esc(i.note) || ''}</span>`
                : `<input type="text" class="form-input form-input-sm" id="note-${esc(i.id)}" placeholder="Optional note if mismatched">`;

            return `
            <tr class="border-b border-neutral-200" style="${rowStyle}">
                <td class="py-sm">
                    <div class="font-semibold text-sm" style="${canceledCellStyle}">${esc(i.product_name)}</div>
                    <div class="text-xs text-muted font-mono" style="${canceledCellStyle}">${esc(i.product_sku || '')}</div>
                </td>
                <td class="text-center font-bold" style="color: #2271b1; ${canceledCellStyle}">${parseInt(i.qty) || 0}</td>
                <td style="width: 100px;" class="text-center">
                    ${recvHtml}
                </td>
                <td>
                    ${noteHtml}
                </td>
            </tr>
        `}).join('');

        Modal.open({
            title: `Confirm Receipt: ${esc(batchId)}`,
            size: 'lg',
            body: `
                <div id="${modalBodyId}">
                    <div class="mb-md flex gap-md p-md bg-neutral-50 rounded border border-neutral-200 relative">
                        <div class="flex-1"><span class="text-muted text-xs">SENDER</span><br><strong>${esc(data.from_location)}</strong></div>
                        <div class="flex-1"><span class="text-muted text-xs">DESTINATION</span><br><strong>${esc(data.to_location)}</strong></div>
                        <div class="text-right">
                            <span class="text-xs text-muted">Sent by: <strong>${esc(data.initiated_by)}</strong></span><br>
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
                </div>
            `,
            confirmText: "Save & Complete",
            cancelText: "Close",
            onConfirm: async () => {
                // FIX: Scope to the modal body container, not the whole document.
                const modalBody = document.getElementById(modalBodyId);
                if (!modalBody) throw new Error("Modal body not found");

                const itemsData = [];
                let hasError = false;

                // Canceled items won't have .recv-qty inputs, so they are safely ignored here
                modalBody.querySelectorAll('.recv-qty').forEach(inp => {
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
                        // FIX: HTMLElement has no getElementById — it was always undefined
                        // (falsy), so the ternary always fell through to document.getElementById,
                        // defeating the scoping fix.  Use querySelector('#…') instead.
                        note: modalBody.querySelector(`#note-${id}`)?.value.trim() || ''
                    });
                });

                if (hasError) throw new Error("Validation Error");

                const result = await API.approveTransfer(batchId, 'approve', itemsData);
                if (result.status === 'success') {
                    Toast.success("Transfer confirmed and inventory updated!");
                    this.parent.loadTransfers();
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
        // Removed the filter so canceled items show in the details modal
        const items = data.items || [];
        const firstItem = items[0] || {};

        const initiatedAtStr = esc(new Date(data.created_at).toLocaleString());
        const approvedAtStr = firstItem.approved_at ? esc(new Date(firstItem.approved_at).toLocaleString()) : '';

        const itemsHtml = items.map(i => {
            const isCanceled = i.status === 'canceled';
            
            const rowStyle = isCanceled ? 'background-color: rgba(0,0,0,0.02);' : '';
            const canceledCellStyle = isCanceled ? 'opacity: 0.5; text-decoration: line-through;' : '';
            const canceledNoteStyle = isCanceled ? 'opacity: 0.8;' : '';

            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
            let qtyClass = '';
            let recvVal = i.received_qty !== null ? parseInt(i.received_qty) : '-';

            if (diff !== null && !isCanceled) {
                qtyClass = diff < 0 ? 'text-error' : (diff > 0 ? 'text-warning' : 'text-success');
            }

            let noteStr = esc(i.note) || '-';
            if (isCanceled) {
                noteStr = noteStr !== '-' ? `<strong>(Canceled)</strong> ${noteStr}` : '<strong>Canceled</strong>';
            }

            return `
                <tr class="border-b border-neutral-100" style="${rowStyle}">
                    <td class="py-sm">
                        <div class="font-semibold text-sm" style="${canceledCellStyle}">${esc(i.product_name)}</div>
                        <div class="text-xs text-muted font-mono" style="${canceledCellStyle}">${esc(i.product_sku || '')}</div>
                    </td>
                    <td class="text-center" style="${canceledCellStyle}">${parseInt(i.qty) || 0}</td>
                    <td class="text-center font-bold ${qtyClass}" style="${canceledCellStyle}">
                        ${recvVal}
                    </td>
                    <td class="text-sm text-muted" style="${canceledNoteStyle}">${noteStr}</td>
                </tr>
            `;
        }).join('');

        let actionVerb = 'Handled';
        if (data.status === 'completed') actionVerb = 'Approved';
        if (data.status === 'rejected') actionVerb = 'Rejected';
        if (data.status === 'canceled') actionVerb = 'Canceled';

        Modal.open({
            title: `Details: ${esc(batchId)}`,
            size: 'lg',
            body: `
                <div class="mb-md flex justify-between p-md bg-neutral-50 rounded border border-neutral-200">
                    <div>
                        <p class="mb-xs"><strong>From:</strong> ${esc(data.from_location)}</p>
                        <p class="mb-xs"><strong>To:</strong> ${esc(data.to_location)}</p>
                        <p><strong>Status:</strong> <span class="badge badge-${esc(this.getBadgeColor(data.status))}">${esc(data.status.toUpperCase())}</span></p>
                    </div>
                    <div class="text-right text-sm text-neutral-700">
                        <div class="mb-sm">
                            <span class="text-muted">Sent by:</span> <strong>${esc(data.initiated_by)}</strong>
                            <div class="text-xs text-muted mt-xs"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</div>
                        </div>
                        ${data.status !== 'pending' ? `
                        <div>
                            <span class="text-muted">${esc(actionVerb)} by:</span> <strong>${esc(data.approved_by || 'System')}</strong>
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

    handleRevert(batchId) {
        const bodyHtml = `
            <div style="margin-bottom: 15px; color: var(--error-500); background: #fef2f2; padding: 12px; border-radius: 6px; border: 1px solid #fecaca; font-size: 13px;">
                <strong>Warning:</strong> You are about to forcefully revert <b>${batchId}</b>.<br><br>
                This will immediately pull the received stock back out of the destination branch and refund the original amount to the sender branch. This action will be permanently logged.
            </div>
            <div class="form-group">
                <label style="display:block; margin-bottom:5px; font-size: 13px; font-weight: 600;">Reason for Reverting <span style="color:red">*</span></label>
                <textarea id="revert-reason" class="form-control" rows="3" placeholder="Enter administrative reason for this revert..." style="width: 100%; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; font-family: inherit;"></textarea>
            </div>
        `;

        Modal.open({
            title: '<span style="color: var(--error-500); display: flex; align-items: center; gap: 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Revert Completed Transfer</span>',
            body: bodyHtml,
            confirmText: 'Confirm Revert',
            onConfirm: async () => {
                const reasonInput = document.getElementById('revert-reason').value.trim();

                if (!reasonInput) {
                    Toast.error("An administrative reason is required to revert a transfer.");
                    throw new Error("Reason required"); // Stops the modal from closing automatically
                }

                const res = await API.revertTransfer(batchId, reasonInput);

                if (res.status === 'success') {
                    Toast.success(res.message);
                    if (this.parent && typeof this.parent.loadTransfers === 'function') {
                        await this.parent.loadTransfers(); // Refresh the table
                    }
                } else {
                    Toast.error(res.message);
                    throw new Error(res.message);
                }
            }
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
                    this.parent.loadTransfers();
                } else {
                    Toast.error(res.message);
                    throw new Error();
                }
            }
        });
    }
}

module.exports = TransferModals;