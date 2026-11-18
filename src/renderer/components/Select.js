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

class Select {
    static html({id = '', name = '', value = '', options = [], className = '', ariaLabel = '', required = false, disabled = false} = {}) {
        const classes = ['form-select', className].filter(Boolean).join(' ');
        const attributes = `${id ? ` id="${escapeAttribute(id)}"` : ''}${name ? ` name="${escapeAttribute(name)}"` : ''}${ariaLabel ? ` aria-label="${escapeAttribute(ariaLabel)}"` : ''}${required ? ' required' : ''}${disabled ? ' disabled' : ''}`;
        const optionMarkup = options.map(option => {
            const optionValue = String(option.value ?? '');
            const selected = optionValue === String(value) || option.selected === true;
            return `<option value="${escapeAttribute(optionValue)}"${selected ? ' selected' : ''}>${escapeText(option.label ?? optionValue)}</option>`;
        }).join('');
        return `<select class="${escapeAttribute(classes)}"${attributes}>${optionMarkup}</select>`;
    }

    static field({label, wrapperClass = '', ...selectOptions} = {}) {
        const id = selectOptions.id || '';
        const labelMarkup = label
            ? `<label class="form-label"${id ? ` for="${escapeAttribute(id)}"` : ''}>${escapeText(label)}</label>`
            : '';
        return `<div class="form-group${wrapperClass ? ` ${escapeAttribute(wrapperClass)}` : ''}">${labelMarkup}${Select.html(selectOptions)}</div>`;
    }
}

module.exports = Select;
