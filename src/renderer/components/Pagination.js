const Button = require('./Button.js');
const Select = require('./Select.js');

class Pagination {
    static render(container, {
        page = 1, total = 0, pageSize = 20, pageSizes = [10, 20, 50],
        itemLabel = 'items', pageSizeId = 'pagination-page-size',
        onPageChange = () => {}, onPageSizeChange = () => {}
    } = {}) {
        if (!container || total <= 0) {
            if (container) container.innerHTML = '';
            return;
        }

        const pageCount = Math.ceil(total / pageSize);
        const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
        const firstItem = (safePage - 1) * pageSize + 1;
        const lastItem = Math.min(safePage * pageSize, total);
        const firstPage = Math.max(1, Math.min(safePage - 2, pageCount - 4));
        const lastPage = Math.min(pageCount, firstPage + 4);
        let pageButtons = '';

        if (firstPage > 1) {
            pageButtons += Button.html({text: '1', variant: 'outline', size: 'sm', className: 'shared-pagination-page-btn', dataAttributes: {'data-page': 1}, ariaLabel: 'Page 1'});
            if (firstPage > 2) pageButtons += '<span class="pagination-ellipsis">...</span>';
        }

        for (let number = firstPage; number <= lastPage; number++) {
            const active = number === safePage;
            pageButtons += Button.html({
                text: String(number), variant: active ? 'primary' : 'outline', size: 'sm',
                className: `shared-pagination-page-btn${active ? ' active' : ''}`,
                ariaLabel: `Page ${number}`, dataAttributes: {'data-page': number}
            });
        }

        if (lastPage < pageCount) {
            if (lastPage < pageCount - 1) pageButtons += '<span class="pagination-ellipsis">...</span>';
            pageButtons += Button.html({text: String(pageCount), variant: 'outline', size: 'sm', className: 'shared-pagination-page-btn', dataAttributes: {'data-page': pageCount}, ariaLabel: `Page ${pageCount}`});
        }

        const sizeOptions = pageSizes.map(size => ({value: size, label: String(size)}));
        container.innerHTML = `
            <div class="pagination shared-pagination">
                <div class="pagination-info">Showing ${firstItem}-${lastItem} of ${Number(total).toLocaleString()} ${itemLabel}</div>
                <div class="pagination-controls">
                    ${Button.html({text: 'Previous', icon: 'fa-solid fa-chevron-left', variant: 'outline', size: 'sm', className: 'shared-pagination-nav-btn', disabled: safePage <= 1, dataAttributes: {'data-page': safePage - 1}})}
                    ${pageButtons}
                    ${Button.html({text: 'Next', icon: 'fa-solid fa-chevron-right', variant: 'outline', size: 'sm', className: 'shared-pagination-nav-btn', disabled: safePage >= pageCount, dataAttributes: {'data-page': safePage + 1}})}
                </div>
                <label class="shared-pagination-size-label" for="${pageSizeId}">Rows per page ${Select.html({id: pageSizeId, value: pageSize, ariaLabel: 'Rows per page', className: 'shared-pagination-size', options: sizeOptions})}</label>
            </div>
        `;

        container.querySelectorAll('[data-page]').forEach(button => {
            button.addEventListener('click', () => {
                const newPage = Number(button.dataset.page);
                if (!button.disabled && Number.isInteger(newPage) && newPage >= 1 && newPage <= pageCount && newPage !== safePage) {
                    onPageChange(newPage);
                }
            });
        });

        container.querySelector(`#${pageSizeId}`)?.addEventListener('change', event => {
            const newSize = Number(event.target.value);
            if (pageSizes.includes(newSize) && newSize !== pageSize) onPageSizeChange(newSize);
        });
    }
}

module.exports = Pagination;
