import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildReliefGeometry, geometryToBinaryStl, parseDimension, validateGeometry } from './mesh';
import './App.css';

type Unit = 'in' | 'mm';

function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState('formforge-model');
  const [rotation, setRotation] = useState(0);
  const [unit, setUnit] = useState<Unit>('in');
  const [width, setWidth] = useState('6');
  const [height, setHeight] = useState('4');
  const [base, setBase] = useState('0.12');
  const [relief, setRelief] = useState('0.10');
  const [resolution, setResolution] = useState(72);
  const [invert, setInvert] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState('Upload an image to begin.');
  const [error, setError] = useState('');
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  const settings = useMemo(() => {
    try {
      return {
        widthMm: parseDimension(width, unit),
        heightMm: parseDimension(height, unit),
        baseMm: parseDimension(base, unit),
        reliefMm: parseDimension(relief, unit),
        resolution,
        invert,
      };
    } catch {
      return null;
    }
  }, [width, height, base, relief, unit, resolution, invert]);

  const processImage = (url: string, degrees: number) => {
    const image = new Image();
    image.onload = () => {
      const rad = degrees * Math.PI / 180;
      const swap = Math.abs(degrees % 180) === 90;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? image.height : image.width;
      canvas.height = swap ? image.width : image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      setImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setStatus('Image ready. Choose dimensions and generate the model.');
    };
    image.src = url;
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please upload a PNG, JPG, WEBP, or SVG image.'); return; }
    setError('');
    const url = URL.createObjectURL(file);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(url);
    setFileName(file.name.replace(/\.[^.]+$/, '') || 'formforge-model');
    setRotation(0);
    processImage(url, 0);
  };

  useEffect(() => {
    if (imageUrl) processImage(imageUrl, rotation);
  }, [imageUrl, rotation]);

  const generate = () => {
    setError('');
    if (!imageData) { setError('Upload an image first.'); return; }
    if (!settings) { setError('Check the dimensions. Use positive numbers or fractions such as 1/4.'); return; }
    try {
      const next = buildReliefGeometry(imageData, settings);
      const report = validateGeometry(next, settings);
      if (!report.valid) throw new Error(report.errors.join(' '));
      geometry?.dispose();
      setGeometry(next);
      setStatus(`Ready to print · ${report.triangleCount.toLocaleString()} triangles · ${report.size.x.toFixed(1)} × ${report.size.y.toFixed(1)} × ${report.size.z.toFixed(1)} mm`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Model generation failed.');
    }
  };

  const download = () => {
    if (!geometry || !settings) { setError('Generate a valid model before downloading.'); return; }
    const report = validateGeometry(geometry, settings);
    if (!report.valid) { setError(report.errors.join(' ')); return; }
    const blob = geometryToBinaryStl(geometry);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_${report.size.x.toFixed(1)}x${report.size.y.toFixed(1)}x${report.size.z.toFixed(1)}mm.stl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f7fb');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
    camera.position.set(170, -190, 145);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5d6878, 2.2));
    const directional = new THREE.DirectionalLight(0xffffff, 2.5);
    directional.position.set(100, -80, 180);
    scene.add(directional);
    const grid = new THREE.GridHelper(300, 20, 0x9aa7b5, 0xd8dfe7);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.2;
    scene.add(grid);
    let mesh: THREE.Mesh | null = null;
    if (geometry) {
      const material = new THREE.MeshStandardMaterial({ color: 0x667085, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox!.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.position.set(maxDim * 1.15, -maxDim * 1.35, maxDim * 0.9);
      controls.target.set(0, 0, size.z / 3);
    }
    const resize = () => {
      const w = mount.clientWidth || 700, h = mount.clientHeight || 520;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    let frame = 0;
    const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
    animate();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose();
      if (mesh?.material) (mesh.material as THREE.Material).dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [geometry]);

  return (
    <div className="app-shell">
      <header><div><span className="brand-mark">F</span><strong>FormForge</strong></div><span className="tagline">Image to printable relief</span></header>
      <main>
        <section className="workspace">
          <aside className="panel controls">
            <div className="step"><span>1</span><div><b>Upload artwork</b><small>PNG, JPG, WEBP or SVG</small></div></div>
            <button className="upload" onClick={() => fileInputRef.current?.click()}>{imageUrl ? 'Replace image' : 'Choose image'}</button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
            {imageUrl && <div className="image-card"><img src={imageUrl} alt="Uploaded artwork" style={{ transform: `rotate(${rotation}deg)` }} /><div><button onClick={() => setRotation((rotation + 270) % 360)}>↶</button><button onClick={() => setRotation((rotation + 90) % 360)}>↷</button></div></div>}
            <div className="step"><span>2</span><div><b>Finished size</b><small>The app converts inches automatically</small></div></div>
            <div className="segmented"><button className={unit === 'in' ? 'active' : ''} onClick={() => setUnit('in')}>Inches</button><button className={unit === 'mm' ? 'active' : ''} onClick={() => setUnit('mm')}>Millimeters</button></div>
            <div className="field-grid">
              <label>Width<input aria-label="Width" value={width} onChange={e => setWidth(e.target.value)} /></label>
              <label>Height<input aria-label="Height" value={height} onChange={e => setHeight(e.target.value)} /></label>
              <label>Base thickness<input aria-label="Base thickness" value={base} onChange={e => setBase(e.target.value)} /></label>
              <label>Relief depth<input aria-label="Relief depth" value={relief} onChange={e => setRelief(e.target.value)} /></label>
            </div>
            {settings && <p className="conversion">Final footprint: {settings.widthMm.toFixed(1)} × {settings.heightMm.toFixed(1)} mm</p>}
            <button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide' : 'Show'} advanced mode</button>
            {advanced && <div className="advanced"><label>Mesh detail: {resolution}<input type="range" min="24" max="140" value={resolution} onChange={e => setResolution(Number(e.target.value))} /></label><label className="check"><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} /> Invert image depth</label></div>}
            <button className="primary" onClick={generate}>Make It Printable</button>
            <button className="secondary" disabled={!geometry} onClick={download}>Download STL</button>
            {error && <div role="alert" className="error">{error}</div>}
          </aside>
          <section className="preview-panel">
            <div className="preview-header"><div><b>3D Preview</b><small>Drag to rotate · scroll to zoom</small></div><span className={geometry ? 'ready' : 'waiting'}>{geometry ? 'Validated' : 'Waiting'}</span></div>
            <div ref={mountRef} className="viewer" data-testid="viewer">{!geometry && <div className="empty"><div className="cube">▱</div><b>Your printable model appears here</b><span>Upload artwork, enter a size, then select Make It Printable.</span></div>}</div>
            <div className="status" data-testid="status">{status}</div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
