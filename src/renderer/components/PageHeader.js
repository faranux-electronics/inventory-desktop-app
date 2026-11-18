function escapeAttribute(value) {
    return String(value ?? '').replace(/[&"<>']/g, character => ({
        '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;'
    })[character]);
}

function escapeText(value) {
    return String(value ?? '').replace(/[&<>]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;'
    })[character]);
}

class PageHeader {
    /** Shared page title row. `actions` and `children` are trusted markup from the caller. */
    static html({title = '', icon = 'fa-solid fa-file-lines', subtitle = '', actions = '', children = '', className = '', rowClassName = ''} = {}) {
        const classes = ['page-header', 'mb-md', className].filter(Boolean).join(' ');
        const rowClasses = ['header-row', rowClassName].filter(Boolean).join(' ');
        const titleMarkup = `<div class="page-header-content"><span class="page-header-icon" aria-hidden="true"><i class="${escapeAttribute(icon)}"></i></span><div class="page-header-titles"><h1 class="page-title page-header-title">${escapeText(title)}</h1>${subtitle ? `<p class="page-header-subtitle">${escapeText(subtitle)}</p>` : ''}</div></div>`;
        return `<div class="${escapeAttribute(classes)}"><div class="${escapeAttribute(rowClasses)}">${titleMarkup}${actions ? `<div class="page-header-actions">${actions}</div>` : ''}</div>${children}</div>`;
    }
}

module.exports = PageHeader;
