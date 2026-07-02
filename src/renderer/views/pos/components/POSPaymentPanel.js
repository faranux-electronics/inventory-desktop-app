/**
 * POSPaymentPanel — Modular UI with Order Settings Modal
 * Architecture:
 * 1. TotalsCalculator: Pure math utility
 * 2. CustomerSearch: Autocomplete logic
 * 3. OrderSettingsModal: Modal DOM and form state (with Max Fee limits & Persistence)
 * 4. POSPaymentPanel: Orchestrator and Main Compact UI
 */
const API = require('../../../services/api.js');
const Toast = require('../../../components/Toast.js');

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
            const base = taxOnItems ? afterDisc : preTax;
            if (taxInclusive) {
                taxAmt = base - (base / (1 + taxRate / 100));
            } else {
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
    constructor(container, onChange, onTaxModeChange, cartId = null) {
        this.container = container;
        this.onChange = onChange;
        this.onTaxModeChange = onTaxModeChange;
        this.cartId = cartId; // For per-cart settings

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
    // Keeps the settings-modal toggle in sync when live cart gets enabled
    // programmatically (e.g. from the per-tab eye icon) rather than by the
    // user clicking this toggle directly.
    setLiveCartEnabledUi(enabled) {
        localStorage.setItem('pos_live_cart_enabled', enabled);
        const toggleEl = this.container.querySelector('#posLiveCartToggleEl');
        if (toggleEl) {
            toggleEl.className = 'pos-toggle' + (enabled ? ' on' : '');
        }
    }

    loadLocalSettings() {
        // Clean up old global settings if they exist
        localStorage.removeItem('pos_order_settings');
        
        // No global settings - everything is per-cart
        // Reset to defaults until cart-specific settings are loaded
        this.state.fees = [];
        this.state.taxOn = false;
        this.state.taxInclusive = false;
        this.state.taxOnItems = false;
        
        // -- DOM-DERIVED TAX RATE SYNC --
        const taxSel = this.container.querySelector('#posTaxRateSelect');
        if (taxSel && taxSel.options.length > 0) {
            this.state.selTaxRate = parseFloat(taxSel.value) || 0;
            this.state.selTaxName = taxSel.options[taxSel.selectedIndex]?.dataset.name || 'Tax';
        } else {
            this.state.selTaxRate = 0;
            this.state.selTaxName = 'Tax';
        }
        
        this.savedCashierId = null;

        this.container.querySelector('#posDiscountType').value = 'value';
        this.container.querySelector('#posDiscountVal').value = '0';
        this.container.querySelector('#posShipping').value = '0';
        this.container.querySelector('#posNotes').value = '';
        this.container.querySelector('#posCustomerId').value = '';
        this.container.querySelector('#posCustomerSearch').value = '';
        this.container.querySelector('#posCustomerEmail').value = '';

        this._updateTaxUI();
        this._renderFees();
    }

    saveLocalSettings() {
        // Save all settings per-cart
        if (this.cartId) {
            const data = this.getData();
            const cartSettings = {
                fees: data.fees,
                discountType: data.discountType,
                discountRaw: data.discountRaw,
                shipping: data.shipping,
                notes: data.notes,
                taxOn: data.taxOn,
                taxRate: data.taxRate,
                taxName: data.taxName,
                taxInclusive: data.taxInclusive,
                taxOnItems: data.taxOnItems,
                cashier: data.cashier,
                customer: data.customer
            };
            localStorage.setItem(`pos_cart_settings_${this.cartId}`, JSON.stringify(cartSettings));
        }
    }

    loadCartSettings(cartId) {
        if (!cartId) return;
        try {
            const savedStr = localStorage.getItem(`pos_cart_settings_${cartId}`);
            if (savedStr) {
                const saved = JSON.parse(savedStr);
                
                // Restore all cart-specific settings
                if (saved.fees) this.state.fees = saved.fees;
                if (saved.discountType) this.container.querySelector('#posDiscountType').value = saved.discountType;
                if (saved.discountRaw) this.container.querySelector('#posDiscountVal').value = saved.discountRaw;
                if (saved.shipping) this.container.querySelector('#posShipping').value = saved.shipping;
                if (saved.notes) this.container.querySelector('#posNotes').value = saved.notes;
                
                // Restore tax settings
                this.state.taxOn = !!saved.taxOn;
                this.state.taxInclusive = !!saved.taxInclusive;
                this.state.taxOnItems = !!saved.taxOnItems;
                
                // -- DOM-DERIVED TAX RATE SYNC --
                const taxSel = this.container.querySelector('#posTaxRateSelect');
                if (taxSel && saved.taxRate) {
                    taxSel.value = saved.taxRate;
                }
                
                if (taxSel && taxSel.options.length > 0) {
                    this.state.selTaxRate = parseFloat(taxSel.value) || 0;
                    this.state.selTaxName = taxSel.options[taxSel.selectedIndex]?.dataset.name || 'Tax';
                } else {
                    this.state.selTaxRate = saved.taxRate || 0;
                    this.state.selTaxName = saved.taxName || 'Tax';
                }

                this._updateTaxUI();
                this._fireTaxMode();
                
                // Restore cashier
                this.savedCashierId = saved.cashier?.id || null;
                const cashierSel = this.container.querySelector('#posCashier');
                if (cashierSel && saved.cashier?.id) {
                    cashierSel.value = saved.cashier.id;
                }
                
                // Restore customer
                if (saved.customer) {
                    this.container.querySelector('#posCustomerId').value = saved.customer.id || '';
                    this.container.querySelector('#posCustomerSearch').value = saved.customer.name || '';
                    this.container.querySelector('#posCustomerEmail').value = saved.customer.email || '';
                }
                
                this._renderFees();
                this.onChange();
            } else {
                // No saved settings for this cart, use defaults
                this.state.fees = [];
                this.state.taxOn = false;
                this.state.taxInclusive = false;
                this.state.taxOnItems = false;
                
                // -- DOM-DERIVED TAX RATE SYNC --
                const taxSel = this.container.querySelector('#posTaxRateSelect');
                if (taxSel && taxSel.options.length > 0) {
                    this.state.selTaxRate = parseFloat(taxSel.value) || 0;
                    this.state.selTaxName = taxSel.options[taxSel.selectedIndex]?.dataset.name || 'Tax';
                } else {
                    this.state.selTaxRate = 0;
                    this.state.selTaxName = 'Tax';
                }
                
                this.container.querySelector('#posDiscountType').value = 'value';
                this.container.querySelector('#posDiscountVal').value = '0';
                this.container.querySelector('#posShipping').value = '0';
                this.container.querySelector('#posNotes').value = '';
                this.container.querySelector('#posCustomerId').value = '';
                this.container.querySelector('#posCustomerSearch').value = '';
                this.container.querySelector('#posCustomerEmail').value = '';
                
                this._updateTaxUI();
                this._renderFees();
                this.onChange();
            }
        } catch (e) {}
    }

    // --- Public API ---
    show() {
        this.modalEl.style.display = 'flex';
        requestAnimationFrame(() => this.modalEl.classList.add('pcm-overlay--in'));
        
        // Add Escape key handler
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    hide() {
        this.modalEl.classList.remove('pcm-overlay--in');
        setTimeout(() => { this.modalEl.style.display = 'none'; }, 220);
        this.onChange();
        
        // Remove Escape key handler
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
            this._escapeHandler = null;
        }
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

        // Target either the select OR the fallback input (if recovering from an error)
        let el = this.container.querySelector('#posCashier') || this.container.querySelector('#posCashierInput');
        if (!el) return;

        if (fallback) {
            const inp = document.createElement('input');
            inp.id = 'posCashierInput'; inp.type = 'text';
            inp.className = 'pos-input';
            inp.placeholder = '⚠️ API Error: Type name manually';
            inp.style.borderColor = '#EF4444'; // Red error border
            el.replaceWith(inp);
        } else {
            // If it was an input (recovering from fallback), change it back to select
            if (el.tagName === 'INPUT') {
                const sel = document.createElement('select');
                sel.id = 'posCashier';
                sel.className = 'pos-select';
                el.replaceWith(sel);
                el = sel;
            }

            el.innerHTML = '<option value="">— Select cashier —</option>' +
                staffList.map(u => `<option value="${u.id}" data-name="${u.display_name}" data-email="${u.email || ''}">${u.display_name}</option>`).join('');
            el.style.borderColor = ''; // Clear error border

            // Auto-select cashier if logged-in email matches
            if (!this.savedCashierId) {
                const user = window._posUser || null; // Get logged-in user from global
                if (user?.email) {
                    const matchingCashier = staffList.find(s => s.email === user.email);
                    if (matchingCashier) {
                        el.value = matchingCashier.id;
                        this.savedCashierId = matchingCashier.id;
                        this.onChange();
                    }
                }
            }

            if (this.savedCashierId) {
                el.value = this.savedCashierId;
                this.onChange();
            }
        }
    }

    reset() {
        // Reset all per-cart settings
        ['posDiscountVal','posNotes','posShipping','posCustomerSearch','posCustomerId','posCustomerEmail'].forEach(id => {
            const el = this.container.querySelector(`#${id}`);
            if (el) el.value = id === 'posDiscountVal' ? '0' : '';
        });
        
        this.state.fees = [];
        this.state.taxOn = false;
        this.state.taxInclusive = false;
        this.state.taxOnItems = false;
        
        // -- DOM-DERIVED TAX RATE SYNC --
        const taxSel = this.container.querySelector('#posTaxRateSelect');
        if (taxSel && taxSel.options.length > 0) {
            taxSel.selectedIndex = 0;
            this.state.selTaxRate = parseFloat(taxSel.value) || 0;
            this.state.selTaxName = taxSel.options[0]?.dataset.name || 'Tax';
        } else {
            this.state.selTaxRate = 0;
            this.state.selTaxName = 'Tax';
        }
        
        this._renderFees();
        this._updateTaxUI();
        this.onChange();
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

        // Live cart toggle
        const liveCartEnabled = localStorage.getItem('pos_live_cart_enabled') === 'true';
        const liveCartToggleEl = this.container.querySelector('#posLiveCartToggleEl');
        if (liveCartToggleEl) {
            liveCartToggleEl.className = 'pos-toggle' + (liveCartEnabled ? ' on' : '');
        }

        this.container.querySelector('#posLiveCartToggle').addEventListener('click', () => {
            const currentState = localStorage.getItem('pos_live_cart_enabled') === 'true';
            const newState = !currentState;
            localStorage.setItem('pos_live_cart_enabled', newState);
            const toggleEl = this.container.querySelector('#posLiveCartToggleEl');
            if (toggleEl) {
                toggleEl.className = 'pos-toggle' + (newState ? ' on' : '');
            }
            // Notify parent to enable/disable live cart
            if (this.onLiveCartToggle) {
                this.onLiveCartToggle(newState);
            }
        });

        // Live cart register ID
        const registerId = localStorage.getItem('pos_live_cart_register_id') || 'till-1';
        const registerInput = this.container.querySelector('#posLiveCartRegisterId');
        if (registerInput) {
            registerInput.value = registerId;
            registerInput.addEventListener('change', () => {
                localStorage.setItem('pos_live_cart_register_id', registerInput.value || 'till-1');
                // Notify parent of register ID change
                if (this.onLiveCartRegisterChange) {
                    this.onLiveCartRegisterChange(registerInput.value || 'till-1');
                }
            });
        }

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
        <div id="posSettingsModalOverlay" class="pcm-overlay" style="display:none; z-index: 2000;">
            <div class="pcm-modal" style="width: min(440px, 92vw); overflow: visible;">
                <div class="pcm-header pcm-header--pos-settings" style="background:#932013; padding: 12px 16px;">
                    Order Settings
                    <button id="posSettingsCloseBtn" class="pcm-close" style="width:24px;height:24px;">&times;</button>
                </div>
                <div class="pcm-body" style="padding: 14px 16px; display:flex; flex-direction:column; gap:12px; overflow: visible;">
                    
                    <div class="pos-people-row">
                        <div class="pos-field-group">
                            <label class="pos-field-label">Cashier</label>
                            <div style="display: flex; gap: 6px;">
                                <select id="posCashier" class="pos-select" style="flex: 1;"><option value="">Loading…</option></select>
                                <button id="posRefreshStaffBtn" type="button" style="padding: 0 8px; border: 1px solid #E2E8F0; background: #fff; border-radius: 4px; cursor: pointer; color: #4b5563;" title="Force Refresh Staff">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.13-5.87L21 8"></path></svg>
                                </button>
                            </div>
                        </div>
                        <div class="pos-field-group">
                            <label class="pos-field-label">Customer <button id="posSameAsCashier" class="pos-same-btn" type="button" style="padding:0 4px;">= Cashier</button></label>
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
                                <span class="pos-tax-label">Apply Tax</span>
                            </label>
                        </div>
                        <div id="posTaxOptions" style="display:none; flex-direction:column; gap:6px; margin-top:6px;">
                            <div style="display:flex; gap:6px;">
                                <select id="posTaxRateSelect" class="pos-select" style="flex:1;"><option value="0">Standard (0%)</option></select>
                                <label class="pos-toggle-wrap" id="posTaxInclToggle">
                                    <div class="pos-toggle" id="posTaxInclEl"></div>
                                    <span id="posTaxInclLabel" class="pos-tax-label">Excl</span>
                                </label>
                            </div>
                            <div class="pos-tax-mode-row" id="posTaxModeRow">
                                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="radio" name="taxApply" value="total" checked class="pos-tax-mode-radio" id="posTaxOnTotal"> On total</label>
                                <label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="radio" name="taxApply" value="items" class="pos-tax-mode-radio" id="posTaxOnItems"> Per item</label>
                            </div>
                        </div>
                    </div>

                    <div class="pos-field-group">
                            <label class="pos-field-label pos-field-label--fees" style="display:flex;justify-content:space-between;">
                                Extra Fees
                                <button class="pos-add-link" id="posAddFeeBtn" type="button">+ Add fee</button>
                            </label>
                            <div id="posFeesContainer" class="pos-fees-container"></div>

                    <div class="pos-field-group">
                        <label class="pos-field-label">Notes</label>
                        <textarea id="posNotes" class="pos-input" rows="2" placeholder="Customer instructions…" style="resize:none;"></textarea>
                    </div>

                    <div class="pos-field-group" style="background:#F8FAFC; padding:8px 10px; border-radius:6px; border:1px solid #E2E8F0;">
                        <div class="pos-tax-row">
                            <label class="pos-toggle-wrap" id="posLiveCartToggle">
                                <div class="pos-toggle" id="posLiveCartToggleEl"></div>
                                <span class="pos-tax-label">Enable Live Cart Display</span>
                            </label>
                        </div>
                        <div style="margin-top:6px; font-size:11px; color:#6B7280;">
                            Register ID: <input id="posLiveCartRegisterId" type="text" class="pos-input" style="width:120px; padding:4px; font-size:11px;" value="till-1" placeholder="till-1">
                        </div>
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
    constructor({ onRequestCheckout, onTaxModeChange, onVoidCart, onPrintQuote }) {
        this.onRequestCheckout = onRequestCheckout;
        this.onTaxModeChange = onTaxModeChange;
        this.onVoidCart = onVoidCart;
        this.onPrintQuote = onPrintQuote;
        this._subtotal = 0;
        this.currentCartId = null;
        // Initialize hardcoded payment methods immediately
        this._methods = [
            { id: 'cod', title: 'Cash' },
            { id: 'momo', title: 'Momo' },
            { id: 'bacs', title: 'Bank Transfer' }
        ];
    }

    render(container) {
        this.container = container;
        this.container.innerHTML = this._html();

        this._initModal();
        this._bindEvents();
        this._loadStaff();
        // Render payment methods immediately since they're hardcoded
        this._renderMethods();
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
            (mode) => this.onTaxModeChange(mode),
            null // Cart ID will be set when cart is activated
        );

        // Restore from storage immediately after initialization
        this.modal.loadLocalSettings();
    }

    setCurrentCartId(cartId) {
        this.currentCartId = cartId;
        // Load per-cart settings for this cart
        if (this.modal) {
            this.modal.cartId = cartId;
            this.modal.loadCartSettings(cartId);
        }
    }

    setLiveCartStatus(isActive) {
        const statusEl = this.container.querySelector('#posLiveCartStatus');
        if (statusEl) {
            statusEl.classList.toggle('active', isActive);
            const textEl = statusEl.querySelector('.pos-live-text');
            if (textEl) {
                textEl.textContent = isActive ? 'Live: On' : 'Live: Off';
            }
        }
    }

    // Syncs the settings-modal "Enable Live Cart Display" toggle when the
    // master flag is flipped from outside the modal (see POSView._toggleLiveCart).
    setLiveCartEnabledUi(enabled) {
        if (this.modal) {
            this.modal.setLiveCartEnabledUi(enabled);
        }
    }

    _openSettings() {
        if (this.modal) {
            this.modal.show();
        }
    }

    _bindEvents() {
        this.container.querySelector('#posOpenSettingsBtn').addEventListener('click', () => {
            this._openSettings();
        });

        const voidButton = this.container.querySelector('#posVoidBtn');
        if (voidButton) {
            voidButton.addEventListener('click', () => {
                if (this.onVoidCart) {
                    this.onVoidCart();
                }
            });
        }

        const quoteButton = this.container.querySelector('#posQuoteBtn');
        if (quoteButton) {
            quoteButton.addEventListener('click', () => {
                if (this.onPrintQuote) {
                    this.onPrintQuote();
                }
            });
        }

        this.container.querySelector('#posCheckoutBtn').addEventListener('click', () => {
            this._handleCheckout();
        });

        this.container.querySelector('#posRefreshStaffBtn').addEventListener('click', () => {
            this._loadStaff(true);
        });
    }

    // --- External APIs (Called by POSView) ---
    setPaymentMethods(methods) {
        // Payment methods are hardcoded in constructor, no-op for API calls
        // This method is kept for compatibility but doesn't change the methods
    }

    setTaxRates(rates) {
        this.modal.setTaxRates(rates);
    }

    updateTotals(subtotal, empty) {
        this._subtotal = subtotal;
        this._refreshTotals();
        const btn = this.container.querySelector('#posCheckoutBtn');
        if (btn) btn.disabled = empty;
        const voidBtn = this.container.querySelector('#posVoidBtn');
        if (voidBtn) voidBtn.disabled = empty;
        const quoteBtn = this.container.querySelector('#posQuoteBtn');
        if (quoteBtn) quoteBtn.disabled = empty;
    }

    setLoading(on) {
        const btn = this.container.querySelector('#posCheckoutBtn');
        if (!btn) return;
        btn.disabled = on;
        btn.innerHTML = on
            ? `<svg class="pos-spinner-inline" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Processing…`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15"><polyline points="20 6 9 17 4 12"/></svg> Charge`;
    }

    resetForm() {
        this.modal.reset();
        this._refreshTotals();
        // Re-apply current cart ID to modal
        if (this.modal && this.currentCartId) {
            this.modal.cartId = this.currentCartId;
        }
    }

    // --- UI Rendering ---
    _renderMethods() {
        const wrap = this.container.querySelector('#posPaymentMethods');
        if (!wrap || !this._methods.length) return;

        wrap.innerHTML = this._methods.map((m, i) => `
            <button class="pos-method-btn ${i === 0 ? 'active' : ''}" data-method="${m.id}" data-title="${m.title}">
                ${m.title}
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
        if (calc.discount > 0) dynHTML += `<div class="pos-trow pos-trow--discount"><span>Discount</span><span>− ${calc.discount.toLocaleString()} Frw</span></div>`;
        if (calc.shipping > 0) dynHTML += `<div class="pos-trow pos-trow--shipping"><span>Shipping</span><span>+ ${calc.shipping.toLocaleString()} Frw</span></div>`;

        const visibleFees = modalData.fees.filter(f => parseFloat(f.amount) > 0);
        if (visibleFees.length > 0) {
            const totalFees = visibleFees.reduce((sum, f) => sum + parseFloat(f.amount), 0);
            const feeLabel = visibleFees.length > 1 ? 'Fees' : (visibleFees[0].label || 'Fee');
            dynHTML += `<div class="pos-trow pos-trow--fee"><span>${feeLabel}</span><span>+ ${totalFees.toLocaleString()} Frw</span></div>`;
        }

        if (modalData.taxOn && modalData.taxRate > 0) {
            const taxBaseLabel = modalData.taxOnItems
                ? `on items`
                : `on total (incl. shipping & fees)`;
            const taxStatusLabel = modalData.taxInclusive ? 'incl.' : 'excl.';
            dynHTML += `<div class="pos-trow pos-trow--tax"><span>${modalData.taxName} (${modalData.taxRate}%) ${taxBaseLabel}, ${taxStatusLabel}</span><span>${modalData.taxInclusive ? '' : '+'}${calc.taxAmt.toLocaleString()} Frw</span></div>`;
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

        // --- VALIDATION BLOCK ---
        if (!activeMethod) {
            return Toast.error('Please select a payment method before charging.');
        }

        if (modalData.discountType === 'value' && modalData.discountRaw > this._subtotal) {
            return Toast.error('Discount amount cannot exceed the subtotal.');
        }

        if (modalData.discountType === 'percent' && modalData.discountRaw > 100) {
            return Toast.error('Discount percentage cannot exceed 100%.');
        }

        if (!modalData.cashier.name || modalData.cashier.name.includes('— Select')) {
            return Toast.error('Please assign a cashier in the Order Details menu.');
        }

        this.onRequestCheckout({
            paymentMethod: activeMethod?.dataset.title || 'Cash',
            paymentMethodId: activeMethod?.dataset.method || 'cod',

            discount: calc.discount,
            discountType: modalData.discountType,
            discountRaw: modalData.discountRaw,
            notes: modalData.notes,
            subtotal: this._subtotal,
            total: calc.total,

            taxOn: modalData.taxOn,
            taxRate: modalData.taxRate,
            taxName: modalData.taxName,
            taxInclusive: modalData.taxInclusive,
            taxOnItems: modalData.taxOnItems,
            taxAmount: calc.taxAmt,

            shipping: calc.shipping,
            fees: modalData.fees,

            cashierId: modalData.cashier.id,
            cashierName: modalData.cashier.name,
            cashierEmail: modalData.cashier.email || null,

            customerId: modalData.customer.id || null,
            customerName: modalData.customer.name,
            customerEmail: modalData.customer.email || null,
        });
    }

    async _loadStaff(forceRefresh = false) {
        const refreshBtn = this.container.querySelector('#posRefreshStaffBtn');
        const selectEl = this.container.querySelector('#posCashier');

        try {
            if (refreshBtn) refreshBtn.style.opacity = '0.5';
            if (selectEl && forceRefresh) selectEl.innerHTML = `<option value="">Refreshing...</option>`;

            const res = await API.getWCStaff(forceRefresh);

            if (res?.status === 'success' && res.data?.length) {
                this.modal.setStaff(res.data, false);
            } else {
                throw new Error('Empty staff response');
            }
        } catch(e) {
            console.error('Staff Load Error:', e);
            // Fallback to text input with the red error styling
            this.modal.setStaff([], true);
        } finally {
            if (refreshBtn) refreshBtn.style.opacity = '1';
        }
    }

    _html() {
        return `
        <div class="pos-payment-panel">
            <div class="pos-pp-section pos-pp-section--compact">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="flex: 1; min-width: 0; text-align: right;">
                        <div id="posActiveCustomer" class="pos-active-customer"></div>
                        <div class="pos-totals-grid">
                            <div class="pos-trow"><span>Subtotal</span><span id="posSubtotal">0 Frw</span></div>
                            <div id="posDynamicTotals" class="pos-dynamic-totals"></div>
                            <div class="pos-trow pos-trow--total"><span>Total</span><span id="posTotal">0 Frw</span></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="pos-pp-section pos-pp-section--methods">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <button id="posOpenSettingsBtn" type="button" class="pos-settings-btn-icon" title="Order Details & Adjustments">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        Settings
                    </button>
                    <div class="pos-live-cart-status" id="posLiveCartStatus">
                        <span class="pos-live-dot"></span>
                        <span class="pos-live-text">Live: Off</span>
                    </div>
                    <div class="pos-methods-row" id="posPaymentMethods"></div>
                </div>
            </div>

            <div class="pos-pp-section pos-pp-section--checkout pos-pp-section--checkout-flex">
                <button id="posVoidBtn" class="pos-void-btn" disabled>
                    Void
                </button>
                <button id="posQuoteBtn" class="pos-quote-btn" disabled>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Quote
                </button>
                <button id="posCheckoutBtn" class="pos-checkout-btn" disabled>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16"><polyline points="20 6 9 17 4 12"/></svg>
                    Charge
                </button>
            </div>
        </div>`;
    }
}

module.exports = POSPaymentPanel;