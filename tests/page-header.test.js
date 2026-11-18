const test = require('node:test');
const assert = require('node:assert/strict');
const PageHeader = require('../src/renderer/components/PageHeader.js');

test('PageHeader renders a sticky-ready title row with an icon and optional subtitle', () => {
    const html = PageHeader.html({
        title: 'Profile Settings',
        icon: 'fa-solid fa-user-gear',
        subtitle: 'Manage your account details.',
        className: 'profile-page-header'
    });

    assert.match(html, /class="page-header mb-md profile-page-header"/);
    assert.match(html, /class="page-header-icon" aria-hidden="true"><i class="fa-solid fa-user-gear"><\/i>/);
    assert.match(html, /<h1 class="page-title page-header-title">Profile Settings<\/h1>/);
    assert.match(html, /<p class="page-header-subtitle">Manage your account details\.<\/p>/);
});

test('PageHeader escapes title and icon attributes while allowing trusted action markup', () => {
    const html = PageHeader.html({
        title: '<script>alert("x")</script>',
        icon: 'icon" onmouseover="run',
        actions: '<button type="button">Save</button>'
    });

    assert.match(html, /&lt;script&gt;alert\("x"\)&lt;\/script&gt;/);
    assert.match(html, /class="icon&quot; onmouseover=&quot;run"/);
    assert.match(html, /<div class="page-header-actions"><button type="button">Save<\/button><\/div>/);
    assert.doesNotMatch(html, /<h1[^>]*><script>/);
});
