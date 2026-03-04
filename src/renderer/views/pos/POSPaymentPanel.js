/**
 * POSPaymentPanel — Modular UI with Order Settings Modal
 * Architecture:
 * 1. TotalsCalculator: Pure math utility
 * 2. CustomerSearch: Autocomplete logic
 * 3. OrderSettingsModal: Modal DOM and form state (with Max Fee limits & Persistence)
 * 4. POSPaymentPanel: Orchestrator and Main Compact UI
 */
const API = require('../../services/api.js');

/* =======================================================================
   1. TotalsCalculator
   ======================================================================= */
class TotalsCalculator {
    static calculate({ subtotal, discountRaw, discountType, shipping, fees, taxOn, taxRate, taxInclusive, taxOnItems }) {
        const discountVal = parseFloat(discountRaw) || 0;
        const discount = discountType === 'percent'
            ? Math.round(subtotal * discountVal / 100)
            : discountVal;

        const shippingCost = parseFloat(shipping) || 0;
        const feesTotal = fees.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);

        const afterDisc = Math.max(0, subtotal - discount);
        const preTax    = afterDisc + shippingCost + feesTotal;

        let taxAmt = 0;
        if (taxOn && taxRate > 0) {
            if (taxInclusive) {
                taxAmt = preTax - (preTax / (1 + taxRate / 100));
            } else {
                const base = taxOnItems ? afterDisc : preTax;
                taxAmt = base * (taxRate / 100);
            }
        }

        const total = taxInclusive ? Math.round(preTax) : Math.round(preTax + taxAmt);

        return { discount, shipping: shippingCost, feesTotal, taxAmt: Math.round(taxAmt), total };
    }
}

/* =======================================================================
   2. CustomerSearch
   ======================================================================= */
class CustomerSearch {
    constructor(container, onSelect) {
        this.container = container;
        this.onSelect = onSelect;
        this.input = container.querySelector('#posCustomerSearch');
        this.resultsPanel = container.querySelector('#posCustomerResults');
        this.idInput = container.querySelector('#posCustomerId');
        this.emailInput = container.querySelector('#posCustomerEmail');
        this.timer = null;
        this._bindEvents();
    }

    _bindEvents() {
        this.input.addEventListener('input', e => {
            this.idInput.value = '';
            this.emailInput.value = '';
            const q = e.target.value.trim();

            if (q.length < 2) {
                this.resultsPanel.style.display = 'none';
                return;
            }
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this._fetchResults(q), 380);
        });

        document.addEventListener('click', e => {
            if (!this.container.contains(e.target)) this.resultsPanel.style.display = 'none';
        });
    }

    async _fetchResults(q) {
        this.resultsPanel.innerHTML = `<div class="pos-ac-loading">Searching…</div>`;
        this.resultsPanel.style.display = 'block';

        try {
            const res = await API.getWCCustomers(q);
            if (res.status === 'success' && res.data?.length) {
                this.resultsPanel.innerHTML = res.data.map(c => `
                    <div class="pos-ac-item" data-id="${c.id}" data-name="${c.display_name}" data-email="${c.email || ''}">
                        <div class="pos-ac-name">${c.display_name}</div>
                        <div class="pos-ac-sub">${c.email || ''}</div>
                    </div>`).join('');

                this.resultsPanel.querySelectorAll('.pos-ac-item').forEach(item =>
                    item.addEventListener('click', () => this._selectItem(item.dataset, q)));
            } else {
                this.resultsPanel.innerHTML = `<div class="pos-ac-item" style="color:#6b7280;">Use "${q}" as walk-in</div>`;
                this.resultsPanel.querySelector('.pos-ac-item').addEventListener('click', () => this._selectWalkIn(q));
            }
        } catch(e) { this.resultsPanel.style.display = 'none'; }
    }

    _selectItem(data) {
        this.input.value = data.name;
        this.idInput.value = data.id;
        this.emailInput.value = data.email;
        this.resultsPanel.style.display = 'none';
        this.onSelect();
    }

    _selectWalkIn(q) {
        this.input.value = q;
        this.resultsPanel.style.display = 'none';
        this.onSelect();
    }
}

