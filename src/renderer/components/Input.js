const TYPES = new Set(['text', 'email', 'password', 'search', 'number', 'tel', 'url', 'date', 'file']);
const VARIANTS = new Set(['default', 'compact']);

function escapeAttribute(value) {
    return String(value ?? '').replace(/[&"<>']/g, character => ({
        '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;'
    })[character]);
}

class Input {
    static html({
        type = 'text', id = '', name = '', value = '', placeholder = '', variant = 'default',
        className = '', autocomplete = '', ariaLabel = '', title = '', accept = '', min, max, step,
        maxLength, required = false, disabled = false,
        readonly = false, autofocus = false
    } = {}) {
        const safeType = TYPES.has(type) ? type : 'text';
        const safeVariant = VARIANTS.has(variant) ? variant : 'default';
        const classes = ['form-input', safeVariant === 'compact' ? 'form-input-sm' : '', className]
            .filter(Boolean).join(' ');

        return `<input type="${safeType}" class="${escapeAttribute(classes)}"${id ? ` id="${escapeAttribute(id)}"` : ''}${name ? ` name="${escapeAttribute(name)}"` : ''}${value !== '' ? ` value="${escapeAttribute(value)}"` : ''}${placeholder ? ` placeholder="${escapeAttribute(placeholder)}"` : ''}${autocomplete ? ` autocomplete="${escapeAttribute(autocomplete)}"` : ''}${ariaLabel ? ` aria-label="${escapeAttribute(ariaLabel)}"` : ''}${title ? ` title="${escapeAttribute(title)}"` : ''}${accept ? ` accept="${escapeAttribute(accept)}"` : ''}${min !== undefined ? ` min="${escapeAttribute(min)}"` : ''}${max !== undefined ? ` max="${escapeAttribute(max)}"` : ''}${step !== undefined ? ` step="${escapeAttribute(step)}"` : ''}${maxLength !== undefined ? ` maxlength="${escapeAttribute(maxLength)}"` : ''}${required ? ' required' : ''}${disabled ? ' disabled' : ''}${readonly ? ' readonly' : ''}${autofocus ? ' autofocus' : ''}>`;
    }

    static field({label, icon = '', wrapperClass = '', ...inputOptions} = {}) {
        const id = inputOptions.id || '';
        const labelMarkup = label
            ? `<label class="form-label"${id ? ` for="${escapeAttribute(id)}"` : ''}>${escapeAttribute(label)}</label>`
            : '';
        const iconMarkup = icon ? `<i class="${escapeAttribute(icon)}" aria-hidden="true"></i>` : '';
        const inputMarkup = Input.html(inputOptions);
        const controlMarkup = icon
            ? `<div class="form-input-icon">${iconMarkup}${inputMarkup}</div>`
            : inputMarkup;

        return `<div class="form-group${wrapperClass ? ` ${escapeAttribute(wrapperClass)}` : ''}">${labelMarkup}${controlMarkup}</div>`;
    }

    static create(options = {}) {
        const input = document.createElement('input');
        const type = TYPES.has(options.type) ? options.type : 'text';
        const variant = VARIANTS.has(options.variant) ? options.variant : 'default';
        input.type = type;
        input.className = ['form-input', variant === 'compact' ? 'form-input-sm' : '', options.className || '']
            .filter(Boolean).join(' ');
        for (const property of ['id', 'name', 'value', 'placeholder', 'autocomplete', 'accept', 'required', 'disabled', 'readOnly', 'autofocus']) {
            if (options[property] !== undefined && options[property] !== null) input[property] = options[property];
        }
        if (options.ariaLabel) input.setAttribute('aria-label', options.ariaLabel);
        if (typeof options.onInput === 'function') input.addEventListener('input', options.onInput);
        if (typeof options.onChange === 'function') input.addEventListener('change', options.onChange);
        return input;
    }
}

module.exports = Input;
