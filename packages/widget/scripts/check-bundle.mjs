// Fails if zod (or other forbidden runtime code) leaked into the embed bundles.
import { readFileSync } from 'node:fs';

const forbidden = ['ZodError', '$ZodType', 'innerHTML', 'insertAdjacentHTML'];
let failed = false;

for (const file of ['widget.js', 'annotate.js']) {
  const bundle = readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  const found = forbidden.filter((needle) => bundle.includes(needle));
  if (found.length) {
    console.error(`dist/${file} contains forbidden code: ${found.join(', ')}`);
    failed = true;
  } else {
    console.log(`dist/${file}: no forbidden code`);
  }
}

if (failed) process.exit(1);