/* =======================================================================
   3. OrderSettingsModal
   ======================================================================= */
class OrderSettingsModal {
    constructor(container, onChange, onTaxModeChange) {
        this.container = container;
        this.onChange = onChange;
        this.onTaxModeChange = onTaxModeChange;

        this.MAX_FEES = 5;

        this.state = {
            fees: [],
            taxRates: [],
            taxOn: false,
            taxInclusive: false,
            taxOnItems: false,
            selTaxRate: 0,
            selTaxName: 'Tax',
            fallbackMode: false,
            staffList: []
        };

        this.savedCashierId = null;

        this.container.innerHTML = this._html();
        this.modalEl = this.container.querySelector('#posSettingsModalOverlay');

        this._bindEvents();
        this._initCustomerSearch();
    }

    // --- State Persistence ---
    loadLocalSettings() {
        try {
            const savedStr = localStorage.getItem('pos_order_settings');
            if (!savedStr) return;
            const saved = JSON.parse(savedStr);

            // Restore JS State
            if (saved.fees) this.state.fees = saved.fees;
            this.state.taxOn = !!saved.taxOn;
            this.state.taxInclusive = !!saved.taxInclusive;
            this.state.taxOnItems = !!saved.taxOnItems;
            this.state.selTaxRate = saved.taxRate || 0;
            this.state.selTaxName = saved.taxName || 'Tax';
            this.savedCashierId = saved.cashier?.id || null;

            // Restore DOM Inputs
            if (saved.discountType) this.container.querySelector('#posDiscountType').value = saved.discountType;
            if (saved.discountRaw) this.container.querySelector('#posDiscountVal').value = saved.discountRaw;
            if (saved.shipping) this.container.querySelector('#posShipping').value = saved.shipping;
            if (saved.notes) this.container.querySelector('#posNotes').value = saved.notes;

            if (saved.customer) {
                this.container.querySelector('#posCustomerId').value = saved.customer.id || '';
                this.container.querySelector('#posCustomerSearch').value = saved.customer.name || '';
                this.container.querySelector('#posCustomerEmail').value = saved.customer.email || '';
            }

            this._updateTaxUI();
            this._renderFees();
        } catch (e) {}
    }

    saveLocalSettings() {
        localStorage.setItem('pos_order_settings', JSON.stringify(this.getData()));
    }

    // --- Public API ---
    show() {
        this.modalEl.style.display = 'flex';
        requestAnimationFrame(() => this.modalEl.classList.add('pcm-overlay--in'));
    }

    hide() {
        this.modalEl.classList.remove('pcm-overlay--in');
        setTimeout(() => { this.modalEl.style.display = 'none'; }, 220);
        this.onChange();
    }

    setTaxRates(rates) {
        this.state.taxRates = rates || [];
        const sel = this.container.querySelector('#posTaxRateSelect');
        if (!sel || !this.state.taxRates.length) return;

        sel.innerHTML = this.state.taxRates.map(r => {
            const rate = parseFloat(r.rate || 0);
            return `<option value="${rate}" data-name="${r.name || 'Tax'}">${r.name || 'Tax'} (${rate}%)</option>`;
        }).join('');

        if (!this.state.selTaxRate) {
            this.state.selTaxRate = parseFloat(this.state.taxRates[0]?.rate || 0);
            this.state.selTaxName = this.state.taxRates[0]?.name || 'Tax';
        } else {
            sel.value = this.state.selTaxRate;
        }
    }

    setStaff(staffList, fallback = false) {
        this.state.staffList = staffList;
        this.state.fallbackMode = fallback;

        const sel = this.container.querySelector('#posCashier');
        if (!sel) return;

        if (fallback) {
            const inp = document.createElement('input');
            inp.id = 'posCashierInput'; inp.type = 'text';
            inp.className = 'pos-input'; inp.placeholder = 'Cashier name';
            sel.replaceWith(inp);
        } else {
            sel.innerHTML = '<option value="">— Select cashier —</option>' +
                staffList.map(u => `<option value="${u.id}" data-name="${u.display_name}" data-email="${u.email || ''}">${u.display_name}</option>`).join('');

            if (this.savedCashierId) {
                sel.value = this.savedCashierId;
                this.onChange();
            }
        }
    }

