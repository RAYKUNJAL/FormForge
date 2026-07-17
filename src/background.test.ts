import { describe, expect, it } from 'vitest';
import { makeImageData, removeBackground } from './background';

function syntheticRender(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isSubject = x >= 6 && x < 14 && y >= 6 && y < 14;
      const value = isSubject ? 20 : 245 - y; // dark subject on a soft light gradient
      data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
  }
  return makeImageData(data, width, height);
}

describe('removeBackground', () => {
  it('clears the backdrop but keeps the subject', () => {
    const { imageData, clearedFraction } = removeBackground(syntheticRender(20, 20));
    const alphaAt = (x: number, y: number) => imageData.data[(y * 20 + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(19, 19)).toBe(0);
    expect(alphaAt(10, 10)).toBe(255);
    expect(clearedFraction).toBeGreaterThan(0.5);
    expect(clearedFraction).toBeLessThan(1);
  });

  it('does not eat a subject that touches the border color range', () => {
    const { imageData } = removeBackground(syntheticRender(20, 20));
    let subjectPixels = 0;
    for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) {
      if (imageData.data[(y * 20 + x) * 4 + 3] === 255) subjectPixels++;
    }
    expect(subjectPixels).toBe(64);
  });
});
