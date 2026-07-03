const Toast = require('../../../components/Toast.js');

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =======================================================================
   BranchBalancePanel
   Per-product branch-share matrix + percentage-based bulk transfer builder.
   Mounted as a tab inside TransfersView (see trvPanelBalance).
   ======================================================================= */
class BranchBalancePanel {
    constructor({onScrollEnd, onLoadAll}) { 
        this.onScrollEnd = onScrollEnd;   
        this.onLoadAll = onLoadAll;       

        this._branches = [];
        this._products = [];              
        this._fromId = '';
        this._toId = '';
        this._percent = 25;
        this._overrides = {};             
        this._excluded = new Set();       
        this._el = null;
        this._isAllLoaded = false;        
    }

    setAllLoaded(isLoaded) {
        this._isAllLoaded = isLoaded;
        const btn = this._el?.querySelector('#bbpLoadAllBtn');
        if (btn) btn.style.display = isLoaded ? 'none' : 'inline-block';
    }

    // ─── Public API ──────────────────────────────────────────────────────
    setBranches(branches, userBranchId) {
        this._branches = branches || [];
        if (userBranchId && !this._fromId) this._fromId = String(userBranchId);
        this._renderControls();
    }

    /** Replace (reset=true) or append (reset=false) the product list. */
    setProducts(products, reset) {
        this._products = reset ? [...(products || [])] : [...this._products, ...(products || [])];
        if (reset) {
            this._overrides = {};
            this._excluded.clear();
        }
        this._renderMatrix();
    }

    showLoading() {
        const body = this._el?.querySelector('#bbpMatrixBody');
        if (body) body.innerHTML = `<div class="trv-empty-row">Loading stock distribution…</div>`;
    }

    render(container) {
        container.innerHTML = `
            <div class="bbp-root" id="bbpRoot">
                <div class="bbp-controls" id="bbpControls"></div>
                <div class="bbp-matrix-wrap" id="bbpMatrixWrap">
                    <div id="bbpMatrixBody"></div>
                </div>
            </div>`;
        this._el = container.querySelector('#bbpRoot');
        this._renderControls();
        this._renderMatrix();
        this._el.querySelector('#bbpMatrixWrap').addEventListener('scroll', (e) => {
            const t = e.target;
            if (t.scrollTop + t.clientHeight >= t.scrollHeight - 150) this.onScrollEnd?.();
        }, {passive: true});
    }

    // ─── Controls (from/to/percent/targets) ───────────────────────────────
    _renderControls() {
        const el = this._el?.querySelector('#bbpControls');
        if (!el || !this._branches.length) return;

        const fromOpts = this._branches.map(b =>
            `<option value="${esc(b.id)}" ${String(b.id) === String(this._fromId) ? 'selected' : ''}>${esc(b.name)}</option>`
        ).join('');
        const toOpts = this._branches
            .filter(b => String(b.id) !== String(this._fromId))
            .map(b => `<option value="${esc(b.id)}" ${String(b.id) === String(this._toId) ? 'selected' : ''}>${esc(b.name)}</option>`)
            .join('');

        el.innerHTML = `
            <div class="bbp-control-row">
                <div class="bbp-field">
                    <label>FROM</label>
                    <select id="bbpFrom" class="tsp-branch-sel">${fromOpts}</select>
                </div>
                <div class="bbp-field">
                    <label>TO</label>
                    <select id="bbpTo" class="tsp-branch-sel">
                        <option value="">— Select destination —</option>
                        ${toOpts}
                    </select>
                </div>
                <div class="bbp-field bbp-field--pct">
                    <label>TARGET %</label>
                    <input type="number" id="bbpPercent" min="1" max="100" value="${this._percent}">
                </div>
                <div class="bbp-quick-pct">
                    ${[10, 25, 50, 75].map(p => `<button type="button" class="trv-btn trv-btn-ghost bbp-pct-btn" data-pct="${p}">${p}%</button>`).join('')}
                </div>
                <div class="trv-toolbar-spacer"></div>
                
                <!-- NEW BUTTON HERE -->
                <button type="button" class="trv-btn trv-btn-ghost" id="bbpLoadAllBtn" style="color: var(--primary-600); border-color: var(--primary-200); background: var(--primary-50); ${this._isAllLoaded ? 'display:none;' : ''}">↓ Load Entire Catalog</button>
                
                <button type="button" class="trv-btn" id="bbpExportBtn">Export CSV</button>
            </div>
        `;

        el.querySelector('#bbpFrom').addEventListener('change', (e) => {
            this._fromId = e.target.value;
            this._renderControls();
            this._renderMatrix();
        });
        el.querySelector('#bbpTo').addEventListener('change', (e) => {
            this._toId = e.target.value;
            this._overrides = {};
            this._renderMatrix();
        });
        el.querySelector('#bbpPercent').addEventListener('input', (e) => {
            this._percent = Math.max(1, Math.min(100, parseInt(e.target.value) || 0));
            this._overrides = {}; 
            this._renderMatrix();
        });
        el.querySelectorAll('.bbp-pct-btn').forEach(btn => btn.addEventListener('click', () => {
            this._percent = parseInt(btn.dataset.pct);
            this._overrides = {};
            this._renderControls();
            this._renderMatrix();
        }));
        el.querySelector('#bbpExportBtn').addEventListener('click', () => this._exportCsv());

        // NEW LISTENER HERE
        el.querySelector('#bbpLoadAllBtn')?.addEventListener('click', (e) => {
            const btn = e.target;
            btn.disabled = true;
            btn.innerHTML = `<svg class="lpg-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: text-bottom;"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Fetching...`;
            this.onLoadAll?.();
        });
    }