    reset() {
        ['posDiscountVal','posNotes','posCustomerSearch','posCustomerId','posCustomerEmail','posShipping'].forEach(id => {
            const el = this.container.querySelector(`#${id}`);
            if (el) el.value = id === 'posDiscountVal' ? '0' : '';
        });
        this.state.fees = [];
        this.state.taxOn = false;
        this._renderFees();
        this._updateTaxUI();
        this.saveLocalSettings();
    }

    getData() {
        const cashierSel = this.container.querySelector('#posCashier');
        let cashier = { id: '', name: '', email: '' };

        if (this.state.fallbackMode) {
            cashier.name = this.container.querySelector('#posCashierInput')?.value?.trim() || '';
        } else {
            const opt = cashierSel?.options[cashierSel.selectedIndex];
            const staff = this.state.staffList.find(s => String(s.id) === String(cashierSel?.value));
            cashier = { id: cashierSel?.value || '', name: opt?.dataset?.name || opt?.text || '', email: staff?.email || '' };
        }

        return {
            discountType: this.container.querySelector('#posDiscountType')?.value || 'value',
            discountRaw: parseFloat(this.container.querySelector('#posDiscountVal')?.value || '0') || 0,
            shipping: parseFloat(this.container.querySelector('#posShipping')?.value || '0') || 0,
            fees: [...this.state.fees],
            taxOn: this.state.taxOn,
            taxRate: this.state.selTaxRate,
            taxName: this.state.selTaxName,
            taxInclusive: this.state.taxInclusive,
            taxOnItems: this.state.taxOnItems,
            notes: this.container.querySelector('#posNotes')?.value?.trim() || '',
            cashier,
            customer: {
                id: this.container.querySelector('#posCustomerId')?.value || '',
                name: this.container.querySelector('#posCustomerSearch')?.value?.trim() || 'Walk-in',
                email: this.container.querySelector('#posCustomerEmail')?.value || ''
            }
        };
    }

    // --- Internal Logic ---
    _initCustomerSearch() {
        const wrap = this.container.querySelector('.pos-autocomplete-wrap');
        new CustomerSearch(wrap, () => this.onChange());
    }

    _bindEvents() {
        this.container.querySelector('#posSettingsCloseBtn').addEventListener('click', () => this.hide());
        this.container.querySelector('#posSettingsApplyBtn').addEventListener('click', () => this.hide());
        this.modalEl.addEventListener('click', e => { if (e.target === this.modalEl) this.hide(); });

        ['#posDiscountVal', '#posDiscountType', '#posShipping', '#posCashier', '#posNotes'].forEach(sel => {
            this.container.querySelector(sel)?.addEventListener('input', () => this.onChange());
            this.container.querySelector(sel)?.addEventListener('change', () => this.onChange());
        });

        this.container.querySelector('#posTaxToggle').addEventListener('click', () => {
            this.state.taxOn = !this.state.taxOn;
            this._updateTaxUI();
            this._fireTaxMode();
        });

        this.container.querySelector('#posTaxInclToggle').addEventListener('click', () => {
            this.state.taxInclusive = !this.state.taxInclusive;
            this._updateTaxUI();
            this._fireTaxMode();
        });

        this.container.querySelector('#posTaxRateSelect').addEventListener('change', e => {
            this.state.selTaxRate = parseFloat(e.target.value) || 0;
            const opt = e.target.options[e.target.selectedIndex];
            this.state.selTaxName = opt ? opt.dataset.name : 'Tax';
            this._fireTaxMode();
        });

        this.container.querySelector('#posTaxOnTotal').addEventListener('change', () => { this.state.taxOnItems = false; this._fireTaxMode(); });
        this.container.querySelector('#posTaxOnItems').addEventListener('change', () => { this.state.taxOnItems = true; this._fireTaxMode(); });

        this.container.querySelector('#posAddFeeBtn').addEventListener('click', () => {
            if (this.state.fees.length < this.MAX_FEES) {
                this.state.fees.push({ label: 'Fee', amount: 0 });
                this._renderFees();
                this.onChange();
            }
        });

        this.container.querySelector('#posSameAsCashier').addEventListener('click', () => {
            const data = this.getData();
            if (data.cashier.name) {
                this.container.querySelector('#posCustomerSearch').value = data.cashier.name;
                this.container.querySelector('#posCustomerId').value = data.cashier.id;
                this.container.querySelector('#posCustomerEmail').value = data.cashier.email || '';
                this.onChange();
            }
        });
    }

