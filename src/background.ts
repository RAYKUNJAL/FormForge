export type BackgroundRemovalResult = {
  imageData: ImageData;
  clearedFraction: number;
};

// Constructs ImageData even in environments without the DOM constructor
// (unit tests, workers).
export function makeImageData(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(data, width, height);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

// Flood-fills from the image border, clearing pixels that look like a
// continuous background (solid colors and soft gradients). Works well on
// AI-generated renders, which almost always place the subject on a plain
// backdrop.
export function removeBackground(source: ImageData, tolerance = 40): BackgroundRemovalResult {
  const { width, height } = source;
  const data = new Uint8ClampedArray(source.data);
  const state = new Uint8Array(width * height); // 0 = unseen, 1 = queued/background
  const queue: number[] = [];

  let borderR = 0, borderG = 0, borderB = 0, borderSamples = 0;
  const sampleBorder = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    borderR += data[i]; borderG += data[i + 1]; borderB += data[i + 2];
    borderSamples++;
  };
  for (let x = 0; x < width; x++) { sampleBorder(x, 0); sampleBorder(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { sampleBorder(0, y); sampleBorder(width - 1, y); }
  borderR /= borderSamples; borderG /= borderSamples; borderB /= borderSamples;

  const distanceTo = (i: number, r: number, g: number, b: number) => {
    const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const enqueueIfBackground = (x: number, y: number, fromIndex: number) => {
    const pixel = y * width + x;
    if (state[pixel]) return;
    const i = pixel * 4;
    const nearBorderColor = distanceTo(i, borderR, borderG, borderB) <= tolerance;
    const nearNeighbor = fromIndex >= 0 && distanceTo(i, data[fromIndex], data[fromIndex + 1], data[fromIndex + 2]) <= tolerance * 0.55;
    if (nearBorderColor || nearNeighbor) {
      state[pixel] = 1;
      queue.push(pixel);
    }
  };

  for (let x = 0; x < width; x++) { enqueueIfBackground(x, 0, -1); enqueueIfBackground(x, height - 1, -1); }
  for (let y = 0; y < height; y++) { enqueueIfBackground(0, y, -1); enqueueIfBackground(width - 1, y, -1); }

  while (queue.length) {
    const pixel = queue.pop()!;
    const x = pixel % width, y = (pixel - x) / width;
    const i = pixel * 4;
    if (x > 0) enqueueIfBackground(x - 1, y, i);
    if (x < width - 1) enqueueIfBackground(x + 1, y, i);
    if (y > 0) enqueueIfBackground(x, y - 1, i);
    if (y < height - 1) enqueueIfBackground(x, y + 1, i);
  }

  let cleared = 0;
  for (let pixel = 0; pixel < state.length; pixel++) {
    if (state[pixel]) {
      data[pixel * 4 + 3] = 0;
      cleared++;
    }
  }
  return {
    imageData: makeImageData(data, width, height),
    clearedFraction: cleared / (width * height),
  };
}
