const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const ImportForm = require('./components/ImportForm.js');
const ImportHistory = require('./components/ImportHistory.js');

class ImportView {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.locationsCache = [];
        this.formComponent = new ImportForm(this);
        this.historyComponent = new ImportHistory(this);
    }

    render() {
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="page-header mb-md">
                <div class="header-row mb-sm">
                    <h1 class="page-title text-neutral-800 font-normal">Import Stock</h1>
                </div>
                
                <div class="tabs" style="border-bottom: 1px solid #c3c4c7;">
                    <button class="tab-btn active" id="mainTabNew" style="padding: 8px 16px; font-weight: 600;">New Import</button>
                    <button class="tab-btn" id="mainTabHistory" style="padding: 8px 16px; font-weight: 600;"><i class="fa-solid fa-clock-rotate-left"></i> Import History</button>
                </div>
            </div>

            <div id="viewNewImport"></div>
            <div id="viewHistory" class="hidden"></div>
        `;

        this.formComponent.render(document.getElementById('viewNewImport'));
        this.historyComponent.render(document.getElementById('viewHistory'));

        this.init();
    }

    async init() {
        const isStale = () => !document.getElementById('mainTabNew');

        try {
            const locRes = await API.getLocations();
            if (isStale()) return;

            if (locRes.status === 'success') {
                this.locationsCache = locRes.data;
                this.formComponent.updateLocations(this.locationsCache);
            }
        } catch (e) {
            console.error("Failed to load locations for guide");
        }

        if (isStale()) return;
        this.attachEvents();
    }

    attachEvents() {
        document.getElementById('mainTabNew').addEventListener('click', (e) => {
            e.target.classList.add('active');
            document.getElementById('mainTabHistory').classList.remove('active');
            document.getElementById('viewNewImport').classList.remove('hidden');
            document.getElementById('viewHistory').classList.add('hidden');
        });

        document.getElementById('mainTabHistory').addEventListener('click', (e) => {
            e.target.classList.add('active');
            document.getElementById('mainTabNew').classList.remove('active');
            document.getElementById('viewHistory').classList.remove('hidden');
            document.getElementById('viewNewImport').classList.add('hidden');
            this.historyComponent.loadHistory();
        });
    }
}

module.exports = ImportView;