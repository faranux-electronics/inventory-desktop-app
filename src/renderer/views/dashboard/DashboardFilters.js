const API = require('../../services/api.js');

class DashboardFilters {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.state = dashboard.state;
        this.categories = [];
    }

    async render() {
        await this.loadCategories();
        await this.loadLocations();

        const container = document.getElementById('filtersContainer');
        const f = this.state.getFilters();

        container.innerHTML = `
            <div class="card p-sm flex items-center gap-md mb-md flex-wrap">
                <div class="search-box flex-1" style="min-width: 200px;">
                    <i class="fa-solid fa-search"></i>
                    <input type="text" id="searchInput" class="search-input w-full" 
                           placeholder="Search products..." value="${f.search}">
                </div>
                
                <select id="categoryFilter" class="form-select" style="width: auto; min-width: 150px;">
                    <option value="">All Categories</option>
                    ${this.categories.map(c =>
            `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`
        ).join('')}
                </select>
                
                <select id="locationFilter" class="form-select" style="width: auto; min-width: 150px;">
                    <option value="">All Locations</option>
                    ${this.locationOptions}
                </select>
                
                <select id="statusFilter" class="form-select" style="width: auto;">
                    <option value="publish" ${f.status === 'publish' ? 'selected' : ''}>Published</option>
                    <option value="draft" ${f.status === 'draft' ? 'selected' : ''}>Drafts</option>
                    <option value="private" ${f.status === 'private' ? 'selected' : ''}>Private</option>
                    <option value="pending" ${f.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="all" ${f.status === 'all' ? 'selected' : ''}>All</option>
                </select>

                <select id="sortFilter" class="form-select" style="width: auto;">
                    <option value="name" ${f.sortBy === 'name' ? 'selected' : ''}>Name</option>
                    <option value="quantity" ${f.sortBy === 'quantity' ? 'selected' : ''}>Stock</option>
                    <option value="price" ${f.sortBy === 'price' ? 'selected' : ''}>Price</option>
                    <option value="sku" ${f.sortBy === 'sku' ? 'selected' : ''}>SKU</option>
                    <option value="category" ${f.sortBy === 'category' ? 'selected' : ''}>Category</option>
                    <option value="total_sales" ${f.sortBy === 'total_sales' ? 'selected' : ''}>Sales</option>
                </select>

                <select id="sortOrderFilter" class="form-select" style="width: auto;">
                    <option value="ASC" ${f.sortOrder === 'ASC' ? 'selected' : ''}>
                        <i class="fa-solid fa-arrow-up"></i> Ascending
                    </option>
                    <option value="DESC" ${f.sortOrder === 'DESC' ? 'selected' : ''}>
                        <i class="fa-solid fa-arrow-down"></i> Descending
                    </option>
                </select>
            </div>
        `;

        this.attachEvents();
    }

    async loadCategories() {
        try {
            const res = await API.getCategories();
            if (res.status === 'success') {
                this.categories = res.data || [];
            }
        } catch (e) {
            console.error('Failed to load categories', e);
        }
    }

    async loadLocations() {
        const locations = await this.state.loadLocations();
        const currentLocation = this.state.filters.location_id;

        this.locationOptions = locations.map(l =>
            `<option value="${l.id}" ${l.id == currentLocation ? 'selected' : ''}>${l.name}</option>`
        ).join('');
    }

    attachEvents() {
        const searchInput = document.getElementById('searchInput');
        const statusFilter = document.getElementById('statusFilter');
        const sortFilter = document.getElementById('sortFilter');
        const sortOrderFilter = document.getElementById('sortOrderFilter');
        const locationFilter = document.getElementById('locationFilter');
        const categoryFilter = document.getElementById('categoryFilter');

        // Debounced search
        let searchTimeout;
        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.state.setSearch(searchInput.value);
                this.dashboard.saveState();
                this.dashboard.loadData();
            }, 500);
        });

        statusFilter?.addEventListener('change', () => {
            this.state.setStatus(statusFilter.value);
            this.dashboard.saveState();
            this.dashboard.loadData();
        });

        sortFilter?.addEventListener('change', () => {
            this.state.filters.sortBy = sortFilter.value;
            this.state.invalidateInventoryCache();
            this.dashboard.saveState();
            this.dashboard.loadData();
        });

        sortOrderFilter?.addEventListener('change', () => {
            this.state.filters.sortOrder = sortOrderFilter.value;
            this.state.invalidateInventoryCache();
            this.dashboard.saveState();
            this.dashboard.loadData();
        });

        locationFilter?.addEventListener('change', () => {
            this.state.setLocationFilter(locationFilter.value);
            this.dashboard.saveState();
            this.dashboard.loadData();
        });

        categoryFilter?.addEventListener('change', () => {
            this.state.setCategory(categoryFilter.value);
            this.dashboard.saveState();
            this.dashboard.loadData();
        });
    }
}

module.exports = DashboardFilters;