    _updateTaxUI() {
        this.container.querySelector('#posTaxToggleEl').className = 'pos-toggle' + (this.state.taxOn ? ' on' : '');
        this.container.querySelector('#posTaxOptions').style.display = this.state.taxOn ? 'flex' : 'none';
        this.container.querySelector('#posTaxModeRow').style.display = this.state.taxOn ? 'flex' : 'none';
        this.container.querySelector('#posTaxInclEl').className = 'pos-toggle' + (this.state.taxInclusive ? ' on' : '');
        this.container.querySelector('#posTaxInclLabel').textContent = this.state.taxInclusive ? 'Incl' : 'Excl';

        if(this.state.taxOnItems) this.container.querySelector('#posTaxOnItems').checked = true;
        else this.container.querySelector('#posTaxOnTotal').checked = true;
    }

    _renderFees() {
        const c = this.container.querySelector('#posFeesContainer');
        const addBtn = this.container.querySelector('#posAddFeeBtn');
        if (!c) return;

        if (this.state.fees.length >= this.MAX_FEES) {
            addBtn.style.opacity = '0.4';
            addBtn.style.cursor = 'not-allowed';
            addBtn.title = `Maximum ${this.MAX_FEES} fees allowed`;
        } else {
            addBtn.style.opacity = '1';
            addBtn.style.cursor = 'pointer';
            addBtn.title = '';
        }

        c.innerHTML = this.state.fees.map((f, i) => `
            <div style="display:flex; gap:4px; align-items:center;">
                <input type="text" class="pos-input" style="flex:1;" placeholder="Label" value="${f.label}" data-fee-label="${i}">
                <input type="number" class="pos-input" style="width:80px; text-align:right;" value="${f.amount}" min="0" data-fee-amt="${i}">
                <button class="pos-remove-btn" data-fee-del="${i}" title="Remove">×</button>
            </div>`).join('');

        c.querySelectorAll('[data-fee-label]').forEach(inp =>
            inp.addEventListener('input', () => { this.state.fees[+inp.dataset.feeLabel].label = inp.value; this.onChange(); }));

        c.querySelectorAll('[data-fee-amt]').forEach(inp =>
            inp.addEventListener('input', () => { this.state.fees[+inp.dataset.feeAmt].amount = parseFloat(inp.value) || 0; this.onChange(); }));

        c.querySelectorAll('[data-fee-del]').forEach(btn =>
            btn.addEventListener('click', () => { this.state.fees.splice(+btn.dataset.feeDel, 1); this._renderFees(); this.onChange(); }));
    }

    _fireTaxMode() {
        this.onChange();
        this.onTaxModeChange({
            taxOn: this.state.taxOn,
            taxOnItems: this.state.taxOnItems,
            taxRate: this.state.selTaxRate,
            taxName: this.state.selTaxName,
            taxInclusive: this.state.taxInclusive,
        });
    }

