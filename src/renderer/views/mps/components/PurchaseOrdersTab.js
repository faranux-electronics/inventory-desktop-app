const { API, Toast, esc, isoDate, today, daysAgo, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');

module.exports = {
    addSupplier(supplier = null) {
        const editing = Boolean(supplier?.id);
        this.openDialog({
            title: editing ? 'Edit supplier' : 'Add supplier',
            confirmText: editing ? 'Save supplier' : 'Add supplier',
            busyText: 'Saving supplier...',
            body: `<div class="mps-form-grid">
                <label>Supplier name<input id="mpsSupplierName" type="text" maxlength="150" autocomplete="off" value="${esc(supplier?.name || '')}" required></label>
                <label>Lead time (days)<input id="mpsSupplierLead" type="number" min="0" value="${esc(supplier?.lead_time_days ?? '')}" placeholder="Optional"></label>
                <label>Minimum order value<input id="mpsSupplierMinOrder" type="number" min="0" step="0.01" value="${esc(supplier?.min_order_value ?? '')}" placeholder="Optional"></label>
                <label>Currency<input id="mpsSupplierCurrency" type="text" maxlength="3" value="${esc(supplier?.currency || 'USD')}" placeholder="USD"></label>
                <label>Contact<input id="mpsSupplierContact" type="text" maxlength="255" value="${esc(supplier?.contact || '')}" placeholder="Optional"></label>
                <label>Note<input id="mpsSupplierNote" type="text" value="${esc(supplier?.note || '')}" placeholder="Optional"></label>
                <label class="mps-check"><input id="mpsSupplierActive" type="checkbox" ${supplier === null || Number(supplier.active) ? 'checked' : ''}> Active supplier</label>
            </div>`,
            onConfirm: async overlay => {
                const name = overlay.querySelector('#mpsSupplierName').value.trim();
                if (!name) { Toast.error('Supplier name is required.'); return false; }
                const leadTime = overlay.querySelector('#mpsSupplierLead').value;
                const minOrder = overlay.querySelector('#mpsSupplierMinOrder').value;
                const payload = {
                    name,
                    currency: overlay.querySelector('#mpsSupplierCurrency').value.trim().toUpperCase() || 'USD',
                    contact: overlay.querySelector('#mpsSupplierContact').value.trim() || null,
                    note: overlay.querySelector('#mpsSupplierNote').value.trim() || null,
                    active: overlay.querySelector('#mpsSupplierActive').checked
                };
                if (editing) payload.id = Number(supplier.id);
                if (leadTime !== '') payload.lead_time_days = Number(leadTime);
                if (minOrder !== '') payload.min_order_value = Number(minOrder);
                const result = await API.mpsSaveSupplier(payload);
                if (result.status !== 'success') { Toast.error(result.message || 'Supplier could not be saved.'); return false; }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success(editing ? 'Supplier updated.' : 'Supplier saved.');
                this.loadOrders();
                return true;
            }
        });
    },

    deleteSupplier(supplier) {
        const products = Number(supplier.products || 0);
        const purchaseOrders = Number(supplier.purchase_orders || 0);
        const links = [
            products ? `${num(products)} product${products === 1 ? '' : 's'}` : '',
            purchaseOrders ? `${num(purchaseOrders)} purchase order${purchaseOrders === 1 ? '' : 's'}` : ''
        ].filter(Boolean);
        const impact = links.length ? ` This will unassign ${links.join(' and ')}.` : '';
        this.confirmDialog({
            title: 'Delete supplier',
            message: `Delete "${supplier.name}"? This cannot be undone.${impact}`,
            confirmText: 'Continue',
            busyText: 'Continuing...',
            onConfirm: async () => {
                setTimeout(() => this.confirmDeleteSupplier(supplier), 0);
                return true;
            }
        });
    },

    confirmDeleteSupplier(supplier) {
        this.confirmDialog({
            title: 'Confirm permanent deletion',
            message: `Final confirmation: permanently delete "${supplier.name}"? This action cannot be undone.`,
            confirmText: 'Delete permanently',
            busyText: 'Deleting supplier...',
            onConfirm: async () => {
                const result = await API.mpsDeleteSupplier(Number(supplier.id));
                if (result.status !== 'success') {
                    Toast.error(result.message || 'Supplier could not be deleted.');
                    return false;
                }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                const detachedCount = (count, label) => count ? `${num(count)} ${label}${Number(count) === 1 ? '' : 's'}` : '';
                const detached = [
                    detachedCount(Number(result.products_unassigned || 0), 'product'),
                    detachedCount(Number(result.purchase_orders_unassigned || 0), 'purchase order')
                ].filter(Boolean);
                Toast.success(detached.length ? `Supplier deleted; unassigned ${detached.join(' and ')}.` : 'Supplier deleted.');
                this.loadOrders();
                return true;
            }
        });
    },

    async loadOrders() {
        const panel = document.getElementById('mpsPanel'); if (!panel) return;
        const retainedSearch = panel.querySelector('#mpsOrderSearch');
        const restoreSearchFocus = retainedSearch && document.activeElement === retainedSearch;
        const searchSelection = restoreSearchFocus ? [retainedSearch.selectionStart, retainedSearch.selectionEnd] : null;
        if (!retainedSearch) panel.innerHTML = '<div class="mps-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading purchasing data…</div>';
        else panel.querySelector('.mps-table')?.setAttribute('aria-busy', 'true');
        const token = ++this.ordersRequestToken;
        const [orders, suppliers, trashSummary] = await Promise.all([
            API.mpsGetPurchaseOrders({page:this.ordersPage,per_page:25,search:this.ordersSearch,sort_by:this.ordersSortBy,sort_order:this.ordersSortOrder,trashed:this.ordersTrashView ? 1 : 0}),
            API.mpsGetSuppliers(),
            API.mpsGetPurchaseOrders({page:1,per_page:1,trashed:1})
        ]);
        if (token !== this.ordersRequestToken || !document.getElementById('mpsPanel')) return;
        if (orders.status !== 'success') { panel.innerHTML = `<div class="mps-empty">${esc(orders.message || 'Could not load purchase orders.')}</div>`; this.addContextualHelp('orders'); return; }
        const ordersPages = Math.max(1, Math.ceil(Number(orders.total || 0) / 25));
        if (Number(orders.total || 0) > 0 && this.ordersPage > ordersPages) { this.ordersPage = ordersPages; return this.loadOrders(); }
        this.orders = orders;
        this.suppliers = suppliers.data || [];
        this.suppliersList = this.suppliers;
        const rows = (orders.data||[]).map(po => `<tr><td>${esc(po.reference)}</td><td>${esc(po.supplier_name||'—')}</td><td>${esc(statusLabel(po.freight_mode))}</td><td><span class="mps-status mps-status-${esc(po.status)}">${esc(statusLabel(po.status))}</span></td><td>${esc(po.eta_date||'—')}</td><td>${esc(po.line_count)}</td><td>${Number(po.value || 0).toLocaleString()} ${esc(po.currency || 'RWF')}</td><td>${this.isWriter ? this.orderButtons(po) : ''}</td></tr>`).join('');
        panel.innerHTML = `<div class="mps-orders-head"><div><h2>Purchase orders</h2><p>Open purchase orders feed incoming quantities into future planner runs.</p></div>${this.isWriter ? '<div class="mps-actions"><button class="btn btn-sm mps-btn-outline" id="mpsNewPo"><i class="fa-solid fa-plus"></i> New purchase order</button><button class="btn btn-sm mps-btn-primary" id="mpsCreatePos"><i class="fa-solid fa-wand-magic-sparkles"></i> Create from reorder list</button><button class="btn btn-sm mps-btn-outline" id="mpsAddSupplier">Add supplier</button><button class="btn btn-sm mps-btn-outline" id="mpsExportPOs">Export purchase orders</button></div>' : ''}</div>
            <div class="mps-table-wrap wp-list-table-wrapper"><table class="mps-table mps-po-list-table wp-list-table widefat fixed striped posts"><thead><tr><th>PO number</th><th>Supplier</th><th>Route</th><th>Status</th><th>ETA</th><th>Lines</th><th>Value (currency)</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="8" class="mps-empty">No purchase orders yet.</td></tr>'}</tbody></table></div>
            <h2 class="mps-suppliers-title">Suppliers</h2><div class="mps-supplier-list">${this.suppliers.map(s=>`<div><b>${esc(s.name)}${Number(s.active) ? '' : ' (inactive)'}</b><span>${esc(s.lead_time_days??'—')} lead days · ${Number(s.products||0)} products</span>${this.isWriter ? `<span class="mps-supplier-actions"><button type="button" class="btn btn-ghost btn-sm" data-edit-supplier="${Number(s.id)}">Edit</button><button type="button" class="btn btn-ghost btn-sm" data-delete-supplier="${Number(s.id)}">Delete</button></span>` : ''}</div>`).join('')||'<p>No suppliers configured.</p>'}</div>`;
        if (this.ordersTrashView && !orders.data?.length) panel.querySelector('.mps-empty')?.replaceChildren('Trash is empty.');
        const poActions = this.ordersTrashView ? null : panel.querySelector('.mps-orders-head .mps-actions');
        panel.querySelector('.mps-orders-head')?.remove();
        const poToolbar = document.createElement('div');
        poToolbar.className = 'mps-toolbar';
        if (poActions) {
            poActions.insertAdjacentHTML('beforeend', '<button class="btn btn-sm mps-btn-outline" id="mpsImportPO">Import purchase order</button>');
            poToolbar.append(poActions);
        }
        const trashToggle = document.createElement('button');
        trashToggle.id = 'mpsTogglePoTrash';
        trashToggle.className = 'btn btn-sm btn-secondary';
        trashToggle.textContent = this.ordersTrashView ? 'Back to active orders' : `View trash (${Number(trashSummary.total || 0).toLocaleString()})`;
        const orderSearch = retainedSearch || document.createElement('input');
        orderSearch.type = 'search';
        orderSearch.id = 'mpsOrderSearch';
        orderSearch.placeholder = 'Search PO number or supplier';
        orderSearch.setAttribute('aria-label', 'Search purchase orders');
        orderSearch.value = this.ordersSearch;
        if (!retainedSearch) orderSearch.addEventListener('input', () => {
            this.ordersSearch = orderSearch.value.trim();
            clearTimeout(this.ordersSearchTimer);
            this.ordersSearchTimer = setTimeout(() => {
                this.ordersPage = 1;
                this.loadOrders();
            }, FILTER_DEBOUNCE_MS);
        });
        poToolbar.append(orderSearch);
        poToolbar.append(trashToggle);
        panel.querySelector('.mps-table-wrap')?.before(poToolbar);
        const poTable = panel.querySelector('.mps-table-wrap .mps-table');
        this.decorateSortableTable(poTable, ['reference','supplier','freight_mode','status','eta','line_count','value',null], 'orders', this.ordersSortBy, this.ordersSortOrder);
        if (poTable?.querySelector('thead th:last-child')) poTable.querySelector('thead th:last-child').textContent = 'Actions';
        const poPagination = this.ordersPaginationHtml(Number(orders.total || 0));
        if (poPagination) poTable?.closest('.mps-table-wrap')?.insertAdjacentHTML('afterend', poPagination);
        panel.querySelectorAll('th[data-mps-sort^="orders:"]').forEach(th => th.addEventListener('click', () => {
            const key = th.dataset.mpsSort.split(':')[1];
            this.ordersSortOrder = this.ordersSortBy === key && this.ordersSortOrder === 'ASC' ? 'DESC' : 'ASC';
            this.ordersSortBy = key;
            this.ordersPage = 1;
            this.loadOrders();
        }));
        panel.querySelectorAll('[data-orders-page]').forEach(button => button.addEventListener('click', () => {
            const page = Number(button.dataset.ordersPage);
            if (Number.isInteger(page) && page >= 1 && page !== this.ordersPage) { this.ordersPage = page; this.loadOrders(); }
        }));
        trashToggle.addEventListener('click', () => { this.ordersTrashView = !this.ordersTrashView; this.ordersPage = 1; this.loadOrders(); });
        document.getElementById('mpsCreatePos')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            this.openDialog({
                title: 'Create purchase orders from reorder list',
                confirmText: 'Create draft POs',
                busyText: 'Refreshing plan and creating...',
                body: `<p class="mps-modal-note">Products with a saved preferred route keep it. Choose the route to use for products without one.</p>
                    <label>Default route for unmarked products<select id="mpsReorderDefaultRoute"><option value="">Choose a route</option><option value="local">Local purchase</option><option value="sea">Imported by sea</option><option value="air">Imported by air</option></select></label>`,
                onConfirm: async dialog => {
                    const freight_mode = dialog.querySelector('#mpsReorderDefaultRoute').value;
                    if (!['local','sea','air'].includes(freight_mode)) { Toast.error('Choose a default purchase route.'); return false; }
                    button.disabled = true;
                    const result = await API.mpsCreatePurchaseOrders({freight_mode});
                    if (result.status !== 'success') {
                        Toast.error(result.message || 'No purchase orders were created.');
                        button.disabled = false;
                        return false;
                    }
                    if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                    Toast.success(`Created ${Number(result.purchase_orders?.length || 0)} draft purchase order(s) from the refreshed reorder list.`);
                    this.updateCalendarTabVisibility();
                    this.loadTab();
                    return true;
                }
            });
        });
        document.getElementById('mpsNewPo')?.addEventListener('click', () => this.openPurchaseOrderEditor());
        document.getElementById('mpsImportPO')?.addEventListener('click', () => this.openWorkbookImport('purchase_order'));
        document.getElementById('mpsAddSupplier')?.addEventListener('click', () => this.addSupplier());
        panel.querySelectorAll('[data-edit-supplier]').forEach(button => button.addEventListener('click', () => {
            this.addSupplier(this.suppliers.find(supplier => String(supplier.id) === button.dataset.editSupplier));
        }));
        panel.querySelectorAll('[data-delete-supplier]').forEach(button => button.addEventListener('click', () => {
            const supplier = this.suppliers.find(item => String(item.id) === button.dataset.deleteSupplier);
            if (supplier) this.deleteSupplier(supplier);
        }));
        document.getElementById('mpsExportPOs')?.addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            const result = await API.mpsExportPurchaseOrders();
            event.currentTarget.disabled = false;
            if (result.status === 'success') Toast.success('Purchase order CSV exported.'); else Toast.error(result.message || 'Purchase order export failed.');
        });
        panel.querySelectorAll('[data-po-action]').forEach(button => button.addEventListener('click', () => this.handleOrderAction(button.dataset.id, button.dataset.poAction)));
        if (restoreSearchFocus) {
            orderSearch.focus({preventScroll: true});
            if (searchSelection && searchSelection[0] !== null) orderSearch.setSelectionRange(...searchSelection);
        }
        this.addContextualHelp('orders');
    },

    orderButtons(po) {
        if (this.ordersTrashView) return `<button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="download">Download</button><button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="restore">Restore</button><button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="permanent-delete">Delete permanently</button>`;
        const canChange = ['draft','ordered','shipped'].includes(po.status);
        const next = po.status === 'draft' ? 'ordered' : po.status === 'ordered' ? 'shipped' : 'receive';
        const edit = canChange ? `<button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="edit">View / Edit</button>` : '';
        const progress = canChange ? `<button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="${next}">${next === 'receive' ? 'Receive' : `Mark ${next}`}</button>` : '';
        const trash = po.status !== 'received' && Number(po.qty_received || 0) === 0
            ? `<button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="delete">Trash</button>` : '';
        return `<button class="btn btn-ghost btn-sm" data-id="${Number(po.id)}" data-po-action="download">Download</button>${edit}${progress}${trash}`;
    },

    async openPurchaseOrderEditor(id = null) {
        const suppliersResult = await API.mpsGetSuppliers();
        const suppliers = suppliersResult.data || [];
        let detail = null;
        if (id) {
            detail = await API.mpsGetPurchaseOrder(id);
            if (detail.status !== 'success') return Toast.error(detail.message || 'Could not load purchase order.');
        }
        const po = detail?.purchase_order || {};
        const lines = detail?.lines || [];
        const supplierOptions = suppliers.map(s => `<option value="${Number(s.id)}" ${String(s.id) === String(po.supplier_id || '') ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
        const lineRows = (lines.length ? lines : [{}]).map(line => {
            const unitCost = line.unit_cost == null || line.unit_cost === '' ? null : Number(line.unit_cost);
            const totalPrice = unitCost == null ? '�' : (Number(line.qty_ordered || 0) * unitCost).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            return `<tr><td><input data-po-sku value="${esc(line.sku || '')}" placeholder="SKU" ${Number(line.qty_received || 0) > 0 ? 'readonly' : ''} required></td><td data-po-product>${esc(line.name || '-')}</td><td><input data-po-qty type="number" min="${Number(line.qty_received || 0) || 1}" step="1" value="${esc(line.qty_ordered || '')}" placeholder="Qty" required></td><td><input data-po-cost type="number" min="0" step="0.01" value="${esc(line.unit_cost ?? '')}" placeholder="Unit price"></td><td data-po-total>${totalPrice}</td><td>${Number(line.qty_received || 0) ? `${Number(line.qty_received)} received` : '<button type="button" class="btn btn-ghost btn-sm" data-po-remove>Remove</button>'}</td></tr>`;
        }).join('');
        const overlay = this.openDialog({
            title: id ? `Edit purchase order ${esc(po.reference)}` : 'New purchase order',
            confirmText: id ? 'Save purchase order' : 'Create purchase order',
            busyText: 'Saving purchase order…',
            body: `<div class="mps-settings-grid"><label>PO number<input id="mpsPoReference" maxlength="50" value="${esc(po.reference || '')}" placeholder="Auto-generated from route"></label>
                <label>Supplier<select id="mpsPoSupplier"><option value="">Unassigned</option>${supplierOptions}</select></label>
                <label>Purchase route<select id="mpsPoFreight">${['local','sea','air'].map(v => `<option value="${v}" ${(po.freight_mode || 'air') === v ? 'selected' : ''}>${v === 'local' ? 'Local' : v === 'sea' ? 'Imported · Sea' : 'Imported · Air'}</option>`).join('')}</select></label>
                <label>ETA<input id="mpsPoEta" type="date" value="${esc(po.eta_date || '')}"></label><label>Currency<select id="mpsPoCurrency"><option value="RWF" ${(po.currency || 'RWF') === 'RWF' ? 'selected' : ''}>RWF</option><option value="USD" ${po.currency === 'USD' ? 'selected' : ''}>USD</option></select></label></div>
                <button type="button" class="btn btn-sm mps-btn-outline" id="mpsPoAddLine">Add line</button>
                <div class="mps-table-wrap mps-po-lines-wrap"><table class="mps-table mps-po-lines-table"><thead><tr><th>SKU</th><th>Product name</th><th data-po-line-sort="qty" role="button" tabindex="0" aria-sort="none">Qty</th><th data-po-line-sort="unit" role="button" tabindex="0" aria-sort="none" id="mpsPoCostHeading">U.P ${esc(po.currency || 'RWF')}</th><th data-po-line-sort="total" role="button" tabindex="0" aria-sort="none" id="mpsPoTotalHeading">T. Price ${esc(po.currency || 'RWF')}</th><th></th></tr></thead><tbody id="mpsPoLineRows">${lineRows}</tbody></table></div><p id="mpsPoCurrencyStatus" class="mps-modal-note" role="status" aria-live="polite"></p>
                <label>Notes<textarea id="mpsPoNote" rows="2">${esc(po.note || '')}</textarea></label>`,
            onConfirm: async overlay => {
                const parsed = [...overlay.querySelectorAll('#mpsPoLineRows tr')].map(row => {
                    const costText = row.querySelector('[data-po-cost]').value.trim();
                    return {sku: row.querySelector('[data-po-sku]').value.trim(), qty_ordered: Number(row.querySelector('[data-po-qty]').value), unit_cost: costText === '' ? null : Number(costText)};
                });
                if (!parsed.length || parsed.some(l => !l.sku || !Number.isInteger(l.qty_ordered) || l.qty_ordered <= 0 || (l.unit_cost != null && (!Number.isFinite(l.unit_cost) || l.unit_cost < 0)))) {
                    Toast.error('Enter each line as SKU, positive whole quantity, and optional non-negative unit cost.'); return false;
                }
                const payload = {reference: overlay.querySelector('#mpsPoReference').value.trim(),
                    supplier_id: overlay.querySelector('#mpsPoSupplier').value || null,
                    freight_mode: overlay.querySelector('#mpsPoFreight').value,
                    currency: overlay.querySelector('#mpsPoCurrency').value,
                    eta_date: overlay.querySelector('#mpsPoEta').value || null,
                    note: overlay.querySelector('#mpsPoNote').value.trim(), lines: parsed};
                if (id) payload.id = Number(id); else payload.status = 'draft';
                const result = await API.mpsSavePurchaseOrder(payload);
                if (result.status !== 'success') {
                    const unmatched = result.unmatched?.length ? ` Unmatched: ${result.unmatched.join(', ')}` : '';
                    Toast.error((result.message || 'Purchase order could not be saved.') + unmatched); return false;
                }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success(id ? 'Purchase order updated.' : 'Purchase order created as draft.');
                this.updateCalendarTabVisibility();
                this.loadOrders();
                return true;
            }
        });
        overlay.querySelector('.mps-dialog')?.classList.add('mps-po-editor-dialog');
        const editorForm = overlay.querySelector('.mps-dialog-form');
        const editorActions = editorForm.querySelector('.mps-dialog-actions');
        const editorScrollBody = document.createElement('div');
        editorScrollBody.className = 'mps-po-scroll-body';
        while (editorForm.firstChild !== editorActions) editorScrollBody.append(editorForm.firstChild);
        editorForm.insertBefore(editorScrollBody, editorActions);
        const lineBody = overlay.querySelector('#mpsPoLineRows');
        const currencySelect = overlay.querySelector('#mpsPoCurrency');
        const saveButton = overlay.querySelector('button[type="submit"]');
        const currencyStatus = overlay.querySelector('#mpsPoCurrencyStatus');
        const updatePoRowTotal = row => {
            const qty = Number(row.querySelector('[data-po-qty]')?.value || 0);
            const costText = row.querySelector('[data-po-cost]')?.value.trim() ?? '';
            const totalCell = row.querySelector('[data-po-total]');
            const total = costText === '' ? null : qty * Number(costText);
            totalCell.textContent = total == null || !Number.isFinite(total)
                ? '-' : total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            return total;
        };
        let lineSortKey = null;
        let lineSortDirection = 1;
        const sortPoLines = () => {
            if (!lineSortKey) return;
            const valueFor = row => {
                const qty = Number(row.querySelector('[data-po-qty]')?.value || 0);
                const costText = row.querySelector('[data-po-cost]')?.value.trim() ?? '';
                const unit = costText === '' ? Number.NEGATIVE_INFINITY : Number(costText);
                return lineSortKey === 'qty' ? qty : lineSortKey === 'unit' ? unit : costText === '' ? Number.NEGATIVE_INFINITY : qty * unit;
            };
            [...lineBody.querySelectorAll('tr')]
                .sort((a, b) => (valueFor(a) - valueFor(b)) * lineSortDirection || String(a.querySelector('[data-po-sku]')?.value || '').localeCompare(String(b.querySelector('[data-po-sku]')?.value || '')))
                .forEach(row => lineBody.appendChild(row));
        };
        overlay.querySelectorAll('[data-po-line-sort]').forEach(heading => {
            const sort = () => {
                const key = heading.dataset.poLineSort;
                lineSortDirection = lineSortKey === key ? -lineSortDirection : 1;
                lineSortKey = key;
                overlay.querySelectorAll('[data-po-line-sort]').forEach(item => item.setAttribute('aria-sort', item === heading ? (lineSortDirection === 1 ? 'ascending' : 'descending') : 'none'));
                sortPoLines();
            };
            heading.addEventListener('click', sort);
            heading.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sort(); }
            });
        });
        lineBody.querySelectorAll('tr').forEach(updatePoRowTotal);
        let currencyUpdateToken = 0;
        const applyCatalogCost = row => {
            const costInput = row.querySelector('[data-po-cost]');
            if (!costInput || row.dataset.poCostAuto !== '1') return false;
            const selectedCost = currencySelect.value === 'USD' ? row.dataset.costUsd : row.dataset.costRwf;
            if (selectedCost === '' || selectedCost == null || !Number.isFinite(Number(selectedCost))) return false;
            costInput.value = selectedCost;
            updatePoRowTotal(row);
            row.dataset.poCostCurrency = currencySelect.value;
            row.dataset.currencyPending = '0';
            row.classList.remove('mps-po-currency-attention');
            row.style.outline = '';
            return true;
        };
        const updateCurrencyStatus = (message = '') => {
            const pendingRows = [...lineBody.querySelectorAll('tr')].filter(row => row.dataset.currencyPending === '1');
            saveButton.disabled = pendingRows.length > 0;
            currencyStatus.textContent = message || (pendingRows.length
                ? `Update or enter a unit cost for: ${pendingRows.map(row => row.querySelector('[data-po-sku]')?.value.trim() || 'SKU required').join(', ')}.`
                : '');
        };
        currencySelect?.addEventListener('change', async event => {
            const currency = event.target.value;
            const token = ++currencyUpdateToken;
            overlay.querySelector('#mpsPoCostHeading').textContent = 'U.P ' + currency;
            overlay.querySelector('#mpsPoTotalHeading').textContent = 'T. Price ' + currency;
            const rows = [...lineBody.querySelectorAll('tr')];
            const needsLookup = [];
            for (const row of rows) {
                if (row.dataset.poCostAuto === '1' && applyCatalogCost(row)) continue;
                const sku = row.querySelector('[data-po-sku]')?.value.trim();
                row.dataset.currencyPending = '1';
                row.classList.add('mps-po-currency-attention');
                row.style.outline = '2px solid #b45309';
                if (row.dataset.poCostAuto === '0') continue;
                if (!sku) continue;
                needsLookup.push({row, sku});
            }
            updateCurrencyStatus(needsLookup.length
                ? `Updating ${needsLookup.length} product price${needsLookup.length === 1 ? '' : 's'} to ${currency}�`
                : 'Review the highlighted costs and enter the new currency amounts.');
            await Promise.all(needsLookup.map(async ({row, sku}) => {
                let result;
                try { result = await API.mpsGetPricingCatalog({search: sku, page: 1, per_page: 20}); }
                catch (_) { result = null; }
                if (token !== currencyUpdateToken || currencySelect.value !== currency) return;
                const product = (result?.data || []).find(item => String(item.sku || '').trim().toLowerCase() === sku.toLowerCase());
                if (!product) return;
                row.dataset.costRwf = product.cost_price == null ? '' : String(product.cost_price);
                row.dataset.costUsd = product.cost_usd == null ? '' : String(product.cost_usd);
                row.dataset.poCostAuto = '1';
                if (!applyCatalogCost(row)) {
                    row.dataset.currencyPending = '1';
                    row.classList.add('mps-po-currency-attention');
                    row.style.outline = '2px solid #b45309';
                }
            }));
            if (token === currencyUpdateToken) updateCurrencyStatus();
        });
        const bindPoCostInput = input => input.addEventListener('input', () => {
            const row = input.closest('tr');
            updatePoRowTotal(row);
            sortPoLines();
            row.dataset.poCostAuto = '0';
            if (row.dataset.currencyPending === '1' && input.value.trim() !== '' && Number.isFinite(Number(input.value)) && Number(input.value) >= 0) {
                row.dataset.currencyPending = '0';
                row.dataset.poCostCurrency = currencySelect.value;
                row.classList.remove('mps-po-currency-attention');
                row.style.outline = '';
                updateCurrencyStatus();
            }
        });
        lineBody.querySelectorAll('[data-po-cost]').forEach(bindPoCostInput);
        const bindPoQtyInput = input => input.addEventListener('input', () => {
            updatePoRowTotal(input.closest('tr'));
            sortPoLines();
        });
        lineBody.querySelectorAll('[data-po-qty]').forEach(bindPoQtyInput);
        const bindPoSkuLookup = input => input.addEventListener('change', async () => {
            const sku = input.value.trim();
            const row = input.closest('tr');
            const nameCell = row?.querySelector('[data-po-product]');
            if (!nameCell) return;
            if (!sku) { nameCell.textContent = '�'; return; }
            nameCell.textContent = 'Looking up�';
            const result = await API.mpsGetPricingCatalog({search: sku, page: 1, per_page: 20});
            if (input.value.trim() !== sku) return;
            if (result.status !== 'success') { nameCell.textContent = 'Lookup failed'; return; }
            const match = (result.data || []).find(product => String(product.sku || '').trim().toLowerCase() === sku.toLowerCase());
            nameCell.textContent = match?.name || 'Product not found';
            if (!match) return;
            row.dataset.costRwf = match.cost_price == null ? '' : String(match.cost_price);
            row.dataset.costUsd = match.cost_usd == null ? '' : String(match.cost_usd);
            const costInput = row.querySelector('[data-po-cost]');
            if (row.dataset.currencyPending === '1' || !costInput.value || row.dataset.poCostAuto === '1') {
                row.dataset.poCostAuto = '1';
                applyCatalogCost(row);
            }
        });
        lineBody.querySelectorAll('[data-po-sku]').forEach(bindPoSkuLookup);
        overlay.querySelector('#mpsPoAddLine')?.addEventListener('click', () => {
            lineBody.insertAdjacentHTML('beforeend', '<tr><td><input data-po-sku placeholder="SKU" required></td><td data-po-product>-</td><td><input data-po-qty type="number" min="1" step="1" placeholder="Qty" required></td><td><input data-po-cost type="number" min="0" step="0.01" placeholder="Unit price"></td><td data-po-total>-</td><td><button type="button" class="btn btn-ghost btn-sm" data-po-remove>Remove</button></td></tr>');
            bindPoCostInput(lineBody.lastElementChild.querySelector('[data-po-cost]'));
            bindPoQtyInput(lineBody.lastElementChild.querySelector('[data-po-qty]'));
            updatePoRowTotal(lineBody.lastElementChild);
            bindPoSkuLookup(lineBody.lastElementChild.querySelector('[data-po-sku]'));
        });
        overlay.addEventListener('click', event => {
            if (event.target.closest('[data-po-remove]')) {
                event.target.closest('tr')?.remove();
                updateCurrencyStatus();
                sortPoLines();
            }
        });
    },

    async handleOrderAction(id, action) {
        if (action === 'edit') return this.openPurchaseOrderEditor(id);
        if (action === 'download') {
            const detail = await API.mpsGetPurchaseOrder(id);
            if (detail.status !== 'success') return Toast.error(detail.message || 'Could not load purchase order.');
            const reference = String(detail.purchase_order?.reference || id).replace(/[^a-z0-9_-]/gi, '-');
            const result = await API.mpsExportPurchaseOrder(id, `Purchase_Order_${reference}.csv`);
            if (result.status === 'success') Toast.success(`Purchase order ${reference} downloaded.`);
            else Toast.error(result.message || 'Purchase order download failed.');
            return;
        }
        if (action === 'restore') {
            const restored = await API.mpsRestorePurchaseOrder(id);
            if (restored.status !== 'success') return Toast.error(restored.message || 'Purchase order could not be restored.');
            if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
            Toast.success('Purchase order restored from trash. Run the planner to refresh incoming quantities.');
            this.updateCalendarTabVisibility();
            this.loadOrders();
            return;
        }
        if (action === 'permanent-delete') {
            return this.confirmDialog({
                title: 'Delete purchase order permanently',
                message: 'This permanently deletes the trashed purchase order and its lines. This cannot be undone.',
                confirmText: 'Delete permanently',
                busyText: 'Deleting purchase order...',
                onConfirm: async () => {
                    const deleted = await API.mpsPermanentlyDeletePurchaseOrder(id);
                    if (deleted.status !== 'success') { Toast.error(deleted.message || 'Purchase order could not be deleted.'); return false; }
                    if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                    Toast.success('Purchase order permanently deleted.');
                    this.loadOrders();
                    return true;
                }
            });
        }
        if (action === 'delete') {
            return this.confirmDialog({
                title: 'Trash purchase order',
                message: 'Move this unreceived purchase order to the trash? It will be hidden from active orders and excluded from incoming stock until restored.',
                confirmText: 'Trash purchase order',
                busyText: 'Moving purchase order to trash...',
                onConfirm: async () => {
                    const deleted = await API.mpsDeletePurchaseOrder(id);
                    if (deleted.status !== 'success') { Toast.error(deleted.message || 'Purchase order could not be deleted.'); return false; }
                    if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                    Toast.success('Purchase order trashed.');
                    this.updateCalendarTabVisibility();
                    this.loadOrders();
                    return true;
                }
            });
        }
        if (action === 'receive') {
            const [detail, locations] = await Promise.all([API.mpsGetPurchaseOrder(id), API.getLocations()]);
            if (detail.status !== 'success') return Toast.error(detail.message || 'Could not load purchase order lines.');
            if (locations.status !== 'success' || !locations.data?.length) return Toast.error('No active receiving locations are available.');
            const defaultLocation = detail.status === 'success' ? detail.purchase_order.receive_location_id : '';
            const reference = detail.status === 'success' ? (detail.purchase_order.reference || `#${id}`) : `#${id}`;
            const options = locations.data.map(location => `<option value="${Number(location.id)}" ${String(location.id) === String(defaultLocation || locations.data[0].id) ? 'selected' : ''}>${esc(location.name)}${location.code ? ` (${esc(location.code)})` : ''}</option>`).join('');
            this.openDialog({
                title: 'Receive purchase order',
                confirmText: 'Receive',
                busyText: 'Receiving...',
                body: `<p class="mps-modal-note">Purchase order <strong>${esc(reference)}</strong></p>
                    <label>Receiving location<select id="mpsReceiveLocation">${options}</select></label>
                    <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU / product</th><th>Outstanding</th><th>Receive now</th></tr></thead><tbody>${(detail.lines || []).map(line => `<tr><td>${esc(line.sku)} · ${esc(line.name)}</td><td>${Number(line.outstanding || 0).toLocaleString()}</td><td><input type="number" min="0" max="${Math.max(0, Number(line.outstanding || 0))}" value="${Math.max(0, Number(line.outstanding || 0))}" data-receive-line="${Number(line.id)}"></td></tr>`).join('')}</tbody></table></div>
                    <p class="mps-modal-note">Enter actual quantities received. Partial receipts remain open on the purchase order.</p>`,
                onConfirm: async overlay => {
                    const locationId = Number(overlay.querySelector('#mpsReceiveLocation').value);
                    if (!locations.data.some(location => Number(location.id) === locationId)) {
                        Toast.error('Choose a valid receiving location.');
                        return false;
                    }
                    const received = {};
                    let totalReceived = 0;
                    for (const input of overlay.querySelectorAll('[data-receive-line]')) {
                        const qty = Number(input.value || 0), outstanding = Number(input.max || 0);
                        if (!Number.isInteger(qty) || qty < 0 || qty > outstanding) { Toast.error('Received quantity must be a whole number up to the outstanding quantity.'); return false; }
                        if (qty > 0) { received[input.dataset.receiveLine] = qty; totalReceived += qty; }
                    }
                    if (!totalReceived) { Toast.error('Enter at least one quantity received.'); return false; }
                    const result = await API.mpsReceivePurchaseOrder(id, received, locationId);
                    if (result.status !== 'success') { Toast.error(result.message || 'Purchase order receiving failed.'); return false; }
                    if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                    Toast.success('Purchase order received.');
                    this.loadTab();
                    return true;
                }
            });
            return;
        }

        const result = await API.mpsSetPurchaseOrderStatus(id, action);
        if (result.status === 'success') {
            if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
            Toast.success(`Purchase order marked ${action}.`);
            this.loadTab();
        } else {
            Toast.error(result.message || 'Purchase order update failed.');
        }
    }
};
