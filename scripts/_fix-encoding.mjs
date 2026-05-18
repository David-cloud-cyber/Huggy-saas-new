import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''));
const targets = ['index.html', 'builder.html', 'dashboard.html'];

const replacements = [
  ['â”€', '\u2500'],
  ['”€', '\u2500'],
  ['â€”', '\u2014'],
  ['â€“', '\u2013'],
  ['â€™', '\u2019'],
  ['â€˜', '\u2018'],
  ['â€œ', '\u201C'],
  ['â€\u009D', '\u201D'],
  ['â€¦', '\u2026'],
  ['â€¢', '\u2022'],
  ['â†‘', '\u2191'],
  ['â†“', '\u2193'],
  ['â†’', '\u2192'],
  ['âœ“', '\u2713'],
  ['âœ•', '\u2715'],
  ['Ã©', 'é'],
  ['Ã¨', 'è'],
  ['Ãª', 'ê'],
  ['Ã«', 'ë'],
  ['Ã ', 'à'],
  ['Ã¢', 'â'],
  ['Ã®', 'î'],
  ['Ã¯', 'ï'],
  ['Ã´', 'ô'],
  ['Ã¶', 'ö'],
  ['Ã»', 'û'],
  ['Ã¼', 'ü'],
  ['Ã§', 'ç'],
  ['Ã‰', 'É'],
  ['Ã€', 'À'],
  ['Â·', '·'],
  ['Â©', '©'],
  ['Â®', '®'],
  ['Â°', '°'],
  ['Â ', ' '],
  ['Â', ''],
  ['ï»¿', ''],
  ['”€”€', '\u2500\u2500'],
];

for (const file of targets) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, 'utf8');
  const before = text;
  for (const [bad, good] of replacements) {
    text = text.split(bad).join(good);
  }
  if (text !== before) {
    fs.writeFileSync(full, text, 'utf8');
    console.log('fixed', file);
  } else {
    console.log('clean ', file);
  }
}
