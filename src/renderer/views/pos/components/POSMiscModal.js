/**
 * POSMiscModal — Modal for adding miscellaneous/custom products to cart
 */
class POSMiscModal {
    constructor({ onConfirm, onCancel }) {
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
        this.modalEl = null;
    }

    show() {
        if (!this.modalEl) {
            this._createModal();
        }
        this.modalEl.style.display = 'flex';
        requestAnimationFrame(() => this.modalEl.classList.add('pos-misc-overlay--in'));
        
        // Focus on name input
        setTimeout(() => {
            const nameInput = this.modalEl.querySelector('#posMiscName');
            if (nameInput) nameInput.focus();
        }, 100);
        
        // Add Escape key handler
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    hide() {
        if (!this.modalEl) return;
        this.modalEl.classList.remove('pos-misc-overlay--in');
        setTimeout(() => {
            this.modalEl.style.display = 'none';
            this._resetForm();
        }, 250);
        
        // Remove Escape key handler
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
            this._escapeHandler = null;
        }
    }

    _createModal() {
        const container = document.createElement('div');
        container.innerHTML = this._html();
        document.body.appendChild(container);
        this.modalEl = container.querySelector('#posMiscModalOverlay');
        this._bindEvents();
    }

    _resetForm() {
        const nameInput = this.modalEl.querySelector('#posMiscName');
        const priceInput = this.modalEl.querySelector('#posMiscPrice');
        const qtyInput = this.modalEl.querySelector('#posMiscQty');
        const notesInput = this.modalEl.querySelector('#posMiscNotes');
        
        if (nameInput) nameInput.value = '';
        if (priceInput) priceInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        if (notesInput) notesInput.value = '';
    }

    _bindEvents() {
        const closeBtn = this.modalEl.querySelector('#posMiscCloseBtn');
        const cancelBtn = this.modalEl.querySelector('#posMiscCancelBtn');
        const confirmBtn = this.modalEl.querySelector('#posMiscConfirmBtn');

        closeBtn.addEventListener('click', () => this.hide());
        cancelBtn.addEventListener('click', () => this.hide());

        confirmBtn.addEventListener('click', () => this._handleConfirm());

        // Enter key to confirm
        this.modalEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._handleConfirm();
            }
        });
    }

    _handleConfirm() {
        const name = this.modalEl.querySelector('#posMiscName').value.trim();
        const price = parseFloat(this.modalEl.querySelector('#posMiscPrice').value) || 0;
        const qty = parseInt(this.modalEl.querySelector('#posMiscQty').value) || 1;
        const notes = this.modalEl.querySelector('#posMiscNotes').value.trim();

        // Validation
        if (!name) {
            this.modalEl.querySelector('#posMiscName').focus();
            return;
        }

        if (price <= 0) {
            this.modalEl.querySelector('#posMiscPrice').focus();
            return;
        }

        if (qty < 1) {
            this.modalEl.querySelector('#posMiscQty').value = 1;
            return;
        }

        this.onConfirm({
            name,
            price,
            qty,
            notes
        });

        this.hide();
    }

    _html() {
        return `
        <div id="posMiscModalOverlay" class="pos-misc-overlay" style="display:none;">
            <div class="pos-misc-modal">
                <div class="pos-misc-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    <span>Add Miscellaneous Item</span>
                    <button id="posMiscCloseBtn" class="pos-misc-close">×</button>
                </div>
                
                <div class="pos-misc-body">
                    <div class="pos-misc-field-group">
                        <label class="pos-misc-label">Item Name *</label>
                        <input type="text" id="posMiscName" class="pos-misc-input" placeholder="e.g., Service fee, Custom item..." autocomplete="off">
                    </div>
                    
                    <div class="pos-misc-row">
                        <div class="pos-misc-field-group">
                            <label class="pos-misc-label">Price (Frw) *</label>
                            <input type="number" id="posMiscPrice" class="pos-misc-input" placeholder="0" min="0" step="1">
                        </div>
                        <div class="pos-misc-field-group">
                            <label class="pos-misc-label">Quantity</label>
                            <input type="number" id="posMiscQty" class="pos-misc-input" value="1" min="1" step="1">
                        </div>
                    </div>
                    
                    <div class="pos-misc-field-group">
                        <label class="pos-misc-label">Notes (optional)</label>
                        <textarea id="posMiscNotes" class="pos-misc-input pos-misc-textarea" placeholder="Additional details..." rows="2"></textarea>
                    </div>
                </div>
                
                <div class="pos-misc-footer">
                    <button id="posMiscCancelBtn" class="pos-misc-btn pos-misc-btn--cancel">Cancel</button>
                    <button id="posMiscConfirmBtn" class="pos-misc-btn pos-misc-btn--confirm">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>`;
    }
}

module.exports = POSMiscModal;
