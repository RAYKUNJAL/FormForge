import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1365, height: 900 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));
await page.goto(process.env.FORMFORGE_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
const sample = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('input[type=file]', { name: 'sample.png', mimeType: 'image/png', buffer: sample });
await page.getByText('Image ready. Choose dimensions and generate the model.').waitFor();
await page.getByLabel('Width').fill('8 1/2');
await page.getByLabel('Height').fill('5');
await page.getByRole('button', { name: 'Make It Printable' }).click();
await page.getByText('Validated').waitFor();
const status = await page.getByTestId('status').textContent();
if (!status?.includes('Ready to print')) throw new Error(`Unexpected status: ${status}`);
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download STL' }).click();
const download = await downloadPromise;
const path = await download.path();
if (!path) throw new Error('STL download did not produce a file');
const size = fs.statSync(path).size;
if (size <= 84) throw new Error(`STL file is too small: ${size}`);
if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(' | ')}`);
console.log(JSON.stringify({ status, stlBytes: size }, null, 2));
await browser.close();
