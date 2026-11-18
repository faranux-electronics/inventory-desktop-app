function escapeAttribute(value) {
    return String(value ?? '').replace(/[&"<>']/g, char => ({
        '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;'
    })[char]);
}

function escapeText(value) {
    return String(value ?? '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

class Table {
    /** Render a shared table shell. Header labels are escaped; body is trusted view markup. */
    static html({
        headers = [], body = '', bodyId = '', className = '', wrapperClass = '', ariaLabel = ''
    } = {}) {
        const headerMarkup = headers.map(header => {
            const config = typeof header === 'string' ? {label: header} : header;
            const classes = config.className ? ` class="${escapeAttribute(config.className)}"` : '';
            const width = config.width ? ` style="width:${escapeAttribute(config.width)}"` : '';
            const title = config.title ? ` title="${escapeAttribute(config.title)}"` : '';
            const dataAttributes = Object.entries(config.dataAttributes || {})
                .filter(([name]) => /^data-[a-z0-9_-]+$/i.test(name))
                .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
            return `<th${classes}${width}${title}${dataAttributes}>${escapeText(config.label)}</th>`;
        }).join('');
        const tableClasses = ['shared-table', className].filter(Boolean).map(escapeAttribute).join(' ');
        const wrapperClasses = ['shared-table-wrapper', wrapperClass].filter(Boolean).map(escapeAttribute).join(' ');
        return `<div class="${wrapperClasses}"><table class="${tableClasses}"${ariaLabel ? ` aria-label="${escapeAttribute(ariaLabel)}"` : ''}>
            <thead><tr>${headerMarkup}</tr></thead>
            <tbody${bodyId ? ` id="${escapeAttribute(bodyId)}"` : ''}>${body}</tbody>
        </table></div>`;
    }
}

module.exports = Table;
