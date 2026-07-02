/**
 * POSReceipt — post-sale receipt modal that triggers PDF generation
 */
const PdfGenerator = require('../../../utils/PdfGenerator');

class POSReceipt {
    constructor({onNewSale}) {
        this.onNewSale = onNewSale;
    }

    async show(data) {
        // 1. Immediately generate and download the PDF Receipt
        await PdfGenerator.generateReceiptPDF(data);

        // 2. Clear any existing overlays
        document.getElementById('posReceiptOverlay')?.remove();

        // 3. Show a simplified success prompt
        const overlay = document.createElement('div');
        overlay.id = 'posReceiptOverlay';
        overlay.className = 'rpt-overlay';

        overlay.innerHTML = `
            <div class="rpt-modal" role="dialog" style="max-width: 380px; text-align: center; padding: 32px 24px;">
                <div style="color: #15803d; margin-bottom: 16px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="64" style="margin: 0 auto; display: block;">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                
                <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 8px; color: #1f2937;">Sale Completed!</h2>
                
                ${data.wcOrderId
            ? `<span style="display: inline-block; background: #f3f4f6; color: #4b5563; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: bold; margin-bottom: 16px;">Order #${data.wcOrderId}</span>`
            : ''}
                
                <p style="color: #6b7280; font-size: 14px; margin-bottom: 28px;">
                    The A4 receipt PDF has been generated and downloaded successfully.
                </p>

                <div style="display: flex; gap: 12px; flex-direction: column;">
                    <button class="rpt-btn" id="rptNewSaleBtn" style="background: #932013; color: white; border: none; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" style="margin-right: 8px;">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Start New Sale
                    </button>
                    
                    <button class="rpt-btn" id="rptPrintBtn" style="background: white; color: #374151; border: 1px solid #d1d5db; padding: 10px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" style="margin-right: 8px;">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        Re-Download Receipt
                    </button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('rpt-overlay--in'));

        // Add Escape key handler
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Handle closing
        const handleClose = () => {
            document.removeEventListener('keydown', escapeHandler);
            overlay.classList.remove('rpt-overlay--in');
            setTimeout(() => {
                overlay.remove();
                this.onNewSale();
            }, 230);
        };

        overlay.querySelector('#rptNewSaleBtn').addEventListener('click', handleClose);

        // Trigger manual reprint if needed
        overlay.querySelector('#rptPrintBtn').addEventListener('click', async () => {
            await PdfGenerator.generateReceiptPDF(data);
        });
    }
}

module.exports = POSReceipt;