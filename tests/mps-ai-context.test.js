const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('Ask AI carries the active Summary, Planning, Calendar, or Part Pricing scope', () => {
    const view = read('../src/renderer/views/mps/MpsView.js');
    const calendar = read('../src/renderer/views/mps/components/CalendarTab.js');
    const api = read('../src/renderer/services/api.js');

    assert.match(view, /this\.openAIChat\(chartQuestion,[^;]*this\.buildAIChatContext\(\)/);
    assert.match(view, /\['summary', 'planning', 'calendar', 'pricing'\]/);
    assert.match(view, /summaryFilters\?\.\(\)/);
    assert.match(view, /activeFilters\?\.\(\)/);
    assert.match(view, /product_status: this\.pricingStatus/);
    assert.match(view, /calendarRange \|\| \{\}/);
    assert.match(calendar, /this\.calendarRange = \{from, to\}/);
    assert.match(view, /API\.mpsAIChat\(question, history, tabContext\)/);
    assert.match(api, /mpsAIChat: \(question, history = \[\], context = \{\}\).*\{question, history, context\}/);
});

test('Ask AI labels the selected tab and suggests questions for that tab', () => {
    const view = read('../src/renderer/views/mps/MpsView.js');

    for (const topic of ['Summary trends and risks', 'Which products to prioritize', 'Upcoming reorder dates', 'Products below the margin target']) {
        assert.ok(view.includes(topic), `Missing contextual AI suggestion: ${topic}`);
    }
    assert.match(view, /current \$\{esc\(tabLabel\)\} view/);
});
