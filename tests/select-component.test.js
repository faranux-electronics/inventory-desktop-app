const test = require('node:test');
const assert = require('node:assert/strict');
const Select = require('../src/renderer/components/Select.js');
const Button = require('../src/renderer/components/Button.js');

test('Button.html safely renders data attributes for reusable pagination actions', () => {
    const html = Button.html({text: '2', dataAttributes: {'data-page': 2, onclick: 'bad'}});
    assert.match(html, /data-page="2"/);
    assert.doesNotMatch(html, /onclick=/);
});

test('Select.html renders reusable options, selected value, and accessible attributes', () => {
    const html = Select.html({
        id: 'logLevel',
        value: 'ERROR',
        ariaLabel: 'Filter by severity',
        className: 'logs-filter-control',
        options: [{value: '', label: 'All levels'}, {value: 'ERROR', label: 'Error'}]
    });

    assert.match(html, /class="form-select logs-filter-control"/);
    assert.match(html, /id="logLevel"/);
    assert.match(html, /aria-label="Filter by severity"/);
    assert.match(html, /<option value="ERROR" selected>Error<\/option>/);
});

test('Select.html escapes option labels, values, and attributes', () => {
    const html = Select.html({
        id: 'filter" onchange="bad',
        options: [{value: 'a"b', label: '<Danger & Care>'}]
    });

    assert.match(html, /id="filter&quot; onchange=&quot;bad"/);
    assert.match(html, /value="a&quot;b"/);
    assert.match(html, /&lt;Danger &amp; Care&gt;/);
});
