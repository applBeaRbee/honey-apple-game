const fs = require('fs');
const path = 'mv-beautify-panel.json';
let raw = fs.readFileSync(path, 'utf-8');

// The data section has literal newlines in the JSON string - fix them
// Find and replace the corrupted block
const oldBlock = '// 9. data\nvar _dt=_parsed.dt;\nif(_dt){_dt=_dt.replace(/`{3}(?:markdown)?\\s*/g,"").replace(/`{3}\\s*$/g,"").trim();var _dL=_dt.split(\\"\\\\n\\");var _dB=\\"\\";var _dS=\\"\\";for(var _di=0;_di<_dL.length;_di++){var';

// The replacement: simple data extraction
const newBlock = '// 9. data\nvar _dt=_parsed.dt;\nif(_dt){_dt=_dt.replace(/`{3}(?:markdown)?\\s*/g,"").replace(/`{3}\\s*$/g,"").trim();}';

// But wait - the newlines here need to be real \n bytes that JSON allows...
// Actually no! JSON strings CANNOT contain literal newlines. They must use \\n.
// But the CRASH happened during JSON.parse. The old version already stored \n as literal newlines??
// Let me check more carefully...

const idx = raw.indexOf(oldBlock);
if (idx >= 0) {
  console.log('Found old block at', idx);
  raw = raw.replace(oldBlock, newBlock);
  console.log('Replaced!');
} else {
  console.log('Old block not found - checking what we have');
  // Search for "9. data" area
  const ci = raw.indexOf('9. data');
  if (ci >= 0) {
    console.log('Context around 9. data:', raw.substring(ci-5, ci+80));
  }
}

try {
  JSON.parse(raw);
  console.log('JSON is now valid!');
  fs.writeFileSync(path, raw, 'utf-8');
  console.log('Written!');
} catch(e) {
  console.log('Still broken:', e.message.substring(0, 100));
}
