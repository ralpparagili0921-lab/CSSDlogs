#!/usr/bin/env node
// Guardrails for the CSSD app. Run:  node tools/check.js
// Exits 1 if anything that has broken this app before is found again.
// No dependencies - plain Node.
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const problems = [];
const fail = (area, msg) => problems.push(`[${area}] ${msg}`);

const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// 1. Every script must at least parse.
for (const f of jsFiles.concat(['sw.js'])) {
  try { new vm.Script(read(f), { filename: f }); } catch (e) { fail('syntax', `${f}: ${e.message}`); }
}

// 2. index.html scripts/styles, the service-worker list and the files on disk must agree.
const html = read('index.html');
const sw = read('sw.js');
const htmlLocal = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"#?]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
const swList = [...(sw.match(/SHELL_URLS\s*=\s*\[([\s\S]*?)\];/) || ['', ''])[1].matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
for (const u of htmlLocal) {
  if (!fs.existsSync(path.join(root, u))) fail('files', `index.html references ${u} which does not exist`);
  if (!swList.includes(u)) fail('service-worker', `${u} is in index.html but not in sw.js SHELL_URLS (it will not work offline)`);
}
for (const u of swList) {
  if (u === '' || u.endsWith('.woff2')) continue;
  if (!htmlLocal.includes(u) && u !== 'index.html') fail('service-worker', `${u} is in sw.js but not loaded by index.html`);
}
for (const f of jsFiles) {
  if (!htmlLocal.includes(f)) fail('files', `${f} exists but index.html never loads it`);
}
const cache = (sw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1];
if (!cache) fail('service-worker', 'CACHE_NAME not found');

// 3. Dates: toISOString() is UTC. Slicing it to a date/month is wrong in Manila (UTC+8).
//    The only allowed form shifts by the timezone offset first (see UI.todayStr).
for (const f of jsFiles) {
  strip(read(f)).split('\n').forEach((line, i) => {
    if (/toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*(10|7)\s*\)|toISOString\(\)\.split\(['"]T['"]\)/.test(line) && !/getTimezoneOffset/.test(line)) {
      fail('dates', `${f}:${i + 1} slices a UTC timestamp into a date: ${line.trim().slice(0, 90)}`);
    }
  });
}

// 4. Globals used across files must exist somewhere (typos, removed modules).
const declared = new Set();
for (const f of jsFiles) {
  for (const m of strip(read(f)).matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
  for (const m of strip(read(f)).matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) declared.add(m[1]);
}
const known = new Set(['Chart', 'XLSX', 'jspdf', 'supabase', 'Intl', 'Math', 'JSON', 'Object', 'Array', 'Date', 'Promise', 'Number', 'String', 'Boolean', 'Set', 'Map', 'URL', 'URLSearchParams', 'Error', 'TypeError', 'RangeError', 'Symbol', 'Notification', 'Audio', 'AudioContext', 'FormData', 'File', 'FileReader', 'Blob', 'Option', 'Image', 'RegExp', 'Element', 'Node', 'Event', 'CustomEvent', 'HTMLElement', 'WebSocket', 'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'AbortController', 'Response', 'Request', 'Headers', 'Uint8Array', 'ArrayBuffer', 'DOMParser', 'XMLSerializer', 'Infinity', 'NaN', 'Atomics', 'Reflect', 'Proxy', 'WeakMap', 'WeakSet', 'BigInt', 'DataTransfer', 'KeyboardEvent', 'MouseEvent', 'Storage', 'Navigator', 'Document', 'Window', 'DOMException', 'SpeechSynthesisUtterance', 'PIN', 'ISO', 'UTC', 'API', 'JS', 'HTML', 'CSS', 'SQL', 'DB', 'OK', 'PDF']);
for (const f of jsFiles) {
  const seen = new Set();
  strip(read(f)).split('\n').forEach((line, i) => {
    const noStr = line.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
    for (const m of noStr.matchAll(/(?<![\w$.'"`>#/-])([A-Z][A-Za-z0-9]{2,})\.([a-z_]\w*)/g)) {
      const name = m[1];
      if (declared.has(name) || known.has(name) || seen.has(name)) continue;
      if (/^[A-Z0-9_]+$/.test(name)) continue;
      // text inside template literal HTML (e.g. "Dr. Smith") is not code; require a call/property use
      if (!/[(\[=,;:]\s*$|^\s*$/.test(noStr.slice(0, m.index)) && !/(await|return|=|\(|,|!|&&|\|\||\?|:)\s*$/.test(noStr.slice(0, m.index))) continue;
      seen.add(name);
      fail('globals', `${f}:${i + 1} uses ${name}.${m[2]} but no file defines ${name}`);
    }
  });
}

// 5. Element ids used from code should exist in index.html or be built by some template.
const allSrc = jsFiles.map(read).join('\n') + '\n' + html;
const idsDefined = new Set([...allSrc.matchAll(/\bid\s*=\s*["']([\w-]+)["']/g)].map(m => m[1]));
const idsDefinedTemplate = [...allSrc.matchAll(/\bid\s*=\s*["']([\w-]*)\$\{/g)].map(m => m[1]);
const idsDefinedSuffix = [...allSrc.matchAll(/\bid\s*=\s*["']\$\{[^}]+\}([\w-]+)["']/g)].map(m => m[1]);
const idsFromCode = [...allSrc.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)].map(m => m[1]);
idsFromCode.forEach(i => idsDefined.add(i));
for (const f of jsFiles) {
  const seen = new Set();
  strip(read(f)).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)) {
      const id = m[1];
      if (idsDefined.has(id) || idsDefinedTemplate.some(p => p && id.startsWith(p)) || idsDefinedSuffix.some(x => id.endsWith(x)) || seen.has(id)) continue;
      seen.add(id);
      fail('ids', `${f}:${i + 1} getElementById('${id}') but nothing creates an element with that id`);
    }
  });
}

// 6. Database expectations must match the sql/ folder.
const g = cp.spawnSync(process.execPath, [path.join(root, 'tools/gen-schema-expected.js'), '--check'], { encoding: 'utf8' });
if (g.status !== 0) fail('schema', (g.stderr || g.stdout).trim());

// 7. No stale references to things that were removed.
for (const f of jsFiles.concat(['index.html'])) {
  const t = read(f);
  if (/PublicDashboard|DashboardStats|view-public-dashboard/.test(t)) fail('removed', `${f} still refers to the removed public dashboard`);
}

if (problems.length) { console.error(problems.join('\n') + `\n\n${problems.length} problem(s) found.`); process.exit(1); }
console.log(`OK: ${jsFiles.length} scripts parse, service-worker list in sync, no UTC date slicing, ${declared.size} globals checked.`);
