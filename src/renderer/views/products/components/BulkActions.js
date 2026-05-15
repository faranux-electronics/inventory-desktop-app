const Toast = require('../../../components/Toast.js');
const Modal = require('../../../components/Modal.js');
const API = require('../../../services/api.js');

class BulkActions {
    constructor(products) {
        this.products = products;
        this.state = products.state;
    }

    render() {
        const container = document.getElementById('bulkActionsContainer');
        container.innerHTML = `
            <div id="selectionActions" class="selection-actions hidden">
                <span id="selectionCount">0 items selected</span>
                <button class="btn btn-sm btn-secondary" id="clearSelectionBtn">Clear</button>
            </div>
        `;

        this.attachEvents();
    }

    update(count) {
        const actionsDiv = document.getElementById('selectionActions');
        const countSpan = document.getElementById('selectionCount');

        if (count > 0) {
            actionsDiv?.classList.remove('hidden');
            if (countSpan) countSpan.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        } else {
            actionsDiv?.classList.add('hidden');
        }
    }

    attachEvents() {
        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
            this.products.clearSelection();
        });
    }
}

module.exports = BulkActions;