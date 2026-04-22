const API = require('../../../services/api.js');
const Toast = require('../../../components/Toast.js');
const PdfGenerator = require('../../../utils/PdfGenerator.js');
const TransferModals = require('./TransferModals.js');

// FIX: Escape helper prevents XSS from server-supplied strings inserted into innerHTML.
function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class TransferTable {
    constructor(parentView) {
        this.parent = parentView;
        this.modals = new TransferModals(parentView);
    }

    // ─── Public render ────────────────────────────────────────────────────────

    render(transfers) {
        const container = document.getElementById('transfersTableBody');
        if (!container) return;

        // Clear any old open panels before re-render
        container.querySelectorAll('.trv-expand-panel--open').forEach(p => p.classList.remove('trv-expand-panel--open'));

        if (!transfers.length) {
            container.innerHTML = `<div class="trv-empty-row">No transfers found.</div>`;
            return;
        }

        const userBranch = this.parent.state.getUserBranchId();
        const isAdmin = this.parent.state.getUser()?.role === 'admin';

        container.innerHTML = transfers.map(t => this._rowHTML(t, userBranch, isAdmin)).join('');
        // FIX: Scope event attachment to the container, not document, to avoid
        // duplicate listeners on re-render and unintended matches elsewhere.
        this._attachEvents(container);
    }

    // ─── Row HTML ─────────────────────────────────────────────────────────────

    _rowHTML(t, userBranch, isAdmin) {
        // Direction icon
        let dirIcon = `<span class="trv-dir-neutral">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14">
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg></span>`;

        // FIX: Use String() normalisation + strict equality for branch ID comparisons
        // to avoid type-coercion bugs (e.g. "010" == 10 is false; was previously ==).
        const uBranch = String(userBranch ?? '');
        const toLoc = String(t.to_loc_id ?? '');
        const fromLoc = String(t.from_loc_id ?? '');

        if (this.parent.currentTab === 'pending_incoming') {
            dirIcon = `<span class="trv-dir-incoming" title="Incoming">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            </span>`;
        } else if (this.parent.currentTab === 'pending_outgoing') {
            dirIcon = `<span class="trv-dir-outgoing" title="Outgoing">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 19V5M19 12l-7-7-7 7"/></svg>
            </span>`;
        } else if (uBranch) {
            if (uBranch === toLoc) {
                dirIcon = `<span class="trv-dir-incoming" title="Incoming">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                </span>`;
            } else if (uBranch === fromLoc) {
                dirIcon = `<span class="trv-dir-outgoing" title="Outgoing">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 19V5M19 12l-7-7-7 7"/></svg>
                </span>`;
            }
        }

        // Discrepancy
        let discHtml = '<span class="trv-disc--na">—</span>';
        let hasUnresolvedDiscrepancy = false; // Add a flag

        if (t.status === 'completed' || t.status === 'rejected') {
            const diff = (parseInt(t.total_received_qty) || 0) - (parseInt(t.total_qty) || 0);
            if (diff < 0) {
                // Check if it's resolved!
                if (parseInt(t.discrepancy_resolved) === 1) {
                    discHtml = `<div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                        <span class="trv-disc--low" style="opacity: 0.5; text-decoration: line-through;" title="Resolved">${diff}</span> 
                        <span style="font-size: 10px; font-weight: 600; color: var(--success-500);">Resolved</span>
                    </div>`;
                } else {
                    discHtml = `<span class="trv-disc--low">${diff}</span>`;
                    hasUnresolvedDiscrepancy = true;
                }
            }
            else if (diff > 0) discHtml = `<span class="trv-disc--high">+${diff}</span>`;
            else discHtml = `<span class="trv-disc--ok">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="13"><polyline points="20 6 9 17 4 12"/></svg>
            </span>`;
        }

        // Status badge (Converted to compact icon)
        const st = esc(t.status.toLowerCase());
        const stLabel = esc(t.status.charAt(0).toUpperCase() + t.status.slice(1));

        let stIcon = '';
        if (st === 'completed') {
            stIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="13"><polyline points="20 6 9 17 4 12"/></svg>';
        } else if (st === 'pending') {
            stIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        } else {
            stIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }

        // The div centers the icon perfectly under the header
        const statusHtml = `<div style="display:flex; justify-content:center; width:100%;"><span class="trv-status-icon trv-status-icon--${st}" title="${stLabel}">${stIcon}</span></div>`;

        // Actions
        let actions = '';
        if (t.status === 'pending') {
            if ((isAdmin || uBranch === toLoc) && uBranch !== fromLoc) {
                actions += `<button class="trv-action-btn trv-action-btn--primary btn-review" data-id="${esc(t.batch_id)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Review
                </button>`;
            }
            if (isAdmin || uBranch === fromLoc) {
                actions += `<button class="trv-action-btn trv-action-btn--danger btn-cancel" data-id="${esc(t.batch_id)}">Cancel</button>`;
            }
        } else {
            actions += `<button class="trv-action-btn trv-action-btn--ghost btn-view" data-id="${esc(t.batch_id)}" title="View details">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>`;
            actions += `<button class="trv-action-btn trv-action-btn--ghost btn-print" data-id="${esc(t.batch_id)}" title="Print PDF">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>`;

            // Add the Resolve button if needed (compact SVG style)
            if (hasUnresolvedDiscrepancy && (isAdmin || uBranch === fromLoc)) {
                actions += `<button class="trv-action-btn trv-action-btn--primary btn-resolve" data-id="${esc(t.batch_id)}" title="Mark Discrepancy as Resolved" style="padding: 0 8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><polyline points="20 6 9 17 4 12"/></svg>
                </button>`;
            }
        }

        const timeAgo = this.timeSince(new Date(t.created_at));
        const batchId = esc(t.batch_id);
        // FIX: Automatic transfer batch IDs (e.g. "Automatic on order #38740") contain
        // spaces and "#", making them invalid HTML element IDs.
        const domId = batchId.replace(/[^a-zA-Z0-9_-]/g, '_');

        return `
        <div class="trv-row" data-batch="${batchId}">
            <div class="trv-row-main">
                <button class="trv-expand-btn expand-toggle" data-batch="${batchId}" title="Expand details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" id="icon-${domId}"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <span class="trv-batch-id btn-view" data-id="${batchId}" title="${batchId}">#${batchId}</span>
                <span class="trv-date" title="${esc(new Date(t.created_at).toLocaleString())}">${esc(timeAgo)}</span>
                <span style="display:flex;justify-content:center;">${dirIcon}</span>
                <span class="trv-branch" title="${esc(t.from_location)}">${esc(t.from_location)}</span>
                <span class="trv-branch" title="${esc(t.to_location)}">${esc(t.to_location)}</span>
                <span class="trv-items-cell" title="${parseInt(t.item_count) || 0} items (${parseInt(t.total_qty) || 0} qty)">
                    ${parseInt(t.item_count) || 0} items 
                    <span class="trv-items-qty">(${parseInt(t.total_qty) || 0} qty)</span>
                </span>
                <span class="trv-disc-cell">${discHtml}</span>
                ${statusHtml}
                <div class="trv-actions">${actions}</div>
            </div>
            <div class="trv-expand-panel" id="expanded-${domId}">
                <div id="expanded-content-${domId}">
                    <div style="color:#9ca3af;font-size:12px;display:flex;align-items:center;gap:8px;padding:8px 0;">
                        <svg class="lpg-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg>
                        Fetching items…
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    // FIX: Accept container param and scope all queries to it, preventing
    // duplicate listeners on re-render and cross-component interference.
    _attachEvents(container) {
        container.querySelectorAll('.expand-toggle').forEach(btn => {
            btn.addEventListener('click', () => this._toggleExpand(btn.dataset.batch));
        });
        container.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', () => this.modals.showDetailsModal(btn.dataset.id));
        });
        container.querySelectorAll('.btn-review').forEach(btn => {
            btn.addEventListener('click', () => this.modals.showReviewModal(btn.dataset.id));
        });
        container.querySelectorAll('.btn-cancel').forEach(btn => {
            btn.addEventListener('click', () => this.modals.handleCancel(btn.dataset.id));
        });
        container.querySelectorAll('.btn-print').forEach(btn => {
            btn.addEventListener('click', () => this._printTransfer(btn.dataset.id));
        });

        // Handle the Resolve button click
        container.querySelectorAll('.btn-resolve').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to mark this discrepancy as resolved? Make sure you have adjusted the stock manually if the item was found.')) {
                    const res = await API.resolveDiscrepancy(btn.dataset.id);
                    if (res.status === 'success') {
                        Toast.success(res.message);
                        await this.parent.loadTransfers(); // Reload the table
                    } else {
                        Toast.error(res.message);
                    }
                }
            });
        });
    }

    // ─── Expand ───────────────────────────────────────────────────────────────

    async _toggleExpand(batchId) {
        // Derive the same sanitised DOM key used when the row was rendered.
        const domId = batchId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const panel = document.getElementById(`expanded-${domId}`);
        const btn = panel?.previousElementSibling?.querySelector('.expand-toggle');
        const content = document.getElementById(`expanded-content-${domId}`);
        if (!panel) return;

        const isOpen = panel.classList.contains('trv-expand-panel--open');

        if (!isOpen) {
            panel.classList.add('trv-expand-panel--open');
            btn?.classList.add('trv-expand-btn--open');

            if (content.dataset.loaded !== 'true') {
                try {
                    const res = await API.getTransferDetails(batchId);
                    if (res.status === 'success') {
                        content.innerHTML = this._expandContentHTML(res.data);
                        content.dataset.loaded = 'true';
                    } else {
                        // FIX: escape server error message before injection
                        content.innerHTML = `<div style="color:var(--error-500);font-size:12px;padding:8px 0;">
                            <i class="fa-solid fa-circle-exclamation"></i> ${esc(res.message)}
                        </div>`;
                    }
                } catch (e) {
                    content.innerHTML = `<div style="color:var(--error-500);font-size:12px;padding:8px 0;">
                        Failed to load transfer items.
                    </div>`;
                }
            }
        } else {
            panel.classList.remove('trv-expand-panel--open');
            btn?.classList.remove('trv-expand-btn--open');
        }
    }

    _expandContentHTML(data) {
        const items = data.items || [];
        const firstItem = items[0] || {};
        const initStr = esc(new Date(data.created_at).toLocaleString());
        const approvedStr = firstItem.approved_at ? esc(new Date(firstItem.approved_at).toLocaleString()) : '';

        // FIX: escape all server-supplied strings before injection
        let metaHTML = `
            <div class="trv-expand-meta">
                <div class="trv-expand-meta-item">
                    <span class="trv-expand-meta-label">Initiated by</span>
                    <strong>${esc(data.initiated_by)}</strong>
                    <span class="trv-expand-meta-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" style="vertical-align:-1px;margin-right:2px;opacity:.6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${initStr}
                    </span>
                </div>`;

        if (data.status !== 'pending' && data.approved_by) {
            const verb = data.status === 'completed' ? 'Approved by' : 'Handled by';
            metaHTML += `
                <div class="trv-expand-meta-item">
                    <span class="trv-expand-meta-label">${esc(verb)}</span>
                    <strong>${esc(data.approved_by)}</strong>
                    ${approvedStr ? `<span class="trv-expand-meta-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" style="vertical-align:-1px;margin-right:2px;opacity:.6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${approvedStr}
                    </span>` : ''}
                </div>`;
        }
        metaHTML += `</div>`;

        const rowsHTML = items.map(i => {
            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
            let recvClass = '';
            let recvVal = i.received_qty !== null ? esc(String(i.received_qty)) : '—';
            if (diff !== null) {
                if (diff < 0) recvClass = 'trv-qty-low';
                else if (diff > 0) recvClass = 'trv-qty-high';
                else recvClass = 'trv-qty-ok';
            }
            return `
            <tr>
                <td class="trv-sub-td" style="font-size:11px;font-family:monospace;color:var(--neutral-400);">${esc(i.product_sku) || '—'}</td>
                <td class="trv-sub-td" style="font-weight:600;color:var(--neutral-800);">${esc(i.product_name)}</td>
                <td class="trv-sub-td" style="text-align:center;font-weight:700;color:var(--primary-600);">${parseInt(i.qty) || 0}</td>
                <td class="trv-sub-td ${recvClass}" style="text-align:center;font-weight:700;">${recvVal}</td>
                <td class="trv-sub-td" style="font-style:italic;color:var(--neutral-400);">${esc(i.note) || '—'}</td>
            </tr>`;
        }).join('');

        return `
            ${metaHTML}
            <div class="trv-expand-header">
                <span class="trv-expand-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" style="vertical-align:-1px;margin-right:4px;opacity:.6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Transfer Items
                </span>
                <span class="trv-product-count">${items.length} product${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="trv-sub-table-wrap">
                <table class="trv-sub-table">
                    <thead>
                        <tr>
                            <th class="trv-sub-th" style="width:90px;">SKU</th>
                            <th class="trv-sub-th">Product</th>
                            <th class="trv-sub-th" style="text-align:center;width:80px;">Sent</th>
                            <th class="trv-sub-th" style="text-align:center;width:80px;">Received</th>
                            <th class="trv-sub-th">Notes</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>`;
    }

    // ─── Print ────────────────────────────────────────────────────────────────

    async _printTransfer(batchId) {
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

    // ─── Helpers ──────────────────────────────────────────────────────────────

    timeSince(date) {
        const s = Math.floor((new Date() - date) / 1000);
        if (s / 31536000 > 1) return Math.floor(s / 31536000) + 'y ago';
        if (s / 2592000 > 1) return Math.floor(s / 2592000) + 'mo ago';
        if (s / 86400 > 1) return Math.floor(s / 86400) + 'd ago';
        if (s / 3600 > 1) return Math.floor(s / 3600) + 'h ago';
        if (s / 60 > 1) return Math.floor(s / 60) + 'm ago';
        return 'just now';
    }
}

module.exports = TransferTable;