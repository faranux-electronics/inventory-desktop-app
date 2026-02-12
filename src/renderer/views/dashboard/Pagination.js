class Pagination {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.state = dashboard.state;
    }

    render(pagination) {
        const container = document.getElementById('paginationContainer');
        if (!container) return;

        const { page = 1, pages = 1, total = 0 } = pagination;

        if (total === 0) {
            container.innerHTML = '';
            return;
        }

        const perPage = 20;
        const startItem = (page - 1) * perPage + 1;
        const endItem = Math.min(page * perPage, total);

        let pagesHtml = '';
        const maxPages = 3;
        let startPage = Math.max(1, page - Math.floor(maxPages / 2));
        let endPage = Math.min(pages, startPage + maxPages - 1);

        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        if (startPage > 1) {
            pagesHtml += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                pagesHtml += `<span class="px-sm text-muted">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            pagesHtml += `
                <button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">
                    ${i}
                </button>
            `;
        }

        if (endPage < pages) {
            if (endPage < pages - 1) {
                pagesHtml += `<span class="px-sm text-muted">...</span>`;
            }
            pagesHtml += `<button class="page-btn" data-page="${pages}">${pages}</button>`;
        }

        container.innerHTML = `
            <div class="pagination">
                <div class="pagination-info">
                    Showing ${startItem} - ${endItem} of ${total.toLocaleString()} items
                </div>
                <div class="pagination-controls">
                    <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left"></i> Prev
                    </button>
                    ${pagesHtml}
                    <button class="page-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>
                        Next <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    attachEvents() {
        document.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newPage = parseInt(btn.dataset.page);
                if (!isNaN(newPage) && !btn.disabled) {
                    this.state.setPage(newPage);
                    this.dashboard.saveState();
                    this.dashboard.loadData();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    }
}

module.exports = Pagination;