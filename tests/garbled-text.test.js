const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const sourceRoots = [path.join(appRoot, 'src'), path.join(appRoot, 'index.html')];
const sourceExtensions = new Set(['.js', '.css', '.html', '.json']);
const mojibakePattern = /(?:Ã.|Â.|â(?:€|€™|€œ|€¦|€”|€“|€˜)|ï¿½|�)/u;

function collectSourceFiles(target) {
    if (!fs.existsSync(target)) return [];
    const stat = fs.statSync(target);
    if (stat.isFile()) return [target];
    return fs.readdirSync(target, {withFileTypes: true})
        .flatMap(entry => entry.isDirectory()
            ? collectSourceFiles(path.join(target, entry.name))
            : sourceExtensions.has(path.extname(entry.name).toLowerCase())
                ? [path.join(target, entry.name)]
                : []);
}

test('app source contains no common mojibake markers', () => {
    const files = sourceRoots.flatMap(collectSourceFiles);
    const findings = [];

    for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (mojibakePattern.test(line)) findings.push(`${path.relative(appRoot, file)}:${index + 1}: ${line.trim()}`);
        });
    }

    assert.deepEqual(findings, [], `Found garbled text markers:\n${findings.join('\n')}`);
});
