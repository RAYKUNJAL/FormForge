import { describe, expect, it } from 'vitest';
import { checkFit, getPrinter, PRINTERS } from './printers';

describe('printer profiles', () => {
  it('includes the Bambu lineup with sane bed sizes', () => {
    expect(PRINTERS.length).toBeGreaterThanOrEqual(7);
    expect(getPrinter('a1-mini').bedX).toBe(180);
    expect(getPrinter('x1c').bedX).toBe(256);
    expect(getPrinter('unknown-id').name).toContain('Bambu');
  });

  it('passes models that fit', () => {
    const report = checkFit({ x: 100, y: 100, z: 50 }, getPrinter('p1s'));
    expect(report.fits).toBe(true);
    expect(report.message).toContain('P1S');
  });

  it('rejects oversized models with a plain explanation', () => {
    const report = checkFit({ x: 200, y: 100, z: 300 }, getPrinter('a1-mini'));
    expect(report.fits).toBe(false);
    expect(report.message).toContain('width by 20.0 mm');
    expect(report.message).toContain('height by 120.0 mm');
  });
});
