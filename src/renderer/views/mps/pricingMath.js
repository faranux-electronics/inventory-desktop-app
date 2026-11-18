function calculatePricing(cost, approved, vatPercent = 18, citPercent = 30) {
    const costAmount = Number(cost) || 0;
    const saleAmount = Number(approved) || 0;
    const vat = saleAmount > 0 ? saleAmount * vatPercent / (100 + vatPercent) : 0;
    const cit = Math.max(0, (saleAmount - costAmount - vat) * citPercent / 100);
    const profit = saleAmount - costAmount - vat - cit;
    return {vat, cit, profit, margin: saleAmount > 0 ? profit / saleAmount * 100 : null};
}

function getProfitMarginFilterOptions(targetMargin = 35) {
    const value = Number(targetMargin);
    const target = Number.isFinite(value) ? value : 35;
    const label = Number(target.toFixed(2)).toString();
    return [
        {value: 'all', label: 'All profits / margins'},
        {value: 'positive', label: 'Positive profit'},
        {value: 'negative', label: 'Negative profit'},
        {value: 'zero', label: 'No profit'},
        {value: 'target_met', label: 'Meets target (' + label + '%+)'},
        {value: 'below_target', label: 'Below target (< ' + label + '%)'}
    ];
}
module.exports = {calculatePricing, getProfitMarginFilterOptions};