    _html() {
        return `
        <div id="posSettingsModalOverlay" class="pcm-overlay" style="display:none; z-index: 1050;">
            <div class="pcm-modal" style="width: min(440px, 92vw); overflow: visible;">
                <div class="pcm-header" style="background:#243B53; padding: 12px 16px; font-size:14px;">
                    Order Settings
                    <button id="posSettingsCloseBtn" class="pcm-close" style="width:24px;height:24px;font-size:16px;">&times;</button>
                </div>
                <div class="pcm-body" style="padding: 14px 16px; display:flex; flex-direction:column; gap:12px; overflow: visible;">
                    
                    <div class="pos-people-row">
                        <div class="pos-field-group">
                            <label class="pos-field-label">Cashier</label>
                            <select id="posCashier" class="pos-select"><option value="">Loading…</option></select>
                        </div>
                        <div class="pos-field-group">
                            <label class="pos-field-label">Customer <button id="posSameAsCashier" class="pos-same-btn" type="button" style="padding:0 4px;font-size:8px;">= Cashier</button></label>
                            <div class="pos-autocomplete-wrap" style="position:relative;">
                                <input id="posCustomerSearch" type="text" class="pos-input" placeholder="Search walk-in…" autocomplete="off">
                                <input id="posCustomerId" type="hidden" value="">
                                <input id="posCustomerEmail" type="hidden" value="">
                                <div id="posCustomerResults" class="pos-autocomplete-dropdown" style="display:none; position:absolute; z-index:999999; top:calc(100% + 4px); bottom:auto; left:0; right:0; box-shadow: 0 6px 20px rgba(0,0,0,.15); max-height: 180px;"></div>
                            </div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div class="pos-field-group">
                            <label class="pos-field-label">Discount</label>
                            <div class="pos-addon-row">
                                <select id="posDiscountType" class="pos-select" style="width:auto; padding:4px;"><option value="value">Frw</option><option value="percent">%</option></select>
                                <input id="posDiscountVal" type="number" class="pos-input" value="0" min="0">
                            </div>
                        </div>
                        <div class="pos-field-group">
                            <label class="pos-field-label">Shipping</label>
                            <input id="posShipping" type="number" class="pos-input" value="0" min="0">
                        </div>
                    </div>

                    <div class="pos-field-group" style="background:#F8FAFC; padding:8px 10px; border-radius:6px; border:1px solid #E2E8F0;">
                        <div class="pos-tax-row">
                            <label class="pos-toggle-wrap" id="posTaxToggle">
                                <div class="pos-toggle" id="posTaxToggleEl"></div>
                                <span style="font-weight:600; font-size:11px;">Apply Tax</span>
                            </label>
                        </div>
                        <div id="posTaxOptions" style="display:none; flex-direction:column; gap:6px; margin-top:6px;">
                            <div style="display:flex; gap:6px;">
                                <select id="posTaxRateSelect" class="pos-select" style="flex:1;"><option value="0">Standard (0%)</option></select>
                                <label class="pos-toggle-wrap" id="posTaxInclToggle">
                                    <div class="pos-toggle" id="posTaxInclEl"></div>
                                    <span id="posTaxInclLabel" style="font-size:11px;">Excl</span>
                                </label>
                            </div>
                            <div class="pos-tax-mode-row" id="posTaxModeRow">
                                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="radio" name="taxApply" value="total" checked class="pos-tax-mode-radio" id="posTaxOnTotal"> On total</label>
                                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="radio" name="taxApply" value="items" class="pos-tax-mode-radio" id="posTaxOnItems"> Per item</label>
                            </div>
                        </div>
                    </div>

                    <div class="pos-field-group">
                        <label class="pos-field-label" style="display:flex;justify-content:space-between;">
                            Extra Fees
                            <button class="pos-add-link" id="posAddFeeBtn" type="button" style="font-size:10px;">+ Add fee</button>
                        </label>
                        <div id="posFeesContainer" style="display:flex;flex-direction:column;gap:4px;"></div>
                    </div>

                    <div class="pos-field-group">
                        <label class="pos-field-label">Notes</label>
                        <textarea id="posNotes" class="pos-input" rows="2" placeholder="Customer instructions…" style="resize:none;"></textarea>
                    </div>
                </div>
                <div class="pcm-footer" style="padding: 12px 16px;">
                    <button id="posSettingsApplyBtn" class="pcm-btn pcm-btn--confirm" style="padding:10px;">Done</button>
                </div>
            </div>
        </div>`;
    }
}


/* =======================================================================
   4. POSPaymentPanel (Main Orchestrator)
   ======================================================================= */
