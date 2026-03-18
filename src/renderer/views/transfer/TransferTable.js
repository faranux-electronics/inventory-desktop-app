const API = require('../../services/api.js');
const Toast = require('../../components/Toast.js');
const PdfGenerator = require('../../utils/PdfGenerator.js');
const TransferModals = require('./TransferModals.js');

class TransferTable {
    constructor(parentView) {
        this.parent = parentView;
        this.modals = new TransferModals(parentView);
    }

    render(transfers) {
        const tbody = document.getElementById('transfersTableBody');
        const userBranch = this.parent.state.getUserBranchId();
        const isAdmin = this.parent.state.getUser()?.role === 'admin';

        if (transfers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center p-lg text-muted" style="background: #f9f9f9;">No transfers found matching your filters.</td></tr>';
            return;
        }

        tbody.innerHTML = transfers.map(t => {
            let actions = '';

            if (t.status === 'pending') {
                if (isAdmin || userBranch == t.to_loc_id) {
                    actions += `<button class="btn btn-sm btn-primary btn-review" data-id="${t.batch_id}" style="padding: 4px 10px; font-weight: normal; font-size: 13px;">Review</button> `;
                }
                if (isAdmin || userBranch == t.from_loc_id) {
                    actions += `<button class="btn btn-sm btn-ghost btn-cancel" data-id="${t.batch_id}" style="padding: 4px 10px; color: #b32d2e; border-color: transparent; font-weight: normal; font-size: 13px;">Cancel</button> `;
                }
            } else {
                actions += `<button class="btn btn-sm btn-ghost btn-view" data-id="${t.batch_id}" title="View Details" style="padding: 4px 8px; border-color: transparent;"><i class="fa-solid fa-eye" style="color: #2271b1; font-size: 14px;"></i></button> `;
                actions += `<button class="btn btn-sm btn-ghost btn-print" data-id="${t.batch_id}" title="Print PDF" style="padding: 4px 8px; border-color: transparent;"><i class="fa-solid fa-print" style="color: #50575e; font-size: 14px;"></i></button> `;
            }

            let dirIcon = '<i class="fa-solid fa-minus" style="color: #a7aaad;"></i>';
            if (this.parent.currentTab === 'pending_incoming') {
                dirIcon = '<i class="fa-solid fa-arrow-down" style="color: #00a32a;" title="Incoming"></i>';
            } else if (this.parent.currentTab === 'pending_outgoing') {
                dirIcon = '<i class="fa-solid fa-arrow-up" style="color: #d63638;" title="Outgoing"></i>';
            } else if (userBranch) {
                if (userBranch == t.to_loc_id) dirIcon = '<i class="fa-solid fa-arrow-down" style="color: #00a32a;" title="Incoming"></i>';
                else if (userBranch == t.from_loc_id) dirIcon = '<i class="fa-solid fa-arrow-up" style="color: #d63638;" title="Outgoing"></i>';
            }

            let discHtml = '<span style="color: #a7aaad;">-</span>';
            if (t.status === 'completed' || t.status === 'rejected') {
                const diff = (parseInt(t.total_received_qty) || 0) - (parseInt(t.total_qty) || 0);
                if (diff < 0) discHtml = `<span style="color: #d63638; font-weight: 600;">${diff}</span>`;
                else if (diff > 0) discHtml = `<span style="color: #dba617; font-weight: 600;">+${diff}</span>`;
                else discHtml = `<span style="color: #00a32a;"><i class="fa-solid fa-check"></i></span>`;
            }

            let statusStyle = '';
            const st = t.status.toLowerCase();
            if (st === 'completed') statusStyle = 'background: #e2e8f0; color: #334155; padding: 4px 12px; border-radius: 4px; font-weight: 500; font-size: 13px;';
            else if (st === 'pending') statusStyle = 'background: #fef3c7; color: #b45309; padding: 4px 12px; border-radius: 4px; font-weight: 500; font-size: 13px;';
            else if (st === 'rejected' || st === 'canceled') statusStyle = 'background: #fee2e2; color: #b91c1c; padding: 4px 12px; border-radius: 4px; font-weight: 500; font-size: 13px;';

            const timeAgo = this.timeSince(new Date(t.created_at));

            return `
                <tr class="hover:bg-neutral-50 transition-colors" style="border-bottom: 1px solid #f0f0f1; font-size: 13px;">
                    <td class="text-center text-muted cursor-pointer expand-toggle" data-batch="${t.batch_id}" style="padding: 12px;">
                        <i class="fa-solid fa-chevron-right" id="icon-${t.batch_id}" style="transition: transform 0.2s; color: #a7aaad;"></i>
                    </td>
                    <td style="padding: 12px;">
                        <span class="btn-view cursor-pointer" data-id="${t.batch_id}" style="color: #2271b1; font-weight: 600;">#${t.batch_id}</span>
                    </td>
                    <td style="padding: 12px; color: #50575e;">${timeAgo}</td>
                    <td class="text-center" style="padding: 12px;">${dirIcon}</td>
                    <td style="padding: 12px; color: #50575e;">${t.from_location}</td>
                    <td style="padding: 12px; color: #50575e;">${t.to_location}</td>
                    <td style="padding: 12px; color: #50575e;">${t.item_count} items <span style="color: #a7aaad;">(${t.total_qty} qty)</span></td>
                    <td class="text-center" style="padding: 12px;">${discHtml}</td>
                    <td style="padding: 12px;"><span style="${statusStyle}">${t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
                    <td style="padding: 12px;"><div class="flex gap-xs items-center">${actions}</div></td>
                </tr>
                <tr class="hidden" id="expanded-${t.batch_id}">
                    <td colspan="10" class="p-0 border-b border-neutral-300" style="background: #f8f9fa;">
                        <div id="expanded-content-${t.batch_id}" style="margin: 0.5rem 1rem 1rem 3rem; border-left: 3px solid #2271b1; background: white; border-radius: 0 4px 4px 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" class="p-md">
                            <div class="text-center py-sm" style="color: #8c8f94;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching transfer items...</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.attachRowEvents();
    }

    attachRowEvents() {
        document.querySelectorAll('.expand-toggle').forEach(td => {
            td.addEventListener('click', () => this.toggleExpand(td.dataset.batch));
        });
        document.querySelectorAll('.btn-view').forEach(btn => btn.addEventListener('click', () => this.modals.showDetailsModal(btn.dataset.id)));
        document.querySelectorAll('.btn-review').forEach(btn => btn.addEventListener('click', () => this.modals.showReviewModal(btn.dataset.id)));
        document.querySelectorAll('.btn-cancel').forEach(btn => btn.addEventListener('click', () => this.modals.handleCancel(btn.dataset.id)));
        document.querySelectorAll('.btn-print').forEach(btn => btn.addEventListener('click', () => this.printTransfer(btn.dataset.id)));
    }

    async toggleExpand(batchId) {
        const row = document.getElementById(`expanded-${batchId}`);
        const icon = document.getElementById(`icon-${batchId}`);
        const content = document.getElementById(`expanded-content-${batchId}`);

        if (row.classList.contains('hidden')) {
            row.classList.remove('hidden');
            icon.style.transform = 'rotate(90deg)';
            icon.style.color = '#2271b1';

            if (content.dataset.loaded !== 'true') {
                try {
                    const res = await API.getTransferDetails(batchId);
                    if (res.status === 'success') {
                        const data = res.data;
                        const items = data.items;

                        const itemsHtml = items.map(i => {
                            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
                            const qtyClass = diff < 0 ? 'text-error' : (diff > 0 ? 'text-warning' : 'text-neutral-700');

                            return `
                                <tr class="hover:bg-neutral-50 transition-colors" style="border-bottom: 1px solid #f0f0f1;">
                                    <td class="text-xs font-mono text-muted pl-md py-sm">${i.product_sku || '-'}</td>
                                    <td class="text-sm font-semibold text-neutral-800 py-sm">${i.product_name}</td>
                                    <td class="text-center text-sm font-bold py-sm" style="color: #2271b1;">${i.qty}</td>
                                    <td class="text-center text-sm font-bold ${qtyClass} py-sm">${i.received_qty !== null ? i.received_qty : '-'}</td>
                                    <td class="text-sm text-muted italic py-sm">${i.note || '-'}</td>
                                </tr>
                            `;
                        }).join('');

                        const firstItem = items[0] || {};
                        const initiatedAtStr = new Date(data.created_at).toLocaleString();
                        const approvedAtStr = firstItem.approved_at ? new Date(firstItem.approved_at).toLocaleString() : '';

                        let metaHtml = `
                            <div style="display: flex; gap: 24px; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px dashed #dcdcde; margin-bottom: 16px; font-size: 14px;">
                                <div style="display: flex; align-items: center; white-space: nowrap;">
                                    <span style="color: #8c8f94; margin-right: 6px;">Initiated By:</span>
                                    <strong style="color: #2c3338; margin-right: 12px;">${data.initiated_by}</strong> 
                                    <span style="color: #8c8f94; font-size: 12px;"><i class="fa-regular fa-clock"></i> ${initiatedAtStr}</span>
                                </div>
                        `;

                        if (data.status !== 'pending') {
                            const actionVerb = data.status === 'completed' ? 'Approved' : 'Handled';
                            metaHtml += `
                                <div style="display: flex; align-items: center; white-space: nowrap;">
                                    <span style="color: #8c8f94; margin-right: 6px;">${actionVerb} By:</span>
                                    <strong style="color: #2c3338; margin-right: 12px;">${data.approved_by || 'System'}</strong> 
                                    <span style="color: #8c8f94; font-size: 12px;"><i class="fa-regular fa-clock"></i> ${approvedAtStr}</span>
                                </div>
                            `;
                        }
                        metaHtml += `</div>`;

                        content.innerHTML = `
                            <div class="mb-sm flex justify-between items-center">
                                <h4 class="text-sm font-bold uppercase tracking-wider" style="color: #50575e;">
                                    <i class="fa-solid fa-box-open mr-xs" style="color: #a7aaad;"></i> Transfer Details
                                </h4>
                                <span style="background: #f0f0f1; color: #3c434a; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                                    ${items.length} Product${items.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            ${metaHtml}
                            <div style="border: 1px solid #c3c4c7; border-radius: 4px; overflow: hidden;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                    <thead style="background: #f8f9fa; border-bottom: 1px solid #c3c4c7;">
                                        <tr>
                                            <th class="text-xs uppercase pl-md py-sm text-left" style="color: #646970; font-weight: 600;">SKU</th>
                                            <th class="text-xs uppercase py-sm text-left" style="color: #646970; font-weight: 600;">Product Name</th>
                                            <th class="text-xs uppercase text-center py-sm" style="color: #646970; font-weight: 600;">Sent Qty</th>
                                            <th class="text-xs uppercase text-center py-sm" style="color: #646970; font-weight: 600;">Received</th>
                                            <th class="text-xs uppercase py-sm text-left" style="color: #646970; font-weight: 600;">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody style="background: white;">${itemsHtml}</tbody>
                                </table>
                            </div>
                        `;
                        content.dataset.loaded = 'true';
                    } else {
                        content.innerHTML = `<div class="text-error text-center p-sm"><i class="fa-solid fa-circle-exclamation"></i> ${res.message}</div>`;
                    }
                } catch (e) {
                    content.innerHTML = `<div class="text-error text-center p-sm"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load transfer items.</div>`;
                }
            }
        } else {
            row.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
            icon.style.color = '#a7aaad';
        }
    }

    async printTransfer(batchId) {
        const res = await API.getTransferDetails(batchId);
        if (res.status !== 'success') return Toast.error("Failed to load details for PDF");

        try {
            await PdfGenerator.generateTransferPDF(batchId, res.data);
            Toast.success("PDF generated successfully");
        } catch (e) {
            Toast.error(e.message);
            console.error(e);
        }
    }

    timeSince(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    }
}

module.exports = TransferTable;