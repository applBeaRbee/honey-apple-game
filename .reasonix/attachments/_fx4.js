const fs = require('fs');
const path = 'mv-beautify-panel.json';

// Read as raw text, do simple string replacement
let raw = fs.readFileSync(path, 'utf-8');

// Replace the data section push: _dB → _rd(_dt)
// In the JSON file, 匣 is stored as \\\\u5323 (4 backslashes in JSON = 2 backslashes in JS string)
// We need to match the exact pattern in the JSON text
raw = raw.replace(
  '_cards.push(_c(\\"\\\\u5323\\",\\"\\\\u5377\\\\u7262\\",_dB,_C.dt,{collapsed:true}));',
  '_cards.push(_c(\\"\\\\u5323\\",\\"\\\\u5377\\\\u7262\\",_rd(_dt),_C.dt,{collapsed:true}));'
);

// Clean up old data parsing code (everything between "// 9. data" and data push)
const dtTag = '// 9. data';
const pushTag = '_cards.push(_c(\\"\\\\u5323\\",\\"\\\\u5377\\\\u7262\\",_rd(_dt)';
const dtStart = raw.indexOf(dtTag);
const pushStart = raw.indexOf(pushTag);
if (dtStart >= 0 && pushStart >= 0) {
  const oldBlock = raw.substring(dtStart, pushStart);
  const newBlock = '// 9. data\\nvar _dt=_parsed.dt;\\nif(_dt){_dt=_dt.replace(/`{3}(?:markdown)?\\\\s*/g,\\"\\").replace(/`{3}\\\\s*$/g,\\"\\").trim();}';
  raw = raw.replace(oldBlock, newBlock);
  console.log('Data section simplified!');
} else {
  console.log('Data markers not found:', dtStart, pushStart);
}

fs.writeFileSync(path, raw, 'utf-8');

// Verify
const obj = JSON.parse(fs.readFileSync(path, 'utf-8'));
const t = obj.replaceString;
console.log('JSON valid: YES');
console.log('_rd(_dt):', t.includes('_rd(_dt'));
const checks = [
  ['_rn function', t.includes('function _rn')],
  ['_rd function', t.includes('function _rd')],
  ['doc CSS', t.includes('.mvd .mv-doc-h')],
  ['list CSS', t.includes('.mv-list-bullet')],
  ['data _rd', t.includes('_rd(_dt')],
  ['supp _rd', t.includes('_rd(it.c)')],
  ['object check profile', t.includes("typeof _pfP[_k][_fk]==='object'")],
  ['br fix', t.includes('.replace(/\\n')],
  ['truncation filter', t.includes('内容过长')],
  ['copy update', t.includes('.mv-list-bullet,')],
];
checks.forEach(([name, ok]) => console.log(name + ':', ok));
