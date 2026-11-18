const VARIANTS = new Set(['primary', 'secondary', 'danger', 'ghost', 'outline', 'google']);
const SIZES = new Set(['sm', 'md', 'lg']);

function escapeAttribute(value) {
    return String(value ?? '').replace(/[&"<>']/g, char => ({
        '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;'
    })[char]);
}

function escapeText(value) {
    return String(value ?? '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

class Button {
    /** Return markup for view templates; icon is a Font Awesome class name. */
    static html({
        text = '', icon = '', variant = 'primary', size = 'md', id = '',
        className = '', title = '', ariaLabel = '', ariaControls = '', ariaExpanded, type = 'button', disabled = false,
        hidden = false, dataAttributes = {}
    } = {}) {
        const safeVariant = VARIANTS.has(variant) ? variant : 'primary';
        const safeSize = SIZES.has(size) ? size : 'md';
        const safeType = ['button', 'submit', 'reset'].includes(type) ? type : 'button';
        const classes = ['btn', `btn-${safeVariant}`, `btn-${safeSize}`, className, hidden ? 'hidden' : '']
            .filter(Boolean).join(' ');
        const iconMarkup = icon ? `<i class="${escapeAttribute(icon)}" aria-hidden="true"></i>` : '';
        const dataMarkup = Object.entries(dataAttributes)
            .filter(([name]) => /^data-[a-z0-9_-]+$/i.test(name))
            .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');

        return `<button type="${safeType}" class="${escapeAttribute(classes)}"${id ? ` id="${escapeAttribute(id)}"` : ''}${title ? ` title="${escapeAttribute(title)}"` : ''}${ariaLabel ? ` aria-label="${escapeAttribute(ariaLabel)}"` : ''}${ariaControls ? ` aria-controls="${escapeAttribute(ariaControls)}"` : ''}${ariaExpanded !== undefined ? ` aria-expanded="${ariaExpanded ? 'true' : 'false'}"` : ''}${disabled ? ' disabled' : ''}${dataMarkup}>${iconMarkup}${escapeText(text)}</button>`;
    }

    /** Create a native button for imperative view/component code. */
    static create(options = {}) {
        const template = document.createElement('template');
        template.innerHTML = Button.html(options).trim();
        const button = template.content.firstElementChild;
        if (typeof options.onClick === 'function') button.addEventListener('click', options.onClick);
        return button;
    }
}

module.exports = Button;
