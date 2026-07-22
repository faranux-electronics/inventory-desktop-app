/**
 * POSReceipt — post-sale receipt modal that lets the cashier choose to
 * print or download the PDF receipt.
 */
const PdfGenerator = require('../../../utils/PdfGenerator');
const ThermalPdfGenerator = require('../../../utils/ThermalPdfGenerator');

class POSReceipt {
    constructor({ onNewSale }) {
        this.onNewSale = onNewSale;
    }

    async show(data) {
        // Clear any existing overlays
        document.getElementById('posReceiptOverlay')?.remove();

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

                <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
                    How would you like the receipt?
                </p>

                <div style="display: flex; gap: 12px; flex-direction: column;">
                    <button class="rpt-btn" id="rptPrintBtn" style="background: #932013; color: white; border: none; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" style="margin-right: 8px;">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        <span class="rpt-btn-label">Print Receipt (A4)</span>
                    </button>

                    <button class="rpt-btn" id="rptThermalPrintBtn" style="background: #1f2937; color: white; border: none; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" style="margin-right: 8px;">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        <span class="rpt-btn-label">Print Receipt (Thermal)</span>
                    </button>

                    <button class="rpt-btn" id="rptDownloadBtn" style="background: white; color: #374151; border: 1px solid #d1d5db; padding: 10px; font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" style="margin-right: 8px;">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        <span class="rpt-btn-label">Download PDF</span>
                    </button>

                    <button class="rpt-btn" id="rptNewSaleBtn" style="background: none; color: #932013; border: none; padding: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                        Skip &amp; Start New Sale
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

        const printBtn = overlay.querySelector('#rptPrintBtn');
        const thermalPrintBtn = overlay.querySelector('#rptThermalPrintBtn');
        const downloadBtn = overlay.querySelector('#rptDownloadBtn');
        const newSaleBtn = overlay.querySelector('#rptNewSaleBtn');

        // Print — opens the PDF in a viewer with the print dialog triggered.
        // Modal stays open so the cashier can also download afterward if needed.
        printBtn.addEventListener('click', async () => {
            const label = printBtn.querySelector('.rpt-btn-label');
            const originalText = label.textContent;
            printBtn.disabled = true;
            label.textContent = 'Preparing…';
            try {
                await PdfGenerator.printReceiptPDF(data);
            } catch (err) {
                console.error('Print failed:', err);
                label.textContent = 'Print failed — try again';
                setTimeout(() => { label.textContent = originalText; }, 2000);
            } finally {
                printBtn.disabled = false;
                if (label.textContent === 'Preparing…') label.textContent = originalText;
            }
        });

        // Thermal Print
        thermalPrintBtn.addEventListener('click', async () => {
            const label = thermalPrintBtn.querySelector('.rpt-btn-label');
            const originalText = label.textContent;
            thermalPrintBtn.disabled = true;
            label.textContent = 'Preparing…';
            try {
                await ThermalPdfGenerator.printThermalReceiptPDF(data);
            } catch (err) {
                console.error('Thermal Print failed:', err);
                label.textContent = 'Print failed — try again';
                setTimeout(() => { label.textContent = originalText; }, 2000);
            } finally {
                thermalPrintBtn.disabled = false;
                if (label.textContent === 'Preparing…') label.textContent = originalText;
            }
        });

        // Download — saves the PDF file to disk
        downloadBtn.addEventListener('click', async () => {
            const label = downloadBtn.querySelector('.rpt-btn-label');
            const originalText = label.textContent;
            downloadBtn.disabled = true;
            label.textContent = 'Preparing…';
            try {
                await PdfGenerator.downloadReceiptPDF(data);
            } catch (err) {
                console.error('Download failed:', err);
                label.textContent = 'Download failed — try again';
                setTimeout(() => { label.textContent = originalText; }, 2000);
            } finally {
                downloadBtn.disabled = false;
                if (label.textContent === 'Preparing…') label.textContent = originalText;
            }
        });

        // Skip / start new sale — closes without generating anything
        newSaleBtn.addEventListener('click', handleClose);
    }
}

module.exports = POSReceipt;