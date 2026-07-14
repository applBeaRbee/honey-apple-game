const fs = require('fs');
const filePath = 'mv-beautify-panel.json';

// Work directly on the JSON file text to avoid double-parse issues
let raw = fs.readFileSync(filePath, 'utf-8');

// After JSON.parse, replaceString contains literal \\u5323 (backslash+backslash+u5323)
// In the raw JSON file this is stored as \\\\\\\\u5323 (8 raw chars: \\ \\ \\ \\ u 5 3 2 3)
// We need to replace _dB with _rd(_dt)
const oldPush = '_cards.push(_c(\\"\\\\u5323\\",\\"\\\\u5377\\\\u7262\\",_dB,_C.dt,{collapsed:true}));';
const newPush = '_cards.push(_c(\\"\\\\u5323\\",\\"\\\\u5377\\\\u7262\\",_rd(_dt),_C.dt,{collapsed:true}));';

if (raw.includes(oldPush)) {
  raw = raw.replace(oldPush, newPush);
  console.log('Data push replaced!');
} else {
  console.log('oldPush NOT FOUND');
  // Debug: find what's around the data area
  const idx = raw.lastIndexOf('_cards.push');
  if (idx >= 0) console.log('Found at', idx, ':', raw.substring(idx, idx+90));
}

// Clean up old data parsing code (everything between "// 9. data" and data push)
const dtLabel = '// 9. data';
const newPushTag = '_cards.push(_c(\\"\\\\u5323\\",\\"\\\\u5377\\\\u7262\\",_rd(_dt)';
const dtStart = raw.indexOf(dtLabel);
const pushPos = raw.indexOf(newPushTag);
if (dtStart >= 0 && pushPos >= 0) {
  const oldBlock = raw.substring(dtStart, pushPos);
  const newBlock = '// 9. data\\nvar _dt=_parsed.dt;\\nif(_dt){_dt=_dt.replace(/`{3}(?:markdown)?\\\\s*/g,\\"\\").replace(/`{3}\\\\s*$/g,\\"\\").trim();}';
  raw = raw.replace(oldBlock, newBlock);
  console.log('Data section simplified!');
} else {
  console.log('Data markers:', dtStart, '/', pushPos);
}

fs.writeFileSync(filePath, raw, 'utf-8');
console.log('Written!');

// Verify
const obj = JSON.parse(raw);
const t = obj.replaceString;
console.log('JSON valid: YES');
console.log('_rd(_dt):', t.includes('_rd(_dt') ? 'YES' : 'FAIL');
const checks = [
  ['_rn function', 'function _rn'],
  ['_rd function', 'function _rd'],
  ['doc CSS', '.mvd .mv-doc-h'],
  ['list CSS', '.mv-list-bullet'],
  ['_rd for data', '_rd(_dt'],
  ['_rd for supp', '_rd(it.c)'],
  ['object check profile', "typeof _pfP[_k][_fk]==='object'"],
  ['truncation filter', '内容过长'],
  ['copy update', '.mv-list-bullet,'],
];
checks.forEach(([name, pattern]) => console.log(name + ':', t.includes(pattern) ? 'YES' : 'FAIL'));
