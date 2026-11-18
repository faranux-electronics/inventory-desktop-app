const { API, Toast, esc, isoDate, today, daysAgo, statusLabel, num, qty, monthLabel, shortNum, CHART_COLORS, STATUS_COLORS, STATUS_ORDER, FILTER_DEBOUNCE_MS, donutChart, legendHtml, hBars, columnChart } = require('../helpers.js');
const Button = require('../../../components/Button.js');
const Input = require('../../../components/Input.js');
const Select = require('../../../components/Select.js');
const FilterBar = require('../../../components/FilterBar.js');
const Table = require('../../../components/Table.js');
const Pagination = require('../../../components/Pagination.js');
const Card = require('../../../components/Card.js');

module.exports = {
    addSupplier(supplier = null) {
        const editing = Boolean(supplier?.id);
        this.openDialog({
            title: editing ? 'Edit supplier' : 'Add supplier',
            confirmText: editing ? 'Save supplier' : 'Add supplier',
            busyText: 'Saving supplier...',
            body: `<div class="mps-form-grid">
                <label>Supplier name${Input.html({id: 'mpsSupplierName', type: 'text', maxLength: 150, autocomplete: 'off', value: supplier?.name || '', required: true})}</label>
                <label>Lead time (days)${Input.html({id: 'mpsSupplierLead', type: 'number', min: 0, value: supplier?.lead_time_days ?? '', placeholder: 'Optional'})}</label>
                <label>Minimum order value${Input.html({id: 'mpsSupplierMinOrder', type: 'number', min: 0, step: '0.01', value: supplier?.min_order_value ?? '', placeholder: 'Optional'})}</label>
                <label>Currency${Input.html({id: 'mpsSupplierCurrency', type: 'text', maxLength: 3, value: supplier?.currency || 'USD', placeholder: 'USD'})}</label>
                <label>Contact${Input.html({id: 'mpsSupplierContact', type: 'text', maxLength: 255, value: supplier?.contact || '', placeholder: 'Optional'})}</label>
                <label>Note${Input.html({id: 'mpsSupplierNote', type: 'text', value: supplier?.note || '', placeholder: 'Optional'})}</label>
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
        const [orders, suppliers, trashSummary, draftPriorityOrders] = await Promise.all([
            API.mpsGetPurchaseOrders({page:this.ordersPage,per_page:this.ordersPerPage || 25,search:this.ordersSearch,sort_by:this.ordersSortBy,sort_order:this.ordersSortOrder,trashed:this.ordersTrashView ? 1 : 0}),
            API.mpsGetSuppliers(),
            API.mpsGetPurchaseOrders({page:1,per_page:1,trashed:1}),
            !this.ordersTrashView && this.isWriter ? API.mpsGetPurchaseOrders({status:'draft',page:1,per_page:1000,sort_by:'priority',sort_order:'ASC'}) : Promise.resolve({status:'success',data:[]})
        ]);
        if (token !== this.ordersRequestToken || !document.getElementById('mpsPanel')) return;
        if (orders.status !== 'success') { panel.innerHTML = `<div class="mps-empty">${esc(orders.message || 'Could not load purchase orders.')}</div>`; return; }
        const ordersPages = Math.max(1, Math.ceil(Number(orders.total || 0) / (this.ordersPerPage || 25)));
        if (Number(orders.total || 0) > 0 && this.ordersPage > ordersPages) { this.ordersPage = ordersPages; return this.loadOrders(); }
        this.orders = orders;
        this.suppliers = suppliers.data || [];
        this.suppliersList = this.suppliers;
        const rows = (orders.data||[]).map(po => `<tr data-po-row="${Number(po.id)}"><td class="mps-po-reference-cell">${Button.html({text: po.reference, variant: 'ghost', size: 'sm', className: 'mps-po-reference-link', dataAttributes: {'data-id': Number(po.id), 'data-po-action': 'detail'}, ariaLabel: `Open ${po.reference}`})}</td><td class="mps-po-supplier-cell">${esc(po.supplier_name||'—')}</td><td>${esc(statusLabel(po.freight_mode))}</td><td class="mps-po-status-cell"><span class="mps-status mps-status-${esc(po.status)}">${esc(statusLabel(po.status))}</span></td><td class="mps-po-date">${esc(po.eta_date||'—')}</td><td class="mps-num">${esc(po.line_count)}</td><td class="mps-num mps-po-value">${Number(po.value || 0).toLocaleString()} ${esc(po.currency || 'RWF')}</td><td class="mps-po-actions-cell">${this.orderButtons(po)}</td></tr>`).join('');
        const poTips = {
            'PO number': 'Purchase order reference (click to open details)',
            'Supplier': 'Assigned supplier',
            'Route': 'Purchase route',
            'Status': 'Purchase order status',
            'ETA': 'Expected arrival date',
            'Lines': 'Number of PO lines',
            'Value': 'PO value in the listed currency'
        };
        const poHeaders = [
            {label: 'PO number', className: 'mps-has-tooltip mps-col-reference', title: poTips['PO number'], dataAttributes: {'data-tooltip': poTips['PO number']}},
            {label: 'Supplier', className: 'mps-has-tooltip mps-col-supplier', title: poTips.Supplier, dataAttributes: {'data-tooltip': poTips.Supplier}},
            {label: 'Route', className: 'mps-has-tooltip mps-col-route', title: poTips.Route, dataAttributes: {'data-tooltip': poTips.Route}},
            {label: 'Status', className: 'mps-has-tooltip mps-col-status', title: poTips.Status, dataAttributes: {'data-tooltip': poTips.Status}},
            {label: 'ETA', className: 'mps-has-tooltip mps-col-eta', title: poTips.ETA, dataAttributes: {'data-tooltip': poTips.ETA}},
            {label: 'Lines', className: 'mps-num mps-has-tooltip mps-col-lines', title: poTips.Lines, dataAttributes: {'data-tooltip': poTips.Lines}},
            {label: 'Value', className: 'mps-num mps-has-tooltip mps-col-value', title: poTips.Value, dataAttributes: {'data-tooltip': poTips.Value}},
            {label: 'Actions', className: 'mps-col-actions'}
        ];
        const orderActions = this.isWriter ? `<div class="mps-po-actions">${Button.html({id: 'mpsNewPo', text: 'New purchase order', icon: 'fa-solid fa-plus', variant: 'primary', size: 'md'})}${Button.html({id: 'mpsCreatePos', text: 'Create from reorder list', icon: 'fa-solid fa-wand-magic-sparkles', variant: 'outline', size: 'md'})}${Button.html({id: 'mpsAddSupplier', text: 'Add supplier', variant: 'outline', size: 'md'})}${Button.html({id: 'mpsImportPO', text: 'Import purchase order', variant: 'outline', size: 'md'})}${Button.html({id: 'mpsExportPOs', text: 'Export purchase orders', variant: 'outline', size: 'md'})}</div>` : '';
        const poRows = rows || '<tr><td colspan="8" class="mps-empty">No purchase orders yet.</td></tr>';
        panel.innerHTML = `<div class="mps-results-head"><div><h2>Purchase orders</h2><p>Open purchase orders feed incoming quantities into future planner runs.</p></div></div>
            ${!this.ordersTrashView && this.isWriter ? this.draftPriorityHtml(draftPriorityOrders.data || []) : ''}
            ${Table.html({wrapperClass: 'mps-table-wrap wp-list-table-wrapper mps-po-orders-wrap', className: 'mps-table mps-po-list-table wp-list-table widefat fixed striped posts', ariaLabel: 'Purchase orders', headers: poHeaders, body: poRows})}
            <footer id="mpsOrdersPagination" aria-live="polite"></footer>
            ${this.suppliersHtml()}`;
        if (this.ordersTrashView && !orders.data?.length) panel.querySelector('.mps-empty')?.replaceChildren('Trash is empty.');
        const poToolbar = FilterBar.create({className: 'mps-toolbar mps-po-toolbar', ariaLabel: 'Purchase order filters'});
        if (orderActions) poToolbar.insertAdjacentHTML('beforeend', orderActions);
        const trashToggle = Button.create({id: 'mpsTogglePoTrash', text: this.ordersTrashView ? 'Back to active orders' : `View trash (${Number(trashSummary.total || 0).toLocaleString()})`, variant: 'outline', size: 'md'});
        const orderSearch = retainedSearch || Input.create({type: 'search', id: 'mpsOrderSearch', placeholder: 'Search PO number or supplier', ariaLabel: 'Search purchase orders'});
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
        panel.querySelector('.mps-po-orders-wrap')?.before(poToolbar);
        const poTable = panel.querySelector('.mps-po-orders-wrap .mps-table');
        this.decorateSortableTable(poTable, ['reference','supplier','freight_mode','status','eta','line_count','value',null], 'orders', this.ordersSortBy, this.ordersSortOrder);
        this.renderOrdersPagination(Number(orders.total || 0));
        this.attachDraftPriorityEvents(panel, draftPriorityOrders.data || []);
        panel.querySelectorAll('th[data-mps-sort^="orders:"]').forEach(th => th.addEventListener('click', () => {
            const key = th.dataset.mpsSort.split(':')[1];
            this.ordersSortOrder = this.ordersSortBy === key && this.ordersSortOrder === 'ASC' ? 'DESC' : 'ASC';
            this.ordersSortBy = key;
            this.ordersPage = 1;
            this.loadOrders();
        }));
        trashToggle.addEventListener('click', () => { this.ordersTrashView = !this.ordersTrashView; this.ordersPage = 1; this.loadOrders(); });
        document.getElementById('mpsCreatePos')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            this.openDialog({
                title: 'Create purchase orders from reorder list',
                confirmText: 'Create draft POs',
                busyText: 'Refreshing plan and creating...',
                body: `<p class="mps-modal-note">Products with a saved preferred route keep it. Choose the route to use for products without one.</p>
                    <label>Default route for unmarked products${Select.html({id: 'mpsReorderDefaultRoute', ariaLabel: 'Default route for unmarked products', options: [
                        {value: '', label: 'Choose a route'},
                        {value: 'local', label: 'Local purchase'},
                        {value: 'sea', label: 'Imported by sea'},
                        {value: 'air', label: 'Imported by air'}
                    ]})}</label>`,
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
        panel.querySelectorAll('[data-po-row]').forEach(row => row.addEventListener('click', event => {
            if (event.target.closest('button,a,input,select')) return;
            this.openPurchaseOrderDetail(Number(row.dataset.poRow));
        }));
        if (restoreSearchFocus) {
            orderSearch.focus({preventScroll: true});
            if (searchSelection && searchSelection[0] !== null) orderSearch.setSelectionRange(...searchSelection);
        }
    },

    renderOrdersPagination(total) {
        const container = document.getElementById('mpsOrdersPagination');
        if (!container) return;
        Pagination.render(container, {
            page: this.ordersPage, total: Number(total || 0), pageSize: this.ordersPerPage || 25,
            pageSizes: [25, 50, 100], pageSizeId: 'mpsOrdersPageSize', itemLabel: 'purchase orders',
            onPageChange: page => { this.ordersPage = page; this.loadOrders(); },
            onPageSizeChange: size => { this.ordersPerPage = size; this.ordersPage = 1; this.loadOrders(); }
        });
    },

    suppliersHtml() {
        const rows = (this.suppliers || []).map(supplier => `<tr>
            <td class="mps-po-reference-cell"><strong>${esc(supplier.name)}</strong>${Number(supplier.active) ? '' : ' <span class="mps-status mps-status-excluded">Inactive</span>'}</td>
            <td class="mps-num">${esc(supplier.lead_time_days ?? '—')}</td>
            <td class="mps-num">${num(Number(supplier.products || 0))}</td>
            <td class="mps-num">${num(Number(supplier.purchase_orders || 0))}</td>
            <td>${esc(supplier.contact || '—')}</td>
            <td>${esc(supplier.currency || 'USD')}</td>
            <td class="mps-po-actions-cell">${this.isWriter ? `<span class="mps-po-actions">${Button.html({text: 'Edit', variant: 'ghost', size: 'sm', className: 'mps-po-action', dataAttributes: {'data-edit-supplier': Number(supplier.id)}})}${Button.html({text: 'Delete', variant: 'ghost', size: 'sm', className: 'mps-po-action mps-po-action-danger', dataAttributes: {'data-delete-supplier': Number(supplier.id)}})}</span>` : ''}</td>
        </tr>`).join('');
        const headers = [
            {label: 'Supplier', className: 'mps-has-tooltip mps-col-supplier-name', title: 'Supplier name and active status', dataAttributes: {'data-tooltip': 'Supplier name and active status'}},
            {label: 'Lead days', className: 'mps-num mps-has-tooltip mps-col-lead', title: 'Average lead time in days', dataAttributes: {'data-tooltip': 'Average lead time in days'}},
            {label: 'Products', className: 'mps-num mps-has-tooltip mps-col-products', title: 'Linked products', dataAttributes: {'data-tooltip': 'Linked products'}},
            {label: 'POs', className: 'mps-num mps-has-tooltip mps-col-pos', title: 'Linked purchase orders', dataAttributes: {'data-tooltip': 'Linked purchase orders'}},
            {label: 'Contact', className: 'mps-has-tooltip mps-col-contact', title: 'Supplier contact', dataAttributes: {'data-tooltip': 'Supplier contact'}},
            {label: 'Currency', className: 'mps-has-tooltip mps-col-currency', title: 'Default currency', dataAttributes: {'data-tooltip': 'Default currency'}},
            {label: 'Actions', className: 'mps-col-actions'}
        ];
        return Card.html({tagName: 'section', className: 'mps-supplier-card', content: `<div class="mps-results-head"><div><h2>Suppliers</h2><p>Supplier lead times, linked products, and purchase orders.</p></div></div>${Table.html({wrapperClass: 'mps-table-wrap mps-supplier-wrap', className: 'mps-table mps-supplier-table', ariaLabel: 'Suppliers', headers, body: rows || '<tr><td colspan="7" class="mps-empty">No suppliers configured.</td></tr>'})}`});
    },

    draftPriorityHtml(drafts) {
        if (!drafts.length) return '';
        const body = drafts.map((po, index) => `<tr class="mps-po-priority-row" draggable="true" data-id="${Number(po.id)}">
            <td class="mps-num mps-po-priority-cell"><i class="fa-solid fa-grip-vertical mps-po-priority-grip" aria-hidden="true"></i><span class="mps-po-priority-badge${index === 0 ? ' is-first' : ''}">${index + 1}</span></td>
            <td class="mps-po-priority-reference"><strong>${esc(po.reference)}</strong></td><td>${esc(po.supplier_name || 'Unassigned supplier')}</td><td>${esc(statusLabel(po.freight_mode))}</td>
        </tr>`).join('');
        return Card.html({tagName: 'section', className: 'mps-draft-priority', content: `<div class="mps-draft-priority-head"><div><h3>Draft priority</h3><p>Drag drafts to reorder them. “Add to draft” uses the top draft first.</p></div>${Button.html({id: 'mpsSavePriorityOrder', text: 'Save Priority Order', icon: 'fa-solid fa-floppy-disk', variant: 'primary', size: 'sm', hidden: true})}</div>
            ${Table.html({wrapperClass: 'mps-table-wrap mps-po-priority-wrap', className: 'mps-table mps-po-priority-table', ariaLabel: 'Draft purchase order priority', headers: [
                {label: 'Priority', className: 'mps-num mps-col-priority'},
                {label: 'PO number', className: 'mps-col-reference'},
                {label: 'Supplier', className: 'mps-col-supplier'},
                {label: 'Route', className: 'mps-col-route'}
            ], body})}`});
    },

    attachDraftPriorityEvents(panel, drafts) {
        const tbody = panel.querySelector('.mps-po-priority-table tbody');
        const saveButton = panel.querySelector('#mpsSavePriorityOrder');
        if (!tbody || !saveButton) return;
        const initialOrder = drafts.map(po => String(po.id));
        let dragged = null;
        const rows = () => [...tbody.querySelectorAll('.mps-po-priority-row')];
        const updateBadges = () => {
            const current = rows().map((row, index) => {
                const badge = row.querySelector('.mps-po-priority-badge');
                badge.textContent = String(index + 1);
                badge.classList.toggle('is-first', index === 0);
                return row.dataset.id;
            });
            saveButton.classList.toggle('hidden', current.join(',') === initialOrder.join(','));
        };
        rows().forEach(row => {
            row.addEventListener('dragstart', event => {
                dragged = row;
                row.classList.add('is-dragging');
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); dragged = null; updateBadges(); });
            row.addEventListener('dragover', event => {
                event.preventDefault();
                if (!dragged || dragged === row) return;
                const bounds = row.getBoundingClientRect();
                if (event.clientY > bounds.top + bounds.height / 2) row.after(dragged);
                else row.before(dragged);
            });
        });
        saveButton.addEventListener('click', async () => {
            const ids = rows().map(row => Number(row.dataset.id));
            const oldMarkup = saveButton.innerHTML;
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving...';
            try {
                const result = await API.mpsSetPurchaseOrderPriority(ids);
                if (result.status !== 'success') throw new Error(result.message || 'Could not save draft priority.');
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success('Draft priority order saved.');
                this.loadOrders();
            } catch (error) {
                Toast.error(error.message || 'Could not save draft priority.');
                saveButton.disabled = false;
                saveButton.innerHTML = oldMarkup;
            }
        });
    },

    orderButtons(po) {
        const action = (actionName, text, className = '') => Button.html({
            text, variant: 'ghost', size: 'sm', className: `mps-po-action ${className}`.trim(),
            dataAttributes: {'data-id': Number(po.id), 'data-po-action': actionName}
        });
        if (this.ordersTrashView) {
            return action('download', 'Download') + (this.isWriter
                ? action('restore', 'Restore') + action('permanent-delete', 'Delete permanently', 'mps-po-action-danger')
                : '');
        }
        if (!this.isWriter) return action('detail', 'Details');
        const canChange = ['draft','ordered','shipped'].includes(po.status);
        const next = po.status === 'draft' ? 'ordered' : po.status === 'ordered' ? 'shipped' : 'receive';
        return action('download', 'Download')
            + (canChange ? action('edit', 'View / Edit') : '')
            + (canChange ? action(next, next === 'receive' ? 'Receive' : `Mark ${next}`) : '')
            + (po.status !== 'received' && Number(po.qty_received || 0) === 0 ? action('delete', 'Trash', 'mps-po-action-danger') : '');
    },

    async openPurchaseOrderEditor(id = null, initialLines = [], defaults = {}) {
        const suppliersResult = await API.mpsGetSuppliers();
        const suppliers = suppliersResult.data || [];
        let detail = null;
        if (id) {
            detail = await API.mpsGetPurchaseOrder(id);
            if (detail.status !== 'success') return Toast.error(detail.message || 'Could not load purchase order.');
        }
        const po = detail?.purchase_order || defaults;
        const lines = detail?.lines || initialLines;
        const parseWorksheet = value => {
            if (!value) return null;
            if (typeof value === 'object') return value;
            try { return JSON.parse(value); } catch (_) { return null; }
        };
        const excelColumn = index => {
            let n = Number(index) + 1, label = '';
            while (n > 0) { const remainder = (n - 1) % 26; label = String.fromCharCode(65 + remainder) + label; n = Math.floor((n - 1) / 26); }
            return label;
        };
        const costingData = parseWorksheet(po.costing_data);
        const supplierSelectOptions = [{value: '', label: 'Unassigned'}, ...suppliers.map(s => ({value: String(s.id), label: s.name}))];
        const lineRows = (lines.length ? lines : [{}]).map(line => {
            const unitCost = line.unit_cost == null || line.unit_cost === '' ? null : Number(line.unit_cost);
            const totalPrice = unitCost == null ? '-' : (Number(line.qty_ordered || 0) * unitCost).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            const worksheet = parseWorksheet(line.worksheet_data);
            const type = ({1: 'New', 2: 'Existing', 3: 'Not for sale'})[Number(worksheet?.product_type)] || '';
            const qa = worksheet?.qa || {};
            const workbookDetails = worksheet ? `<small class="mps-po-workbook-meta"><b>${esc(type)}</b> · Incoming ${esc(worksheet.in_qty ?? line.qty_ordered ?? '-')} × USD ${esc(worksheet.in_unit_cost_usd ?? '-')} = USD ${esc(worksheet.in_total_usd ?? '-')}<br>Current stock snapshot ${esc(worksheet.current_qty ?? 0)} × USD ${esc(worksheet.current_unit_cost_usd ?? '-')} = USD ${esc(worksheet.current_total_usd ?? '-')} · Total qty ${esc(worksheet.total_qty ?? '-')}<br>Landed unit USD ${esc(worksheet.landed_unit_cost_usd ?? '-')} / RWF ${esc(worksheet.landed_unit_cost_rwf ?? '-')} · Inventory cost RWF ${esc(worksheet.inventory_unit_cost_rwf ?? '-')}<br>NYEREKA ${esc(worksheet.nyereka_price_rwf ?? '-')} · Calculated RWF ${esc(worksheet.calculated_price_rwf ?? '-')} · Approved RWF ${esc(worksheet.approved_price_rwf ?? '-')}<br>VAT ${esc(worksheet.vat_rwf ?? '-')} · CIT ${esc(worksheet.cit_rwf ?? '-')} · Profit after tax ${esc(worksheet.profit_after_tax_rwf ?? '-')} · Margin ${worksheet.margin_percent == null ? '-' : `${esc(worksheet.margin_percent)}%`}<br>QA: ${esc(qa.status || 'Not tested')} · ${esc(qa.coverage || 'No coverage recorded')}${qa.comment ? ` · ${esc(qa.comment)}` : ''}${qa.next_step ? ` · Next: ${esc(qa.next_step)}` : ''}</small>` : '';
            return `<tr><td><input data-po-sku data-po-source-sku="${esc(line.sku || '')}" value="${esc(line.sku || '')}" placeholder="SKU" ${Number(line.qty_received || 0) > 0 ? 'readonly' : ''} required></td><td data-po-product>${esc(line.name || '-')}${workbookDetails}<input type="hidden" data-po-worksheet value="${esc(worksheet ? JSON.stringify(worksheet) : '')}"></td><td><input data-po-source-name maxlength="120" value="${esc(line.source_name || '')}" placeholder="AliExpress, Amazon…"></td><td><input data-po-source-reference maxlength="2048" value="${esc(line.source_reference || '')}" placeholder="Product URL or listing ID"></td><td><input data-po-qty type="number" min="${Number(line.qty_received || 0) || 1}" step="1" value="${esc(line.qty_ordered || '')}" placeholder="Qty" required></td><td><input data-po-cost type="number" min="0" step="0.01" value="${esc(line.unit_cost ?? '')}" placeholder="Unit price"></td><td data-po-total>${totalPrice}</td><td>${Number(line.qty_received || 0) ? `${Number(line.qty_received)} received` : '<button type="button" class="btn btn-ghost btn-sm" data-po-remove>Remove</button>'}</td></tr>`;
        }).join('');
        const costingSummary = costingData ? `<section class="mps-po-workbook-summary"><h3>Cost inventory workbook</h3><p>USD/RWF ${esc(costingData.exchange_rate_rwf_per_usd ?? '-')} · Cost ratio ${costingData.cost_ratio == null ? '-' : `${esc(((Number(costingData.cost_ratio) - 1) * 100).toFixed(2))}%`} · ${Number(costingData.expenses?.length || 0)} shipment cost categories retained.</p><details><summary>Show imported expense sheet values</summary>${(costingData.expenses || []).map(item => `<p><b>${esc(item.category)}</b>: ${esc(Object.entries(item.cells || {}).map(([column, value]) => `${excelColumn(column)}=${value}`).join(' · ') || 'No values')}</p>`).join('')}</details><p>Existing stock and prices in this workbook are retained as a dated snapshot. WooCommerce remains the current inventory and selling-price source.</p></section>` : '';
        const overlay = this.openDialog({
            title: id ? `Edit purchase order ${esc(po.reference)}` : 'New purchase order',
            confirmText: id ? 'Save purchase order' : 'Create purchase order',
            busyText: 'Saving purchase order…',
            body: `<div class="mps-settings-grid"><label>PO number${Input.html({id: 'mpsPoReference', type: 'text', maxLength: 50, value: po.reference || '', placeholder: 'Auto-generated from route'})}</label>
                <label>Supplier${Select.html({id: 'mpsPoSupplier', value: po.supplier_id || '', options: supplierSelectOptions, ariaLabel: 'Supplier'})}</label>
                <label>Purchase route${Select.html({id: 'mpsPoFreight', value: po.freight_mode || 'air', options: [
                    {value: 'local', label: 'Local'},
                    {value: 'sea', label: 'Imported · Sea'},
                    {value: 'air', label: 'Imported · Air'}
                ], ariaLabel: 'Purchase route'})}</label>
                <label>ETA${Input.html({id: 'mpsPoEta', type: 'date', value: po.eta_date || ''})}</label><label>Currency${Select.html({id: 'mpsPoCurrency', value: po.currency || 'RWF', options: [{value: 'RWF', label: 'RWF'}, {value: 'USD', label: 'USD'}], ariaLabel: 'Currency'})}</label>
                <label>Shipping carrier${Input.html({id: 'mpsPoCarrier', type: 'text', maxLength: 120, value: po.shipping_carrier || '', placeholder: 'Carrier or courier'})}</label><label>Tracking number${Input.html({id: 'mpsPoTracking', type: 'text', maxLength: 120, value: po.tracking_number || '', placeholder: 'Shipment tracking number'})}</label></div>
                ${costingSummary}<input type="hidden" id="mpsPoCostingData" value="${esc(costingData ? JSON.stringify(costingData) : '')}">
                <button type="button" class="btn btn-sm mps-btn-outline" id="mpsPoAddLine">Add line</button>
                <div class="mps-table-wrap mps-po-lines-wrap"><table class="mps-table mps-po-lines-table"><thead><tr><th>SKU</th><th>Product name</th><th>Source</th><th>Listing link / reference</th><th data-po-line-sort="qty" role="button" tabindex="0" aria-sort="none">Qty</th><th data-po-line-sort="unit" role="button" tabindex="0" aria-sort="none" id="mpsPoCostHeading">U.P ${esc(po.currency || 'RWF')}</th><th data-po-line-sort="total" role="button" tabindex="0" aria-sort="none" id="mpsPoTotalHeading">T. Price ${esc(po.currency || 'RWF')}</th><th></th></tr></thead><tbody id="mpsPoLineRows">${lineRows}</tbody></table></div><p id="mpsPoCurrencyStatus" class="mps-modal-note" role="status" aria-live="polite"></p>
                <label>Notes<textarea id="mpsPoNote" rows="2">${esc(po.note || '')}</textarea></label>`,
            onConfirm: async overlay => {
                const parsed = [...overlay.querySelectorAll('#mpsPoLineRows tr')].map(row => {
                    const costText = row.querySelector('[data-po-cost]').value.trim();
                    let worksheet_data = null;
                    try { worksheet_data = JSON.parse(row.querySelector('[data-po-worksheet]')?.value || 'null'); } catch (_) {}
                    return {sku: row.querySelector('[data-po-sku]').value.trim(), qty_ordered: Number(row.querySelector('[data-po-qty]').value), unit_cost: costText === '' ? null : Number(costText), worksheet_data, source_name: row.querySelector('[data-po-source-name]').value.trim(), source_reference: row.querySelector('[data-po-source-reference]').value.trim()};
                });
                if (!parsed.length || parsed.some(l => !l.sku || !Number.isInteger(l.qty_ordered) || l.qty_ordered <= 0 || (l.unit_cost != null && (!Number.isFinite(l.unit_cost) || l.unit_cost < 0)))) {
                    Toast.error('Enter each line as SKU, positive whole quantity, and optional non-negative unit cost.'); return false;
                }
                const payload = {reference: overlay.querySelector('#mpsPoReference').value.trim(),
                    supplier_id: overlay.querySelector('#mpsPoSupplier').value || null,
                    freight_mode: overlay.querySelector('#mpsPoFreight').value,
                    currency: overlay.querySelector('#mpsPoCurrency').value,
                    eta_date: overlay.querySelector('#mpsPoEta').value || null,
                    shipping_carrier: overlay.querySelector('#mpsPoCarrier').value.trim() || null,
                    tracking_number: overlay.querySelector('#mpsPoTracking').value.trim() || null,
                    note: overlay.querySelector('#mpsPoNote').value.trim(), lines: parsed};
                try { payload.costing_data = JSON.parse(overlay.querySelector('#mpsPoCostingData')?.value || 'null'); }
                catch (_) { Toast.error('The imported cost worksheet could not be read. Preview and import it again.'); return false; }
                if (id) payload.id = Number(id); else payload.status = 'draft';
                const result = await API.mpsSavePurchaseOrder(payload);
                if (result.status !== 'success') {
                    const unmatched = result.unmatched?.length ? ` Unmatched: ${result.unmatched.join(', ')}` : '';
                    Toast.error((result.message || 'Purchase order could not be saved.') + unmatched); return false;
                }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success(id ? 'Purchase order updated.' : 'Purchase order created as draft.');
                defaults.onSaved?.();
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
                row.style.outline = '2px solid var(--palette-hex-b45309)';
                if (row.dataset.poCostAuto === '0') continue;
                if (!sku) continue;
                needsLookup.push({row, sku});
            }
            updateCurrencyStatus(needsLookup.length
                ? `Updating ${needsLookup.length} product price${needsLookup.length === 1 ? '' : 's'} to ${currency}...`
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
                    row.style.outline = '2px solid var(--palette-hex-b45309)';
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
            if (input.dataset.poSourceSku && input.dataset.poSourceSku.toLowerCase() !== sku.toLowerCase()) {
                row.querySelector('[data-po-worksheet]')?.removeAttribute('value');
                row.querySelector('[data-po-worksheet]')?.setAttribute('value', '');
                nameCell.querySelector('.mps-po-workbook-meta')?.remove();
            }
            if (!sku) { nameCell.textContent = '-'; return; }
            nameCell.textContent = 'Looking up...';
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
            lineBody.insertAdjacentHTML('beforeend', '<tr><td><input data-po-sku placeholder="SKU" required></td><td data-po-product>-<input type="hidden" data-po-worksheet value=""></td><td><input data-po-source-name maxlength="120" placeholder="AliExpress, Amazon…"></td><td><input data-po-source-reference maxlength="2048" placeholder="Product URL or listing ID"></td><td><input data-po-qty type="number" min="1" step="1" placeholder="Qty" required></td><td><input data-po-cost type="number" min="0" step="0.01" placeholder="Unit price"></td><td data-po-total>-</td><td><button type="button" class="btn btn-ghost btn-sm" data-po-remove>Remove</button></td></tr>');
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

    async openPurchaseOrderDetail(id, selectedTab = 'overview') {
        const [detail, commercial, suppliers] = await Promise.all([
            API.mpsGetPurchaseOrder(id), API.mpsGetPurchaseOrderCommercials(id), API.mpsGetSuppliers()
        ]);
        if (detail.status !== 'success' || commercial.status !== 'success') return Toast.error(detail.message || commercial.message || 'Could not load purchase order details.');
        const po = detail.purchase_order, lines = detail.lines || [], quotes = commercial.quotes || [];
        const panel = document.getElementById('mpsPanel'); if (!panel) return;
        const parseJson = value => { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch (_) { return {}; } };
        const workflow = parseJson(po.workflow_data);
        workflow.steps = workflow.steps && typeof workflow.steps === 'object' ? workflow.steps : {};
        workflow.quality_checks = Array.isArray(workflow.quality_checks) ? workflow.quality_checks : [];
        const route = po.freight_mode || 'local';
        const canWrite = Boolean(this.isWriter);
        const quoteable = !['received','cancelled'].includes(po.status);
        const canFinalize = ['draft','ordered'].includes(po.status);
        const routeSteps = {
            local: [
                ['prepare_list','Prepare purchase list','24 hours'],['request_quotation','Request quotation','24 hours'],['payment','Payment','24 hours'],
                ['local_transport','Local transport','24 hours'],['update_store','Update store','24 hours']
            ],
            air: [
                ['prepare_list','Prepare purchase list','24 hours'],['share_supplier','Share list with supplier','48 hours'],['supplier_payment','Make supplier payment','24 hours'],
                ['packing','Packing','7 days'],['transport_payment','Transport payment','24 hours'],['transport_agent','Send to transport agent','72 hours'],['air_freight','Air freight','7 days'],
                ['customs_clearance','Customs clearance','72 hours'],['local_transport','Local transport','24 hours'],['update_store','Update store','24 hours']
            ],
            sea: [
                ['prepare_list','Prepare purchase list','24 hours'],['request_quotation','Request quotation','72 hours'],['payment','Payment','48 hours'],
                ['packing','Packing','7 days'],['transport_payment','Transport payment','24 hours'],['transport_agent','Send to transport agent','72 hours'],
                ['arrival_confirmation','Goods arrival confirmation','24 hours'],['supplier_follow_up','Supplier follow-up if arrival is unconfirmed','24 hours'],['packing_instructions','Send packing instructions','24 hours'],['sea_freight','Sea freight','40 days'],
                ['customs_clearance','Customs clearance','15 days'],['local_transport','Local transport','24 hours'],['update_store','Update store','24 hours']
            ]
        }[route];
        const money = (value,currency) => value == null || value === '' ? '—' : `${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})} ${currency}`;
        const selected = selectedTab === 'overview' || selectedTab === 'ratio' || selectedTab === 'fees' || selectedTab === 'workflow' || selectedTab === 'new'
            || quotes.some(q => selectedTab === `quote-${Number(q.id)}`) ? selectedTab : 'overview';
        const tabs = [
            ['overview','Overview'],['ratio','Cost ratio'],
            ...quotes.map(q=>[`quote-${Number(q.id)}`,`v${Number(q.version_no)} · ${q.supplier_name}`]),
            ['fees','Fees & tracking'],['workflow','Workflow'],...(canWrite && quoteable ? [['new','New version']] : [])
        ];
        const tabHtml = tabs.map(([key,label])=>`<button type="button" class="mps-po-detail-tab${key===selected?' active':''}" role="tab" aria-selected="${key===selected?'true':'false'}" data-detail-tab="${esc(key)}">${esc(label)}</button>`).join('');
        const selectedQuote = selected.startsWith('quote-') ? quotes.find(q=>`quote-${Number(q.id)}`===selected) : null;
        let view = '';
        if (selected === 'overview') {
            view = `<section class="mps-po-detail-cards"><article><span>Supplier</span><strong>${esc(po.supplier_name || 'Unassigned')}</strong></article><article><span>Route</span><strong>${esc(statusLabel(route))}</strong></article><article><span>Status</span><strong>${esc(statusLabel(po.status))}</strong></article><article><span>ETA</span><strong>${esc(po.eta_date || '—')}</strong></article><article><span>Tracking</span><strong>${esc(po.tracking_number || 'Not recorded')}</strong></article><article><span>Final quote</span><strong>${esc(quotes.find(q=>q.status==='final') ? `${quotes.find(q=>q.status==='final').supplier_name} v${quotes.find(q=>q.status==='final').version_no}` : 'Not finalized')}</strong></article></section>
                <section class="mps-po-detail-section"><h3>Purchase items</h3><div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Product</th><th>Source</th><th>Listing link / reference</th><th>Ordered</th><th>Received</th><th>Unit cost</th><th>Line value</th></tr></thead><tbody>${lines.map(line=>`<tr><td>${esc(line.sku)}</td><td>${esc(line.name)}</td><td>${esc(line.source_name || '—')}</td><td>${/^https?:\/\//i.test(String(line.source_reference || '')) ? `<a href="${esc(line.source_reference)}" target="_blank" rel="noopener noreferrer">Open listing</a>` : esc(line.source_reference || '—')}</td><td>${Number(line.qty_ordered).toLocaleString()}</td><td>${Number(line.qty_received).toLocaleString()}</td><td>${money(line.unit_cost,po.currency)}</td><td>${money(Number(line.unit_cost||0)*Number(line.qty_ordered||0),po.currency)}</td></tr>`).join('')}</tbody></table></div><p>${esc(po.note || '')}</p></section>`;
        } else if (selected === 'ratio') {
            const finalQuote = quotes.find(q=>q.status==='final');
            const fx = Number(commercial.exchange_rate_rwf_per_usd || 1500);
            view = `<section class="mps-po-detail-section"><h3>Final cost / inventory ratio</h3><p>Only the finalized supplier version is used here. Recorded fees marked “Landed cost” are converted to RWF and added to the final goods cost.</p>
                <div class="mps-po-ratio-cards"><article><span>Final supplier version</span><strong>${finalQuote ? `${esc(finalQuote.supplier_name)} v${Number(finalQuote.version_no)}` : 'Not finalized'}</strong></article><article><span>Goods cost</span><strong>${finalQuote ? money(commercial.final_goods_total_rwf,'RWF') : '—'}</strong></article><article><span>Included fees</span><strong>${money(commercial.fees_total_rwf,'RWF')}</strong></article><article><span>Landed inventory value</span><strong>${finalQuote ? money(Number(commercial.final_goods_total_rwf||0)+Number(commercial.fees_total_rwf||0),'RWF') : '—'}</strong></article><article><span>Cost / inventory ratio</span><strong>${commercial.final_cost_inventory_ratio == null ? '—' : `× ${Number(commercial.final_cost_inventory_ratio).toFixed(4)}`}</strong></article><article><span>USD conversion rate</span><strong>${Number(fx).toLocaleString()} RWF/USD</strong></article></div>
                ${finalQuote ? `<div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Final unit cost</th><th>WooCommerce sale</th><th>Sale less cost</th></tr></thead><tbody>${finalQuote.lines.map(line=>{const unitRwf=Number(line.unit_price||0)*(finalQuote.currency==='USD'?fx:1);const qty=Number(lines.find(item=>Number(item.product_id)===Number(line.product_id))?.qty_ordered||0);return `<tr><td>${esc(line.sku)}</td><td>${esc(line.product_name)}</td><td>${qty.toLocaleString()}</td><td>${money(unitRwf,'RWF')}</td><td>${money(line.sale_price_rwf,'RWF')}</td><td>${money(Number(line.sale_price_rwf||0)-unitRwf,'RWF')}</td></tr>`;}).join('')}</tbody></table></div>` : `<p class="mps-po-detail-empty">Finalize a supplier quote to calculate this ratio.</p>`}</section>`;
        } else if (selectedQuote) {
            const fx = Number(commercial.exchange_rate_rwf_per_usd || 1500);
            view = `<section class="mps-po-detail-section"><div class="mps-po-version-heading"><div><h3>${esc(selectedQuote.supplier_name)} · version ${Number(selectedQuote.version_no)}</h3><p>${esc(selectedQuote.direction==='counter_offer'?'Our counter-offer':'Supplier response')} · ${esc(selectedQuote.currency)} · ${esc(String(selectedQuote.created_at||'').slice(0,16))}</p><p>${esc(selectedQuote.notes||'')}</p></div><span class="mps-status mps-status-${esc(selectedQuote.status)}">${esc(statusLabel(selectedQuote.status))}</span></div>
                <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit quote</th><th>Line total</th><th>WooCommerce sale</th><th>Sale less quote</th></tr></thead><tbody>${selectedQuote.lines.map(line=>{const qty=Number(lines.find(item=>Number(item.product_id)===Number(line.product_id))?.qty_ordered||0);const unitRwf=Number(line.unit_price||0)*(selectedQuote.currency==='USD'?fx:1);return `<tr><td>${esc(line.sku)}</td><td>${esc(line.product_name)}</td><td>${qty.toLocaleString()}</td><td>${money(line.unit_price,selectedQuote.currency)}</td><td>${money(line.unit_price==null?null:Number(line.unit_price)*qty,selectedQuote.currency)}</td><td>${money(line.sale_price_rwf,'RWF')}</td><td>${line.unit_price==null?'—':money(Number(line.sale_price_rwf||0)-unitRwf,'RWF')}</td></tr>`;}).join('')}</tbody></table></div>
                ${canWrite && canFinalize && selectedQuote.direction==='supplier' && selectedQuote.status!=='final' ? `<div class="mps-po-inline-finalize"><label><input type="checkbox" data-finalize-ack> I reviewed this version and want it to set the PO costs.</label><button type="button" class="btn btn-primary" data-finalize-quote="${Number(selectedQuote.id)}" disabled>Finalize version</button></div>` : ''}</section>`;
        } else if (selected === 'fees') {
            const feeRows = (commercial.fees||[]).map(fee=>`<tr><td>${esc(fee.category)}</td><td>${money(fee.amount,fee.currency)}</td><td>${esc(fee.paid_at||'—')}</td><td>${fee.include_in_landed_cost?'Included':'Excluded'}</td><td>${esc(fee.reference||'')}</td><td>${esc(fee.note||'')}</td></tr>`).join('');
            view = `<section class="mps-po-detail-section"><h3>Shipment tracking</h3>${canWrite && !['received','cancelled'].includes(po.status) ? `<div class="mps-po-inline-form"><label>Carrier${Input.html({id: 'detailCarrier', type: 'text', maxLength: 120, value: po.shipping_carrier || '', placeholder: 'Carrier'})}</label><label>Tracking number${Input.html({id: 'detailTracking', type: 'text', maxLength: 120, value: po.tracking_number || '', placeholder: 'Tracking number'})}</label><button type="button" class="btn btn-primary" data-save-tracking>Save tracking</button></div>` : `<p>${esc(po.shipping_carrier||'')} ${esc(po.tracking_number||'Not recorded')}</p>`}</section>
                <section class="mps-po-detail-section"><h3>Recorded fees</h3><div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>Fee</th><th>Amount</th><th>Paid date</th><th>Cost treatment</th><th>Reference</th><th>Notes</th></tr></thead><tbody>${feeRows||'<tr><td colspan="6">No fees recorded.</td></tr>'}</tbody></table></div>
                ${canWrite ? `<h4>Add incurred fees</h4><p>Recognized categories complete their workflow step when saved. Supplier payments are recorded separately from landed-cost fees.</p><datalist id="mpsPoFeeCategories"><option value="Supplier payment"><option value="Transport payment"><option value="Packing"><option value="Air freight"><option value="Sea freight"><option value="Customs clearance"><option value="Local transport"></datalist><div id="detailFeeRows"><div class="mps-po-fee-entry" data-fee-entry><input data-fee-category list="mpsPoFeeCategories" placeholder="Freight, duty, insurance"><input data-fee-amount type="number" min="0" step="0.01" placeholder="Amount"><select data-fee-currency><option>RWF</option><option>USD</option></select><input data-fee-date type="date"><input data-fee-reference placeholder="Receipt / reference"><input data-fee-note placeholder="Notes"><label><input data-fee-landed type="checkbox" checked> Landed cost</label></div></div><div class="mps-po-inline-actions"><button type="button" class="btn btn-ghost btn-sm" data-add-fee-row>Add another fee</button><button type="button" class="btn btn-primary" data-save-fees>Save fees</button></div>` : ''}</section>`;
        } else if (selected === 'workflow') {
            const savedSteps = workflow.steps || {};
            const stepMarkup = routeSteps.map(([key,label,target],index)=>{const step=savedSteps[key]||{};const base=index===0?String(po.created_at||'').slice(0,10):savedSteps[routeSteps[index-1][0]]?.completed_at;const match=/^(\d+)\s+(hours?|days?)$/.exec(target);let due='';if(base&&match){const days=Math.ceil(Number(match[1])/(match[2].startsWith('hour')?24:1));const date=new Date(`${base}T00:00:00`);date.setDate(date.getDate()+days);due=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}return `<div class="mps-po-workflow-step"><div><strong>${esc(label)}</strong><small>Target: ${esc(target)}${due?` · Target date: ${esc(due)}`:''}</small></div><label>Completed on<input type="date" data-workflow-step="${esc(key)}" value="${esc(step.completed_at||'')}" ${canWrite?'':'disabled'}></label><label>Notes<input type="text" data-workflow-note="${esc(key)}" maxlength="1000" value="${esc(step.notes||'')}" placeholder="Optional" ${canWrite?'':'disabled'}></label></div>`;}).join('');
            const checks = Array.isArray(workflow.quality_checks)&&workflow.quality_checks.length ? workflow.quality_checks : [{outcome:'',resolution:''}];
            const qaMarkup = checks.map((check,index)=>`<div class="mps-po-quality-cycle"><h4>Quality check ${index+1}</h4><div class="mps-settings-grid"><label>Checked on<input type="date" data-qa-field="checked_at" data-qa-index="${index}" value="${esc(check.checked_at||'')}"></label><label>Quality result<select data-qa-field="outcome" data-qa-index="${index}"><option value="">Choose result</option><option value="pass" ${check.outcome==='pass'?'selected':''}>Good quality</option><option value="fail" ${check.outcome==='fail'?'selected':''}>Failed</option></select></label></div><div data-qa-failure="${index}" ${check.outcome==='fail'?'':'hidden'}><div class="mps-settings-grid"><label>Resolution path<select data-qa-field="resolution" data-qa-index="${index}"><option value="">Choose refund or resend</option><option value="refund" ${check.resolution==='refund'?'selected':''}>Refund</option><option value="resend" ${check.resolution==='resend'?'selected':''}>Resend</option></select></label><label>Report refund/resend by (24 hours)<input type="date" data-qa-field="report_at" data-qa-index="${index}" value="${esc(check.report_at||'')}"></label><label>Refund/resend follow-up<input type="date" data-qa-field="follow_up_at" data-qa-index="${index}" value="${esc(check.follow_up_at||'')}"></label><label>Refund received/replacement received<input type="date" data-qa-field="resolved_at" data-qa-index="${index}" value="${esc(check.resolved_at||'')}"></label></div></div><label>Quality notes<textarea data-qa-field="notes" data-qa-index="${index}" rows="2" maxlength="1000">${esc(check.notes||'')}</textarea></label></div>`).join('');
            const lastQa=checks[checks.length-1]||{};
            const routeComplete=routeSteps.every(([key])=>key==='supplier_follow_up'&&savedSteps.arrival_confirmation?.completed_at||savedSteps[key]?.completed_at);
            const qaComplete=Boolean(lastQa.checked_at&&(lastQa.outcome==='pass'||(lastQa.outcome==='fail'&&lastQa.report_at&&lastQa.follow_up_at&&lastQa.resolution==='refund'&&lastQa.resolved_at)));
            const flowComplete=Boolean(routeComplete&&qaComplete);
            view = `<section class="mps-po-detail-section"><div class="mps-po-version-heading"><div><h3>${esc(statusLabel(route))} purchase workflow</h3><p>Complete the route steps in order. The listed targets follow the supplied flowchart.</p></div><span class="mps-status ${flowComplete?'mps-status-received':'mps-status-draft'}">${flowComplete?'Flow complete':'In progress'}</span></div><div class="mps-po-workflow-list">${stepMarkup}</div>
                <h3>Quality, refund, or resend</h3><p>Record the quality check within 72 hours of updating the store. If it fails, report it within 24 hours and track the refund or resend until resolved.</p>${qaMarkup}${canWrite&&lastQa.outcome==='fail'&&lastQa.resolution==='resend'&&lastQa.resolved_at?'<button type="button" class="btn btn-ghost btn-sm" data-add-qa-cycle>Add quality check after replacement</button>':''}
                ${canWrite?'<div class="mps-po-inline-actions"><button type="button" class="btn btn-primary" data-save-workflow>Save workflow</button></div>':''}</section>`;
        } else if (selected === 'new') {
            const supplierOptions=(suppliers.data||[]).filter(s=>Number(s.active)).map(s=>`<option value="${Number(s.id)}">${esc(s.name)}</option>`).join('');
            view = `<section class="mps-po-detail-section"><h3>Record supplier response or counter-offer</h3><p>Each save creates an immutable version. Upload the filled request CSV or enter prices below.</p><div class="mps-po-inline-form"><label>Supplier<select id="newQuoteSupplier"><option value="">Choose supplier</option>${supplierOptions}</select></label><label>Version type<select id="newQuoteDirection"><option value="supplier">Supplier response</option><option value="counter_offer">Our counter-offer</option></select></label><label>Currency<select id="newQuoteCurrency"><option>USD</option><option>RWF</option></select></label><label>Supplier response CSV or XLSX<input id="newQuoteCsv" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label></div><div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${lines.map(line=>`<tr><td>${esc(line.sku)}</td><td>${esc(line.name)}</td><td>${Number(line.qty_ordered).toLocaleString()}</td><td><input type="number" min="0" step="0.01" data-new-quote-price="${Number(line.product_id)}" data-new-quote-sku="${esc(line.sku)}" placeholder="Not quoted"></td></tr>`).join('')}</tbody></table></div><label>Version notes<textarea id="newQuoteNotes" rows="2" placeholder="Validity, date, or supplier notes"></textarea></label><label class="mps-check"><input type="checkbox" id="newQuoteFinalize"> Finalize this supplier version after saving</label><div class="mps-po-inline-actions"><button type="button" class="btn btn-ghost" data-download-request>Download supplier request CSV</button><button type="button" class="btn btn-primary" data-save-new-quote>Save as next version</button></div></section>`;
        }
        panel.innerHTML = `<div class="mps-po-detail-page"><div class="mps-po-detail-header"><div><button type="button" class="btn btn-ghost btn-sm" data-po-back>← Purchase orders</button><h2>${esc(po.reference)}</h2><p>${esc(po.supplier_name||'Unassigned supplier')} · ${esc(statusLabel(route))} · ${esc(statusLabel(po.status))}</p></div><div class="mps-po-detail-actions">${canWrite && !['received','cancelled'].includes(po.status)?'<button type="button" class="btn btn-ghost" data-edit-po>Edit items</button>':''}<button type="button" class="btn btn-ghost" data-download-po>Download PO</button></div></div><nav class="mps-po-detail-tabs" role="tablist" aria-label="Purchase order detail tabs">${tabHtml}</nav><div class="mps-po-detail-content">${view}</div></div>`;
        panel.querySelector('[data-po-back]')?.addEventListener('click',()=>this.loadOrders());
        panel.querySelector('[data-edit-po]')?.addEventListener('click',()=>this.openPurchaseOrderEditor(id));
        panel.querySelector('[data-download-po]')?.addEventListener('click',()=>this.handleOrderAction(id,'download'));
        panel.querySelectorAll('[data-detail-tab]').forEach(button=>button.addEventListener('click',()=>this.openPurchaseOrderDetail(id,button.dataset.detailTab)));
        if (selected==='new') {
            const parseCsv=source=>{const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<source.length;i++){const c=source[i],n=source[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}else cell+=c;}if(cell!==''||row.length){row.push(cell);rows.push(row);}return rows;};
            panel.querySelector('#newQuoteCsv')?.addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{let rows;if(file.name.toLowerCase().endsWith('.xlsx')){const workbook=await API.mpsPreviewWorkbook(file,'supplier_quote');if(workbook.status!=='success')throw new Error(workbook.message||'Workbook could not be read.');rows=[['SKU','Supplier unit price','Currency'],...(workbook.rows||[]).map(row=>[row.sku,row.supplier_unit_price,row.currency||''])];}else rows=parseCsv((await file.text()).replace(/^\uFEFF/,''));const headers=(rows.shift()||[]).map(v=>v.trim().toLowerCase());const si=headers.indexOf('sku'),pi=headers.indexOf('supplier unit price'),ci=headers.indexOf('currency');if(si<0||pi<0)return Toast.error('CSV needs SKU and Supplier unit price columns.');const bySku=new Map([...panel.querySelectorAll('[data-new-quote-price]')].map(input=>[input.dataset.newQuoteSku.trim().toUpperCase(),input]));let count=0;for(const row of rows){const sku=String(row[si]||'').trim().toUpperCase(),price=String(row[pi]||'').trim(),input=bySku.get(sku);if(!input||!price||!Number.isFinite(Number(price)))continue;input.value=price;count++;const currency=String(row[ci]||'').trim().toUpperCase();if(['USD','RWF'].includes(currency))panel.querySelector('#newQuoteCurrency').value=currency;}Toast.success(`${count} supplier price(s) loaded.`);}catch(_){Toast.error('Could not read supplier response file.');}});
            panel.querySelector('[data-download-request]')?.addEventListener('click',async()=>{const cell=v=>`"${String(v??'').replace(/"/g,'""')}"`;const csv=[['SKU','Product','Quantity','Supplier unit price','Currency'],...lines.map(l=>[l.sku,l.name,l.qty_ordered,'',po.currency||'USD'])].map(r=>r.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${String(po.reference).replace(/[^a-z0-9_-]/gi,'-')}_supplier_request.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);const step=route==='air'?'share_supplier':'request_quotation';const next={...workflow,route,steps:{...workflow.steps,[step]:{...(workflow.steps[step]||{}),completed_at:workflow.steps[step]?.completed_at||today(),notes:'Request CSV exported; share the file with the supplier through your normal channel.'}},quality_checks:workflow.quality_checks};const saved=await API.mpsSavePurchaseOrderWorkflow(Number(id),next);if(saved.status==='success'){workflow.steps=next.steps;Toast.success('Request CSV prepared and workflow updated.');}else Toast.error(saved.message||'CSV downloaded, but workflow could not be updated.');});
            panel.querySelector('[data-save-new-quote]')?.addEventListener('click',async event=>{const supplierId=panel.querySelector('#newQuoteSupplier').value;const quoteLines=[...panel.querySelectorAll('[data-new-quote-price]')].map(input=>({product_id:Number(input.dataset.newQuotePrice),unit_price:input.value.trim()===''?null:Number(input.value)}));if(!supplierId||!quoteLines.some(l=>l.unit_price!==null)||quoteLines.some(l=>l.unit_price!==null&&(!Number.isFinite(l.unit_price)||l.unit_price<0)))return Toast.error('Choose a supplier and enter at least one valid quote price.');event.currentTarget.disabled=true;const result=await API.mpsSavePurchaseOrderQuote({po_id:Number(id),supplier_id:Number(supplierId),direction:panel.querySelector('#newQuoteDirection').value,currency:panel.querySelector('#newQuoteCurrency').value,notes:panel.querySelector('#newQuoteNotes').value.trim(),lines:quoteLines});if(result.status!=='success'){event.currentTarget.disabled=false;return Toast.error(result.message||'Quote version could not be saved.');}if(panel.querySelector('#newQuoteFinalize').checked){const final=await API.mpsFinalizePurchaseOrderQuote(Number(id),Number(result.id));if(final.status!=='success'){Toast.error(final.message||'Quote saved but could not be finalized.');return this.openPurchaseOrderDetail(id,`quote-${Number(result.id)}`);}}if(this.state.invalidateMpsCache)this.state.invalidateMpsCache();Toast.success(`Saved supplier quote version ${Number(result.version_no)}.`);this.openPurchaseOrderDetail(id,`quote-${Number(result.id)}`);});
        }
        if (selected==='fees') {
            panel.querySelector('[data-save-tracking]')?.addEventListener('click',async()=>{const result=await API.mpsSavePurchaseOrder({id:Number(id),shipping_carrier:panel.querySelector('#detailCarrier').value.trim()||null,tracking_number:panel.querySelector('#detailTracking').value.trim()||null});if(result.status!=='success')return Toast.error(result.message||'Tracking could not be saved.');Toast.success('Tracking saved.');this.openPurchaseOrderDetail(id,'fees');});
            panel.querySelector('[data-add-fee-row]')?.addEventListener('click',()=>panel.querySelector('#detailFeeRows')?.insertAdjacentHTML('beforeend','<div class="mps-po-fee-entry" data-fee-entry><input data-fee-category list="mpsPoFeeCategories" placeholder="Freight, duty, insurance"><input data-fee-amount type="number" min="0" step="0.01" placeholder="Amount"><select data-fee-currency><option>RWF</option><option>USD</option></select><input data-fee-date type="date"><input data-fee-reference placeholder="Receipt / reference"><input data-fee-note placeholder="Notes"><label><input data-fee-landed type="checkbox" checked> Landed cost</label></div>'));
            panel.querySelector('[data-save-fees]')?.addEventListener('click',async event=>{const entries=[...panel.querySelectorAll('[data-fee-entry]')].map(row=>({category:row.querySelector('[data-fee-category]').value.trim(),amount:row.querySelector('[data-fee-amount]').value.trim(),currency:row.querySelector('[data-fee-currency]').value,paid_at:row.querySelector('[data-fee-date]').value||null,reference:row.querySelector('[data-fee-reference]').value.trim(),note:row.querySelector('[data-fee-note]').value.trim(),include_in_landed_cost:row.querySelector('[data-fee-landed]').checked})).filter(f=>f.category||f.amount);if(!entries.length)return Toast.error('Enter at least one fee.');if(entries.some(f=>!f.category||!f.amount||!Number.isFinite(Number(f.amount))||Number(f.amount)<0))return Toast.error('Each fee needs a category and valid amount.');event.currentTarget.disabled=true;for(const fee of entries){const result=await API.mpsSavePurchaseOrderFee({po_id:Number(id),...fee});if(result.status!=='success'){event.currentTarget.disabled=false;return Toast.error(result.message||'A fee could not be saved.');}}if(this.state.invalidateMpsCache)this.state.invalidateMpsCache();Toast.success(`${entries.length} fee(s) saved.`);this.openPurchaseOrderDetail(id,'fees');});
        }
        if (selected==='workflow') {
            panel.querySelectorAll('[data-qa-field="outcome"]').forEach(select=>select.addEventListener('change',()=>{const failure=panel.querySelector(`[data-qa-failure="${select.dataset.qaIndex}"]`);if(failure)failure.hidden=select.value!=='fail';const resolution=panel.querySelector(`[data-qa-field="resolution"][data-qa-index="${select.dataset.qaIndex}"]`);if(select.value==='pass'&&resolution)resolution.value='';}));
            panel.querySelector('[data-add-qa-cycle]')?.addEventListener('click',()=>{workflow.quality_checks=checks.concat([{outcome:'',resolution:''}]);this.saveWorkflowFromPanel(id,route,workflow,()=>this.openPurchaseOrderDetail(id,'workflow'));});
            panel.querySelector('[data-save-workflow]')?.addEventListener('click',async event=>{const next={route,steps:{},quality_checks:checks.map((q,index)=>({...q}))};panel.querySelectorAll('[data-workflow-step]').forEach(input=>{const key=input.dataset.workflowStep;next.steps[key]={completed_at:input.value||null,notes:panel.querySelector(`[data-workflow-note="${key}"]`)?.value.trim()||''};});panel.querySelectorAll('[data-qa-field]').forEach(input=>{const index=Number(input.dataset.qaIndex),field=input.dataset.qaField;next.quality_checks[index][field]=input.value;});event.currentTarget.disabled=true;const result=await API.mpsSavePurchaseOrderWorkflow(Number(id),next);if(result.status!=='success'){event.currentTarget.disabled=false;return Toast.error(result.message||'Workflow could not be saved.');}if(this.state.invalidateMpsCache)this.state.invalidateMpsCache();Toast.success('Workflow saved.');this.openPurchaseOrderDetail(id,'workflow');});
        }
        if (selectedQuote && canWrite && canFinalize && selectedQuote.direction==='supplier' && selectedQuote.status!=='final') {
            const ack=panel.querySelector('[data-finalize-ack]'),button=panel.querySelector('[data-finalize-quote]');ack?.addEventListener('change',()=>{button.disabled=!ack.checked;});button?.addEventListener('click',async()=>{if(!ack?.checked)return;button.disabled=true;const result=await API.mpsFinalizePurchaseOrderQuote(Number(id),Number(selectedQuote.id));if(result.status!=='success'){button.disabled=false;return Toast.error(result.message||'Version could not be finalized.');}if(this.state.invalidateMpsCache)this.state.invalidateMpsCache();Toast.success('Supplier version finalized and PO costs updated.');this.openPurchaseOrderDetail(id,`quote-${Number(selectedQuote.id)}`);});
        }
    },

    async saveWorkflowFromPanel(id, route, workflow, onSaved) {
        const result=await API.mpsSavePurchaseOrderWorkflow(Number(id),{...workflow,route});
        if(result.status!=='success')return Toast.error(result.message||'Workflow could not be saved.');
        if(this.state.invalidateMpsCache)this.state.invalidateMpsCache();
        Toast.success('A quality follow-up cycle was added.');
        onSaved?.();
    },

    async openPurchaseOrderCommercialsLegacy(id) {
        const [detail, commercial, suppliers] = await Promise.all([
            API.mpsGetPurchaseOrder(id), API.mpsGetPurchaseOrderCommercials(id), API.mpsGetSuppliers()
        ]);
        if (detail.status !== 'success' || commercial.status !== 'success') return Toast.error(detail.message || commercial.message || 'Could not load supplier quotes.');
        const po = detail.purchase_order;
        const lines = detail.lines || [];
        const orderedQtyByProduct = new Map(lines.map(line => [Number(line.product_id), Number(line.qty_ordered || 0)]));
        const quotes = commercial.quotes || [];
        const suppliersData = (suppliers.data || []).filter(item => Number(item.active));
        const canRecordQuotes = !['received','cancelled'].includes(po.status);
        const canFinalizeQuote = ['draft','ordered'].includes(po.status);
        const canUpdateTracking = canRecordQuotes;
        const money = (value, currency) => value == null || value === '' ? '—' : `${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})} ${currency}`;
        const quoteLines = quotes.map(quote => (quote.lines || []).map(line => {
            const fx = quote.currency === 'USD' ? Number(commercial.exchange_rate_rwf_per_usd || 1500) : 1;
            const costRwf = line.unit_price == null ? null : Number(line.unit_price) * fx;
            const sale = Number(line.sale_price_rwf || 0);
            const spread = costRwf == null ? null : sale - costRwf;
            const quantity = orderedQtyByProduct.get(Number(line.product_id)) || 0;
            const lineTotal = line.unit_price == null ? null : Number(line.unit_price) * quantity;
            return `<tr><td>${esc(quote.supplier_name)} v${Number(quote.version_no)}${quote.status === 'final' ? ' <b class="mps-status-pill">FINAL</b>' : ''}<small>${esc(quote.direction === 'counter_offer' ? 'Our counter-offer' : 'Supplier quote')} · ${esc(String(quote.created_at || '').slice(0,10))}</small></td><td>${esc(line.sku)}</td><td>${esc(line.product_name)}</td><td>${money(line.unit_price,quote.currency)}</td><td>${money(lineTotal,quote.currency)}</td><td>${money(line.sale_price_rwf,'RWF')}</td><td>${spread == null ? '—' : money(spread,'RWF')}</td></tr>`;
        }).join('')).join('');
        const quoteOptions = quotes.filter(q => q.direction === 'supplier' && ['received','final','superseded'].includes(q.status)).map(q => `<option value="${Number(q.id)}">${esc(q.supplier_name)} · v${Number(q.version_no)} · ${esc(q.currency)} · ${esc(q.status)}</option>`).join('');
        const feeRows = (commercial.fees || []).map(fee => `<tr><td>${esc(fee.category)}</td><td>${money(fee.amount,fee.currency)}</td><td>${esc(fee.paid_at || '—')}</td><td>${fee.include_in_landed_cost ? 'Included' : 'Excluded'}</td><td>${esc(fee.reference || '')}</td></tr>`).join('');
        const supplierOptions = suppliersData.map(s => `<option value="${Number(s.id)}" ${String(s.id) === String(po.supplier_id || '') ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
        const body = `<div class="mps-po-commercial-scroll"><p class="mps-modal-note"><b>${esc(po.reference)}</b> · Supplier quotes are saved as numbered snapshots. Only a finalized supplier quote updates PO line costs and the cost/inventory calculation. Sale prices come from current WooCommerce approved prices.</p>
            <section class="mps-po-commercial-section"><h3>Quote versions and price comparison</h3>
            <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>Supplier / version</th><th>SKU</th><th>Product</th><th>Quoted unit price</th><th>Quoted line total</th><th>WooCommerce sale price</th><th>Sale less quote</th></tr></thead><tbody>${quoteLines || `<tr><td colspan="7">No supplier quote versions recorded yet.</td></tr>`}</tbody></table></div>
            <p class="mps-modal-note">${(commercial.quotes || []).length} version(s). Goods total in current PO costs: ${money(commercial.po_goods_total,commercial.po_currency)}. Recorded landed-cost fees: ${money(commercial.fees_total_rwf,'RWF')} (USD fees converted at ${Number(commercial.exchange_rate_rwf_per_usd || 1500).toLocaleString()} RWF/USD). Final quote cost/inventory ratio: ${commercial.final_cost_inventory_ratio == null ? 'not available until a supplier quote is finalized' : `× ${Number(commercial.final_cost_inventory_ratio).toFixed(3)}`}.</p></section>
            ${canRecordQuotes ? `<section class="mps-po-commercial-section"><h3>Record a quote version</h3><div class="mps-settings-grid"><label>Supplier<select id="mpsQuoteSupplier" required><option value="">Select supplier</option>${supplierOptions}</select></label><label>Version received<select id="mpsQuoteDirection"><option value="supplier">Supplier price list</option><option value="counter_offer">Our counter-offer</option></select></label><label>Currency<select id="mpsQuoteCurrency"><option>USD</option><option>RWF</option></select></label></div>
            <label>Upload supplier response CSV or XLSX<input id="mpsSupplierQuoteCsv" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><small>Use the downloaded request CSV and fill its “Supplier unit price” column. SKU must match exactly.</small></label>
            <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>SKU</th><th>Product</th><th>Order qty</th><th>Unit price</th></tr></thead><tbody>${lines.map(line=>`<tr><td>${esc(line.sku)}</td><td>${esc(line.name)}</td><td>${Number(line.qty_ordered).toLocaleString()}</td><td><input type="number" min="0" step="0.01" data-quote-product="${Number(line.product_id)}" data-quote-sku="${esc(line.sku)}" placeholder="Not quoted"></td></tr>`).join('')}</tbody></table></div>
            <label>Version notes<textarea id="mpsQuoteNotes" rows="2" placeholder="Quote date, validity, supplier comments"></textarea></label>
            <label class="mps-check"><input type="checkbox" id="mpsQuoteFinalizeNew"> Finalize this supplier quote after saving it</label></section>` : `<p class="mps-modal-note">This ${esc(po.status)} purchase order is closed to new quote versions. Existing versions remain available for review.</p>`}
            <section class="mps-po-commercial-section"><h3>Finalize an existing supplier version</h3>${canFinalizeQuote ? `<label>Selected version<select id="mpsQuoteFinalize"><option value="">Keep current PO costs</option>${quoteOptions}</select></label><p class="mps-modal-note">Finalizing replaces the PO's item costs with that version. Earlier versions remain available for comparison.</p>` : `<p class="mps-modal-note">Quote finalization is available while the PO is a draft or ordered.</p>`}</section>
            <section class="mps-po-commercial-section"><h3>Shipment tracking</h3><div class="mps-settings-grid"><label>Carrier<input id="mpsCommercialCarrier" maxlength="120" value="${esc(po.shipping_carrier || '')}" placeholder="Carrier or courier" ${canUpdateTracking ? '' : 'disabled'}></label><label>Tracking number<input id="mpsCommercialTracking" maxlength="120" value="${esc(po.tracking_number || '')}" placeholder="Shipment tracking number" ${canUpdateTracking ? '' : 'disabled'}></label></div></section>
            <section class="mps-po-commercial-section"><h3>Shipment and other fees</h3><div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>Fee</th><th>Amount</th><th>Currency</th><th>Paid date</th><th>Receipt / reference</th><th>Landed cost</th></tr></thead><tbody id="mpsPoFeeRows"><tr data-fee-row><td><input data-fee-category placeholder="Freight, insurance, duty"></td><td><input data-fee-amount type="number" min="0" step="0.01" placeholder="0"></td><td><select data-fee-currency><option>RWF</option><option>USD</option></select></td><td><input data-fee-date type="date"></td><td><input data-fee-reference placeholder="Optional"></td><td><input data-fee-landed type="checkbox" checked></td></tr></tbody></table></div><button type="button" class="btn btn-ghost btn-sm" id="mpsPoAddFee">Add fee</button>
            <div class="mps-table-wrap"><table class="mps-table"><thead><tr><th>Recorded fee</th><th>Amount</th><th>Date</th><th>Cost treatment</th><th>Reference</th></tr></thead><tbody>${feeRows || `<tr><td colspan="5">No fees recorded.</td></tr>`}</tbody></table></div></section>
            <button type="button" class="btn btn-ghost btn-sm" id="mpsPoDownloadRequest">Download supplier request CSV</button></div>`;
        const overlay = this.openDialog({
            title: `Supplier quotes · ${esc(po.reference)}`, body, confirmText: 'Save updates', cancelText: 'Close', busyText: 'Saving quote and costs...',
            onConfirm: async currentOverlay => {
                const supplierId = currentOverlay.querySelector('#mpsQuoteSupplier')?.value || '';
                const quoteInputLines = [...currentOverlay.querySelectorAll('[data-quote-product]')].map(input => ({product_id:Number(input.dataset.quoteProduct),unit_price:input.value.trim()==='' ? null : Number(input.value)}));
                const hasAnyQuotePrice = quoteInputLines.some(line => line.unit_price !== null);
                const feeInputs = [...currentOverlay.querySelectorAll('[data-fee-row]')].map(row => ({category:row.querySelector('[data-fee-category]').value.trim(),amount:row.querySelector('[data-fee-amount]').value.trim(),currency:row.querySelector('[data-fee-currency]').value,paid_at:row.querySelector('[data-fee-date]').value || null,reference:row.querySelector('[data-fee-reference]').value.trim(),include_in_landed_cost:row.querySelector('[data-fee-landed]').checked})).filter(fee => fee.category || fee.amount);
                if (hasAnyQuotePrice && !supplierId) { Toast.error('Choose the supplier before recording prices.'); return false; }
                if (quoteInputLines.some(line => line.unit_price !== null && (!Number.isFinite(line.unit_price) || line.unit_price < 0))) { Toast.error('Quote prices must be valid non-negative amounts.'); return false; }
                if (feeInputs.some(fee => !fee.category || !fee.amount || !Number.isFinite(Number(fee.amount)) || Number(fee.amount)<0)) { Toast.error('Each fee needs a category and valid non-negative amount.'); return false; }
                const tracking = currentOverlay.querySelector('#mpsCommercialTracking').value.trim();
                const carrier = currentOverlay.querySelector('#mpsCommercialCarrier').value.trim();
                const trackingChanged = tracking !== String(po.tracking_number || '') || carrier !== String(po.shipping_carrier || '');
                if (trackingChanged && canUpdateTracking) {
                    const trackingResult = await API.mpsSavePurchaseOrder({id:Number(id),tracking_number:tracking || null,shipping_carrier:carrier || null});
                    if (trackingResult.status !== 'success') { Toast.error(trackingResult.message || 'Shipment tracking could not be saved.'); return false; }
                }
                for (const fee of feeInputs) {
                    const result = await API.mpsSavePurchaseOrderFee({po_id:Number(id),...fee});
                    if (result.status !== 'success') { Toast.error(result.message || 'A fee could not be saved.'); return false; }
                }
                let newQuoteId = null;
                if (hasAnyQuotePrice) {
                    const result = await API.mpsSavePurchaseOrderQuote({po_id:Number(id),supplier_id:Number(supplierId),direction:currentOverlay.querySelector('#mpsQuoteDirection').value,currency:currentOverlay.querySelector('#mpsQuoteCurrency').value,notes:currentOverlay.querySelector('#mpsQuoteNotes').value.trim(),lines:quoteInputLines});
                    if (result.status !== 'success') { Toast.error(result.message || 'Quote version could not be saved.'); return false; }
                    newQuoteId = Number(result.id);
                }
                const selectedQuote = newQuoteId && currentOverlay.querySelector('#mpsQuoteFinalizeNew')?.checked ? newQuoteId : Number(currentOverlay.querySelector('#mpsQuoteFinalize')?.value || 0);
                if (selectedQuote) {
                    const result = await API.mpsFinalizePurchaseOrderQuote(Number(id),selectedQuote);
                    if (result.status !== 'success') { Toast.error(result.message || 'Quote version could not be finalized.'); return false; }
                }
                if (this.state.invalidateMpsCache) this.state.invalidateMpsCache();
                Toast.success(hasAnyQuotePrice ? 'Quote version and PO details saved.' : 'PO fees and shipment details saved.');
                this.loadOrders();
                return true;
            }
        });
        overlay.querySelector('.mps-dialog')?.classList.add('mps-po-commercial-dialog');
        overlay.querySelector('#mpsSupplierQuoteCsv')?.addEventListener('change', async event => {
            const file = event.target.files?.[0]; if (!file) return;
            const parseCsv = source => {
                const rows = []; let row = [], cell = '', quoted = false;
                for (let i=0; i<source.length; i++) {
                    const char=source[i], next=source[i+1];
                    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
                    else if (char === '"') quoted = !quoted;
                    else if (char === ',' && !quoted) { row.push(cell); cell=''; }
                    else if ((char === '\n' || char === '\r') && !quoted) { if (char==='\r' && next==='\n') i++; row.push(cell); if(row.some(value=>value!=='')) rows.push(row); row=[]; cell=''; }
                    else cell += char;
                }
                if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
                return rows;
            };
            try {
                let rows;if(file.name.toLowerCase().endsWith('.xlsx')){const workbook=await API.mpsPreviewWorkbook(file,'supplier_quote');if(workbook.status!=='success')throw new Error(workbook.message||'Workbook could not be read.');rows=[['SKU','Supplier unit price','Currency'],...(workbook.rows||[]).map(row=>[row.sku,row.supplier_unit_price,row.currency||''])];}else rows=parseCsv((await file.text()).replace(/^\uFEFF/,''));
                const header=(rows.shift()||[]).map(value=>value.trim().toLowerCase());
                const skuIndex=header.indexOf('sku'), priceIndex=header.indexOf('supplier unit price'), currencyIndex=header.indexOf('currency');
                if (skuIndex < 0 || priceIndex < 0) { Toast.error('This CSV must include SKU and Supplier unit price columns.'); return; }
                const inputBySku=new Map([...overlay.querySelectorAll('[data-quote-product]')].map(input=>[String(input.dataset.quoteSku||'').trim().toUpperCase(),input]));
                let imported=0, unmatched=0;
                for (const record of rows) {
                    const sku=String(record[skuIndex]||'').trim().toUpperCase(), input=inputBySku.get(sku), price=String(record[priceIndex]||'').trim();
                    if (!sku || !price) continue;
                    if (!input || !Number.isFinite(Number(price)) || Number(price)<0) { unmatched++; continue; }
                    input.value=price; imported++;
                    const currency=String(record[currencyIndex]||'').trim().toUpperCase();
                    if (['USD','RWF'].includes(currency)) overlay.querySelector('#mpsQuoteCurrency').value=currency;
                }
                Toast.success(`${imported} quote price(s) loaded${unmatched ? `; ${unmatched} row(s) were unmatched or invalid` : ''}.`);
            } catch (_) { Toast.error('The supplier response file could not be read.'); }
        });
        overlay.querySelector('#mpsPoAddFee')?.addEventListener('click', () => {
            overlay.querySelector('#mpsPoFeeRows')?.insertAdjacentHTML('beforeend','<tr data-fee-row><td><input data-fee-category placeholder="Freight, insurance, duty"></td><td><input data-fee-amount type="number" min="0" step="0.01" placeholder="0"></td><td><select data-fee-currency><option>RWF</option><option>USD</option></select></td><td><input data-fee-date type="date"></td><td><input data-fee-reference placeholder="Optional"></td><td><input data-fee-landed type="checkbox" checked></td></tr>');
        });
        overlay.querySelector('#mpsPoDownloadRequest')?.addEventListener('click', () => {
            const csvCell = value => `"${String(value ?? '').replace(/"/g,'""')}"`;
            const rows = [['SKU','Product','Quantity','Supplier unit price','Currency'],...lines.map(line=>[line.sku,line.name,line.qty_ordered,'',po.currency || 'USD'])];
            const csv = rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
            const blob = new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
            const link=document.createElement('a'); link.href=url; link.download=`${String(po.reference || `PO${id}`).replace(/[^a-z0-9_-]/gi,'-')}_supplier_request.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
        });
    },

    async handleOrderAction(id, action) {
        if (action === 'detail' || action === 'commercials') return this.openPurchaseOrderDetail(Number(id));
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
            const locationOptions = locations.data.map(location => ({value: String(location.id), label: `${location.name}${location.code ? ` (${location.code})` : ''}`}));
            const defaultLocationId = String(defaultLocation || locations.data[0].id);
            this.openDialog({
                title: 'Receive purchase order',
                confirmText: 'Receive',
                busyText: 'Receiving...',
                body: `<p class="mps-modal-note">Purchase order <strong>${esc(reference)}</strong></p>
                    <label>Receiving location${Select.html({id: 'mpsReceiveLocation', value: defaultLocationId, options: locationOptions, ariaLabel: 'Receiving location'})}</label>
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
