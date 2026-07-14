const fs = require('fs');
let raw = fs.readFileSync('mv-beautify-panel.json', 'utf-8');
const lines = raw.split('\n');

// Line 5 (0-indexed: line 4) contains the replaceString
// Extract: we need to re-stringify just the replaceString value
// Find the key
const key = '"replaceString": "';
const keyIdx = raw.indexOf(key);
const valueStart = keyIdx + key.length;

// Find the end: the last " before \n  "trimStrings"
const trimStr = '\n  "trimStrings"';
const trimIdx = raw.indexOf(trimStr);
if (trimIdx === -1) { console.log('trimIdx not found'); process.exit(1); }

// The value ends right before the \n and trimStrings
// Go backwards from trimIdx to find the closing quote of replaceString
let end = trimIdx;
while (end > valueStart && raw[end] !== '"') end--;
// end is at the closing quote of the string
if (end <= valueStart) { console.log('end not found'); process.exit(1); }

const rawValue = raw.substring(valueStart, end);
console.log('Raw value length:', rawValue.length);

// Properly JSON-escape the value
// In JSON strings, we need to escape: " -> \", \ -> \\, and control chars
let escaped = '';
for (let i = 0; i < rawValue.length; i++) {
  const c = rawValue[i];
  const code = c.charCodeAt(0);
  if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
    // Control char - should not happen
    escaped += '\\u' + code.toString(16).padStart(4, '0');
  } else if (c === '"') {
    escaped += '\\"';
  } else if (c === '\\') {
    escaped += '\\\\';
  } else if (code === 0x0A) {
    escaped += '\\n';
  } else if (code === 0x0D) {
    escaped += '\\r';
  } else if (code === 0x09) {
    escaped += '\\t';
  } else {
    escaped += c;
  }
}

// Reconstruct the file
const newFile = raw.substring(0, valueStart) + escaped + raw.substring(end);
fs.writeFileSync('mv-beautify-panel.json', newFile, 'utf-8');
console.log('Escaped and written');

// Verify
try {
  const obj = JSON.parse(fs.readFileSync('mv-beautify-panel.json', 'utf-8'));
  console.log('JSON valid: YES');
  console.log('replaceString length:', obj.replaceString.length);
  console.log('Has _rn:', obj.replaceString.includes('function _rn'));
  console.log('Has _rd:', obj.replaceString.includes('function _rd'));
  console.log('Has list CSS:', obj.replaceString.includes('.mv-list-bullet'));
  console.log('Has doc CSS:', obj.replaceString.includes('.mvd .mv-doc-h'));
  console.log('Has supp _rd:', obj.replaceString.includes('_rd(it.c)'));
  console.log('Has data section:', obj.replaceString.includes('// 9. data'));
} catch(e) {
  console.log('Still broken:', e.message.substring(0, 100));
}
