const API = require('../../../services/api.js');
const Toast = require('../../../components/Toast.js');
const PdfGenerator = require('../../../utils/PdfGenerator.js');
const TransferModals = require('./TransferModals.js');

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
        this._attachEvents(container);
    }

    // ─── Row HTML ─────────────────────────────────────────────────────────────

    _rowHTML(t, userBranch, isAdmin) {
        if (t.is_request) return this._requestRowHTML(t, userBranch, isAdmin);

        // Direction icon
        let dirIcon = `<span class="trv-dir-neutral">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14">
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg></span>`;

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

            if (isAdmin && st === 'completed') {
                actions += `<button class="trv-action-btn trv-action-btn--danger btn-revert" data-id="${esc(t.batch_id)}" title="Revert Transfer (Admin Only)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12"><path d="M3 11V9a4 4 0 0 1 4-4h14M8 2l-5 5 5 5M21 13v2a4 4 0 0 1-4 4H3M16 22l5-5-5-5"/></svg>
                </button>`;
            }
            // the Resolve button if needed (compact SVG style)
            if (hasUnresolvedDiscrepancy && (isAdmin || uBranch === fromLoc)) {
                actions += `<button class="trv-action-btn trv-action-btn--primary btn-resolve" data-id="${esc(t.batch_id)}" title="Mark Discrepancy as Resolved" style="padding: 0 8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><polyline points="20 6 9 17 4 12"/></svg>
                </button>`;
            }
        }

        const timeAgo = this.timeSince(new Date(t.created_at));
        const batchId = esc(t.batch_id);
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

    // ─── Request row HTML ─────────────────────────────────────────────────────

    _requestRowHTML(t, userBranch, isAdmin) {
        const uBranch = String(userBranch ?? '');
        const toLoc = String(t.to_loc_id ?? '');   // requester (me, if outgoing request)
        const fromLoc = String(t.from_loc_id ?? ''); // who's being asked (me, if incoming request)

        const iAmBeingAsked = uBranch === fromLoc; // I can fulfill/reject this
        const iRequested = uBranch === toLoc;      // I can cancel this

        const dirIcon = iAmBeingAsked
            ? `<span class="trv-dir-incoming" title="Request received"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>`
            : `<span class="trv-dir-outgoing" title="Request sent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><path d="M12 5v14M5 12l7 7 7-7"/></svg></span>`;

        const st = esc((t.status || '').toLowerCase());
        const stLabel = 'Requested: ' + esc(t.status.charAt(0).toUpperCase() + t.status.slice(1));
        let stIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        if (st === 'fulfilled') stIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="13"><polyline points="20 6 9 17 4 12"/></svg>';
        else if (st === 'rejected' || st === 'canceled') stIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        const statusHtml = `<div style="display:flex; justify-content:center; width:100%;"><span class="trv-status-icon trv-status-icon--${st === 'pending' ? 'pending' : (st === 'fulfilled' ? 'completed' : 'rejected')}" title="${stLabel}">${stIcon}</span></div>`;

        let actions = '';
        if (t.status === 'pending') {
            if (isAdmin || iAmBeingAsked) {
                actions += `<button class="trv-action-btn trv-action-btn--primary btn-fulfill-req" data-id="${esc(t.batch_id)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    Fulfill
                </button>`;
                actions += `<button class="trv-action-btn trv-action-btn--danger btn-reject-req" data-id="${esc(t.batch_id)}">Reject</button>`;
            } else if (isAdmin || iRequested) {
                actions += `<button class="trv-action-btn trv-action-btn--danger btn-cancel-req" data-id="${esc(t.batch_id)}">Cancel</button>`;
            }
        } else {
            actions += `<button class="trv-action-btn trv-action-btn--ghost btn-view-req" data-id="${esc(t.batch_id)}" title="View details">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>`;
        }

        const timeAgo = this.timeSince(new Date(t.created_at));
        const batchId = esc(t.batch_id);
        const domId = batchId.replace(/[^a-zA-Z0-9_-]/g, '_');

        return `
        <div class="trv-row trv-row--request" data-batch="${batchId}">
            <div class="trv-row-main">
                <button class="trv-expand-btn expand-toggle-req" data-batch="${batchId}" title="Expand details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" id="icon-${domId}"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <span class="trv-batch-id btn-view-req" data-id="${batchId}" title="${batchId}">#${batchId} <span style="font-size:10px;color:var(--neutral-400);font-weight:600;">REQUEST</span></span>
                <span class="trv-date" title="${esc(new Date(t.created_at).toLocaleString())}">${esc(timeAgo)}</span>
                <span style="display:flex;justify-content:center;">${dirIcon}</span>
                <span class="trv-branch" title="${esc(t.from_location)}">${esc(t.from_location)}</span>
                <span class="trv-branch" title="${esc(t.to_location)}">${esc(t.to_location)}</span>
                <span class="trv-items-cell" title="${parseInt(t.item_count) || 0} items (${parseInt(t.total_qty) || 0} qty)">
                    ${parseInt(t.item_count) || 0} items
                    <span class="trv-items-qty">(${parseInt(t.total_qty) || 0} qty)</span>
                </span>
                <span class="trv-disc-cell"><span class="trv-disc--na">—</span></span>
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

    _expandRequestContentHTML(data) {
        const items = data.items || [];
        const initStr = esc(new Date(data.created_at).toLocaleString());

        const rowsHTML = items.map(i => `
            <tr>
                <td class="trv-sub-td" style="font-size:11px;font-family:monospace;color:var(--neutral-400);">${esc(i.product_sku) || '—'}</td>
                <td class="trv-sub-td" style="font-weight:600;color:var(--neutral-800);">${esc(i.product_name)}</td>
                <td class="trv-sub-td" style="text-align:center;font-weight:700;color:var(--primary-600);">${parseInt(i.requested_qty) || 0}</td>
                <td class="trv-sub-td" style="text-align:center;font-weight:700;">${i.approved_qty !== null ? parseInt(i.approved_qty) : '—'}</td>
                <td class="trv-sub-td" style="font-style:italic;color:var(--neutral-400);">${esc(i.response_note) || '—'}</td>
            </tr>`).join('');

        return `
            <div class="trv-expand-meta">
                <div class="trv-expand-meta-item">
                    <span class="trv-expand-meta-label">Requested by</span>
                    <strong>${esc(data.requested_by)}</strong>
                    <span class="trv-expand-meta-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" style="vertical-align:-1px;margin-right:2px;opacity:.6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${initStr}
                    </span>
                </div>
            </div>
            <div class="trv-expand-header">
                <span class="trv-expand-title">Requested Items</span>
                <span class="trv-product-count">${items.length} product${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="trv-sub-table-wrap">
                <table class="trv-sub-table">
                    <thead>
                        <tr>
                            <th class="trv-sub-th" style="width:90px;">SKU</th>
                            <th class="trv-sub-th">Product</th>
                            <th class="trv-sub-th" style="text-align:center;width:80px;">Requested</th>
                            <th class="trv-sub-th" style="text-align:center;width:80px;">Approved</th>
                            <th class="trv-sub-th">Notes</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>`;
    }

    async _toggleExpandRequest(batchId) {
        const domId = batchId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const panel = document.getElementById(`expanded-${domId}`);
        const btn = panel?.previousElementSibling?.querySelector('.expand-toggle-req');
        const content = document.getElementById(`expanded-content-${domId}`);
        if (!panel) return;

        const isOpen = panel.classList.contains('trv-expand-panel--open');
        if (!isOpen) {
            panel.classList.add('trv-expand-panel--open');
            btn?.classList.add('trv-expand-btn--open');
            if (content.dataset.loaded !== 'true') {
                try {
                    const res = await API.getTransferRequestDetails(batchId);
                    if (res.status === 'success') {
                        content.innerHTML = this._expandRequestContentHTML(res.data);
                        content.dataset.loaded = 'true';
                    } else {
                        content.innerHTML = `<div style="color:var(--error-500);font-size:12px;padding:8px 0;">${esc(res.message)}</div>`;
                    }
                } catch (e) {
                    content.innerHTML = `<div style="color:var(--error-500);font-size:12px;padding:8px 0;">Failed to load request items.</div>`;
                }
            }
        } else {
            panel.classList.remove('trv-expand-panel--open');
            btn?.classList.remove('trv-expand-btn--open');
        }
    }

    // ─── Event binding ────────────────────────────────────────────────────────

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
        container.querySelectorAll('.btn-revert').forEach(btn => {
            btn.addEventListener('click', () => this.modals.handleRevert(btn.dataset.id));
        });

        // ── Request row events ──────────────────────────────────────────────
        container.querySelectorAll('.expand-toggle-req').forEach(btn => {
            btn.addEventListener('click', () => this._toggleExpandRequest(btn.dataset.batch));
        });
        container.querySelectorAll('.btn-view-req').forEach(btn => {
            btn.addEventListener('click', () => this.modals.showRequestDetailsModal(btn.dataset.id));
        });
        container.querySelectorAll('.btn-fulfill-req').forEach(btn => {
            btn.addEventListener('click', () => this.parent.startFulfillFromRequest(btn.dataset.id));
        });
        container.querySelectorAll('.btn-reject-req').forEach(btn => {
            btn.addEventListener('click', () => this.modals.handleRejectRequest(btn.dataset.id));
        });
        container.querySelectorAll('.btn-cancel-req').forEach(btn => {
            btn.addEventListener('click', () => this.modals.handleCancelRequest(btn.dataset.id));
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

    handleRevert(batchId) {
        const bodyHtml = `
            <div style="margin-bottom: 15px; color: var(--error-600); background: #fef2f2; padding: 12px; border-radius: 6px; border: 1px solid #fecaca; font-size: 13px;">
                <strong>Warning:</strong> You are about to forcefully revert <b>${batchId}</b>.<br><br>
                This will immediately pull the received stock back out of the destination branch and refund the original amount to the sender branch. This action will be permanently logged.
            </div>
            <div class="form-group">
                <label style="display:block; margin-bottom:5px; font-size: 13px; font-weight: 600;">Reason for Reverting <span style="color:red">*</span></label>
                <textarea id="revert-reason" class="form-control" rows="3" placeholder="Enter administrative reason for this revert..." style="width: 100%; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; font-family: inherit;"></textarea>
            </div>
        `;

        Modal.open({
            title: '<span style="color: var(--error-600); display: flex; align-items: center; gap: 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Revert Completed Transfer</span>',
            body: bodyHtml,
            confirmText: 'Confirm Revert',
            confirmClass: 'btn-danger', // Uses your custom red button styling
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
    _expandContentHTML(data) {
        const items = data.items || [];
        const firstItem = items[0] || {};
        const initStr = esc(new Date(data.created_at).toLocaleString());
        const approvedStr = firstItem.approved_at ? esc(new Date(firstItem.approved_at).toLocaleString()) : '';

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
            const isCanceled = i.status === 'canceled';

            // Row background for canceled items
            const rowStyle = isCanceled ? 'background-color: rgba(0,0,0,0.02);' : '';
            // Strikethrough and opacity ONLY for the product details cells
            const canceledCellStyle = isCanceled ? 'opacity: 0.5; text-decoration: line-through;' : '';
            // Dim the notes slightly, but NO strikethrough
            const canceledNoteStyle = isCanceled ? 'opacity: 0.8;' : '';

            const diff = (i.received_qty !== null) ? i.received_qty - i.qty : null;
            let recvClass = '';
            let recvVal = i.received_qty !== null ? esc(String(i.received_qty)) : '—';

            if (diff !== null && !isCanceled) {
                if (diff < 0) recvClass = 'trv-qty-low';
                else if (diff > 0) recvClass = 'trv-qty-high';
                else recvClass = 'trv-qty-ok';
            }

            let noteStr = esc(i.note) || '—';
            if (isCanceled) {
                noteStr = noteStr !== '—' ? `<strong>(Canceled)</strong> ${noteStr}` : '<strong>Canceled</strong>';
            }

            return `
            <tr style="${rowStyle}">
                <td class="trv-sub-td" style="font-size:11px;font-family:monospace;color:var(--neutral-400); ${canceledCellStyle}">${esc(i.product_sku) || '—'}</td>
                <td class="trv-sub-td" style="font-weight:600;color:var(--neutral-800); ${canceledCellStyle}">${esc(i.product_name)}</td>
                <td class="trv-sub-td" style="text-align:center;font-weight:700;color:var(--primary-600); ${canceledCellStyle}">${parseInt(i.qty) || 0}</td>
                <td class="trv-sub-td ${recvClass}" style="text-align:center;font-weight:700; ${canceledCellStyle}">${recvVal}</td>
                <td class="trv-sub-td" style="font-style:italic;color:var(--neutral-400); ${canceledNoteStyle}">${noteStr}</td>
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