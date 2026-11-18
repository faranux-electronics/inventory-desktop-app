const Input = require('../../../components/Input.js');

function renderPricingMeasurements(product, isWriter, format, escape, extra = {}) {
    const dimensionUnit = String(product.dimension_unit || 'cm') === 'store' ? 'cm' : String(product.dimension_unit || 'cm');
    const weightUnit = String(product.weight_unit || 'g') === 'store' ? 'g' : String(product.weight_unit || 'g');
    const weightUnitLabel = weightUnit === 'g' ? 'gr' : weightUnit;
    const value = field => product[field] === null || product[field] === '' || product[field] === undefined
        ? ''
        : format(product[field]);
    const inputValue = field => {
        const raw = product[field];
        if (raw === null || raw === '' || raw === undefined) return '';
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? String(numeric) : String(raw);
    };
    const hasDimensions = ['length', 'width', 'height'].some(field => value(field) !== '');
    const hasWeight = value('weight') !== '';
    const dimensionSummary = hasDimensions ? ['length', 'width', 'height'].map(field => value(field) || '-').join(' x ') : '—';
    const weightSummary = hasWeight ? value('weight') : '—';
    const editorId = `mps-pricing-measurements-${Number(product.catalog_id)}`;
    const popover = isWriter ? `<div id="${editorId}" class="mps-pricing-measure-popover" popover>
            <div class="mps-pricing-measure-popover-header"><div class="mps-pricing-measure-popover-title">Pricing, dimensions and weight</div><button type="button" class="mps-pricing-popover-close" data-pricing-popover-cancel aria-label="Cancel and close" title="Cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
            ${extra.pricingFields || ''}
            <div class="mps-pricing-measure-popover-dimensions">
                <label title="Length"><span>L</span>${Input.html({type: 'number', min: 0, step: 'any', value: inputValue('length'), className: 'mps-pricing-measure mps-pricing-length', ariaLabel: `Length (${dimensionUnit}) for ${product.sku || product.name}`})}</label>
                <label title="Width"><span>W</span>${Input.html({type: 'number', min: 0, step: 'any', value: inputValue('width'), className: 'mps-pricing-measure mps-pricing-width', ariaLabel: `Width (${dimensionUnit}) for ${product.sku || product.name}`})}</label>
                <label title="Height"><span>H</span>${Input.html({type: 'number', min: 0, step: 'any', value: inputValue('height'), className: 'mps-pricing-measure mps-pricing-height', ariaLabel: `Height (${dimensionUnit}) for ${product.sku || product.name}`})}</label>
                <span class="mps-pricing-measure-unit">${escape(dimensionUnit)}</span>
            </div>
            <div class="mps-pricing-measure-popover-weight">
                <label><span>Weight</span>${Input.html({type: 'number', min: 0, step: 'any', value: inputValue('weight'), className: 'mps-pricing-measure mps-pricing-weight', ariaLabel: `Weight (${weightUnit}) for ${product.sku || product.name}`})}</label>
                <span class="mps-pricing-measure-unit">${escape(weightUnitLabel)}</span>
            </div>
            <div class="mps-pricing-measure-popover-actions">${extra.actions || ''}</div>
        </div>` : '';
    const sizeContent = `<span data-pricing-size-summary>${escape(dimensionSummary)}</span>`;
    const weightContent = `<span data-pricing-weight-summary>${escape(weightSummary)}</span>`;
    const sizeValue = isWriter ? `<button type="button" class="mps-pricing-value-link mps-pricing-measurement-number" popovertarget="${editorId}" aria-label="Edit dimensions">${sizeContent}</button>` : sizeContent;
    const weightValue = isWriter ? `<button type="button" class="mps-pricing-value-link mps-pricing-measurement-number" popovertarget="${editorId}" aria-label="Edit weight">${weightContent}</button>` : weightContent;
    const dimensionUnitHtml = hasDimensions ? `<span class="mps-pricing-measure-unit-inline">${escape(dimensionUnit)}</span>` : '';
    const weightUnitHtml = hasWeight ? `<span class="mps-pricing-measure-unit-inline">${escape(weightUnitLabel)}</span>` : '';
    const measurementRows = !isWriter && !hasDimensions && !hasWeight
        ? '<div class="mps-pricing-measurement-row mps-pricing-measurement-empty"><span>No measurements</span></div>'
        : `<div class="mps-pricing-measurement-row">${sizeValue}${dimensionUnitHtml}</div><div class="mps-pricing-measurement-row">${weightValue}${weightUnitHtml}</div>`;
    const html = `<td class="mps-pricing-size-cell"><div class="mps-pricing-measurements-summary">${measurementRows}</div>${popover}</td>`;

    return {html, dimensionUnit, weightUnit, editorId};
}

module.exports = {renderPricingMeasurements};
