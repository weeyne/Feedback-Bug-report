// Copies the built widget into public/w/ so it is served from the same origin as the API.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const src = new URL('../../../packages/widget/dist/', import.meta.url);
const dest = new URL('../public/w/', import.meta.url);

if (!existsSync(new URL('widget.js', src))) {
  console.error(
    'packages/widget/dist/widget.js not found. Run: pnpm --filter @dymcode/widget build',
  );
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const file of ['widget.js', 'screenshot.js']) cpSync(new URL(file, src), new URL(file, dest));
console.log('Copied widget.js and screenshot.js into apps/web/public/w/');
