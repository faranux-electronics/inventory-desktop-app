function escapeAttribute(value) {
    return String(value ?? '').replace(/[&"<>']/g, char => ({
        '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;'
    })[char]);
}

class FilterBar {
    /** Render a shared filter toolbar. Controls are trusted markup from reusable inputs/selects/buttons. */
    static html({id = '', className = '', content = '', ariaLabel = 'Filters'} = {}) {
        const classes = ['shared-filter-bar', className].filter(Boolean).join(' ');
        return `<div class="${escapeAttribute(classes)}"${id ? ` id="${escapeAttribute(id)}"` : ''} role="group" aria-label="${escapeAttribute(ariaLabel)}">${content}</div>`;
    }

    static create(options = {}) {
        const template = document.createElement('template');
        template.innerHTML = FilterBar.html(options).trim();
        return template.content.firstElementChild;
    }
}

module.exports = FilterBar;
