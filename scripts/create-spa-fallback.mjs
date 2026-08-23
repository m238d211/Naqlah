import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/create-spa-fallback.mjs <dist-directory>');
await copyFile(join(directory, 'index.html'), join(directory, '200.html'));
console.log(`Created ${join(directory, '200.html')}`);