class POSPaymentPanel {
    constructor({ onRequestCheckout, onTaxModeChange }) {
        this.onRequestCheckout = onRequestCheckout;
        this.onTaxModeChange = onTaxModeChange;
        this._subtotal = 0;
        this._methods = [];
    }

    render(container) {
        this.container = container;
        this.container.innerHTML = this._html();

        this._initModal();
        this._bindEvents();
        this._loadStaff();
    }

    _initModal() {
        const modalContainer = document.createElement('div');
        this.container.appendChild(modalContainer);

        this.modal = new OrderSettingsModal(
            modalContainer,
            () => {
                this.modal.saveLocalSettings(); // Save automatically on every interaction
                this._refreshTotals();
            },
            (mode) => this.onTaxModeChange(mode)
        );

        // Restore from storage immediately after initialization
        this.modal.loadLocalSettings();
    }

    _bindEvents() {
        this.container.querySelector('#posOpenSettingsBtn').addEventListener('click', () => {
            this.modal.show();
        });

        this.container.querySelector('#posCheckoutBtn').addEventListener('click', () => {
            this._handleCheckout();
        });
    }

    // --- External APIs (Called by POSView) ---
    setPaymentMethods(methods) {
        this._methods = (methods || []).filter(m => m.enabled !== false);
        this._renderMethods();
    }

    setTaxRates(rates) {
        this.modal.setTaxRates(rates);
    }

    updateTotals(subtotal, empty) {
        this._subtotal = subtotal;
        this._refreshTotals();
        const btn = this.container.querySelector('#posCheckoutBtn');
        if (btn) btn.disabled = empty;
    }

    setLoading(on) {
        const btn = this.container.querySelector('#posCheckoutBtn');
        if (!btn) return;
        btn.disabled = on;
        btn.innerHTML = on
            ? `<svg class="pos-spinner-inline" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Processing…`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15"><polyline points="20 6 9 17 4 12"/></svg> Charge &amp; Review`;
    }

    resetForm() {
        this.modal.reset();
        this._refreshTotals();
    }

