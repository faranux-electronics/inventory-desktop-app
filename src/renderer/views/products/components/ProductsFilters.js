const API = require('../../../services/api.js');

class ProductsFilters {
    constructor(products) {
        this.products = products;
        this.state = products.state;
        this.categories = [];
        this.searchDebounceTimer = null;
    }

    async render() {
        await this.loadCategories();
        await this.loadLocations();

        const statusContainer = document.getElementById('statusFilterContainer');
        const filtersContainer = document.getElementById('filtersContainer');
        const f = this.state.getFilters();

        // 1. Build WooCommerce Status Links
        if (statusContainer) {
            const statuses = [
                { id: 'all', label: 'All' },
                { id: 'publish', label: 'Published' },
                { id: 'draft', label: 'Drafts' },
                { id: 'pending', label: 'Pending' },
                { id: 'private', label: 'Private' }
            ];

            statusContainer.innerHTML = `
                <ul class="subsubsub" style="list-style: none; padding: 0; margin: 0 0 10px 0; font-size: 13px; color: #646970; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                    ${statuses.map((s, index) => `
                        <li style="display: inline-flex; align-items: center; margin: 0;">
                            <a href="#" class="status-link ${f.status === s.id ? 'current' : ''}" data-status="${s.id}" 
                               style="text-decoration: none; color: ${f.status === s.id ? '#000' : '#2271b1'}; font-weight: ${f.status === s.id ? '600' : '400'}; padding: 2px 4px;">
                                ${s.label}
                            </a> ${index < statuses.length - 1 ? '<span style="color: #c3c4c7; margin: 0 4px;">|</span>' : ''}
                        </li>
                    `).join('')}
                </ul>
            `;
        }

        // 2. Build Category Dropdown with Visual Indentation for Subcategories
        if (filtersContainer) {
            const categoryOptions = this.categories.map(c => {
                const parts = c.split('>');
                const indent = '&nbsp;'.repeat((parts.length - 1) * 4);
                const label = parts[parts.length - 1].trim();
                return `<option value="${c}" ${c === f.category ? 'selected' : ''}>${indent}${label}</option>`;
            }).join('');

            filtersContainer.innerHTML = `
                <div class="tablenav top products-filter-bar">
                    <div class="alignleft actions products-filter-actions">
                        <select id="categoryFilter" class="filter-dropdown" title="Filter by category">
                            <option value="">Select a category</option>
                            ${categoryOptions}
                        </select>
                        
                        <select id="locationFilter" class="filter-dropdown" title="Filter by location">
                            <option value="">All Locations</option>
                            ${this.locationOptions}
                        </select>

                        <select id="stockFilter" class="filter-dropdown" title="Filter by stock status">
                            <option value="all" ${f.stockFilter === 'all' ? 'selected' : ''}>All Stock</option>
                            <option value="mismatch" ${f.stockFilter === 'mismatch' ? 'selected' : ''}>Mismatch Only</option>
                            <option value="instock" ${f.stockFilter === 'instock' ? 'selected' : ''}>In Stock</option>
                            <option value="lowstock" ${f.stockFilter === 'lowstock' ? 'selected' : ''}>Low Stock</option>
                            <option value="outofstock" ${f.stockFilter === 'outofstock' ? 'selected' : ''}>Out of Stock</option>
                        </select>

                        <button id="applyFiltersBtn" class="btn btn-sm btn-filter-submit">Filter</button>
                    </div>

                    <div class="alignright search-box products-search-box">
                        <input type="search" id="searchInput" placeholder="Search products..." value="${f.search || ''}" class="filter-search-input">
                        <button id="searchBtn" class="btn btn-sm btn-search-submit">Search</button>
                    </div>
                </div>

                <style>
                    .products-filter-bar {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: space-between;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 10px;
                    }
                    .products-filter-actions {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        align-items: center;
                        flex: 1 1 auto;
                    }
                    .filter-dropdown {
                        font-size: 13px;
                        padding: 4px 8px;
                        border: 1px solid #8c8f94;
                        border-radius: 4px;
                        background: white;
                        height: 32px;
                        min-width: 140px;
                        max-width: 220px;
                        flex: 1 1 140px;
                        color: #2c3338;
                        outline: none;
                    }
                    .filter-dropdown:focus {
                        border-color: #2271b1;
                        box-shadow: 0 0 0 1px #2271b1;
                    }
                    .btn-filter-submit {
                        background: #f6f7f7;
                        border: 1px solid #2271b1;
                        color: #2271b1;
                        padding: 4px 12px;
                        height: 32px;
                        border-radius: 4px;
                        font-weight: 500;
                        cursor: pointer;
                        flex: 0 0 auto;
                    }
                    .btn-filter-submit:hover {
                        background: #f0f6fc;
                    }
                    .products-search-box {
                        display: flex;
                        gap: 6px;
                        align-items: center;
                        flex: 0 1 280px;
                    }
                    .filter-search-input {
                        font-size: 13px;
                        padding: 4px 8px;
                        border: 1px solid #8c8f94;
                        border-radius: 4px;
                        height: 32px;
                        flex: 1 1 auto;
                        min-width: 140px;
                        outline: none;
                    }
                    .filter-search-input:focus {
                        border-color: #2271b1;
                        box-shadow: 0 0 0 1px #2271b1;
                    }
                    .btn-search-submit {
                        background: #f6f7f7;
                        border: 1px solid #8c8f94;
                        color: #2c3338;
                        padding: 4px 12px;
                        height: 32px;
                        border-radius: 4px;
                        cursor: pointer;
                        flex: 0 0 auto;
                    }
                    .btn-search-submit:hover {
                        background: #f0f0f1;
                    }
                    @media (max-width: 960px) {
                        .products-filter-bar {
                            flex-direction: column;
                            align-items: stretch;
                        }
                        .products-filter-actions {
                            width: 100%;
                        }
                        .products-search-box {
                            width: 100%;
                            flex: 1 1 100%;
                        }
                        .filter-search-input {
                            width: 100%;
                        }
                    }
                    @media (max-width: 640px) {
                        .filter-dropdown {
                            flex: 1 1 calc(50% - 6px);
                            max-width: none;
                        }
                    }
                </style>
            `;
        }

        this.attachEvents();
    }

