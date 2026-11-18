// Run under Manila time: TZ=Asia/Manila node tools/test-month-key.js
global.window = global; global.document = {};
const src = require('fs').readFileSync(__dirname + '/../js/reports.js', 'utf8');
const m = src.match(/_monthList\(from, to\) \{[\s\S]*?\n  \},/);
const fn = new Function('return {' + m[0].replace(/,$/, '') + '}')();
const r = fn._monthList('2026-09-01', '2026-11-18').map(x => x.key).join(',');
const ok = r === '2026-09,2026-10,2026-11';
console.log(ok ? 'OK month keys: ' + r : 'FAIL month keys: ' + r); process.exit(ok ? 0 : 1);
