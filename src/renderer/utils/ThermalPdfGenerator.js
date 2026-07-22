const PdfGenerator = require('./PdfGenerator');
const FARANUX_LOGO_BASE64 = PdfGenerator.FARANUX_LOGO_BASE64;

class ThermalPdfGenerator {
    /**
     * Builds the thermal receipt jsPDF document WITHOUT saving/downloading it.
     * Returns { doc, receiptId } so callers decide what to do with it.
     */
    static async _buildReceiptDoc(data) {
        let jsPDF;
        let autoTable;

        try {
            jsPDF = require('jspdf').jsPDF;
            autoTable = require('jspdf-autotable');

            if (autoTable && typeof autoTable !== 'function' && autoTable.default) {
                autoTable = autoTable.default;
            }
        } catch (e) {
            throw new Error("PDF libraries missing. Please run: npm install jspdf jspdf-autotable");
        }

        // Calculate dynamic height for 80mm thermal receipt
        let dynamicY = 70; // Exact height of all header/customer elements
        dynamicY += 8; // Table header

        (data.items || []).forEach(i => {
            // roughly 26mm cell width for item name. 8pt font -> ~18 chars max per line
            const lines = Math.ceil((i.name.length || 1) / 18);
            dynamicY += (lines * 3.5) + 2.5; // exact row height estimation
        });

        dynamicY += 10; // After table padding
        dynamicY += 5; // Subtotal
        if (data.discount > 0) dynamicY += 5;
        if (data.shipping > 0) dynamicY += 5;
        (data.fees || []).filter(f => f.amount > 0).forEach(f => { dynamicY += 5; });
        if (data.taxAmount > 0) dynamicY += 5;
        dynamicY += 6; // Total paid gap + thick line
        
        if (data.notes) {
            const noteLines = Math.ceil(data.notes.length / 40);
            dynamicY += (noteLines * 4) + 4;
        }
        
        dynamicY += 15; // Footer (****)
        dynamicY += 5; // Bottom margin safety

        const totalHeight = Math.ceil(dynamicY);

        // 80mm width paper, length dynamically calculated
        const doc = new jsPDF({ format: [80, Math.max(totalHeight, 150)], unit: 'mm' });
        
        const darkText = [0, 0, 0];
        const lightText = [50, 50, 50];
        const borderColor = [100, 100, 100];
        
        const centerX = 40; // Center of 80mm
        
        let currentY = 10;

        // --- 1. Document Header ---
        try {
            if (FARANUX_LOGO_BASE64 && FARANUX_LOGO_BASE64.length > 100) {
                const grayscaleLogo = await new Promise((resolve) => {
                    const img = new window.Image();
                    img.onload = () => {
                        const canvas = window.document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        for (let i = 0; i < imgData.data.length; i += 4) {
                            const gray = 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
                            imgData.data[i] = gray;
                            imgData.data[i + 1] = gray;
                            imgData.data[i + 2] = gray;
                        }
                        ctx.putImageData(imgData, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    };
                    img.onerror = () => resolve(FARANUX_LOGO_BASE64);
                    img.src = FARANUX_LOGO_BASE64;
                });
                // Width 40, Height 17 -> Center it at X: 20
                doc.addImage(grayscaleLogo, 'PNG', 20, currentY, 40, 17);
                currentY += 25;
            }
        } catch (e) {
            console.warn("Failed to load logo into PDF", e);
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...darkText);
        doc.text("INTERNAL RECEIPT", centerX, currentY, { align: 'center' });
        currentY += 6;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-RW', { year: 'numeric', month: 'short', day: '2-digit' });
        const timeStr = now.toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit' });
        const receiptId = data.wcOrderId ? `WC-${data.wcOrderId}` : 'POS-' + Date.now().toString(36).toUpperCase();

        doc.setTextColor(...lightText);
        doc.text(`Receipt No: ${receiptId}`, centerX, currentY, { align: 'center' });
        currentY += 5;
        doc.text(`Date: ${dateStr} ${timeStr}`, centerX, currentY, { align: 'center' });
        currentY += 5;
        
        // Divider Line
        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.5);
        doc.line(4, currentY, 76, currentY);
        currentY += 5;

        // --- 2. Details ---
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...darkText);
        const custName = (data.customerName && data.customerName.toLowerCase() !== 'walk-in')
            ? data.customerName
            : 'Walk-in Customer';
        doc.text(`Customer: ${custName}`, 4, currentY);
        currentY += 4;
        