    async loadCategories(force = false) {
        if (!force && this.categories && this.categories.length > 0) {
            return this.categories;
        }
        try {
            const res = await API.getCategories();
            if (res.status === 'success') {
                this.categories = res.data || [];
            }
        } catch (e) {
            console.error('Failed to load categories', e);
        }
        return this.categories;
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
        const searchBtn = document.getElementById('searchBtn');
        const applyFiltersBtn = document.getElementById('applyFiltersBtn');
        const locationFilter = document.getElementById('locationFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const stockFilter = document.getElementById('stockFilter');

        // Status Links Click (inline class toggle without re-rendering or re-fetching categories)
        document.querySelectorAll('.status-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const newStatus = link.dataset.status;
                if (this.state.filters.status === newStatus) return;

                document.querySelectorAll('.status-link').forEach(l => {
                    const isCurrent = l.dataset.status === newStatus;
                    l.classList.toggle('current', isCurrent);
                    l.style.color = isCurrent ? '#000' : '#2271b1';
                    l.style.fontWeight = isCurrent ? '600' : '400';
                });

                this.state.setStatus(newStatus);
                this.products.saveState();
                this.products.loadData();
            });
        });

        // Search trigger with debouncing & unchanged-term guard
        const triggerSearch = () => {
            const val = (searchInput?.value || '').trim();
            if (this.state.filters.search === val) return;
            this.state.setSearch(val);
            this.products.saveState();
            this.products.loadData();
        };

        searchBtn?.addEventListener('click', () => {
            clearTimeout(this.searchDebounceTimer);
            triggerSearch();
        });

        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(this.searchDebounceTimer);
                triggerSearch();
            }
        });

        searchInput?.addEventListener('input', () => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                triggerSearch();
            }, 350);
        });

        // Dropdown Auto-Filters
        locationFilter?.addEventListener('change', () => {
            if (this.state.filters.location_id === locationFilter.value) return;
            this.state.setLocationFilter(locationFilter.value);
            this.products.saveState();
            this.products.loadData();
        });

        categoryFilter?.addEventListener('change', () => {
            if (this.state.filters.category === categoryFilter.value) return;
            this.state.setCategory(categoryFilter.value);
            this.products.saveState();
            this.products.loadData();
        });

        stockFilter?.addEventListener('change', () => {
            if (this.state.filters.stockFilter === stockFilter.value) return;
            this.state.filters.stockFilter = stockFilter.value;
            this.products.saveState();
            this.products.loadData();
        });

        // Manual Filter Button
        applyFiltersBtn?.addEventListener('click', () => {
            const locVal = locationFilter ? locationFilter.value : '';
            const catVal = categoryFilter ? categoryFilter.value : '';
            const stockVal = stockFilter ? stockFilter.value : 'all';

            const locChanged = this.state.filters.location_id !== locVal;
            const catChanged = this.state.filters.category !== catVal;
            const stockChanged = (this.state.filters.stockFilter || 'all') !== stockVal;

            if (!locChanged && !catChanged && !stockChanged) return;

            this.state.setLocationFilter(locVal);
            this.state.setCategory(catVal);
            this.state.filters.stockFilter = stockVal;
            this.products.saveState();
            this.products.loadData();
        });
    }
}

module.exports = ProductsFilters;