    // --- UI Rendering ---
    _renderMethods() {
        const wrap = this.container.querySelector('#posPaymentMethods');
        if (!wrap || !this._methods.length) return;

        const icons = {
            cod:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
            bacs:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
            cheque: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
            stripe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
            default:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="5" y="2" width="14" height="20" rx="2"/></svg>`,
        };

        wrap.innerHTML = this._methods.map((m, i) => `
            <button class="pos-method-btn ${i === 0 ? 'active' : ''}" data-method="${m.id}" data-title="${m.title}" style="white-space: normal; height: auto; min-height: 52px; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                ${icons[m.id] || icons.default}
                <span style="width: 100%; text-align: center; word-break: break-word; line-height: 1.15; font-size: 10px;">${m.title}</span>
            </button>`).join('');

        wrap.querySelectorAll('.pos-method-btn').forEach(btn =>
            btn.addEventListener('click', () => {
                wrap.querySelectorAll('.pos-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }));
    }

    _refreshTotals() {
        const modalData = this.modal.getData();
        const calc = TotalsCalculator.calculate({ subtotal: this._subtotal, ...modalData });

        this.container.querySelector('#posSubtotal').textContent = `${this._subtotal.toLocaleString()} Frw`;
        this.container.querySelector('#posTotal').textContent = `${calc.total.toLocaleString()} Frw`;

        let dynHTML = '';
        if (calc.discount > 0) dynHTML += `<div class="pos-trow" style="color:#10B981;font-size:11px;"><span>Discount</span><span>− ${calc.discount.toLocaleString()} Frw</span></div>`;
        if (calc.shipping > 0) dynHTML += `<div class="pos-trow" style="font-size:11px;"><span>Shipping</span><span>+ ${calc.shipping.toLocaleString()} Frw</span></div>`;

        modalData.fees.forEach(f => {
            if (parseFloat(f.amount) > 0) {
                dynHTML += `<div class="pos-trow" style="font-size:11px;"><span>${f.label || 'Fee'}</span><span>+ ${parseFloat(f.amount).toLocaleString()} Frw</span></div>`;
            }
        });

        if (modalData.taxOn && modalData.taxRate > 0) {
            dynHTML += `<div class="pos-trow" style="color:#2689C4;font-size:11px;"><span>${modalData.taxName} (${modalData.taxRate}%)</span><span>${modalData.taxInclusive?'':'+'}${calc.taxAmt.toLocaleString()} Frw</span></div>`;
        }

        this.container.querySelector('#posDynamicTotals').innerHTML = dynHTML;

        const custLabel = this.container.querySelector('#posActiveCustomer');
        if (modalData.customer.name && modalData.customer.name.toLowerCase() !== 'walk-in') {
            custLabel.style.display = 'block';
            custLabel.textContent = `👤 ${modalData.customer.name}`;
        } else {
            custLabel.style.display = 'none';
        }
    }

    _handleCheckout() {
        const modalData = this.modal.getData();
        const calc = TotalsCalculator.calculate({ subtotal: this._subtotal, ...modalData });
        const activeMethod = this.container.querySelector('.pos-method-btn.active');

        this.onRequestCheckout({
            paymentMethod: activeMethod?.dataset.title || 'Cash',
            paymentMethodId: activeMethod?.dataset.method || 'cod',

            discount: calc.discount,
            discountType: modalData.discountType,
            discountRaw: modalData.discountRaw,
            notes: modalData.notes,
            subtotal: this._subtotal,
            total: calc.total,

            taxRate: modalData.taxRate,
            taxName: modalData.taxName,
            taxInclusive: modalData.taxInclusive,
            taxOnItems: modalData.taxOnItems,
            taxAmount: calc.taxAmt,

            shipping: calc.shipping,
            fees: modalData.fees,

            cashierId: modalData.cashier.id,
            cashierName: modalData.cashier.name,
            // FIX: Pass null instead of an empty string
            cashierEmail: modalData.cashier.email || null,

            customerId: modalData.customer.id || null,
            customerName: modalData.customer.name,
            // FIX: Pass null instead of an empty string
            customerEmail: modalData.customer.email || null,
        });
    }

    async _loadStaff() {
        try {
            const res = await API.getWCStaff();
            if (res?.status === 'success' && res.data?.length) {
                this.modal.setStaff(res.data, false);
            } else {
                this.modal.setStaff([], true);
            }
        } catch(e) {
            this.modal.setStaff([], true);
        }
    }

    _html() {
        return `
        <div class="pos-payment-panel">
            <div class="pos-pp-section" style="padding: 6px 10px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                <button id="posOpenSettingsBtn" type="button" style="width:100%; padding: 6px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:6px; font-size:11.5px; font-weight:600; color:#243B53; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition: background .12s;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    Order Details & Adjustments
                </button>
            </div>

            <div class="pos-pp-section" style="padding: 8px 12px;">
                <div id="posActiveCustomer" style="font-size:11px; font-weight:700; color:#2689C4; margin-bottom:4px; display:none;"></div>
                <div class="pos-totals-grid" style="gap:2px;">
                    <div class="pos-trow" style="font-size:11px;"><span>Subtotal</span><span id="posSubtotal" style="font-weight:600;">0 Frw</span></div>
                    <div id="posDynamicTotals" style="display:flex; flex-direction:column; gap:2px;"></div>
                    <div class="pos-trow pos-trow--total" style="margin-top:2px; padding-top:4px;"><span>Total</span><span id="posTotal" style="color:#2689C4; font-size:15px;">0 Frw</span></div>
                </div>
            </div>

            <div class="pos-pp-section" style="padding: 6px 12px 10px; border-bottom:none;">
                <div class="pos-methods-grid" id="posPaymentMethods" style="margin-bottom:6px; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));"></div>
                <button id="posCheckoutBtn" class="pos-checkout-btn" style="padding: 10px;" disabled>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><polyline points="20 6 9 17 4 12"/></svg>
                    Charge
                </button>
            </div>
        </div>`;
    }
}

module.exports = POSPaymentPanel;