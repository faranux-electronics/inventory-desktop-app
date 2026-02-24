//
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
                <ul class="subsubsub" style="list-style: none; padding: 0; margin: 0 0 10px 0; font-size: 13px; color: #646970;">
                    ${statuses.map((s, index) => `
                        <li style="display: inline-block; margin: 0;">
                            <a href="#" class="status-link ${f.status === s.id ? 'current' : ''}" data-status="${s.id}" 
                               style="text-decoration: none; color: ${f.status === s.id ? '#000' : '#2271b1'}; font-weight: ${f.status === s.id ? '600' : '400'};">
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
                // Indent subcategories dynamically (4 spaces per depth level)
                const indent = '&nbsp;'.repeat((parts.length - 1) * 4);
                const label = parts[parts.length - 1].trim();
                return `<option value="${c}" ${c === f.category ? 'selected' : ''}>${indent}${label}</option>`;
            }).join('');

            filtersContainer.innerHTML = `
                <div class="tablenav top" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div class="alignleft actions" style="display: flex; gap: 8px; align-items: center;">
                        <select id="categoryFilter" style="font-size: 13px; padding: 4px 8px; border: 1px solid #8c8f94; border-radius: 3px; background: white; min-width: 150px;">
                            <option value="">Select a category</option>
                            ${categoryOptions}
                        </select>
                        
                        <select id="locationFilter" style="font-size: 13px; padding: 4px 8px; border: 1px solid #8c8f94; border-radius: 3px; background: white; min-width: 150px;">
                            <option value="">All Locations</option>
                            ${this.locationOptions}
                        </select>

                        <button id="applyFiltersBtn" class="btn btn-sm" style="background: #f6f7f7; border: 1px solid #2271b1; color: #2271b1; padding: 3px 10px;">Filter</button>
                    </div>

                    <div class="alignright search-box" style="display: flex; gap: 6px;">
                        <input type="search" id="searchInput" placeholder="Search products..." value="${f.search}" style="font-size: 13px; padding: 4px 8px; border: 1px solid #8c8f94; border-radius: 3px;">
                        <button id="searchBtn" class="btn btn-sm" style="background: #f6f7f7; border: 1px solid #8c8f94; color: #2c3338; padding: 3px 10px;">Search</button>
                    </div>
                </div>
            `;
        }

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
        const searchBtn = document.getElementById('searchBtn');
        const applyFiltersBtn = document.getElementById('applyFiltersBtn');
        const locationFilter = document.getElementById('locationFilter');
        const categoryFilter = document.getElementById('categoryFilter');

        // Status Links Click
        document.querySelectorAll('.status-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.state.setStatus(link.dataset.status);
                this.dashboard.saveState();
                this.dashboard.loadData();
                this.render(); // Re-render filters to update the bold "current" styling
            });
        });

        // Search trigger
        const triggerSearch = () => {
            this.state.setSearch(searchInput.value);
            this.dashboard.saveState();
            this.dashboard.loadData();
        };

        searchBtn?.addEventListener('click', triggerSearch);
        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') triggerSearch();
        });

        // Dropdown Auto-Filters
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

        // Filter Button (Just a manual trigger for the dropdowns)
        applyFiltersBtn?.addEventListener('click', () => {
            this.state.setLocationFilter(locationFilter.value);
            this.state.setCategory(categoryFilter.value);
            this.dashboard.saveState();
            this.dashboard.loadData();
        });
    }
}

module.exports = DashboardFilters;