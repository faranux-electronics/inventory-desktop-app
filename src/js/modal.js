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
                    <button class="btn" id="btnCancelModal">Cancel</button>
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

        // Ensure UI is in "Transfer Mode" (in case it was used for Input before)
        document.querySelector('.modal-content .form-group').parentElement.style.display = 'flex';

        setupDropdowns(locations);
        setupBody(locations);

        modal.style.display = 'flex';
    },

    // NEW: Generic Input Modal (for Adding Branches)
    openInput: (title, label, onConfirm) => {
        const modal = document.getElementById('transferModal');
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalDesc').innerText = "";

        // Hide Dropdowns
        document.querySelector('.modal-content .form-group').parentElement.style.display = 'none';

        // Show Input
        const body = document.getElementById('transferBody');
        body.innerHTML = `
            <div class="form-group">
                <label>${label}</label>
                <input type="text" id="modalTextInput" class="form-control" style="width:100%; padding:10px; font-size:1em;">
            </div>
        `;

        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('modalTextInput').focus(), 100);

        // Override Confirm Button
        const btn = document.getElementById('btnConfirmTransfer');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.onclick = () => {
            const val = document.getElementById('modalTextInput').value;
            if(!val) return alert("Please enter a value");
            modal.style.display = 'none';
            // Restore UI for next time
            document.querySelector('.modal-content .form-group').parentElement.style.display = 'flex';
            onConfirm(val);
        };
    }
};

/* --- HELPERS --- */

function closeModal() {
    document.getElementById('transferModal').style.display = 'none';
}

function setModalDisabled(disabled) {
    document.querySelectorAll('#transferModal input, #transferModal select, #transferModal button')
        .forEach(el => el.disabled = disabled);
}

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

function setupBody() {
    const bodyDiv = document.getElementById('transferBody');
    if (mode === 'single') {
        document.getElementById('modalTitle').innerText = "Transfer Item";
        document.getElementById('modalDesc').innerText = targetData.name;
        bodyDiv.innerHTML = `<div class="form-group"><label>Quantity:</label><input type="number" id="tQty" value="1" min="1" style="width:100%;"></div>`;
    } else {
        document.getElementById('modalTitle').innerText = "Bulk Transfer";
        document.getElementById('modalDesc').innerText = `Moving ${targetData.length} items.`;
        bodyDiv.innerHTML = targetData.map(p => `
            <div class="bulk-item" id="row-${p.id}">
                <input type="checkbox" class="bulk-check" data-id="${p.id}" checked style="margin-right:10px;">
                <div class="bulk-name">${p.name}</div>
                <div class="bulk-meta">SKU: ${p.sku||'-'}</div>
                <input type="number" class="bulk-qty-input" id="qty-${p.id}" data-id="${p.id}" value="1" min="1">
            </div>
        `).join('');

        document.querySelectorAll('.bulk-check').forEach(cb => {
            cb.onchange = (e) => {
                const id = e.target.dataset.id;
                document.getElementById(`qty-${id}`).disabled = !e.target.checked;
                document.getElementById(`row-${id}`).style.opacity = e.target.checked ? '1' : '0.5';
            };
        });
    }
}

async function handleConfirm() {
    const fromId = document.getElementById('tFrom').value;
    const toId = document.getElementById('tTo').value;
    const btn = document.getElementById('btnConfirmTransfer');

    if (fromId === toId) return alert("Source and Destination cannot be same.");

    setModalDisabled(true);
    btn.innerText = "Processing...";

    try {
        let res;
        if (mode === 'single') {
            const qty = parseInt(document.getElementById('tQty').value);
            if (!qty || qty <= 0) throw new Error("Invalid Quantity");
            res = await api.transfer({ product_id: targetData.id, from_id: fromId, to_id: toId, qty });
        } else {
            const items = [];
            document.querySelectorAll('.bulk-item').forEach(row => {
                const cb = row.querySelector('.bulk-check');
                const inp = row.querySelector('.bulk-qty-input');
                if (cb && cb.checked && inp.value > 0) {
                    items.push({ product_id: inp.dataset.id, from_id: fromId, to_id: toId, qty: inp.value });
                }
            });
            if (!items.length) throw new Error("No items selected");
            res = await api.bulkTransfer(items);
        }

        if (res.status === 'success') {
            toast.show("Success!", "success");
            closeModal();
            if (onSuccessCallback) await onSuccessCallback();
        } else {
            toast.show(res.message, "error");
        }
    } catch (e) {
        toast.show(e.message, "error");
    } finally {
        btn.innerText = "Confirm";
        requestAnimationFrame(() => setModalDisabled(false));
    }
}

function getStock(product, locationId) {
    if(!product.stock_breakdown) return 0;
    const loc = product.stock_breakdown.find(l => l.location_id == locationId);
    return loc ? loc.quantity : 0;
}