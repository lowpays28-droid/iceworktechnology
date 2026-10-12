import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('public/vendor', { recursive: true });
await copyFile('node_modules/@netlify/identity/dist/main.js', 'public/vendor/netlify-identity.js');
await copyFile('node_modules/gotrue-js/lib/index.js', 'public/vendor/identity-transport.js');