    // ─── Matrix (per-product branch-share breakdown) ──────────────────────
    _breakdown(product) {
        const map = {};
        let total = 0;
        if (product.stock_breakdown) {
            product.stock_breakdown.toString().split(',').forEach(pair => {
                const idx = pair.lastIndexOf(':');
                if (idx === -1) return;
                const lid = pair.substring(0, idx).trim();
                const qty = parseInt(pair.substring(idx + 1).trim() || 0);
                map[lid] = qty;
                total += qty;
            });
        }
        return {map, total};
    }

    _computeQty(product) {
        if (this._overrides[product.id] !== undefined) return this._overrides[product.id];
        const {map, total} = this._breakdown(product);
        const fromQty = parseInt(map[this._fromId] || 0);
        const toQty = this._toId ? parseInt(map[this._toId] || 0) : 0;

        // Target = the destination's share if it held `percent`% of the TOTAL
        // stock across all branches (not a percentage of the source's stock).
        const targetQty = Math.floor(total * (this._percent / 100));

        // Only move enough to close the gap between what the destination
        // already has and that target share.
        const needed = targetQty - toQty;

        return Math.max(0, Math.min(needed, fromQty));
    }

    _renderMatrix() {
        const body = this._el?.querySelector('#bbpMatrixBody');
        if (!body) return;

        if (!this._products.length) {
            body.innerHTML = `<div class="trv-empty-row">No products loaded yet.</div>`;
            return;
        }
        if (!this._fromId) {
            body.innerHTML = `<div class="trv-empty-row">Select a source branch to see its stock share.</div>`;
            return;
        }

        const headerCols = this._branches.map(b => `<div class="bbp-ch">${esc(b.name)}</div>`).join('');
        const hasDestination = !!this._toId;

        let validCount = 0;
        let excludedValidCount = 0;

        const rows = this._products.map(p => {
            const {map, total} = this._breakdown(p);
            const cells = this._branches.map(b => {
                const qty = parseInt(map[b.id] || 0);
                const pct = total > 0 ? (qty / total * 100) : 0;
                let cls = 'bbp-cell';
                if (String(b.id) === String(this._fromId)) cls += ' bbp-cell--from';
                return `<div class="${cls}">${qty}<span class="bbp-cell-pct">${pct.toFixed(0)}%</span></div>`;
            }).join('');

            const targetQty = Math.floor(total * (this._percent / 100));
            const moveQty = this._computeQty(p);
            const fromQty = parseInt(map[this._fromId] || 0);
            const disabled = fromQty <= 0 || !hasDestination;
            
            // Track valid items for the Master Checkbox logic
            if (!disabled) {
                validCount++;
                if (this._excluded.has(p.id)) excludedValidCount++;
            }

            const checked = !disabled && !this._excluded.has(p.id) && moveQty > 0;

            const moveCell = hasDestination
                ? `<input type="number" class="bbp-move-qty" data-id="${esc(p.id)}" min="0" max="${fromQty}" value="${moveQty}" ${disabled ? 'disabled' : ''}>`
                : `<span class="bbp-move-placeholder" title="Select a destination branch to calculate">—</span>`;

            return `
                <div class="bbp-row ${disabled ? 'bbp-row--disabled' : ''}" data-id="${esc(p.id)}">
                    <div class="bbp-rc bbp-rc--check">
                        <input type="checkbox" class="bbp-check" data-id="${esc(p.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                    </div>
                    <div class="bbp-rc bbp-rc--name">
                        <div class="bbp-pname">${esc(p.name)}</div>
                        <div class="bbp-psku">${esc(p.sku || '')}</div>
                    </div>
                    ${cells}
                    <div class="bbp-rc bbp-rc--total">${total}</div>
                    <div class="bbp-rc bbp-rc--target">${targetQty}</div>
                    <div class="bbp-rc bbp-rc--move">
                        ${moveCell}
                    </div>
                </div>`;
        }).join('');

        // Determine if the Master Checkbox should be checked
        const isMasterChecked = validCount > 0 && excludedValidCount === 0;

        body.innerHTML = `
            ${!hasDestination ? `<div class="bbp-dest-hint">Select a destination branch above to calculate Move Qty.</div>` : ''}
            <div class="bbp-matrix">
                <div class="bbp-row bbp-row--head">
                    <div class="bbp-rc bbp-rc--check" title="Select / Deselect All">
                        <input type="checkbox" id="bbpMasterCheck" ${isMasterChecked ? 'checked' : ''} ${validCount === 0 ? 'disabled' : ''}>
                    </div>
                    <div class="bbp-rc bbp-rc--name">Product</div>
                    ${headerCols}
                    <div class="bbp-rc bbp-rc--total">Total</div>
                    <div class="bbp-rc bbp-rc--target" title="Target quantity for the destination (% of total)">Target Qty</div>
                    <div class="bbp-rc bbp-rc--move" ${hasDestination ? '' : 'title="Select a destination branch to calculate"'}>Move Qty${hasDestination ? '' : ' <span class="bbp-move-hint">(select destination)</span>'}</div>
                </div>
                ${rows}
            </div>`;

        // --- Event Listeners ---

        // 1. Master Checkbox Listener
        const masterCheck = body.querySelector('#bbpMasterCheck');
        if (masterCheck) {
            masterCheck.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                this._products.forEach(p => {
                    const {map} = this._breakdown(p);
                    const fromQty = parseInt(map[this._fromId] || 0);
                    // Only toggle items that actually have stock to move
                    if (fromQty > 0) {
                        if (isChecked) {
                            this._excluded.delete(p.id);
                        } else {
                            this._excluded.add(p.id);
                        }
                    }
                });
                this._renderMatrix(); // Re-render to reflect changes visually
            });
        }

        // 2. Individual Checkbox Listener
        body.querySelectorAll('.bbp-check').forEach(cb => cb.addEventListener('change', () => {
            const id = parseInt(cb.dataset.id);
            if (cb.checked) this._excluded.delete(id); else this._excluded.add(id);
            
            // Re-evaluate master checkbox state without full re-render
            const master = body.querySelector('#bbpMasterCheck');
            if (master) {
                const allValidChecks = Array.from(body.querySelectorAll('.bbp-check:not(:disabled)'));
                master.checked = allValidChecks.every(c => c.checked);
            }
        }));

        // 3. Move Quantity Input Listener
        body.querySelectorAll('.bbp-move-qty').forEach(inp => inp.addEventListener('change', () => {
            const id = parseInt(inp.dataset.id);
            const p = this._products.find(x => x.id === id);
            const {map} = this._breakdown(p || {});
            const max = parseInt(map[this._fromId] || 0);
            const val = Math.max(0, Math.min(parseInt(inp.value) || 0, max));
            inp.value = val;
            this._overrides[id] = val;
            const row = inp.closest('.bbp-row');
            const cb = row?.querySelector('.bbp-check');
            if (cb && val === 0) { 
                cb.checked = false; 
                this._excluded.add(id);
                // Also uncheck master if a local item drops to 0
                const master = body.querySelector('#bbpMasterCheck');
                if (master) master.checked = false;
            }
        }));
    }

    // ─── Build the move list and download it as a CSV file ────────────────
    _csvEscape(val) {
        const str = String(val ?? '');
        if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
    }

    _exportCsv() {
        if (!this._fromId) return Toast.error('Select a source branch');
        if (!this._toId) return Toast.error('Select a destination branch');
        if (this._fromId === this._toId) return Toast.error('Source and destination must differ');

        const items = [];
        this._products.forEach(p => {
            if (this._excluded.has(p.id)) return;
            const qty = this._computeQty(p);
            if (qty > 0) items.push(p);
        });

        if (!items.length) return Toast.error(`No products have stock to move at ${this._percent}%`);

        const locMap = {};
        this._branches.forEach(b => locMap[b.id] = b.name);
        const fromName = locMap[this._fromId] || this._fromId;
        const toName = locMap[this._toId] || this._toId;

        const branchCols = this._branches.map(b => b.name);
        const header = [
            'Product', 'SKU',
            ...branchCols,
            'Total',
            'Target %',
            'Target Qty',
            'From Branch', 'To Branch', 'Move Qty'
        ];

        const rows = items.map(p => {
            const {map, total} = this._breakdown(p);
            const targetQty = Math.floor(total * (this._percent / 100));
            const moveQty = this._computeQty(p);
            const branchVals = this._branches.map(b => parseInt(map[b.id] || 0));
            return [p.name, p.sku || '', ...branchVals, total, this._percent, targetQty, fromName, toName, moveQty];
        });

        const csv = [header, ...rows]
            .map(row => row.map(v => this._csvEscape(v)).join(','))
            .join('\r\n');

        // Prepend a UTF-8 BOM so Excel renders special characters (×, ±, etc.)
        // correctly instead of misreading the file as Windows-1252.
        const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const safe = s => String(s).replace(/[^a-z0-9]+/gi, '_');
        const a = document.createElement('a');
        a.href = url;
        a.download = `BalanceTransfer_${safe(fromName)}_to_${safe(toName)}_${this._percent}pct_${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Toast.success(`Exported ${items.length} products to CSV`);
    }
}

module.exports = BranchBalancePanel;