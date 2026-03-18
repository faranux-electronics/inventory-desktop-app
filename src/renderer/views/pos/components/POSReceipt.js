/**
 * POSReceipt — post-sale receipt modal with full breakdown
 */
class POSReceipt {
    constructor({ onNewSale }) { this.onNewSale = onNewSale; }

    show({ items=[], subtotal=0, discount=0, discountType='value', total=0,
             paymentMethod='cash', notes='', branchName='', wcOrderId=null,
             cashierName='', customerName='', customerEmail='',
             taxRate=0, taxName='Tax', taxInclusive=false, taxAmount=0,
             fees=[], shipping=0 }) {
        document.getElementById('posReceiptOverlay')?.remove();

        const now      = new Date();
        const dateStr  = now.toLocaleDateString('en-RW', { year:'numeric', month:'short', day:'2-digit' });
        const timeStr  = now.toLocaleTimeString('en-RW', { hour:'2-digit', minute:'2-digit' });
        const receiptId = 'POS-' + Date.now().toString(36).toUpperCase();

        const itemRows = items.map(i => `
            <tr>
                <td class="rpt-td">${i.name}</td>
                <td class="rpt-td rpt-td--c">${i.qty}</td>
                <td class="rpt-td rpt-td--r">${(i.price * i.qty).toLocaleString()}</td>
            </tr>`).join('');

        const feeRows = (fees || []).filter(f => f.amount > 0).map(f => `
            <div class="rpt-trow"><span>${f.label || 'Fee'}</span><span>+ ${(+f.amount).toLocaleString()} Frw</span></div>`).join('');

        const discLabel = discountType === 'percent' ? `Discount` : 'Discount';

        const overlay = document.createElement('div');
        overlay.id = 'posReceiptOverlay';
        overlay.className = 'rpt-overlay';
        overlay.innerHTML = `
            <div class="rpt-modal" role="dialog">
                <div class="rpt-success-bar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="22"><polyline points="20 6 9 17 4 12"/></svg>
                    Sale Completed!
                    ${wcOrderId ? `<span class="rpt-wc-badge">WC #${wcOrderId}</span>` : ''}
                </div>
                <div class="rpt-paper" id="rptPrintable">
                    <div class="rpt-paper-header">
                        <p class="rpt-title">RECEIPT</p>
                        ${branchName ? `<p class="rpt-branch">${branchName}</p>` : ''}
                        <p class="rpt-meta">${dateStr} &nbsp;·&nbsp; ${timeStr}</p>
                        <p class="rpt-id">${receiptId}</p>
                        ${cashierName ? `<p class="rpt-meta" style="margin-top:6px;"><strong>Cashier:</strong> ${cashierName}</p>` : ''}
                        ${customerName && customerName.toLowerCase() !== 'walk-in'
            ? `<p class="rpt-meta"><strong>Customer:</strong> ${customerName}${customerEmail ? ' · ' + customerEmail : ''}</p>`
            : ''}
                    </div>
                    <table class="rpt-table">
                        <thead><tr>
                            <th class="rpt-th">Item</th>
                            <th class="rpt-th rpt-td--c">Qty</th>
                            <th class="rpt-th rpt-td--r">Total (Frw)</th>
                        </tr></thead>
                        <tbody>${itemRows}</tbody>
                    </table>
                    <hr class="rpt-divider">
                    <div class="rpt-totals">
                        <div class="rpt-trow"><span>Subtotal</span><span>${subtotal.toLocaleString()} Frw</span></div>
                        ${discount > 0 ? `<div class="rpt-trow rpt-trow--disc"><span>${discLabel}</span><span>− ${discount.toLocaleString()} Frw</span></div>` : ''}
                        ${shipping > 0 ? `<div class="rpt-trow"><span>Shipping</span><span>+ ${shipping.toLocaleString()} Frw</span></div>` : ''}
                        ${feeRows}
                        ${taxAmount > 0 ? `<div class="rpt-trow rpt-trow--tax"><span>${taxName} (${taxRate}% ${taxInclusive ? 'incl' : 'excl'})</span><span>${taxAmount.toLocaleString()} Frw</span></div>` : ''}
                        <div class="rpt-trow rpt-trow--total"><span>TOTAL PAID</span><span>${total.toLocaleString()} Frw</span></div>
                        <div class="rpt-trow rpt-trow--method"><span>Payment</span><span>${paymentMethod.toUpperCase()}</span></div>
                        ${notes ? `<div class="rpt-trow rpt-trow--notes"><span>Notes</span><span>${notes}</span></div>` : ''}
                    </div>
                    <p class="rpt-footer">Thank you for your purchase!</p>
                </div>
                <div class="rpt-actions">
                    <button class="rpt-btn rpt-btn--print" id="rptPrintBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Print
                    </button>
                    <button class="rpt-btn rpt-btn--new" id="rptNewSaleBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New Sale
                    </button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('rpt-overlay--in'));

        const close = () => {
            overlay.classList.remove('rpt-overlay--in');
            setTimeout(() => { overlay.remove(); this.onNewSale(); }, 230);
        };
        overlay.querySelector('#rptNewSaleBtn').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        overlay.querySelector('#rptPrintBtn').addEventListener('click', () => {
            const html = document.getElementById('rptPrintable').innerHTML;
            const w = window.open('', '_blank', 'width=380,height=620');
            w.document.write(`<html lang="en"><head><title>Receipt</title><style>
                body{font-family:monospace;font-size:12px;padding:16px;color:#111;}
                table{width:100%;border-collapse:collapse;}
                th,td{padding:4px 2px;border-bottom:1px dashed #ccc;font-size:12px;}
                .rpt-td--c,.rpt-th.rpt-td--c{text-align:center;}
                .rpt-td--r,.rpt-th.rpt-td--r{text-align:right;}
                .rpt-divider{border:none;border-top:1px dashed #999;margin:10px 0;}
                .rpt-title{font-size:18px;font-weight:900;text-align:center;letter-spacing:4px;}
                .rpt-paper-header{text-align:center;margin-bottom:12px;}
                .rpt-trow{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}
                .rpt-trow--total{font-weight:800;font-size:14px;border-top:2px solid #111;padding-top:6px;}
                .rpt-footer{text-align:center;color:#888;font-size:10px;margin-top:12px;}
                @media print{@page{margin:4mm;}}
            </style></head><body>${html}</body></html>`);
            w.print();
        });
    }
}

module.exports = POSReceipt;