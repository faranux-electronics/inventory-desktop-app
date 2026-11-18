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

class Tabs {
    static html({id = '', className = '', activeId = '', tabs = []} = {}) {
        const wrapperClasses = ['tabs', className].filter(Boolean).join(' ');
        const tabMarkup = tabs.map(tab => {
            const isActive = String(tab.key) === String(activeId);
            const iconMarkup = tab.icon ? `<i class="${escapeAttribute(tab.icon)}" aria-hidden="true"></i> ` : '';
            const role = tab.role ? ` role="${escapeAttribute(tab.role)}"` : '';
            const controls = tab.ariaControls ? ` aria-controls="${escapeAttribute(tab.ariaControls)}"` : '';
            const selected = tab.role === 'tab' ? ` aria-selected="${isActive ? 'true' : 'false'}"` : '';
            return `<button type="button" class="tab-btn${isActive ? ' active' : ''}${tab.className ? ` ${escapeAttribute(tab.className)}` : ''}"${tab.elementId ? ` id="${escapeAttribute(tab.elementId)}"` : ''} data-tab="${escapeAttribute(tab.key)}"${role}${controls}${selected}${tab.hidden ? ' hidden' : ''}${tab.disabled ? ' disabled' : ''}${isActive ? ' aria-current="page"' : ''}>${iconMarkup}${escapeText(tab.label)}</button>`;
        }).join('');
        return `<div${id ? ` id="${escapeAttribute(id)}"` : ''} class="${escapeAttribute(wrapperClasses)}">${tabMarkup}</div>`;
    }

    static bind(container, onChange = () => {}) {
        if (!container) return;
        container.querySelectorAll('[data-tab]').forEach(button => {
            button.addEventListener('click', () => {
                if (button.disabled) return;
                container.querySelectorAll('[data-tab]').forEach(tab => {
                    const selected = tab === button;
                    tab.classList.toggle('active', selected);
                    if (selected) tab.setAttribute('aria-current', 'page');
                    else tab.removeAttribute('aria-current');
                    if (tab.getAttribute?.('role') === 'tab') tab.setAttribute('aria-selected', selected ? 'true' : 'false');
                });
                onChange(button.dataset.tab, button);
            });
        });
    }
}

module.exports = Tabs;
