import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildReliefGeometry, parseDimension, validateGeometry } from './mesh';
import { geometryTo3mf, geometryToBinaryStl } from './exporters';
import { loadModelFile } from './loaders';
import { repairGeometry, type RepairResult } from './repair';
import { prepareModel, type SizeAxis } from './prepare';
import { checkFit, getPrinter, PRINTERS } from './printers';
import { removeBackground } from './background';
import './App.css';

type Unit = 'in' | 'mm';
type Mode = 'relief' | 'model';

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [aiAvailable, setAiAvailable] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [mode, setMode] = useState<Mode>('relief');
  const [printerId, setPrinterId] = useState('p1s');
  const [unit, setUnit] = useState<Unit>('in');
  const [status, setStatus] = useState('Upload an image to begin.');
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  // Image-relief workflow
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState('formforge-model');
  const [rotation, setRotation] = useState(0);
  const [stripBackground, setStripBackground] = useState(false);
  const [width, setWidth] = useState('6');
  const [height, setHeight] = useState('4');
  const [base, setBase] = useState('0.12');
  const [relief, setRelief] = useState('0.10');
  const [resolution, setResolution] = useState(72);
  const [invert, setInvert] = useState(false);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  // 3D-model workflow
  const [modelGeometry, setModelGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [repairReport, setRepairReport] = useState<RepairResult | null>(null);
  const [targetSize, setTargetSize] = useState('4');
  const [sizeAxis, setSizeAxis] = useState<SizeAxis>('longest');
  const [addBase, setAddBase] = useState(false);
  const [plateThickness, setPlateThickness] = useState('0.08');

  const printer = getPrinter(printerId);

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

  const prepared = useMemo(() => {
    if (!modelGeometry) return null;
    try {
      return prepareModel(modelGeometry, {
        targetMm: parseDimension(targetSize, unit),
        axis: sizeAxis,
        addBase,
        baseMm: addBase ? parseDimension(plateThickness, unit) : 0,
      });
    } catch {
      return null;
    }
  }, [modelGeometry, targetSize, unit, sizeAxis, addBase, plateThickness]);

  const activeGeometry = mode === 'relief' ? geometry : prepared?.geometry ?? null;

  const fit = useMemo(() => {
    if (!activeGeometry) return null;
    activeGeometry.computeBoundingBox();
    const size = new THREE.Vector3();
    activeGeometry.boundingBox!.getSize(size);
    return { size, report: checkFit(size, printer) };
  }, [activeGeometry, printer]);

  const processImage = (url: string, degrees: number, strip: boolean) => {
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
      let data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (strip) {
        const result = removeBackground(data);
        data = result.imageData;
        setStatus(`Background removed (${Math.round(result.clearedFraction * 100)}% of the image). Choose dimensions and generate the model.`);
      } else {
        setStatus('Image ready. Choose dimensions and generate the model.');
      }
      setImageData(data);
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
    processImage(url, 0, stripBackground);
  };

  useEffect(() => {
    if (imageUrl) processImage(imageUrl, rotation, stripBackground);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, rotation, stripBackground]);

  useEffect(() => {
    if (mode !== 'model' || aiAvailable !== 'unknown') return;
    fetch('/api/health')
      .then(response => setAiAvailable(response.ok ? 'yes' : 'no'))
      .catch(() => setAiAvailable('no'));
  }, [mode, aiAvailable]);

  const generateFromPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please upload a PNG, JPG, or WEBP picture.'); return; }
    setError('');
    setBusy(true);
    try {
      setStatus('Uploading the picture to the 3D generator…');
      const form = new FormData();
      form.append('image', file);
      const response = await fetch('/api/generate', { method: 'POST', body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? 'The 3D generator is not available on this server right now.');
      }
      const { job_id: jobId } = await response.json();
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const statusResponse = await fetch(`/api/jobs/${jobId}`);
        if (!statusResponse.ok) throw new Error('Lost contact with the 3D generator. Try again.');
        const job = await statusResponse.json();
        if (job.status === 'failed') throw new Error(job.error ?? '3D generation failed.');
        if (job.status === 'complete') break;
        setStatus(`Creating your 3D model — ${job.stage}…`);
      }
      const modelResponse = await fetch(`/api/jobs/${jobId}/model`);
      if (!modelResponse.ok) throw new Error('The generated model could not be downloaded. Try again.');
      const blob = await modelResponse.blob();
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'formforge-model';
      await handleModelFile(new File([blob], `${baseName}.glb`, { type: 'model/gltf-binary' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '3D generation failed.');
      setStatus('Upload a 3D model or a picture to begin.');
      setBusy(false);
    }
  };

  const handleModelFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setBusy(true);
    setStatus('Reading the 3D model…');
    try {
      const raw = await loadModelFile(file);
      setStatus('Analyzing and repairing the mesh…');
      await new Promise(resolve => setTimeout(resolve, 30));
      const result = repairGeometry(raw);
      raw.dispose();
      modelGeometry?.dispose();
      setModelGeometry(result.geometry);
      setRepairReport(result);
      setFileName(file.name.replace(/\.[^.]+$/, '') || 'formforge-model');
      setStatus(`Model ready · ${result.after.triangleCount.toLocaleString()} triangles · ${result.after.watertight ? 'watertight' : 'repaired with minor gaps left'}. Set the finished size and export.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The model could not be loaded.');
      setStatus('Upload a 3D model to begin.');
    } finally {
      setBusy(false);
    }
  };

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

  const exportModel = (format: 'stl' | '3mf') => {
    setError('');
    const target = activeGeometry;
    if (!target) { setError(mode === 'relief' ? 'Generate a valid model before downloading.' : 'Upload a 3D model before downloading.'); return; }
    if (mode === 'relief' && settings) {
      const report = validateGeometry(target, settings);
      if (!report.valid) { setError(report.errors.join(' ')); return; }
    }
    target.computeBoundingBox();
    const size = new THREE.Vector3();
    target.boundingBox!.getSize(size);
    const stamp = `${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}mm`;
    const blob = format === 'stl' ? geometryToBinaryStl(target) : geometryTo3mf(target, fileName);
    downloadBlob(blob, `${fileName}_${stamp}.${format}`);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    if (next === 'relief') setStatus(imageData ? 'Image ready. Choose dimensions and generate the model.' : 'Upload an image to begin.');
    else setStatus(modelGeometry ? 'Model ready. Set the finished size and export.' : 'Upload a 3D model from ChatGPT, Google, Meshy, Tripo, or any 3D tool.');
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f7fb');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    const bedMax = Math.max(printer.bedX, printer.bedY);
    camera.position.set(bedMax * 0.7, -bedMax * 0.85, bedMax * 0.6);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5d6878, 2.2));
    const directional = new THREE.DirectionalLight(0xffffff, 2.5);
    directional.position.set(100, -80, 180);
    scene.add(directional);
    const grid = new THREE.GridHelper(bedMax, Math.round(bedMax / 16), 0x9aa7b5, 0xd8dfe7);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.2;
    scene.add(grid);
    const bedOutline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-printer.bedX / 2, -printer.bedY / 2, 0),
        new THREE.Vector3(printer.bedX / 2, -printer.bedY / 2, 0),
        new THREE.Vector3(printer.bedX / 2, printer.bedY / 2, 0),
        new THREE.Vector3(-printer.bedX / 2, printer.bedY / 2, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x1769e0 }),
    );
    bedOutline.position.z = -0.1;
    scene.add(bedOutline);
    let mesh: THREE.Mesh | null = null;
    if (activeGeometry) {
      const fits = fit?.report.fits ?? true;
      const material = new THREE.MeshStandardMaterial({ color: fits ? 0x667085 : 0xb2543e, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(activeGeometry, material);
      scene.add(mesh);
      activeGeometry.computeBoundingBox();
      const size = new THREE.Vector3();
      activeGeometry.boundingBox!.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 10);
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
      bedOutline.geometry.dispose(); (bedOutline.material as THREE.Material).dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [activeGeometry, printer, fit]);

  return (
    <div className="app-shell">
      <header>
        <div><span className="brand-mark">F</span><strong>FormForge</strong></div>
        <nav className="mode-tabs">
          <button className={mode === 'relief' ? 'active' : ''} onClick={() => switchMode('relief')}>Image → Relief</button>
          <button className={mode === 'model' ? 'active' : ''} onClick={() => switchMode('model')}>3D Model → Print</button>
        </nav>
        <span className="tagline">Make it printable</span>
      </header>
      <main>
        <section className="workspace">
          <aside className="panel controls">
            {mode === 'relief' && <>
              <div className="step"><span>1</span><div><b>Upload artwork</b><small>PNG, JPG, WEBP or SVG</small></div></div>
              <button className="upload" onClick={() => fileInputRef.current?.click()}>{imageUrl ? 'Replace image' : 'Choose image'}</button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
              {imageUrl && <div className="image-card"><img src={imageUrl} alt="Uploaded artwork" style={{ transform: `rotate(${rotation}deg)` }} /><div><button onClick={() => setRotation((rotation + 270) % 360)}>↶</button><button onClick={() => setRotation((rotation + 90) % 360)}>↷</button></div></div>}
              {imageUrl && <label className="check strip"><input type="checkbox" checked={stripBackground} onChange={e => setStripBackground(e.target.checked)} /> Remove background automatically</label>}
              <div className="step"><span>2</span><div><b>Finished size</b><small>The app converts inches automatically</small></div></div>
              <div className="segmented"><button className={unit === 'in' ? 'active' : ''} onClick={() => setUnit('in')}>Inches</button><button className={unit === 'mm' ? 'active' : ''} onClick={() => setUnit('mm')}>Millimeters</button></div>
              <div className="field-grid">
                <label>Width<input aria-label="Width" value={width} onChange={e => setWidth(e.target.value)} /></label>
                <label>Height<input aria-label="Height" value={height} onChange={e => setHeight(e.target.value)} /></label>
                <label>Base thickness<input aria-label="Base thickness" value={base} onChange={e => setBase(e.target.value)} /></label>
                <label>Relief depth<input aria-label="Relief depth" value={relief} onChange={e => setRelief(e.target.value)} /></label>
              </div>
              {settings && <p className="conversion">Final footprint: {settings.widthMm.toFixed(1)} × {settings.heightMm.toFixed(1)} mm</p>}
              <div className="step"><span>3</span><div><b>Printer</b><small>Used to check the model fits the bed</small></div></div>
              <select aria-label="Printer" value={printerId} onChange={e => setPrinterId(e.target.value)}>
                {PRINTERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide' : 'Show'} advanced mode</button>
              {advanced && <div className="advanced"><label>Mesh detail: {resolution}<input type="range" min="24" max="140" value={resolution} onChange={e => setResolution(Number(e.target.value))} /></label><label className="check"><input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} /> Invert image depth</label></div>}
              <button className="primary" onClick={generate}>Make It Printable</button>
              <button className="secondary" disabled={!geometry} onClick={() => exportModel('3mf')}>Download 3MF (Bambu)</button>
              <button className="secondary" disabled={!geometry} onClick={() => exportModel('stl')}>Download STL</button>
            </>}
            {mode === 'model' && <>
              <div className="step"><span>1</span><div><b>Upload 3D model</b><small>STL, OBJ, GLB, GLTF or 3MF</small></div></div>
              <button className="upload" disabled={busy} onClick={() => modelInputRef.current?.click()}>{modelGeometry ? 'Replace model' : busy ? 'Working…' : 'Choose 3D model'}</button>
              <input ref={modelInputRef} type="file" accept=".stl,.obj,.glb,.gltf,.3mf" hidden onChange={e => { handleModelFile(e.target.files?.[0]); e.target.value = ''; }} />
              {aiAvailable === 'yes' && <>
                <div className="or">or</div>
                <button className="upload" disabled={busy} data-testid="ai-generate" onClick={() => photoInputRef.current?.click()}>{busy ? 'Working…' : 'Create 3D model from a picture'}</button>
                <input ref={photoInputRef} type="file" accept="image/*" hidden data-testid="photo-input" onChange={e => { generateFromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                <p className="hint">Built-in AI (TripoSR) turns one picture into a full 3D model. On CPU servers this takes a few minutes.</p>
              </>}
              {aiAvailable === 'no' && <p className="hint">Picture-to-3D generation is not running on this server. Deploy the AI service from DEPLOY.md to enable it.</p>}
              {repairReport && <div className="repair-card" data-testid="repair-report">
                <b>Automatic repair</b>
                <ul>{repairReport.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
              </div>}
              <div className="step"><span>2</span><div><b>Finished size</b><small>Model is scaled evenly, no distortion</small></div></div>
              <div className="segmented"><button className={unit === 'in' ? 'active' : ''} onClick={() => setUnit('in')}>Inches</button><button className={unit === 'mm' ? 'active' : ''} onClick={() => setUnit('mm')}>Millimeters</button></div>
              <div className="field-grid">
                <label>{sizeAxis === 'longest' ? 'Longest side' : sizeAxis === 'x' ? 'Width' : sizeAxis === 'y' ? 'Depth' : 'Height'}<input aria-label="Finished size" value={targetSize} onChange={e => setTargetSize(e.target.value)} /></label>
                <label>Measure<select aria-label="Size axis" value={sizeAxis} onChange={e => setSizeAxis(e.target.value as SizeAxis)}>
                  <option value="longest">Longest side</option>
                  <option value="x">Width</option>
                  <option value="y">Depth</option>
                  <option value="z">Height</option>
                </select></label>
              </div>
              {prepared && <p className="conversion" data-testid="model-size">Finished size: {prepared.size.x.toFixed(1)} × {prepared.size.y.toFixed(1)} × {prepared.size.z.toFixed(1)} mm</p>}
              <label className="check"><input type="checkbox" checked={addBase} onChange={e => setAddBase(e.target.checked)} /> Add flat base plate</label>
              {addBase && <label>Base plate thickness<input aria-label="Base plate thickness" value={plateThickness} onChange={e => setPlateThickness(e.target.value)} /></label>}
              <div className="step"><span>3</span><div><b>Printer</b><small>Used to check the model fits the bed</small></div></div>
              <select aria-label="Printer" value={printerId} onChange={e => setPrinterId(e.target.value)}>
                {PRINTERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="primary" disabled={!prepared} onClick={() => exportModel('3mf')}>Download 3MF (Bambu)</button>
              <button className="secondary" disabled={!prepared} onClick={() => exportModel('stl')}>Download STL</button>
            </>}
            {fit && <div className={fit.report.fits ? 'fit ok' : 'fit bad'} data-testid="fit">{fit.report.message}</div>}
            {error && <div role="alert" className="error">{error}</div>}
          </aside>
          <section className="preview-panel">
            <div className="preview-header"><div><b>3D Preview</b><small>Drag to rotate · scroll to zoom · blue line is the printer bed</small></div><span className={activeGeometry ? 'ready' : 'waiting'}>{activeGeometry ? 'Validated' : 'Waiting'}</span></div>
            <div ref={mountRef} className="viewer" data-testid="viewer">{!activeGeometry && <div className="empty"><div className="cube">▱</div><b>Your printable model appears here</b><span>{mode === 'relief' ? 'Upload artwork, enter a size, then select Make It Printable.' : 'Upload a 3D model — it is repaired and sized automatically.'}</span></div>}</div>
            <div className="status" data-testid="status">{status}</div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
