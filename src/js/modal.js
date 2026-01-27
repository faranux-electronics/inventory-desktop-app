const api = require('./api.js');
const state = require('./state.js');
const toast = require('./toast.js');

let mode = 'single';
let targetData = null;
let onSuccessCallback = null;

module.exports = {
    init: () => {
        if (document.getElementById('transferModal')) return;

        const modalHtml = `
        <div id="transferModal" class="modal">
            <div class="modal-content" style="width:500px;">
                <h3 id="modalTitle">Transfer Stock</h3>
                <div id="modalDesc" style="margin-bottom:15px;color:#666;font-size:0.9em;"></div>

                <div style="display:flex;gap:10px;">
                    <div class="form-group" style="flex:1;">
                        <label>From:</label>
                        <select id="tFrom"></select>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>To:</label>
                        <select id="tTo"></select>
                    </div>
                </div>

                <div id="transferBody"></div>

                <div class="modal-actions">
                    <button class="btn btn-secondary" id="btnCancelModal">Cancel</button>
                    <button class="btn btn-primary" id="btnConfirmTransfer">Confirm</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('btnCancelModal').onclick = closeModal;
        document.getElementById('btnConfirmTransfer').onclick = handleConfirm;
    },

    open: async (transferMode, data, onSuccess) => {
        mode = transferMode;
        targetData = data;
        onSuccessCallback = onSuccess;

        const modal = document.getElementById('transferModal');
        const locations = await state.loadLocations();

        setupDropdowns(locations);
        setupBody(locations);

        modal.style.display = 'flex';
    }
};

/* =========================
   UI HELPERS
========================= */

function closeModal() {
    document.getElementById('transferModal').style.display = 'none';
}

function setModalDisabled(disabled) {
    document.querySelectorAll('#transferModal input, #transferModal select, #transferModal button')
        .forEach(el => el.disabled = disabled);
}

/* =========================
   DROPDOWNS
========================= */

function setupDropdowns(locations) {
    const toSelect = document.getElementById('tTo');
    const fromSelect = document.getElementById('tFrom');

    let options = `<option value="0">Unassigned / Main Warehouse</option>`;
    locations.forEach(l => options += `<option value="${l.id}">${l.name}</option>`);

    toSelect.innerHTML = options;

    if (mode === 'single') {
        let fromOptions = '';
        const mainQty = getStock(targetData, 0);
        fromOptions += `<option value="0" ${mainQty > 0 ? '' : 'disabled'}>Main (${mainQty})</option>`;

        locations.forEach(l => {
            const qty = getStock(targetData, l.id);
            fromOptions += `<option value="${l.id}" ${qty > 0 ? '' : 'disabled'}>${l.name} (${qty})</option>`;
        });

        fromSelect.innerHTML = fromOptions;
    } else {
        fromSelect.innerHTML = options;
    }
}

/* =========================
   BODY CONTENT
========================= */

function setupBody() {
    const bodyDiv = document.getElementById('transferBody');

    if (mode === 'single') {
        document.getElementById('modalTitle').innerText = "Transfer Item";
        document.getElementById('modalDesc').innerText = targetData.name;

        bodyDiv.innerHTML = `
            <div class="form-group">
                <label>Quantity:</label>
                <input type="number" id="tQty" value="1" min="1" style="width:100%;">
            </div>`;
    } else {
        document.getElementById('modalTitle').innerText = "Bulk Transfer";
        document.getElementById('modalDesc').innerText = `Moving ${targetData.length} items.`;

        // Render List with Checkboxes
        bodyDiv.innerHTML = targetData.map(p => `
            <div class="bulk-item" id="row-${p.id}">
                <input type="checkbox" class="bulk-check" data-id="${p.id}" checked style="margin-right:10px; cursor:pointer;">
                
                <div class="bulk-name">${p.name}</div>
                <div class="bulk-meta">SKU: ${p.sku || '-'}</div>
                <input type="number" class="bulk-qty-input" id="qty-${p.id}" data-id="${p.id}" value="1" min="1">
            </div>
        `).join('');

        // Add Toggle Logic (Disable Input when Unchecked)
        document.querySelectorAll('.bulk-check').forEach(cb => {
            cb.onchange = (e) => {
                const id = e.target.dataset.id;
                const row = document.getElementById(`row-${id}`);
                const qtyInput = document.getElementById(`qty-${id}`);

                if (e.target.checked) {
                    row.style.opacity = '1';
                    qtyInput.disabled = false;
                } else {
                    row.style.opacity = '0.5';
                    qtyInput.disabled = true;
                }
            };
        });
    }
}

/* =========================
   CONFIRM HANDLER
========================= */

async function handleConfirm() {
    const fromId = document.getElementById('tFrom').value;
    const toId = document.getElementById('tTo').value;
    const btn = document.getElementById('btnConfirmTransfer');

    if (fromId === toId) return alert("Source and Destination cannot be the same.");

    try {
        setModalDisabled(true);
        btn.innerText = "Processing...";

        let res;

        if (mode === 'single') {
            const qty = parseInt(document.getElementById('tQty').value);
            if (!qty || qty <= 0) throw new Error("Invalid Quantity");

            res = await api.transfer({
                product_id: targetData.id,
                from_id: fromId,
                to_id: toId,
                qty
            });
        } else {
            const items = [];

            // Loop through all Bulk Item Rows
            document.querySelectorAll('.bulk-item').forEach(row => {
                const checkbox = row.querySelector('.bulk-check');
                const input = row.querySelector('.bulk-qty-input');

                // ONLY Process if Checkbox is CHECKED
                if (checkbox && checkbox.checked) {
                    const q = parseInt(input.value);
                    if (q > 0) {
                        items.push({
                            product_id: parseInt(input.dataset.id),
                            from_id: fromId,
                            to_id: toId,
                            qty: q
                        });
                    }
                }
            });

            if (!items.length) throw new Error("No items selected or quantities are zero.");
            res = await api.bulkTransfer(items);
        }

        if (res.status === 'success') {
            toast.show("Transfer Successful!", "success");
            closeModal();
            if (onSuccessCallback) await onSuccessCallback();
        } else {
            toast.show("Error: " + res.message, "error");
        }

    } catch (e) {
        toast.show("System Error: " + e.message, "error");
    } finally {
        btn.innerText = "Confirm";
        requestAnimationFrame(() => setModalDisabled(false));
    }
}

function getStock(product, locationId) {
    if (!product.stock_breakdown) return 0;
    const loc = product.stock_breakdown.find(l => l.location_id == locationId);
    return loc ? loc.quantity : 0;
}