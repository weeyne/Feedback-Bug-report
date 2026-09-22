// Fails if zod (or other forbidden runtime code) leaked into the embed bundle.
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../dist/widget.js', import.meta.url), 'utf8');
const forbidden = ['ZodError', '$ZodType', 'innerHTML', 'insertAdjacentHTML'];
const found = forbidden.filter((needle) => bundle.includes(needle));
if (found.length) {
  console.error(`dist/widget.js contains forbidden code: ${found.join(', ')}`);
  process.exit(1);
}
console.log('dist/widget.js: no forbidden code');
