const Button = require('./Button.js');
const Card = require('./Card.js');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

class ChartCard {
    static heading({id, title, caption, metric = ''} = {}) {
        const safeTitle = escapeHtml(title);
        const safeCaption = escapeHtml(caption);
        const captionId = id ? `mpsChartCaption-${escapeHtml(id)}` : '';
        const info = caption && captionId
            ? Button.html({
                icon: 'fa-solid fa-circle-info', variant: 'ghost', size: 'sm',
                className: 'mps-chart-info-button', title: caption,
                ariaLabel: `Explain ${title}: ${caption}`, ariaControls: captionId,
                ariaExpanded: false, dataAttributes: {'data-chart-info': captionId}
            })
            : '';
        return `<div class="mps-chart-head"><div class="mps-chart-title"><h2>${safeTitle}</h2>${info}${captionId ? `<div class="mps-chart-caption" id="${captionId}" hidden>${safeCaption}</div>` : ''}</div>${metric === '' ? '' : `<span>${escapeHtml(metric)}</span>`}</div>`;
    }

    /** Render a reusable chart panel with a title, optional explanation, metric, and chart body. */
    static html({id, title, caption, metric = '', content = '', className = ''} = {}) {
        return Card.html({
            tagName: 'section',
            className: ['mps-chart-card', className].filter(Boolean).join(' '),
            content: `${ChartCard.heading({id, title, caption, metric})}${content}`
        });
    }
}

module.exports = ChartCard;
