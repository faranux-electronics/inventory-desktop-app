const TAG_NAMES = new Set(['article', 'aside', 'div', 'section']);

function escapeAttribute(value) {
    return String(value ?? '').replace(/[&"<>']/g, character => ({
        '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;'
    })[character]);
}

class Card {
    /** Render a shared card container. Content is trusted markup from the calling view. */
    static html({tagName = 'div', id = '', className = '', role = '', ariaLabel = '', content = ''} = {}) {
        const safeTag = TAG_NAMES.has(tagName) ? tagName : 'div';
        const classes = ['card', className].filter(Boolean).map(escapeAttribute).join(' ');
        return `<${safeTag} class="${classes}"${id ? ` id="${escapeAttribute(id)}"` : ''}${role ? ` role="${escapeAttribute(role)}"` : ''}${ariaLabel ? ` aria-label="${escapeAttribute(ariaLabel)}"` : ''}>${content}</${safeTag}>`;
    }
}

module.exports = Card;
