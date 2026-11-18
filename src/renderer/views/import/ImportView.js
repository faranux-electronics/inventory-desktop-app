const Toast = require('../../components/Toast.js');
const API = require('../../services/api.js');
const PageHeader = require('../../components/PageHeader.js');
const Tabs = require('../../components/Tabs.js');
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
        content.dataset.view = 'import';

        content.innerHTML = `
            ${PageHeader.html({title: 'Import Stock', icon: 'fa-solid fa-file-import', subtitle: 'Import stock quantities and review previous imports.', className: 'page-header-surface import-page-header'})}

            <div class="import-content">
                ${Tabs.html({id: 'importTabs', className: 'import-tabs', activeId: 'new', tabs: [
                    {key: 'new', elementId: 'mainTabNew', label: 'New Import'},
                    {key: 'history', elementId: 'mainTabHistory', label: 'Import History', icon: 'fa-solid fa-clock-rotate-left'}
                ]})}

                <div id="viewNewImport"></div>
                <div id="viewHistory" class="hidden"></div>
            </div>
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
        Tabs.bind(document.getElementById('importTabs'), tab => {
            const showHistory = tab === 'history';
            document.getElementById('viewHistory').classList.toggle('hidden', !showHistory);
            document.getElementById('viewNewImport').classList.toggle('hidden', showHistory);
            if (showHistory) this.historyComponent.loadHistory();
        });
    }
}

module.exports = ImportView;