        doc.setFontSize(8);
        doc.setTextColor(...lightText);
        doc.text(`Cashier: ${data.cashierName || 'Admin'}`, 4, currentY);
        currentY += 4;
        doc.text(`Payment: ${data.paymentMethod ? data.paymentMethod.toUpperCase() : 'CASH'}`, 4, currentY);
        currentY += 6;

        // --- 3. Table Data ---
        const tableBody = data.items.map(i => {
            return [
                i.sku || '-',
                i.name,
                i.qty.toString(),
                (i.price * i.qty).toLocaleString()
            ];
        });

        autoTable(doc, {
            startY: currentY,
            head: [['SKU', 'Item', 'Qty', 'Total']],
            body: tableBody,
            theme: 'plain',
            headStyles: {
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                fillColor: false,
                lineWidth: { bottom: 0.5 },
                lineColor: [0, 0, 0]
            },
            bodyStyles: {
                textColor: [0, 0, 0]
            },
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: { top: 1, bottom: 1, left: 1, right: 1 }
            },
            columnStyles: {
                0: { cellWidth: 18 },
                1: { cellWidth: 26 },
                2: { halign: 'center', cellWidth: 8 },
                3: { halign: 'right', fontStyle: 'bold', cellWidth: 20 }
            },
            margin: { left: 4, right: 4 }
        });

        currentY = doc.lastAutoTable.finalY + 5;

        // --- 4. Totals ---
        const addTotalRow = (label, amount, isBold = false) => {
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            doc.setFontSize(isBold ? 10 : 9);
            doc.setTextColor(...(isBold ? darkText : lightText));
            doc.text(label, 45, currentY, { align: 'right' });
            doc.text(`${amount.toLocaleString()}`, 76, currentY, { align: 'right' });
            currentY += 5;
        };

        doc.setDrawColor(...borderColor);
        doc.line(4, currentY - 3, 76, currentY - 3);

        addTotalRow("Subtotal:", data.subtotal || 0);

        if (data.discount > 0) {
            addTotalRow("Discount:", `-${data.discount}`);
        }

        if (data.shipping > 0) {
            addTotalRow("Shipping:", data.shipping);
        }

        (data.fees || []).filter(f => f.amount > 0).forEach(f => {
            addTotalRow(`${f.label || 'Fee'}:`, f.amount);
        });

        if (data.taxAmount > 0) {
            addTotalRow(`Tax (${data.taxRate}%):`, data.taxAmount);
        }

        // Thick divider for Total Paid
        currentY += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(40, currentY - 4, 76, currentY - 4);

        addTotalRow("TOTAL PAID:", data.total || 0, true);
        currentY += 2;

        // Render Notes
        if (data.notes) {
            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(...lightText);
            const splitNotes = doc.splitTextToSize(`Notes: ${data.notes}`, 72);
            doc.text(splitNotes, 4, currentY);
            currentY += (splitNotes.length * 4) + 4;
        }

        // --- 5. Footer ---
        currentY += 5;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...darkText);
        doc.text("*".repeat(40), centerX, currentY, { align: 'center' });
        currentY += 5;

        return { doc, receiptId };
    }

    /**
     * Prints the receipt by opening it in the system's default browser.
     */
    static async printThermalReceiptPDF(data) {
        const { ipcRenderer } = require('electron');
        const { doc, receiptId } = await this._buildReceiptDoc(data);

        doc.autoPrint();
        const arrayBuffer = doc.output('arraybuffer');

        const result = await ipcRenderer.invoke('open-pdf-in-browser', {
            buffer: arrayBuffer,
            filename: `Thermal_Receipt_${receiptId}.pdf`
        });

        if (!result || !result.success) {
            throw new Error(result?.error || 'Failed to open receipt in browser');
        }
    }
}

module.exports = ThermalPdfGenerator;
