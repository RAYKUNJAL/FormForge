import { chromium } from 'playwright';
import fs from 'node:fs';

function binaryStlCube(sizeMm) {
  const s = sizeMm;
  const v = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ];
  const tris = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
  ];
  const buffer = Buffer.alloc(84 + tris.length * 50);
  buffer.writeUInt32LE(tris.length, 80);
  let offset = 84;
  for (const tri of tris) {
    offset += 12; // normal left zero; loaders recompute
    for (const cornerIndex of tri) {
      for (const coord of v[cornerIndex]) { buffer.writeFloatLE(coord, offset); offset += 4; }
    }
    offset += 2;
  }
  return buffer;
}

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

async function expectDownload(buttonName, minBytes) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error(`${buttonName} did not produce a file`);
  const size = fs.statSync(path).size;
  if (size <= minBytes) throw new Error(`${buttonName} produced a file that is too small: ${size}`);
  return { name: download.suggestedFilename(), size };
}

// --- Workflow 1: image to relief ---
const sample = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('input[type=file]', { name: 'sample.png', mimeType: 'image/png', buffer: sample });
await page.getByText('Image ready. Choose dimensions and generate the model.').waitFor();
await page.getByLabel('Width').fill('8 1/2');
await page.getByLabel('Height').fill('5');
await page.getByRole('button', { name: 'Make It Printable' }).click();
await page.getByText('Validated').waitFor();
const reliefStatus = await page.getByTestId('status').textContent();
if (!reliefStatus?.includes('Ready to print')) throw new Error(`Unexpected status: ${reliefStatus}`);
const reliefFit = await page.getByTestId('fit').textContent();
if (!reliefFit?.includes('Fits the Bambu Lab P1S')) throw new Error(`Unexpected relief fit result: ${reliefFit}`);
const reliefStl = await expectDownload('Download STL', 84);
const relief3mf = await expectDownload('Download 3MF (Bambu)', 200);
if (!relief3mf.name.endsWith('.3mf')) throw new Error(`Unexpected 3MF name: ${relief3mf.name}`);

// --- Workflow 2: 3D model to print-ready ---
await page.getByRole('button', { name: '3D Model → Print' }).click();
await page.setInputFiles('input[accept=".stl,.obj,.glb,.gltf,.3mf"]', {
  name: 'ai-cube.stl', mimeType: 'model/stl', buffer: binaryStlCube(10),
});
await page.getByTestId('repair-report').waitFor();
await page.getByText('Model ready').waitFor();
await page.getByLabel('Finished size').fill('4');
const modelSize = await page.getByTestId('model-size').textContent();
if (!modelSize?.includes('101.6 × 101.6 × 101.6')) throw new Error(`Unexpected prepared size: ${modelSize}`);
const modelFit = await page.getByTestId('fit').textContent();
if (!modelFit?.includes('Fits the Bambu Lab P1S')) throw new Error(`Unexpected model fit result: ${modelFit}`);

// Oversized models must be flagged for a small printer.
await page.getByLabel('Printer').selectOption('a1-mini');
await page.getByLabel('Finished size').fill('200');
await page.getByRole('button', { name: 'Millimeters' }).click();
const badFit = await page.getByTestId('fit').textContent();
if (!badFit?.includes('Too large for the Bambu Lab A1 mini')) throw new Error(`Oversize fit check failed: ${badFit}`);

await page.getByLabel('Finished size').fill('120');
await page.getByText('Fits the Bambu Lab A1 mini').waitFor();
const model3mf = await expectDownload('Download 3MF (Bambu)', 200);
const modelStl = await expectDownload('Download STL', 84);

// Base plate option should extend the height.
await page.getByText('Add flat base plate').click();
await page.getByLabel('Base plate thickness').fill('2');
await page.getByText('Finished size: 120.0 × 120.0 × 122.0 mm').waitFor();

if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(' | ')}`);
console.log(JSON.stringify({ reliefStatus, reliefStl, relief3mf, modelSize, model3mf, modelStl }, null, 2));
await browser.close();
