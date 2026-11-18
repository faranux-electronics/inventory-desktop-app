const test = require('node:test');
const assert = require('node:assert/strict');
const Input = require('../src/renderer/components/Input.js');

test('Input.html renders a safe reusable input with variant and common attributes', () => {
    const html = Input.html({
        type: 'email', id: 'email-field', name: 'email', value: 'ada@example.com',
        placeholder: 'Email', variant: 'compact', required: true, autocomplete: 'username'
    });

    assert.match(html, /type="email"/);
    assert.match(html, /class="form-input form-input-sm"/);
    assert.match(html, /id="email-field"/);
    assert.match(html, /required/);
    assert.match(html, /autocomplete="username"/);
});

test('Input.field creates a labeled icon input and escapes text and attributes', () => {
    const html = Input.field({
        label: '<Email>', id: 'email" onfocus="bad', type: 'email', icon: 'fa-solid fa-envelope',
        placeholder: 'you@example.com', required: true
    });

    assert.ok(html.includes('for="email&quot; onfocus=&quot;bad"'));
    assert.ok(html.includes('&lt;Email&gt;'));
    assert.match(html, /class="form-input-icon"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /type="email"/);
});

test('Input.html supports date controls for reusable date filters', () => {
    const html = Input.html({type: 'date', id: 'start-date', value: '2026-03-01', ariaLabel: 'Start date'});
    assert.match(html, /type="date"/);
    assert.match(html, /id="start-date"/);
    assert.match(html, /value="2026-03-01"/);
    assert.match(html, /aria-label="Start date"/);
});

test('Input.create creates a native input and attaches input/change handlers', () => {
    const previousDocument = global.document;
    const input = {addEventListener(event, callback) { this[event] = callback; }, setAttribute(name, value) { this[name] = value; }};
    global.document = {createElement: tag => {
        assert.equal(tag, 'input');
        return input;
    }};
    const onInput = () => {};
    const onChange = () => {};

    try {
        const created = Input.create({type: 'password', id: 'password', variant: 'compact', required: true, onInput, onChange});
        assert.equal(created.type, 'password');
        assert.equal(created.id, 'password');
        assert.equal(created.required, true);
        assert.match(created.className, /form-input-sm/);
        assert.equal(created.input, onInput);
        assert.equal(created.change, onChange);
    } finally {
        global.document = previousDocument;
    }
});

test('New reusable form inputs start empty and use placeholders for examples', () => {
    const fields = [
        {id: 'new-name', type: 'text', placeholder: 'Enter a name'},
        {id: 'new-quantity', type: 'number', placeholder: 'Enter quantity'},
        {id: 'new-price', type: 'number', placeholder: '0.00'}
    ];

    for (const field of fields) {
        const html = Input.field({label: 'New item field', ...field});
        const input = html.match(/<input\b[^>]*>/)?.[0];

        assert.ok(input, `Expected an input for ${field.id}`);
        assert.doesNotMatch(input, /\svalue=/i, `${field.id} must not be prefilled`);
        assert.ok(input.includes(`placeholder=\"${field.placeholder}\"`), `${field.id} should show its example as a placeholder`);
    }
});


