const test = require('node:test');
const assert = require('node:assert/strict');
const Pagination = require('../src/renderer/components/Pagination.js');

function button(page, disabled = false) {
    return {
        dataset: {page: String(page)},
        disabled,
        addEventListener(type, handler) { this[type] = handler; }
    };
}

test('Pagination renders reusable controls and reports page and page-size changes', () => {
    const pages = [button(1), button(2), button(3), button(2)];
    const sizeSelect = {addEventListener(type, handler) { this[type] = handler; }};
    const container = {
        innerHTML: '',
        querySelectorAll: () => pages,
        querySelector: selector => selector === '#userRowsPerPage' ? sizeSelect : null
    };
    const pageChanges = [];
    const sizeChanges = [];

    Pagination.render(container, {
        page: 1,
        pageSize: 20,
        total: 45,
        itemLabel: 'users',
        pageSizeId: 'userRowsPerPage',
        onPageChange: page => pageChanges.push(page),
        onPageSizeChange: size => sizeChanges.push(size)
    });

    assert.match(container.innerHTML, /Showing 1-20 of 45 users/);
    assert.match(container.innerHTML, /class="form-select shared-pagination-size"/);
    pages[1].click();
    pages[3].click();
    sizeSelect.change({target: {value: '50'}});

    assert.deepEqual(pageChanges, [2, 2]);
    assert.deepEqual(sizeChanges, [50]);
});

test('Pagination clears its container when there are no results', () => {
    const container = {innerHTML: 'old pagination'};
    Pagination.render(container, {total: 0});
    assert.equal(container.innerHTML, '');
});
