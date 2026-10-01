// Detection and false-positive rates of screenContent on a labelled corpus. No network.
//   node tests/screen-eval.mjs tests/screen-corpora/corpus-2.json
import { readFile } from 'node:fs/promises';
import { screenContent } from '../scripts/url-screen.mjs';
const corpus = JSON.parse(await readFile(process.argv[2], 'utf8'));
const run = list => list.map(x => ({ id: x.id, severity: screenContent(x.text).severity }));
const injection = run(corpus.injection), benign = run(corpus.benign), count = (list, f) => list.filter(f).length;
console.log(JSON.stringify({
  injection: { n: injection.length, detected_strict_HIGH: count(injection, x => x.severity === 'HIGH'), detected_lenient_HIGH_or_LOW: count(injection, x => x.severity !== 'NONE') },
  benign: { n: benign.length, false_positive_strict_HIGH: count(benign, x => x.severity === 'HIGH'), false_positive_lenient_HIGH_or_LOW: count(benign, x => x.severity !== 'NONE') },
}, null, 2));
