/**
 * POSConfirmModal — full order summary with fees, tax mode, shipping
 */
class POSConfirmModal {
    constructor({ onConfirm, onCancel }) {
        this.onConfirm = onConfirm;
        this.onCancel  = onCancel;
    }

    show(data) {
        document.getElementById('posConfirmOverlay')?.remove();
        const { items=[], paymentMethod='cash', discount=0, discountType='value', discountRaw=0,
            notes='', subtotal=0, total=0, cashierName='', cashierEmail='',
            customerName='', customerEmail='', taxRate=0, taxName='Tax', taxInclusive=false,
            taxOnItems=false, taxAmount=0, fees=[], shipping=0, taxOn=false } = data;

        // When per-item tax is active, show tax-adjusted prices in the items table
        const showItemTax = taxOn && taxOnItems && taxRate > 0 && !taxInclusive;
        const itemRows = items.map(i => {
            const taxedUnit  = showItemTax ? Math.round(i.price * (1 + taxRate / 100)) : i.price;
            const lineTotal  = taxedUnit * i.qty;

            return `<tr>
        <td class="pcm-td">
            <strong>${i.name}</strong>
            ${i.sku ? `<div style="font-size:10.5px;color:#6b7280;margin-top:3px;">SKU: ${i.sku}</div>` : ''}
        </td>
        <td class="pcm-td pcm-td--c">${i.qty}</td>
        <td class="pcm-td pcm-td--r">${taxedUnit.toLocaleString()} Frw</td>
        <td class="pcm-td pcm-td--r"><strong>${lineTotal.toLocaleString()} Frw</strong></td>
    </tr>`;
        }).join('');

        const discLabel = discountType === 'percent' ? `Discount (${discountRaw}%)` : 'Discount';
        const feeRows   = fees.filter(f=>+f.amount!==0).map(f=>`
            <div class="pcm-sum-row pcm-sum-row--fee"><span>${f.label||'Fee'}</span><span>+ ${(+f.amount).toLocaleString()} Frw</span></div>`).join('');

        const taxLabel = taxAmount > 0
            ? `${taxName} (${taxRate}%, ${taxOnItems ? 'per item' : 'on total'}, ${taxInclusive ? 'incl.' : 'excl.'})`
            : '';

        const overlay = document.createElement('div');
        overlay.id = 'posConfirmOverlay';
        overlay.className = 'pcm-overlay';
        overlay.innerHTML = `
            <div class="pcm-modal" role="dialog" aria-modal="true">
                <div class="pcm-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
                    Confirm Sale
                    <button class="pcm-close" id="pcmClose">&times;</button>
                </div>
                <div class="pcm-body">
                    <div>
                        <p class="pcm-section-label">Items</p>
                        <table class="pcm-table">
                            <thead><tr>
                                <th class="pcm-th">Product</th><th class="pcm-th pcm-td--c">Qty</th>
                                <th class="pcm-th pcm-td--r">Unit</th><th class="pcm-th pcm-td--r">Total (Frw)</th>
                            </tr></thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                    </div>
                    <div>
                        <p class="pcm-section-label">Summary</p>
                        <div class="pcm-summary">
                            <div class="pcm-sum-row"><span>Subtotal</span><span>${subtotal.toLocaleString()} Frw</span></div>
                            ${discount>0?`<div class="pcm-sum-row pcm-sum-row--disc"><span>${discLabel}</span><span>− ${discount.toLocaleString()} Frw</span></div>`:''}
                            ${shipping>0?`<div class="pcm-sum-row pcm-sum-row--ship"><span>Shipping</span><span>+ ${shipping.toLocaleString()} Frw</span></div>`:''}
                            ${feeRows}
                            ${taxAmount>0?`<div class="pcm-sum-row pcm-sum-row--tax"><span>${taxLabel}</span><span>${taxInclusive?'':'+ '}${taxAmount.toLocaleString()} Frw</span></div>`:''}
                            <div class="pcm-sum-row pcm-sum-row--total pcm-sum-row--divider"><span>Total</span><span>${total.toLocaleString()} Frw</span></div>
                        </div>
                    </div>
                    <div>
                        <p class="pcm-section-label">Order Details</p>
                        <div class="pcm-summary">
                            <div class="pcm-sum-row pcm-sum-row--method"><span>Payment</span><span><strong>${paymentMethod.replace(/_/g,' ').toUpperCase()}</strong></span></div>
                            <div class="pcm-sum-row pcm-sum-row--method"><span>Cashier</span><span>${cashierName||'—'}${cashierEmail?` <span style="color:#9ca3af;font-size:10px;">${cashierEmail}</span>`:''}</span></div>
                            <div class="pcm-sum-row pcm-sum-row--method"><span>Customer</span><span>${customerName}${customerEmail?` <span style="color:#9ca3af;font-size:10px;">${customerEmail}</span>`:''}</span></div>
                        </div>
                    </div>
                    ${notes?`<div class="pcm-notes"><p class="pcm-section-label">Notes</p><p class="pcm-notes-text">${notes}</p></div>`:''}
                </div>
                <div class="pcm-footer">
                    <button class="pcm-btn pcm-btn--cancel" id="pcmCancelBtn">Cancel</button>
                    <button class="pcm-btn pcm-btn--confirm" id="pcmConfirmBtn">Confirm &amp; Process</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('pcm-overlay--in'));

        // Add Escape key handler
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };
        document.addEventListener('keydown', escapeHandler);

        const handleClose = () => {
            document.removeEventListener('keydown', escapeHandler);
            overlay.classList.remove('pcm-overlay--in');
            setTimeout(() => { overlay.remove(); this.onCancel(); }, 220);
        };
        
        overlay.querySelector('#pcmClose').addEventListener('click', handleClose);
        overlay.querySelector('#pcmCancelBtn').addEventListener('click', handleClose);
        overlay.querySelector('#pcmConfirmBtn').addEventListener('click', () => {
            document.removeEventListener('keydown', escapeHandler);
            overlay.classList.remove('pcm-overlay--in');
            setTimeout(() => { overlay.remove(); this.onConfirm(data); }, 220);
        });
    }
}
module.exports = POSConfirmModal;