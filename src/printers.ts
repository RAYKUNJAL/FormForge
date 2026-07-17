export type PrinterProfile = {
  id: string;
  name: string;
  bedX: number;
  bedY: number;
  bedZ: number;
};

export const PRINTERS: PrinterProfile[] = [
  { id: 'a1-mini', name: 'Bambu Lab A1 mini', bedX: 180, bedY: 180, bedZ: 180 },
  { id: 'a1', name: 'Bambu Lab A1', bedX: 256, bedY: 256, bedZ: 256 },
  { id: 'p1p', name: 'Bambu Lab P1P', bedX: 256, bedY: 256, bedZ: 256 },
  { id: 'p1s', name: 'Bambu Lab P1S', bedX: 256, bedY: 256, bedZ: 256 },
  { id: 'x1c', name: 'Bambu Lab X1 Carbon', bedX: 256, bedY: 256, bedZ: 256 },
  { id: 'x1e', name: 'Bambu Lab X1E', bedX: 256, bedY: 256, bedZ: 256 },
  { id: 'h2d', name: 'Bambu Lab H2D', bedX: 350, bedY: 320, bedZ: 325 },
];

export function getPrinter(id: string): PrinterProfile {
  return PRINTERS.find(p => p.id === id) ?? PRINTERS[3];
}

export type FitReport = {
  fits: boolean;
  message: string;
};

export function checkFit(size: { x: number; y: number; z: number }, printer: PrinterProfile): FitReport {
  const overX = size.x > printer.bedX;
  const overY = size.y > printer.bedY;
  const overZ = size.z > printer.bedZ;
  if (!overX && !overY && !overZ) {
    return { fits: true, message: `Fits the ${printer.name} (${printer.bedX} × ${printer.bedY} × ${printer.bedZ} mm build volume).` };
  }
  const axes: string[] = [];
  if (overX) axes.push(`width by ${(size.x - printer.bedX).toFixed(1)} mm`);
  if (overY) axes.push(`depth by ${(size.y - printer.bedY).toFixed(1)} mm`);
  if (overZ) axes.push(`height by ${(size.z - printer.bedZ).toFixed(1)} mm`);
  return {
    fits: false,
    message: `Too large for the ${printer.name}: over on ${axes.join(', ')}. Reduce the finished size or choose a larger printer.`,
  };
}
