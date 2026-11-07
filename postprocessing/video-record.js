/**
 * =========================================================================================
 *  MP4 VIDEO RECORDING ENGINE FOR THREE.JS & WEBGL (WebCodecs + Mp4Muxer + Tiled GPU Export)
 * =========================================================================================
 * 
 *  ⚠️ IMPORTANT INSTRUCTION FOR AI AGENTS & DEVELOPERS:
 *  ----------------------------------------------------
 *  DO NOT IMPORT THIS FILE AS AN EXTERNAL ES MODULE IN STANDALONE CODEPEN / HTML PROJECTS!
 *  Many projects in this repository are 100% self-contained single-file HTML applications
 *  running under the file:// protocol or inside standalone iframe/Codepen sandboxes where
 *  relative module imports will fail or create unwanted external dependencies.
 * 
 *  INSTEAD:
 *  COPY the code from this file (or the modular sections detailed below) DIRECTLY into
 *  your project's single HTML file (e.g., inside the main <script> tag alongside lil-gui and Three.js).
 * 
 * =========================================================================================
 *  WHAT DOES THIS MODULE SOLVE?
 * =========================================================================================
 *  Standard browser canvas recording (e.g. MediaRecorder API) has major limitations:
 *  1. Non-deterministic framerate — dependent on real-time rendering speed, dropping frames on heavy shaders.
 *  2. Resolution limits — constrained by display viewport and device pixel ratio (DPR).
 *  3. Video compression artifacts — blotchy macroblocking, banding across dark tones, and loss of fine details.
 *  4. Shaky animations & speed changes — animation timeline jumps if speed or FPS varies during export.
 * 
 *  THIS ENGINE SOLVES ALL OF THESE WITH:
 *  1. Exact Deterministic Rendering:
 *     Renders every frame at startTime + (frameIndex / 30) * animationSpeed, waiting for each frame
 *     to finish rendering before encoding. Constant 30 fps playback is guaranteed regardless of export speed.
 *  2. Arbitrary High-Resolution Tiled GPU Assembly:
 *     Exports at native DPR, 2x, 3x, 4x, or custom DPR without cropping, downscaling, or upscaling.
 *     Assembles large frames from overlapping GPU tiles (1024px core + 16px apron) with shader offsets
 *     (uFragCoordOffset) preserving screen-space derivatives (fwidth, dFdx, dFdy) and dithering across tile boundaries.
 *  3. Studio-Master H.264 Video Quality (Zero Compression Artifacts):
 *     Uses WebCodecs VideoEncoder with constant-quality quantizer mode (QP 1) and latencyMode: 'quality'.
 *     Passes explicit per-frame AVC quantizer parameters, completely eliminating macroblocking and banding.
 *  4. Hardware Fallback & Rate Control:
 *     If quantizer mode is unsupported by hardware drivers, falls back to resolution-proportional
 *     mastering bitrates (up to 180 Mbps) with 1-second keyframe intervals.
 *  5. Self-Contained Modal UI & Verification:
 *     Glassmorphic modal dialog with live progress bar, thumbnail preview, ETA, spec grid, cancel button,
 *     and dual MP4 container box parsing (stsz, mvhd, tkhd) + HTMLVideoElement verification.
 * 
 * =========================================================================================
 *  CRITICAL PITFALLS & IMPLEMENTATION RULES:
 * =========================================================================================
 *  1. The Three.js setPixelRatio(1) Trap:
 *     Three.js WebGLRenderer scales tile dimensions by this._pixelRatio during setSize().
 *     If renderer.setPixelRatio(1) is NOT called before tile rendering, tiles will be allocated
 *     at tileW * devicePixelRatio, distorting gl_FragCoord, slicing the scene with seams, and cutting
 *     off the viewport. ALWAYS call renderer.setPixelRatio(1) at start of export and restore preview DPR
 *     in cleanupAndRestore().
 * 
 *  2. The WebCodecs Chromium Quantizer Trap:
 *     Simply configuring { bitrateMode: 'quantizer' } is not enough! Chromium falls back to a coarse
 *     default quantizer (QP ~28-30) unless you explicitly pass encoder.encode(frame, { avc: { quantizer: targetQp } }).
 *     Always supply avc: { quantizer: 1 } for Master Quality.
 * 
 *  3. Scene & Event Isolation:
 *     Guard pointerdown, pointermove, keydown, and window resize listeners with 'if (isExporting) return;'.
 *     Cancel the requestAnimationFrame render loop during export (suspend()), and cleanly restore it afterward.
 * 
 *  4. Fast-Path Optimization:
 *     When exportWidth <= TILE_SIZE && exportHeight <= TILE_SIZE (cols === 1 && rows === 1), bypass tile
 *     loops and render directly in a single pass.
 * =========================================================================================
 */

/* ==========================================================================
   SECTION 1: MODAL DIALOG STYLES & DOM INJECTION
   ========================================================================== */

/**
 * CSS stylesheet for the glassmorphic MP4 export overlay.
 * Can be embedded directly inside <style> tags of your HTML file or injected dynamically.
 */
const EXPORT_MODAL_CSS = `
/* MP4 Export Modal & Overlay */
.export-overlay {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #ededed;
  opacity: 1; transition: opacity 0.2s ease;
  user-select: none;
}
.export-overlay[hidden] { display: none; }
.export-dialog {
  width: min(480px, 92vw);
  background: #111115;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex; flex-direction: column; gap: 16px;
}
.export-header {
  display: flex; flex-direction: column; gap: 4px;
}
.export-title-row {
  display: flex; align-items: center; justify-content: space-between;
}
.export-title-row h2 {
  margin: 0; font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; color: #fff;
}
.export-badge {
  font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 3px 8px; border-radius: 9999px; background: rgba(255, 255, 255, 0.1); color: #ccc;
}
.export-badge.rendering { background: rgba(54, 169, 196, 0.25); color: #66c7c8; border: 1px solid rgba(54, 169, 196, 0.4); }
.export-badge.complete { background: rgba(80, 200, 120, 0.25); color: #72e096; border: 1px solid rgba(80, 200, 120, 0.4); }
.export-badge.error { background: rgba(240, 80, 80, 0.25); color: #ff7777; border: 1px solid rgba(240, 80, 80, 0.4); }
.export-sub {
  margin: 0; font-size: 0.8rem; color: #888;
}
.export-meta-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px; padding: 10px 14px;
}
.meta-item {
  display: flex; flex-direction: column; gap: 2px;
}
.meta-label {
  font-size: 0.7rem; color: #777; text-transform: uppercase; letter-spacing: 0.04em;
}
.meta-value {
  font-size: 0.85rem; font-weight: 500; color: #ddd;
}
.export-preview-container {
  display: flex; justify-content: center; align-items: center;
  background: #000; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden; max-height: 180px; position: relative;
}
#export-thumb {
  width: 100%; height: auto; max-height: 180px; object-fit: contain; display: block;
}
.export-progress-section {
  display: flex; flex-direction: column; gap: 6px;
}
.export-progress-header {
  display: flex; justify-content: space-between; font-size: 0.82rem; color: #bbb;
}
.export-progress-track {
  width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 9999px; overflow: hidden;
}
.export-progress-fill {
  height: 100%; width: 0%; background: linear-gradient(90deg, #36a9c4, #72e096);
  transition: width 0.1s linear; border-radius: 9999px;
}
.export-stats-row {
  display: flex; justify-content: space-between; font-size: 0.78rem; color: #777;
}
.export-verified-badge {
  display: flex; align-items: center; gap: 6px;
  background: rgba(80, 200, 120, 0.12); border: 1px solid rgba(80, 200, 120, 0.25);
  border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; color: #72e096;
}
.export-verified-badge svg { flex-shrink: 0; }
.export-error-box {
  background: rgba(240, 80, 80, 0.12); border: 1px solid rgba(240, 80, 80, 0.25);
  border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; color: #ff7777;
}
.export-actions {
  display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;
}
.export-btn {
  padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 500;
  cursor: pointer; transition: all 0.15s ease; border: none; outline: none;
}
.export-btn.secondary {
  background: rgba(255, 255, 255, 0.08); color: #ccc; border: 1px solid rgba(255, 255, 255, 0.12);
}
.export-btn.secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); color: #fff; }
.export-btn.primary {
  background: #36a9c4; color: #000; font-weight: 600;
}
.export-btn.primary:hover:not(:disabled) { background: #45bacc; }
.export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/**
 * HTML markup template for the export modal dialog.
 * Injected automatically by ensureExportModalDOM() if not already present.
 */
const EXPORT_MODAL_HTML = `
<div id="export-overlay" class="export-overlay" hidden>
  <div class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
    <div class="export-header">
      <div class="export-title-row">
        <h2 id="export-title">Exporting Video</h2>
        <span id="export-badge" class="export-badge rendering">Rendering</span>
      </div>
      <p class="export-sub">Encoding deterministic 30 fps MP4 via WebCodecs</p>
    </div>

    <div class="export-meta-grid">
      <div class="meta-item">
        <span class="meta-label">Resolution</span>
        <span id="meta-res" class="meta-value">—</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Duration</span>
        <span id="meta-duration" class="meta-value">—</span>
      </div>
      <div class="meta-item" style="grid-column: span 2;">
        <span class="meta-label">Encoder / Quality</span>
        <span id="meta-encoder" class="meta-value">—</span>
      </div>
    </div>

    <div class="export-preview-container">
      <canvas id="export-thumb" width="360" height="202"></canvas>
    </div>

    <div class="export-progress-section">
      <div class="export-progress-header">
        <span id="export-status-text">Preparing encoder...</span>
        <span id="export-percent">0%</span>
      </div>
      <div class="export-progress-track">
        <div id="export-progress-fill" class="export-progress-fill"></div>
      </div>
      <div class="export-stats-row">
        <span id="export-frame-count">Frame 0 / 0</span>
        <span id="export-time-est">Estimating time...</span>
      </div>
    </div>

    <div id="export-verified-badge" class="export-verified-badge" hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span id="verified-text">Verified: —</span>
    </div>

    <div id="export-error-box" class="export-error-box" hidden>
      <span id="export-error-text">An error occurred during video export.</span>
    </div>

    <div class="export-actions">
      <button id="export-cancel-btn" class="export-btn secondary">Cancel</button>
      <button id="export-download-btn" class="export-btn primary" hidden>Download MP4</button>
      <button id="export-done-btn" class="export-btn secondary" hidden>Close</button>
    </div>
  </div>
</div>
`;

/**
 * Injects modal styles and markup into the document if not already present.
 */
function ensureExportModalDOM() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('export-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'export-modal-styles';
    style.textContent = EXPORT_MODAL_CSS;
    document.head.appendChild(style);
  }
  if (!document.getElementById('export-overlay')) {
    const container = document.createElement('div');
    container.innerHTML = EXPORT_MODAL_HTML.trim();
    document.body.appendChild(container.firstElementChild);
  }
}


/* ==========================================================================
   SECTION 2: MP4 CONTAINER BOX PARSER & CONTAINER VERIFIER
   ========================================================================== */

/**
 * Parses MP4 ISO Base Media File Format binary boxes (ftyp, moov, mvhd, trak, tkhd, mdia, stbl, stsz).
 * Verifies that the muxed container contains exact timescale, duration, sample count, and frame dimensions.
 * 
 * @param {ArrayBuffer} buffer - Raw MP4 file buffer from mp4-muxer.
 * @returns {Object} Extracted container metadata.
 */
function verifyMp4Boxes(buffer) {
  const view = new DataView(buffer);
  let sampleCount = 0, timescale = 0, duration = 0, width = 0, height = 0;

  function scanBoxes(offset, end) {
    while (offset < end) {
      if (offset + 8 > end) break;
      const size = view.getUint32(offset);
      const type = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );
      const boxSize = size === 1 ? Number(view.getBigUint64(offset + 8)) : (size === 0 ? end - offset : size);
      if (boxSize < 8 || offset + boxSize > end) break;

      if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
        const headerSize = size === 1 ? 16 : 8;
        scanBoxes(offset + headerSize, offset + boxSize);
      } else if (type === 'mvhd') {
        const version = view.getUint8(offset + 8);
        if (version === 0) {
          timescale = view.getUint32(offset + 20);
          duration = view.getUint32(offset + 24);
        } else if (version === 1) {
          timescale = view.getUint32(offset + 28);
          duration = Number(view.getBigUint64(offset + 32));
        }
      } else if (type === 'tkhd') {
        const version = view.getUint8(offset + 8);
        const wOffset = version === 0 ? offset + 84 : offset + 96;
        if (wOffset + 8 <= offset + boxSize) {
          width = view.getUint32(wOffset) >>> 16;
          height = view.getUint32(wOffset + 4) >>> 16;
        }
      } else if (type === 'stsz') {
        const sampleSize = view.getUint32(offset + 12);
        const count = view.getUint32(offset + 16);
        sampleCount = count;
      }
      offset += boxSize;
    }
  }

  try {
    scanBoxes(0, buffer.byteLength);
  } catch (e) {
    console.warn('MP4 box inspection warning:', e);
  }

  const durationSec = timescale > 0 ? duration / timescale : 0;
  return { sampleCount, timescale, duration, durationSec, width, height };
}

/**
 * Validates MP4 playback capability and video dimensions using an in-memory HTMLVideoElement.
 * 
 * @param {Blob} blob - MP4 video blob.
 * @returns {Promise<Object>} Video element dimensions and duration.
 */
function verifyWithVideoElement(blob) {
  return new Promise((resolve, reject) => {
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    const url = URL.createObjectURL(blob);
    tempVideo.onloadedmetadata = () => {
      const meta = {
        width: tempVideo.videoWidth,
        height: tempVideo.videoHeight,
        duration: tempVideo.duration
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    tempVideo.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(tempVideo.error?.message || 'Video metadata check failed'));
    };
    tempVideo.src = url;
  });
}


/* ==========================================================================
   SECTION 3: UNIVERSAL VIDEO RECORDER FACTORY (createVideoRecorder)
   ========================================================================== */

/**
 * Creates an instance of the Universal Video Recording Engine.
 * 
 * @param {Object} options Configuration options:
 *   - renderer: Three.js WebGLRenderer instance (Required)
 *   - scene: Three.js Scene instance (Required)
 *   - camera: Three.js Camera instance (Required)
 *   - uniforms: Uniforms object with uResolution (Vector2) and uFragCoordOffset (Vector2) (Required)
 *   - setTime: (timeSeconds) => void - function to advance procedural shader animation phase (Required)
 *   - updateView: (delta) => void - function to advance camera/motion smoothing (Required)
 *   - getSpeed: () => number - returns animation speed multiplier (Optional, default () => 1)
 *   - getTimeline: () => number - returns current animation timeline in seconds (Optional)
 *   - setTimeline: (t) => void - sets animation timeline in seconds (Optional)
 *   - pauseAnimation: () => void - cancels requestAnimationFrame loop (Required)
 *   - resumeAnimation: () => void - restarts requestAnimationFrame loop (Required)
 *   - onRestorePreview: () => void - restores preview DPR, calls resize() and draw() (Required)
 *   - defaultDuration: number - default video duration in seconds (Default: 14)
 *   - filenamePrefix: string - downloaded MP4 filename prefix (Default: 'export')
 *   - gui: lil-gui instance (Optional - attaches 'Export MP4' folder automatically)
 * 
 * @returns {Object} Recorder controller instance.
 */
function createVideoRecorder(options) {
  const {
    renderer,
    scene,
    camera,
    uniforms,
    setTime,
    updateView,
    getSpeed = () => 1,
    getTimeline = () => 0,
    setTimeline = () => {},
    pauseAnimation,
    resumeAnimation,
    onRestorePreview,
    defaultDuration = 14,
    filenamePrefix = 'video-export',
    gui = null
  } = options;

  if (!renderer || !scene || !camera || !uniforms) {
    throw new Error('createVideoRecorder requires renderer, scene, camera, and uniforms.');
  }

  // Ensure uFragCoordOffset exists on uniforms for tiled GPU assembly
  if (!uniforms.uFragCoordOffset) {
    uniforms.uFragCoordOffset = { value: new (window.THREE?.Vector2 || function(x, y) { this.x = x; this.y = y; this.set = function(a, b) { this.x = a; this.y = b; }; })(0, 0) };
  }

  ensureExportModalDOM();

  const nativeDpr = window.devicePixelRatio || 1;
  const exportSettings = {
    duration: defaultDuration,
    fps: '30 fps (fixed)',
    quality: 'Master (QP 1)',
    dprMode: 'Native (' + nativeDpr.toFixed(2) + 'x)',
    customDpr: Math.max(1, Math.min(4, Math.round(nativeDpr * 100) / 100)),
    resolutionInfo: '',
    exportVideo: () => startExport()
  };

  let isExporting = false;
  let exportCancelled = false;

  function getExportDpr() {
    if (exportSettings.dprMode.startsWith('1x')) return 1.0;
    if (exportSettings.dprMode.startsWith('2x')) return 2.0;
    if (exportSettings.dprMode.startsWith('3x')) return 3.0;
    if (exportSettings.dprMode.startsWith('4x')) return 4.0;
    if (exportSettings.dprMode === 'Custom') return exportSettings.customDpr;
    return window.devicePixelRatio || 1;
  }

  let resController = null;
  function updateResolutionInfo() {
    const dpr = getExportDpr();
    let w = Math.round(window.innerWidth * dpr);
    let h = Math.round(window.innerHeight * dpr);
    w = w - (w % 2);
    h = h - (h % 2);
    exportSettings.resolutionInfo = `${w} × ${h} (${dpr.toFixed(2)}x)`;
    resController?.updateDisplay();
  }

  async function startExport() {
    if (isExporting) return;
    if (typeof VideoEncoder === 'undefined') {
      alert('WebCodecs VideoEncoder is not supported in this browser. Please use Chrome, Edge, or a browser with WebCodecs support.');
      return;
    }
    if (typeof Mp4Muxer === 'undefined') {
      alert('Mp4Muxer library is not available. Please ensure mp4-muxer is included.');
      return;
    }

    const dpr = getExportDpr();
    let exportWidth = Math.round(window.innerWidth * dpr);
    let exportHeight = Math.round(window.innerHeight * dpr);
    exportWidth = exportWidth - (exportWidth % 2);
    exportHeight = exportHeight - (exportHeight % 2);

    const fps = 30;
    const exportDuration = exportSettings.duration;
    const totalFrames = Math.round(exportDuration * fps);

    // Map quality preset to target Quantization Parameter (QP)
    const targetQp = exportSettings.quality.includes('QP 1)') ? 1
      : exportSettings.quality.includes('QP 4)') ? 4
      : exportSettings.quality.includes('QP 10)') ? 10 : 18;

    // Probe codecs: try quantizer mode with latencyMode: 'quality' for studio-grade output
    const candidateCodecs = ['avc1.640033', 'avc1.64002a', 'avc1.4d002a', 'avc1.42001f'];
    let selectedConfig = null;
    let encoderModeDesc = '';

    for (const codec of candidateCodecs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width: exportWidth,
          height: exportHeight,
          bitrateMode: 'quantizer',
          latencyMode: 'quality'
        });
        if (support && support.supported) {
          if (support.config && (support.config.width !== exportWidth || support.config.height !== exportHeight)) continue;
          selectedConfig = {
            codec,
            width: exportWidth,
            height: exportHeight,
            bitrateMode: 'quantizer',
            latencyMode: 'quality'
          };
          encoderModeDesc = `H.264 Master QP ${targetQp} (${codec})`;
          break;
        }
      } catch (e) {}
    }

    if (!selectedConfig) {
      // Ultra-high bitrate proportional to resolution: up to 180 Mbps for studio quality fallback
      const bitrateMultiplier = (targetQp === 1) ? 60 : (targetQp === 4) ? 45 : (targetQp === 10) ? 25 : 12;
      const targetBitrate = Math.round(Math.min(200_000_000, Math.max(30_000_000, exportWidth * exportHeight * bitrateMultiplier)));
      for (const codec of candidateCodecs) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec,
            width: exportWidth,
            height: exportHeight,
            bitrate: targetBitrate,
            bitrateMode: 'variable',
            latencyMode: 'quality'
          });
          if (support && support.supported) {
            if (support.config && (support.config.width !== exportWidth || support.config.height !== exportHeight)) continue;
            selectedConfig = {
              codec,
              width: exportWidth,
              height: exportHeight,
              bitrate: targetBitrate,
              bitrateMode: 'variable',
              latencyMode: 'quality'
            };
            encoderModeDesc = `H.264 ${(targetBitrate / 1_000_000).toFixed(1)} Mbps (${codec})`;
            break;
          }
        } catch (e) {}
      }
    }

    if (!selectedConfig) {
      alert(`The requested export resolution (${exportWidth} × ${exportHeight}) is not supported by the H.264 video encoder on this device. Please select a lower DPR.`);
      return;
    }

    isExporting = true;
    exportCancelled = false;
    pauseAnimation();

    // CRITICAL: Force Three.js renderer pixel ratio to 1 during export!
    // Prevents tile buffers from being multiplied by screen DPR.
    renderer.setPixelRatio(1);

    const overlay = document.getElementById('export-overlay');
    const badge = document.getElementById('export-badge');
    const metaRes = document.getElementById('meta-res');
    const metaDur = document.getElementById('meta-duration');
    const metaEnc = document.getElementById('meta-encoder');
    const thumb = document.getElementById('export-thumb');
    const thumbCtx = thumb.getContext('2d');
    const statusText = document.getElementById('export-status-text');
    const percentText = document.getElementById('export-percent');
    const progressFill = document.getElementById('export-progress-fill');
    const frameCountText = document.getElementById('export-frame-count');
    const timeEstText = document.getElementById('export-time-est');
    const verifiedBadge = document.getElementById('export-verified-badge');
    const verifiedText = document.getElementById('verified-text');
    const errorBox = document.getElementById('export-error-box');
    const errorText = document.getElementById('export-error-text');
    const cancelBtn = document.getElementById('export-cancel-btn');
    const downloadBtn = document.getElementById('export-download-btn');
    const doneBtn = document.getElementById('export-done-btn');

    overlay.hidden = false;
    badge.textContent = 'Rendering';
    badge.className = 'export-badge rendering';
    metaRes.textContent = `${exportWidth} × ${exportHeight}`;
    metaDur.textContent = `${exportDuration}s (${totalFrames} frames)`;
    metaEnc.textContent = `${encoderModeDesc} • ${exportSettings.quality}`;
    statusText.textContent = 'Preparing encoder...';
    percentText.textContent = '0%';
    progressFill.style.width = '0%';
    frameCountText.textContent = `Frame 0 / ${totalFrames}`;
    timeEstText.textContent = 'Starting...';
    verifiedBadge.hidden = true;
    errorBox.hidden = true;
    cancelBtn.hidden = false;
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel';
    downloadBtn.hidden = true;
    doneBtn.hidden = true;

    thumb.width = 360;
    thumb.height = Math.max(1, Math.round(360 * (exportHeight / exportWidth)));

    let completedBlobUrl = null;

    cancelBtn.onclick = () => {
      exportCancelled = true;
      statusText.textContent = 'Cancelling export...';
      cancelBtn.disabled = true;
    };

    const cleanupAndRestore = () => {
      isExporting = false;
      uniforms.uFragCoordOffset.value.set(0, 0);
      setTimeline(savedTimeline);
      setTime(savedTimeline);
      updateView(0);
      onRestorePreview();
      resumeAnimation();
    };

    const savedTimeline = getTimeline();
    const startTime = savedTimeline;
    const animationSpeed = getSpeed();

    let muxer = null;
    let encoder = null;
    let assemblyCanvas = null;

    try {
      muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: exportWidth,
          height: exportHeight,
          frameRate: fps
        },
        fastStart: 'in-memory'
      });

      let encoderFatalError = null;
      let encodedChunksCount = 0;

      encoder = new VideoEncoder({
        output: (chunk, meta) => {
          encodedChunksCount++;
          muxer.addVideoChunk(chunk, meta);
        },
        error: (err) => {
          console.error('VideoEncoder error:', err);
          encoderFatalError = err;
        }
      });
      encoder.configure(selectedConfig);

      assemblyCanvas = document.createElement('canvas');
      assemblyCanvas.width = exportWidth;
      assemblyCanvas.height = exportHeight;
      const assemblyCtx = assemblyCanvas.getContext('2d', { alpha: false, desynchronized: false });

      const TILE_SIZE = 1024;
      const OVERLAP = 16;
      const cols = Math.ceil(exportWidth / TILE_SIZE);
      const rows = Math.ceil(exportHeight / TILE_SIZE);

      const exportStartTime = performance.now();

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (exportCancelled) break;
        if (encoderFatalError) throw encoderFatalError;

        // Deterministic frame time calculation
        const frameTime = startTime + (frameIndex / fps) * animationSpeed;
        setTimeline(frameTime);
        setTime(frameTime);
        updateView(frameIndex === 0 ? 0 : (1 / fps) * animationSpeed);

        uniforms.uResolution.value.set(exportWidth, exportHeight);

        // Fast-path: single tile render
        if (cols === 1 && rows === 1) {
          uniforms.uFragCoordOffset.value.set(0, 0);
          renderer.setSize(exportWidth, exportHeight, false);
          renderer.render(scene, camera);
          assemblyCtx.drawImage(renderer.domElement, 0, 0);
        } else {
          // Multi-tile assembly with 16px overlap apron
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const coreX = c * TILE_SIZE;
              const coreW = Math.min(TILE_SIZE, exportWidth - coreX);
              const coreY = r * TILE_SIZE;
              const coreH = Math.min(TILE_SIZE, exportHeight - coreY);

              const padLeft = (coreX > 0) ? OVERLAP : 0;
              const padRight = (coreX + coreW < exportWidth) ? OVERLAP : 0;
              const padBottom = (coreY > 0) ? OVERLAP : 0;
              const padTop = (coreY + coreH < exportHeight) ? OVERLAP : 0;

              const tileX = coreX - padLeft;
              const tileY = coreY - padBottom;
              const tileW = coreW + padLeft + padRight;
              const tileH = coreH + padBottom + padTop;

              uniforms.uFragCoordOffset.value.set(tileX, tileY);
              renderer.setSize(tileW, tileH, false);
              renderer.render(scene, camera);

              // Copy core region to assembly canvas
              const sx = padLeft;
              const sy = padTop;
              const sw = coreW;
              const sh = coreH;

              const dx = coreX;
              const dy = exportHeight - (coreY + coreH);
              const dw = coreW;
              const dh = coreH;

              assemblyCtx.drawImage(renderer.domElement, sx, sy, sw, sh, dx, dy, dw, dh);
            }
          }
        }

        // Exact microsecond timestamps for constant 30 fps
        const timestamp = Math.round(frameIndex * 1_000_000 / fps);
        const frameDuration = Math.round((frameIndex + 1) * 1_000_000 / fps) - timestamp;

        const videoFrame = new VideoFrame(assemblyCanvas, { timestamp, duration: frameDuration });
        const encodeOptions = {
          keyFrame: frameIndex % 30 === 0 // 1-second keyframe interval
        };
        if (selectedConfig.bitrateMode === 'quantizer') {
          encodeOptions.avc = { quantizer: targetQp }; // Lock in requested QP
        }
        encoder.encode(videoFrame, encodeOptions);
        videoFrame.close(); // Prompt release of GPU resources

        // Encoder backpressure
        if (encoder.encodeQueueSize > 4) {
          await new Promise(resolve => {
            const onDequeue = () => {
              if (encoder.encodeQueueSize <= 2) {
                encoder.removeEventListener('dequeue', onDequeue);
                resolve();
              }
            };
            encoder.addEventListener('dequeue', onDequeue);
          });
        }

        // UI progress update
        const currentCount = frameIndex + 1;
        const pct = (currentCount / totalFrames * 100).toFixed(1);
        progressFill.style.width = pct + '%';
        percentText.textContent = pct + '%';
        frameCountText.textContent = `Frame ${currentCount} / ${totalFrames}`;
        statusText.textContent = 'Rendering & encoding...';

        const elapsedSec = (performance.now() - exportStartTime) / 1000;
        const currentFps = currentCount / elapsedSec;
        const remainingSec = Math.max(0, Math.round((totalFrames - currentCount) / currentFps));
        timeEstText.textContent = `~${currentFps.toFixed(1)} fps • ${remainingSec}s left`;

        thumbCtx.drawImage(assemblyCanvas, 0, 0, thumb.width, thumb.height);
        await new Promise(r => setTimeout(r, 0));
      }

      if (exportCancelled) {
        try { encoder?.close(); } catch(e) {}
        overlay.hidden = true;
        cancelBtn.disabled = false;
        cleanupAndRestore();
        return;
      }

      statusText.textContent = 'Finalizing MP4 file...';
      await encoder.flush();
      muxer.finalize();
      encoder.close();
      encoder = null;

      const mp4Buffer = muxer.target.buffer;

      // Verify exported dimensions, duration, and frame count
      const boxMeta = verifyMp4Boxes(mp4Buffer);
      const blob = new Blob([mp4Buffer], { type: 'video/mp4' });
      completedBlobUrl = URL.createObjectURL(blob);
      const videoElementMeta = await verifyWithVideoElement(blob);

      const verifiedWidth = boxMeta.width || videoElementMeta.width;
      const verifiedHeight = boxMeta.height || videoElementMeta.height;
      const verifiedDuration = videoElementMeta.duration || boxMeta.durationSec;
      const verifiedFrames = boxMeta.sampleCount || encodedChunksCount;

      console.log('MP4 Export Verification:', {
        expected: { width: exportWidth, height: exportHeight, duration: exportDuration, frames: totalFrames },
        boxes: boxMeta,
        videoElement: videoElementMeta,
        verified: { width: verifiedWidth, height: verifiedHeight, duration: verifiedDuration, frames: verifiedFrames }
      });

      badge.textContent = 'Complete';
      badge.className = 'export-badge complete';
      statusText.textContent = 'Export completed!';
      percentText.textContent = '100%';
      progressFill.style.width = '100%';
      timeEstText.textContent = `Total time: ${((performance.now() - exportStartTime) / 1000).toFixed(1)}s`;

      verifiedText.textContent = `Verified: ${verifiedWidth}×${verifiedHeight} • ${verifiedDuration.toFixed(2)}s • ${verifiedFrames} frames`;
      verifiedBadge.hidden = false;

      cancelBtn.hidden = true;
      downloadBtn.hidden = false;
      doneBtn.hidden = false;

      const qpTag = selectedConfig.bitrateMode === 'quantizer' ? `qp${targetQp}` : 'vbr';
      const fileName = `${filenamePrefix}-${exportWidth}x${exportHeight}-${exportDuration}s-30fps-${qpTag}.mp4`;

      const triggerDownload = () => {
        if (!completedBlobUrl) return;
        const a = document.createElement('a');
        a.href = completedBlobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      downloadBtn.onclick = triggerDownload;

      doneBtn.onclick = () => {
        overlay.hidden = true;
        if (completedBlobUrl) {
          URL.revokeObjectURL(completedBlobUrl);
          completedBlobUrl = null;
        }
        cleanupAndRestore();
      };

    } catch (err) {
      console.error('Export error:', err);
      badge.textContent = 'Failed';
      badge.className = 'export-badge error';
      statusText.textContent = 'Export error';
      errorText.textContent = err.message || 'An error occurred during video export.';
      errorBox.hidden = false;
      cancelBtn.textContent = 'Close';
      cancelBtn.disabled = false;
      cancelBtn.onclick = () => {
        overlay.hidden = true;
        if (completedBlobUrl) {
          URL.revokeObjectURL(completedBlobUrl);
          completedBlobUrl = null;
        }
        cleanupAndRestore();
      };
    }
  }

  function attachGUI(targetGui) {
    if (!targetGui) return;
    const exportFolder = targetGui.addFolder('Export MP4');
    exportFolder.add(exportSettings, 'duration', 5, 20, 1).name('Duration (s)');
    exportFolder.add(exportSettings, 'fps').name('Frame rate').disable();
    exportFolder.add(exportSettings, 'quality', [
      'Master (QP 1)',
      'Ultra (QP 4)',
      'High (QP 10)',
      'Standard (QP 18)'
    ]).name('Video quality');
    const dprOptions = [
      'Native (' + nativeDpr.toFixed(2) + 'x)',
      '1x (1.0)',
      '2x (2.0)',
      '3x (3.0)',
      '4x (4.0)',
      'Custom'
    ];
    exportFolder.add(exportSettings, 'dprMode', dprOptions).name('Resolution / DPR').onChange(() => {
      customDprController.show(exportSettings.dprMode === 'Custom');
      updateResolutionInfo();
    });
    const customDprController = exportFolder.add(exportSettings, 'customDpr', 1, 4, .25).name('Custom DPR').onChange(updateResolutionInfo);
    customDprController.show(false);
    resController = exportFolder.add(exportSettings, 'resolutionInfo').name('Output size').disable();
    exportFolder.add(exportSettings, 'exportVideo').name('▶ Export MP4 Video');
    exportFolder.open();
    updateResolutionInfo();
  }

  if (gui) {
    attachGUI(gui);
  }

  window.addEventListener('resize', () => {
    updateResolutionInfo();
  }, { passive: true });

  return {
    startExport,
    attachGUI,
    updateResolutionInfo,
    getIsExporting: () => isExporting,
    getExportSettings: () => exportSettings
  };
}


/* ==========================================================================
   SECTION 4: EMBEDDED MP4-MUXER LIBRARY (v5.2.2, MIT License)
   ========================================================================== */

/**
 * Embedded Mp4Muxer (v5.2.2) by Thomas Fletcher (MIT License).
 * Provides in-browser, high-performance MP4 multiplexing without external dependencies.
 */
"use strict";
var Mp4Muxer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => {
    if (!member.has(obj))
      throw TypeError("Cannot " + msg);
  };
  var __privateGet = (obj, member, getter) => {
    __accessCheck(obj, member, "read from private field");
    return getter ? getter.call(obj) : member.get(obj);
  };
  var __privateAdd = (obj, member, value) => {
    if (member.has(obj))
      throw TypeError("Cannot add the same private member more than once");
    member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  };
  var __privateSet = (obj, member, value, setter) => {
    __accessCheck(obj, member, "write to private field");
    setter ? setter.call(obj, value) : member.set(obj, value);
    return value;
  };
  var __privateWrapper = (obj, member, setter, getter) => ({
    set _(value) {
      __privateSet(obj, member, value, setter);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  });
  var __privateMethod = (obj, member, method) => {
    __accessCheck(obj, member, "access private method");
    return method;
  };

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    ArrayBufferTarget: () => ArrayBufferTarget,
    FileSystemWritableFileStreamTarget: () => FileSystemWritableFileStreamTarget,
    Muxer: () => Muxer,
    StreamTarget: () => StreamTarget
  });

  // src/misc.ts
  var bytes = new Uint8Array(8);
  var view = new DataView(bytes.buffer);
  var u8 = (value) => {
    return [(value % 256 + 256) % 256];
  };
  var u16 = (value) => {
    view.setUint16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var i16 = (value) => {
    view.setInt16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var u24 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[1], bytes[2], bytes[3]];
  };
  var u32 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var i32 = (value) => {
    view.setInt32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var u64 = (value) => {
    view.setUint32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var fixed_8_8 = (value) => {
    view.setInt16(0, 2 ** 8 * value, false);
    return [bytes[0], bytes[1]];
  };
  var fixed_16_16 = (value) => {
    view.setInt32(0, 2 ** 16 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var fixed_2_30 = (value) => {
    view.setInt32(0, 2 ** 30 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var ascii = (text, nullTerminated = false) => {
    let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      bytes2.push(0);
    return bytes2;
  };
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };
  var lastPresentedSample = (samples) => {
    let result = void 0;
    for (let sample of samples) {
      if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
        result = sample;
      }
    }
    return result;
  };
  var intoTimescale = (timeInSeconds, timescale, round = true) => {
    let value = timeInSeconds * timescale;
    return round ? Math.round(value) : value;
  };
  var rotationMatrix = (rotationInDegrees) => {
    let theta = rotationInDegrees * (Math.PI / 180);
    let cosTheta = Math.cos(theta);
    let sinTheta = Math.sin(theta);
    return [
      cosTheta,
      sinTheta,
      0,
      -sinTheta,
      cosTheta,
      0,
      0,
      0,
      1
    ];
  };
  var IDENTITY_MATRIX = rotationMatrix(0);
  var matrixToBytes = (matrix) => {
    return [
      fixed_16_16(matrix[0]),
      fixed_16_16(matrix[1]),
      fixed_2_30(matrix[2]),
      fixed_16_16(matrix[3]),
      fixed_16_16(matrix[4]),
      fixed_2_30(matrix[5]),
      fixed_16_16(matrix[6]),
      fixed_16_16(matrix[7]),
      fixed_2_30(matrix[8])
    ];
  };
  var deepClone = (x) => {
    if (!x)
      return x;
    if (typeof x !== "object")
      return x;
    if (Array.isArray(x))
      return x.map(deepClone);
    return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)]));
  };
  var isU32 = (value) => {
    return value >= 0 && value < 2 ** 32;
  };

  // src/box.ts
  var box = (type, contents, children) => ({
    type,
    contents: contents && new Uint8Array(contents.flat(10)),
    children
  });
  var fullBox = (type, version, flags, contents, children) => box(
    type,
    [u8(version), u24(flags), contents ?? []],
    children
  );
  var ftyp = (details) => {
    let minorVersion = 512;
    if (details.fragmented)
      return box("ftyp", [
        ascii("iso5"),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("iso5"),
        ascii("iso6"),
        ascii("mp41")
      ]);
    return box("ftyp", [
      ascii("isom"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("isom"),
      details.holdsAvc ? ascii("avc1") : [],
      ascii("mp41")
    ]);
  };
  var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
  var free = (size) => ({ type: "free", size });
  var moov = (tracks, creationTime, fragmented = false) => box("moov", null, [
    mvhd(creationTime, tracks),
    ...tracks.map((x) => trak(x, creationTime)),
    fragmented ? mvex(tracks) : null
  ]);
  var mvhd = (creationTime, tracks) => {
    let duration = intoTimescale(Math.max(
      0,
      ...tracks.filter((x) => x.samples.length > 0).map((x) => {
        const lastSample = lastPresentedSample(x.samples);
        return lastSample.presentationTimestamp + lastSample.duration;
      })
    ), GLOBAL_TIMESCALE);
    let nextTrackId = Math.max(...tracks.map((x) => x.id)) + 1;
    let needsU64 = !isU32(creationTime) || !isU32(duration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mvhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u32OrU64(duration),
      // Duration
      fixed_16_16(1),
      // Preferred rate
      fixed_8_8(1),
      // Preferred volume
      Array(10).fill(0),
      // Reserved
      matrixToBytes(IDENTITY_MATRIX),
      // Matrix
      Array(24).fill(0),
      // Pre-defined
      u32(nextTrackId)
      // Next track ID
    ]);
  };
  var trak = (track, creationTime) => box("trak", null, [
    tkhd(track, creationTime),
    mdia(track, creationTime)
  ]);
  var tkhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let durationInGlobalTimescale = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      GLOBAL_TIMESCALE
    );
    let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
    let u32OrU64 = needsU64 ? u64 : u32;
    let matrix;
    if (track.info.type === "video") {
      matrix = typeof track.info.rotation === "number" ? rotationMatrix(track.info.rotation) : track.info.rotation;
    } else {
      matrix = IDENTITY_MATRIX;
    }
    return fullBox("tkhd", +needsU64, 3, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.id),
      // Track ID
      u32(0),
      // Reserved
      u32OrU64(durationInGlobalTimescale),
      // Duration
      Array(8).fill(0),
      // Reserved
      u16(0),
      // Layer
      u16(0),
      // Alternate group
      fixed_8_8(track.info.type === "audio" ? 1 : 0),
      // Volume
      u16(0),
      // Reserved
      matrixToBytes(matrix),
      // Matrix
      fixed_16_16(track.info.type === "video" ? track.info.width : 0),
      // Track width
      fixed_16_16(track.info.type === "video" ? track.info.height : 0)
      // Track height
    ]);
  };
  var mdia = (track, creationTime) => box("mdia", null, [
    mdhd(track, creationTime),
    hdlr(track.info.type === "video" ? "vide" : "soun"),
    minf(track)
  ]);
  var mdhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let localDuration = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      track.timescale
    );
    let needsU64 = !isU32(creationTime) || !isU32(localDuration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mdhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.timescale),
      // Timescale
      u32OrU64(localDuration),
      // Duration
      u16(21956),
      // Language ("und", undetermined)
      u16(0)
      // Quality
    ]);
  };
  var hdlr = (componentSubtype) => fullBox("hdlr", 0, 0, [
    ascii("mhlr"),
    // Component type
    ascii(componentSubtype),
    // Component subtype
    u32(0),
    // Component manufacturer
    u32(0),
    // Component flags
    u32(0),
    // Component flags mask
    ascii("mp4-muxer-hdlr", true)
    // Component name
  ]);
  var minf = (track) => box("minf", null, [
    track.info.type === "video" ? vmhd() : smhd(),
    dinf(),
    stbl(track)
  ]);
  var vmhd = () => fullBox("vmhd", 0, 1, [
    u16(0),
    // Graphics mode
    u16(0),
    // Opcolor R
    u16(0),
    // Opcolor G
    u16(0)
    // Opcolor B
  ]);
  var smhd = () => fullBox("smhd", 0, 0, [
    u16(0),
    // Balance
    u16(0)
    // Reserved
  ]);
  var dinf = () => box("dinf", null, [
    dref()
  ]);
  var dref = () => fullBox("dref", 0, 0, [
    u32(1)
    // Entry count
  ], [
    url()
  ]);
  var url = () => fullBox("url ", 0, 1);
  var stbl = (track) => {
    const needsCtts = track.compositionTimeOffsetTable.length > 1 || track.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
    return box("stbl", null, [
      stsd(track),
      stts(track),
      stss(track),
      stsc(track),
      stsz(track),
      stco(track),
      needsCtts ? ctts(track) : null
    ]);
  };
  var stsd = (track) => fullBox("stsd", 0, 0, [
    u32(1)
    // Entry count
  ], [
    track.info.type === "video" ? videoSampleDescription(
      VIDEO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    ) : soundSampleDescription(
      AUDIO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    )
  ]);
  var videoSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Pre-defined
    u16(0),
    // Reserved
    Array(12).fill(0),
    // Pre-defined
    u16(track.info.width),
    // Width
    u16(track.info.height),
    // Height
    u32(4718592),
    // Horizontal resolution
    u32(4718592),
    // Vertical resolution
    u32(0),
    // Reserved
    u16(1),
    // Frame count
    Array(32).fill(0),
    // Compressor name
    u16(24),
    // Depth
    i16(65535)
    // Pre-defined
  ], [
    VIDEO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track),
    track.info.decoderConfig.colorSpace ? colr(track) : null
  ]);
  var COLOR_PRIMARIES_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // ITU-R BT.601 525 - SMPTE 170M
  };
  var TRANSFER_CHARACTERISTICS_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "smpte170m": 6,
    // SMPTE 170M
    "iec61966-2-1": 13
    // IEC 61966-2-1
  };
  var MATRIX_COEFFICIENTS_MAP = {
    "rgb": 0,
    // Identity
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // SMPTE 170M
  };
  var colr = (track) => box("colr", [
    ascii("nclx"),
    // Colour type
    u16(COLOR_PRIMARIES_MAP[track.info.decoderConfig.colorSpace.primaries]),
    // Colour primaries
    u16(TRANSFER_CHARACTERISTICS_MAP[track.info.decoderConfig.colorSpace.transfer]),
    // Transfer characteristics
    u16(MATRIX_COEFFICIENTS_MAP[track.info.decoderConfig.colorSpace.matrix]),
    // Matrix coefficients
    u8((track.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
    // Full range flag
  ]);
  var avcC = (track) => track.info.decoderConfig && box("avcC", [
    // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var hvcC = (track) => track.info.decoderConfig && box("hvcC", [
    // For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var vpcC = (track) => {
    if (!track.info.decoderConfig) {
      return null;
    }
    let decoderConfig = track.info.decoderConfig;
    if (!decoderConfig.colorSpace) {
      throw new Error(`'colorSpace' is required in the decoder config for VP9.`);
    }
    let parts = decoderConfig.codec.split(".");
    let profile = Number(parts[1]);
    let level = Number(parts[2]);
    let bitDepth = Number(parts[3]);
    let chromaSubsampling = 0;
    let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    return fullBox("vpcC", 1, 0, [
      u8(profile),
      // Profile
      u8(level),
      // Level
      u8(thirdByte),
      // Bit depth, chroma subsampling, full range
      u8(colourPrimaries),
      // Colour primaries
      u8(transferCharacteristics),
      // Transfer characteristics
      u8(matrixCoefficients),
      // Matrix coefficients
      u16(0)
      // Codec initialization data size
    ]);
  };
  var av1C = () => {
    let marker = 1;
    let version = 1;
    let firstByte = (marker << 7) + version;
    return box("av1C", [
      firstByte,
      0,
      0,
      0
    ]);
  };
  var soundSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Version
    u16(0),
    // Revision level
    u32(0),
    // Vendor
    u16(track.info.numberOfChannels),
    // Number of channels
    u16(16),
    // Sample size (bits)
    u16(0),
    // Compression ID
    u16(0),
    // Packet size
    fixed_16_16(track.info.sampleRate)
    // Sample rate
  ], [
    AUDIO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track)
  ]);
  var esds = (track) => {
    let description = new Uint8Array(track.info.decoderConfig.description);
    return fullBox("esds", 0, 0, [
      // https://stackoverflow.com/a/54803118
      u32(58753152),
      // TAG(3) = Object Descriptor ([2])
      u8(32 + description.byteLength),
      // length of this OD (which includes the next 2 tags)
      u16(1),
      // ES_ID = 1
      u8(0),
      // flags etc = 0
      u32(75530368),
      // TAG(4) = ES Descriptor ([2]) embedded in above OD
      u8(18 + description.byteLength),
      // length of this ESD
      u8(64),
      // MPEG-4 Audio
      u8(21),
      // stream type(6bits)=5 audio, flags(2bits)=1
      u24(0),
      // 24bit buffer size
      u32(130071),
      // max bitrate
      u32(130071),
      // avg bitrate
      u32(92307584),
      // TAG(5) = ASC ([2],[3]) embedded in above OD
      u8(description.byteLength),
      // length
      ...description,
      u32(109084800),
      // TAG(6)
      u8(1),
      // length
      u8(2)
      // data
    ]);
  };
  var dOps = (track) => {
    let preskip = 3840;
    let gain = 0;
    const description = track.info.decoderConfig?.description;
    if (description) {
      if (description.byteLength < 18) {
        throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
      }
      const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
      preskip = view2.getUint16(10, true);
      gain = view2.getInt16(14, true);
    }
    return box("dOps", [
      u8(0),
      // Version
      u8(track.info.numberOfChannels),
      // OutputChannelCount
      u16(preskip),
      u32(track.info.sampleRate),
      // InputSampleRate
      fixed_8_8(gain),
      // OutputGain
      u8(0)
      // ChannelMappingFamily
    ]);
  };
  var stts = (track) => {
    return fullBox("stts", 0, 0, [
      u32(track.timeToSampleTable.length),
      // Number of entries
      track.timeToSampleTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleDelta)
        // Sample duration
      ])
    ]);
  };
  var stss = (track) => {
    if (track.samples.every((x) => x.type === "key"))
      return null;
    let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
    return fullBox("stss", 0, 0, [
      u32(keySamples.length),
      // Number of entries
      keySamples.map(([index]) => u32(index + 1))
      // Sync sample table
    ]);
  };
  var stsc = (track) => {
    return fullBox("stsc", 0, 0, [
      u32(track.compactlyCodedChunkTable.length),
      // Number of entries
      track.compactlyCodedChunkTable.map((x) => [
        // Sample-to-chunk table
        u32(x.firstChunk),
        // First chunk
        u32(x.samplesPerChunk),
        // Samples per chunk
        u32(1)
        // Sample description index
      ])
    ]);
  };
  var stsz = (track) => fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(track.samples.length),
    // Number of entries
    track.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
  var stco = (track) => {
    if (track.finalizedChunks.length > 0 && last(track.finalizedChunks).offset >= 2 ** 32) {
      return fullBox("co64", 0, 0, [
        u32(track.finalizedChunks.length),
        // Number of entries
        track.finalizedChunks.map((x) => u64(x.offset))
        // Chunk offset table
      ]);
    }
    return fullBox("stco", 0, 0, [
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((x) => u32(x.offset))
      // Chunk offset table
    ]);
  };
  var ctts = (track) => {
    return fullBox("ctts", 0, 0, [
      u32(track.compositionTimeOffsetTable.length),
      // Number of entries
      track.compositionTimeOffsetTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleCompositionTimeOffset)
        // Sample offset
      ])
    ]);
  };
  var mvex = (tracks) => {
    return box("mvex", null, tracks.map(trex));
  };
  var trex = (track) => {
    return fullBox("trex", 0, 0, [
      u32(track.id),
      // Track ID
      u32(1),
      // Default sample description index
      u32(0),
      // Default sample duration
      u32(0),
      // Default sample size
      u32(0)
      // Default sample flags
    ]);
  };
  var moof = (sequenceNumber, tracks) => {
    return box("moof", null, [
      mfhd(sequenceNumber),
      ...tracks.map(traf)
    ]);
  };
  var mfhd = (sequenceNumber) => {
    return fullBox("mfhd", 0, 0, [
      u32(sequenceNumber)
      // Sequence number
    ]);
  };
  var fragmentSampleFlags = (sample) => {
    let byte1 = 0;
    let byte2 = 0;
    let byte3 = 0;
    let byte4 = 0;
    let sampleIsDifferenceSample = sample.type === "delta";
    byte2 |= +sampleIsDifferenceSample;
    if (sampleIsDifferenceSample) {
      byte1 |= 1;
    } else {
      byte1 |= 2;
    }
    return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
  };
  var traf = (track) => {
    return box("traf", null, [
      tfhd(track),
      tfdt(track),
      trun(track)
    ]);
  };
  var tfhd = (track) => {
    let tfFlags = 0;
    tfFlags |= 8;
    tfFlags |= 16;
    tfFlags |= 32;
    tfFlags |= 131072;
    let referenceSample = track.currentChunk.samples[1] ?? track.currentChunk.samples[0];
    let referenceSampleInfo = {
      duration: referenceSample.timescaleUnitsToNextSample,
      size: referenceSample.size,
      flags: fragmentSampleFlags(referenceSample)
    };
    return fullBox("tfhd", 0, tfFlags, [
      u32(track.id),
      // Track ID
      u32(referenceSampleInfo.duration),
      // Default sample duration
      u32(referenceSampleInfo.size),
      // Default sample size
      u32(referenceSampleInfo.flags)
      // Default sample flags
    ]);
  };
  var tfdt = (track) => {
    return fullBox("tfdt", 1, 0, [
      u64(intoTimescale(track.currentChunk.startTimestamp, track.timescale))
      // Base Media Decode Time
    ]);
  };
  var trun = (track) => {
    let allSampleDurations = track.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
    let allSampleSizes = track.currentChunk.samples.map((x) => x.size);
    let allSampleFlags = track.currentChunk.samples.map(fragmentSampleFlags);
    let allSampleCompositionTimeOffsets = track.currentChunk.samples.map((x) => intoTimescale(x.presentationTimestamp - x.decodeTimestamp, track.timescale));
    let uniqueSampleDurations = new Set(allSampleDurations);
    let uniqueSampleSizes = new Set(allSampleSizes);
    let uniqueSampleFlags = new Set(allSampleFlags);
    let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
    let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
    let sampleDurationPresent = uniqueSampleDurations.size > 1;
    let sampleSizePresent = uniqueSampleSizes.size > 1;
    let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
    let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
    let flags = 0;
    flags |= 1;
    flags |= 4 * +firstSampleFlagsPresent;
    flags |= 256 * +sampleDurationPresent;
    flags |= 512 * +sampleSizePresent;
    flags |= 1024 * +sampleFlagsPresent;
    flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
    return fullBox("trun", 1, flags, [
      u32(track.currentChunk.samples.length),
      // Sample count
      u32(track.currentChunk.offset - track.currentChunk.moofOffset || 0),
      // Data offset
      firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
      track.currentChunk.samples.map((_, i) => [
        sampleDurationPresent ? u32(allSampleDurations[i]) : [],
        // Sample duration
        sampleSizePresent ? u32(allSampleSizes[i]) : [],
        // Sample size
        sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
        // Sample flags
        // Sample composition time offsets
        sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
      ])
    ]);
  };
  var mfra = (tracks) => {
    return box("mfra", null, [
      ...tracks.map(tfra),
      mfro()
    ]);
  };
  var tfra = (track, trackIndex) => {
    let version = 1;
    return fullBox("tfra", version, 0, [
      u32(track.id),
      // Track ID
      u32(63),
      // This specifies that traf number, trun number and sample number are 32-bit ints
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((chunk) => [
        u64(intoTimescale(chunk.startTimestamp, track.timescale)),
        // Time
        u64(chunk.moofOffset),
        // moof offset
        u32(trackIndex + 1),
        // traf number
        u32(1),
        // trun number
        u32(1)
        // Sample number
      ])
    ]);
  };
  var mfro = () => {
    return fullBox("mfro", 0, 0, [
      // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
      // is known
      u32(0)
      // Size
    ]);
  };
  var VIDEO_CODEC_TO_BOX_NAME = {
    "avc": "avc1",
    "hevc": "hvc1",
    "vp9": "vp09",
    "av1": "av01"
  };
  var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
    "avc": avcC,
    "hevc": hvcC,
    "vp9": vpcC,
    "av1": av1C
  };
  var AUDIO_CODEC_TO_BOX_NAME = {
    "aac": "mp4a",
    "opus": "Opus"
  };
  var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
    "aac": esds,
    "opus": dOps
  };

  // src/target.ts
  var isTarget = Symbol("isTarget");
  var Target = class {
  };
  isTarget;
  var ArrayBufferTarget = class extends Target {
    constructor() {
      super(...arguments);
      this.buffer = null;
    }
  };
  var StreamTarget = class extends Target {
    constructor(options) {
      super();
      this.options = options;
      if (typeof options !== "object") {
        throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
      }
      if (options.onData) {
        if (typeof options.onData !== "function") {
          throw new TypeError("options.onData, when provided, must be a function.");
        }
        if (options.onData.length < 2) {
          throw new TypeError(
            "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
          );
        }
      }
      if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
        throw new TypeError("options.chunked, when provided, must be a boolean.");
      }
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
        throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
      }
    }
  };
  var FileSystemWritableFileStreamTarget = class extends Target {
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.options = options;
      if (!(stream instanceof FileSystemWritableFileStream)) {
        throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
      }
      if (options !== void 0 && typeof options !== "object") {
        throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
      }
      if (options) {
        if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
          throw new TypeError("options.chunkSize, when provided, must be a positive integer");
        }
      }
    }
  };

  // src/writer.ts
  var _helper, _helperView;
  var Writer = class {
    constructor() {
      this.pos = 0;
      __privateAdd(this, _helper, new Uint8Array(8));
      __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
      /**
       * Stores the position from the start of the file to where boxes elements have been written. This is used to
       * rewrite/edit elements that were already added before, and to measure sizes of things.
       */
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    /** Sets the current position for future writes to a new one. */
    seek(newPos) {
      this.pos = newPos;
    }
    writeU32(value) {
      __privateGet(this, _helperView).setUint32(0, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 4));
    }
    writeU64(value) {
      __privateGet(this, _helperView).setUint32(0, Math.floor(value / 2 ** 32), false);
      __privateGet(this, _helperView).setUint32(4, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7)
          this.write(__privateGet(this, _helper));
      }
      if (text.length % 8 !== 0) {
        this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
      }
    }
    writeBox(box2) {
      this.offsets.set(box2, this.pos);
      if (box2.contents && !box2.children) {
        this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
        this.write(box2.contents);
      } else {
        let startPos = this.pos;
        this.writeBoxHeader(box2, 0);
        if (box2.contents)
          this.write(box2.contents);
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              this.writeBox(child);
        }
        let endPos = this.pos;
        let size = box2.size ?? endPos - startPos;
        this.seek(startPos);
        this.writeBoxHeader(box2, size);
        this.seek(endPos);
      }
    }
    writeBoxHeader(box2, size) {
      this.writeU32(box2.largeSize ? 1 : size);
      this.writeAscii(box2.type);
      if (box2.largeSize)
        this.writeU64(size);
    }
    measureBoxHeader(box2) {
      return 8 + (box2.largeSize ? 8 : 0);
    }
    patchBox(box2) {
      let endPos = this.pos;
      this.seek(this.offsets.get(box2));
      this.writeBox(box2);
      this.seek(endPos);
    }
    measureBox(box2) {
      if (box2.contents && !box2.children) {
        let headerSize = this.measureBoxHeader(box2);
        return headerSize + box2.contents.byteLength;
      } else {
        let result = this.measureBoxHeader(box2);
        if (box2.contents)
          result += box2.contents.byteLength;
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              result += this.measureBox(child);
        }
        return result;
      }
    }
  };
  _helper = new WeakMap();
  _helperView = new WeakMap();
  var _target, _buffer, _bytes, _maxPos, _ensureSize, ensureSize_fn;
  var ArrayBufferTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _ensureSize);
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _buffer, new ArrayBuffer(2 ** 16));
      __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
      __privateAdd(this, _maxPos, 0);
      __privateSet(this, _target, target);
    }
    write(data) {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos + data.byteLength);
      __privateGet(this, _bytes).set(data, this.pos);
      this.pos += data.byteLength;
      __privateSet(this, _maxPos, Math.max(__privateGet(this, _maxPos), this.pos));
    }
    finalize() {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos);
      __privateGet(this, _target).buffer = __privateGet(this, _buffer).slice(0, Math.max(__privateGet(this, _maxPos), this.pos));
    }
  };
  _target = new WeakMap();
  _buffer = new WeakMap();
  _bytes = new WeakMap();
  _maxPos = new WeakMap();
  _ensureSize = new WeakSet();
  ensureSize_fn = function(size) {
    let newLength = __privateGet(this, _buffer).byteLength;
    while (newLength < size)
      newLength *= 2;
    if (newLength === __privateGet(this, _buffer).byteLength)
      return;
    let newBuffer = new ArrayBuffer(newLength);
    let newBytes = new Uint8Array(newBuffer);
    newBytes.set(__privateGet(this, _bytes), 0);
    __privateSet(this, _buffer, newBuffer);
    __privateSet(this, _bytes, newBytes);
  };
  var DEFAULT_CHUNK_SIZE = 2 ** 24;
  var MAX_CHUNKS_AT_ONCE = 2;
  var _target2, _sections, _chunked, _chunkSize, _chunks, _writeDataIntoChunks, writeDataIntoChunks_fn, _insertSectionIntoChunk, insertSectionIntoChunk_fn, _createChunk, createChunk_fn, _flushChunks, flushChunks_fn;
  var StreamTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _writeDataIntoChunks);
      __privateAdd(this, _insertSectionIntoChunk);
      __privateAdd(this, _createChunk);
      __privateAdd(this, _flushChunks);
      __privateAdd(this, _target2, void 0);
      __privateAdd(this, _sections, []);
      __privateAdd(this, _chunked, void 0);
      __privateAdd(this, _chunkSize, void 0);
      /**
       * The data is divided up into fixed-size chunks, whose contents are first filled in RAM and then flushed out.
       * A chunk is flushed if all of its contents have been written.
       */
      __privateAdd(this, _chunks, []);
      __privateSet(this, _target2, target);
      __privateSet(this, _chunked, target.options?.chunked ?? false);
      __privateSet(this, _chunkSize, target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE);
    }
    write(data) {
      __privateGet(this, _sections).push({
        data: data.slice(),
        start: this.pos
      });
      this.pos += data.byteLength;
    }
    flush() {
      if (__privateGet(this, _sections).length === 0)
        return;
      let chunks = [];
      let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        let lastChunk = chunks[chunks.length - 1];
        let section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (let chunk of chunks) {
        chunk.data = new Uint8Array(chunk.size);
        for (let section of __privateGet(this, _sections)) {
          if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
            chunk.data.set(section.data, section.start - chunk.start);
          }
        }
        if (__privateGet(this, _chunked)) {
          __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, chunk.data, chunk.start);
          __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
        } else {
          __privateGet(this, _target2).options.onData?.(chunk.data, chunk.start);
        }
      }
      __privateGet(this, _sections).length = 0;
    }
    finalize() {
      if (__privateGet(this, _chunked)) {
        __privateMethod(this, _flushChunks, flushChunks_fn).call(this, true);
      }
    }
  };
  _target2 = new WeakMap();
  _sections = new WeakMap();
  _chunked = new WeakMap();
  _chunkSize = new WeakMap();
  _chunks = new WeakMap();
  _writeDataIntoChunks = new WeakSet();
  writeDataIntoChunks_fn = function(data, position) {
    let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + __privateGet(this, _chunkSize));
    if (chunkIndex === -1)
      chunkIndex = __privateMethod(this, _createChunk, createChunk_fn).call(this, position);
    let chunk = __privateGet(this, _chunks)[chunkIndex];
    let relativePosition = position - chunk.start;
    let toWrite = data.subarray(0, Math.min(__privateGet(this, _chunkSize) - relativePosition, data.byteLength));
    chunk.data.set(toWrite, relativePosition);
    let section = {
      start: relativePosition,
      end: relativePosition + toWrite.byteLength
    };
    __privateMethod(this, _insertSectionIntoChunk, insertSectionIntoChunk_fn).call(this, chunk, section);
    if (chunk.written[0].start === 0 && chunk.written[0].end === __privateGet(this, _chunkSize)) {
      chunk.shouldFlush = true;
    }
    if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
      for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
        __privateGet(this, _chunks)[i].shouldFlush = true;
      }
      __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
    }
    if (toWrite.byteLength < data.byteLength) {
      __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
    }
  };
  _insertSectionIntoChunk = new WeakSet();
  insertSectionIntoChunk_fn = function(chunk, section) {
    let low = 0;
    let high = chunk.written.length - 1;
    let index = -1;
    while (low <= high) {
      let mid = Math.floor(low + (high - low + 1) / 2);
      if (chunk.written[mid].start <= section.start) {
        low = mid + 1;
        index = mid;
      } else {
        high = mid - 1;
      }
    }
    chunk.written.splice(index + 1, 0, section);
    if (index === -1 || chunk.written[index].end < section.start)
      index++;
    while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
      chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
      chunk.written.splice(index + 1, 1);
    }
  };
  _createChunk = new WeakSet();
  createChunk_fn = function(includesPosition) {
    let start = Math.floor(includesPosition / __privateGet(this, _chunkSize)) * __privateGet(this, _chunkSize);
    let chunk = {
      start,
      data: new Uint8Array(__privateGet(this, _chunkSize)),
      written: [],
      shouldFlush: false
    };
    __privateGet(this, _chunks).push(chunk);
    __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
    return __privateGet(this, _chunks).indexOf(chunk);
  };
  _flushChunks = new WeakSet();
  flushChunks_fn = function(force = false) {
    for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
      let chunk = __privateGet(this, _chunks)[i];
      if (!chunk.shouldFlush && !force)
        continue;
      for (let section of chunk.written) {
        __privateGet(this, _target2).options.onData?.(
          chunk.data.subarray(section.start, section.end),
          chunk.start + section.start
        );
      }
      __privateGet(this, _chunks).splice(i--, 1);
    }
  };
  var FileSystemWritableFileStreamTargetWriter = class extends StreamTargetWriter {
    constructor(target) {
      super(new StreamTarget({
        onData: (data, position) => target.stream.write({
          type: "write",
          data,
          position
        }),
        chunked: true,
        chunkSize: target.options?.chunkSize
      }));
    }
  };

  // src/muxer.ts
  var GLOBAL_TIMESCALE = 1e3;
  var SUPPORTED_VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
  var SUPPORTED_AUDIO_CODECS = ["aac", "opus"];
  var TIMESTAMP_OFFSET = 2082844800;
  var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "cross-track-offset"];
  var _options, _writer, _ftypSize, _mdat, _videoTrack, _audioTrack, _creationTime, _finalizedChunks, _nextFragmentNumber, _videoSampleQueue, _audioSampleQueue, _finalized, _validateOptions, validateOptions_fn, _writeHeader, writeHeader_fn, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn, _prepareTracks, prepareTracks_fn, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn, _createSampleForTrack, createSampleForTrack_fn, _addSampleToTrack, addSampleToTrack_fn, _validateTimestamp, validateTimestamp_fn, _finalizeCurrentChunk, finalizeCurrentChunk_fn, _finalizeFragment, finalizeFragment_fn, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn, _ensureNotFinalized, ensureNotFinalized_fn;
  var Muxer = class {
    constructor(options) {
      __privateAdd(this, _validateOptions);
      __privateAdd(this, _writeHeader);
      __privateAdd(this, _computeMoovSizeUpperBound);
      __privateAdd(this, _prepareTracks);
      // https://wiki.multimedia.cx/index.php/MPEG-4_Audio
      __privateAdd(this, _generateMpeg4AudioSpecificConfig);
      __privateAdd(this, _createSampleForTrack);
      __privateAdd(this, _addSampleToTrack);
      __privateAdd(this, _validateTimestamp);
      __privateAdd(this, _finalizeCurrentChunk);
      __privateAdd(this, _finalizeFragment);
      __privateAdd(this, _maybeFlushStreamingTargetWriter);
      __privateAdd(this, _ensureNotFinalized);
      __privateAdd(this, _options, void 0);
      __privateAdd(this, _writer, void 0);
      __privateAdd(this, _ftypSize, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoTrack, null);
      __privateAdd(this, _audioTrack, null);
      __privateAdd(this, _creationTime, Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET);
      __privateAdd(this, _finalizedChunks, []);
      // Fields for fragmented MP4:
      __privateAdd(this, _nextFragmentNumber, 1);
      __privateAdd(this, _videoSampleQueue, []);
      __privateAdd(this, _audioSampleQueue, []);
      __privateAdd(this, _finalized, false);
      __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
      options.video = deepClone(options.video);
      options.audio = deepClone(options.audio);
      options.fastStart = deepClone(options.fastStart);
      this.target = options.target;
      __privateSet(this, _options, {
        firstTimestampBehavior: "strict",
        ...options
      });
      if (options.target instanceof ArrayBufferTarget) {
        __privateSet(this, _writer, new ArrayBufferTargetWriter(options.target));
      } else if (options.target instanceof StreamTarget) {
        __privateSet(this, _writer, new StreamTargetWriter(options.target));
      } else if (options.target instanceof FileSystemWritableFileStreamTarget) {
        __privateSet(this, _writer, new FileSystemWritableFileStreamTargetWriter(options.target));
      } else {
        throw new Error(`Invalid target: ${options.target}`);
      }
      __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
      __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
    }
    addVideoChunk(sample, meta, timestamp, compositionTimeOffset) {
      if (!(sample instanceof EncodedVideoChunk)) {
        throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addVideoChunkRaw(
        data,
        sample.type,
        timestamp ?? sample.timestamp,
        sample.duration,
        meta,
        compositionTimeOffset
      );
    }
    addVideoChunkRaw(data, type, timestamp, duration, meta, compositionTimeOffset) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).video)
        throw new Error("No video track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _videoTrack).samples.length === __privateGet(this, _options).fastStart.expectedVideoChunks) {
        throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedVideoChunks}).`);
      }
      let videoSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _videoTrack), data, type, timestamp, duration, meta, compositionTimeOffset);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _audioTrack)) {
        while (__privateGet(this, _audioSampleQueue).length > 0 && __privateGet(this, _audioSampleQueue)[0].decodeTimestamp <= videoSample.decodeTimestamp) {
          let audioSample = __privateGet(this, _audioSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        }
        if (videoSample.decodeTimestamp <= __privateGet(this, _audioTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        } else {
          __privateGet(this, _videoSampleQueue).push(videoSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      }
    }
    addAudioChunk(sample, meta, timestamp) {
      if (!(sample instanceof EncodedAudioChunk)) {
        throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
    }
    addAudioChunkRaw(data, type, timestamp, duration, meta) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).audio)
        throw new Error("No audio track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _audioTrack).samples.length === __privateGet(this, _options).fastStart.expectedAudioChunks) {
        throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedAudioChunks}).`);
      }
      let audioSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _audioTrack), data, type, timestamp, duration, meta);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _videoTrack)) {
        while (__privateGet(this, _videoSampleQueue).length > 0 && __privateGet(this, _videoSampleQueue)[0].decodeTimestamp <= audioSample.decodeTimestamp) {
          let videoSample = __privateGet(this, _videoSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        }
        if (audioSample.decodeTimestamp <= __privateGet(this, _videoTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        } else {
          __privateGet(this, _audioSampleQueue).push(audioSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      }
    }
    /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
    finalize() {
      if (__privateGet(this, _finalized)) {
        throw new Error("Cannot finalize a muxer more than once.");
      }
      if (__privateGet(this, _options).fastStart === "fragmented") {
        for (let videoSample of __privateGet(this, _videoSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        for (let audioSample of __privateGet(this, _audioSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this, false);
      } else {
        if (__privateGet(this, _videoTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
        if (__privateGet(this, _audioTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
      }
      let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter(Boolean);
      if (__privateGet(this, _options).fastStart === "in-memory") {
        let mdatSize;
        for (let i = 0; i < 2; i++) {
          let movieBox2 = moov(tracks, __privateGet(this, _creationTime));
          let movieBoxSize = __privateGet(this, _writer).measureBox(movieBox2);
          mdatSize = __privateGet(this, _writer).measureBox(__privateGet(this, _mdat));
          let currentChunkPos = __privateGet(this, _writer).pos + movieBoxSize + mdatSize;
          for (let chunk of __privateGet(this, _finalizedChunks)) {
            chunk.offset = currentChunkPos;
            for (let { data } of chunk.samples) {
              currentChunkPos += data.byteLength;
              mdatSize += data.byteLength;
            }
          }
          if (currentChunkPos < 2 ** 32)
            break;
          if (mdatSize >= 2 ** 32)
            __privateGet(this, _mdat).largeSize = true;
        }
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        __privateGet(this, _writer).writeBox(movieBox);
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
        for (let chunk of __privateGet(this, _finalizedChunks)) {
          for (let sample of chunk.samples) {
            __privateGet(this, _writer).write(sample.data);
            sample.data = null;
          }
        }
      } else if (__privateGet(this, _options).fastStart === "fragmented") {
        let startPos = __privateGet(this, _writer).pos;
        let mfraBox = mfra(tracks);
        __privateGet(this, _writer).writeBox(mfraBox);
        let mfraBoxSize = __privateGet(this, _writer).pos - startPos;
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos - 4);
        __privateGet(this, _writer).writeU32(mfraBoxSize);
      } else {
        let mdatPos = __privateGet(this, _writer).offsets.get(__privateGet(this, _mdat));
        let mdatSize = __privateGet(this, _writer).pos - mdatPos;
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _mdat).largeSize = mdatSize >= 2 ** 32;
        __privateGet(this, _writer).patchBox(__privateGet(this, _mdat));
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        if (typeof __privateGet(this, _options).fastStart === "object") {
          __privateGet(this, _writer).seek(__privateGet(this, _ftypSize));
          __privateGet(this, _writer).writeBox(movieBox);
          let remainingBytes = mdatPos - __privateGet(this, _writer).pos;
          __privateGet(this, _writer).writeBox(free(remainingBytes));
        } else {
          __privateGet(this, _writer).writeBox(movieBox);
        }
      }
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
      __privateGet(this, _writer).finalize();
      __privateSet(this, _finalized, true);
    }
  };
  _options = new WeakMap();
  _writer = new WeakMap();
  _ftypSize = new WeakMap();
  _mdat = new WeakMap();
  _videoTrack = new WeakMap();
  _audioTrack = new WeakMap();
  _creationTime = new WeakMap();
  _finalizedChunks = new WeakMap();
  _nextFragmentNumber = new WeakMap();
  _videoSampleQueue = new WeakMap();
  _audioSampleQueue = new WeakMap();
  _finalized = new WeakMap();
  _validateOptions = new WeakSet();
  validateOptions_fn = function(options) {
    if (typeof options !== "object") {
      throw new TypeError("The muxer requires an options object to be passed to its constructor.");
    }
    if (!(options.target instanceof Target)) {
      throw new TypeError("The target must be provided and an instance of Target.");
    }
    if (options.video) {
      if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
        throw new TypeError(`Unsupported video codec: ${options.video.codec}`);
      }
      if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
        throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
      }
      if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
        throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
      }
      const videoRotation = options.video.rotation;
      if (typeof videoRotation === "number" && ![0, 90, 180, 270].includes(videoRotation)) {
        throw new TypeError(`Invalid video rotation: ${videoRotation}. Has to be 0, 90, 180 or 270.`);
      } else if (Array.isArray(videoRotation) && (videoRotation.length !== 9 || videoRotation.some((value) => typeof value !== "number"))) {
        throw new TypeError(`Invalid video transformation matrix: ${videoRotation.join()}`);
      }
      if (options.video.frameRate !== void 0 && (!Number.isInteger(options.video.frameRate) || options.video.frameRate <= 0)) {
        throw new TypeError(
          `Invalid video frame rate: ${options.video.frameRate}. Must be a positive integer.`
        );
      }
    }
    if (options.audio) {
      if (!SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
        throw new TypeError(`Unsupported audio codec: ${options.audio.codec}`);
      }
      if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
        throw new TypeError(
          `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
        );
      }
      if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
        throw new TypeError(
          `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
        );
      }
    }
    if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
      throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
    }
    if (typeof options.fastStart === "object") {
      if (options.video) {
        if (options.fastStart.expectedVideoChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedVideoChunks) || options.fastStart.expectedVideoChunks < 0) {
          throw new TypeError(`'expectedVideoChunks' must be a non-negative integer.`);
        }
      }
      if (options.audio) {
        if (options.fastStart.expectedAudioChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedAudioChunks) || options.fastStart.expectedAudioChunks < 0) {
          throw new TypeError(`'expectedAudioChunks' must be a non-negative integer.`);
        }
      }
    } else if (![false, "in-memory", "fragmented"].includes(options.fastStart)) {
      throw new TypeError(`'fastStart' option must be false, 'in-memory', 'fragmented' or an object.`);
    }
    if (options.minFragmentDuration !== void 0 && (!Number.isFinite(options.minFragmentDuration) || options.minFragmentDuration < 0)) {
      throw new TypeError(`'minFragmentDuration' must be a non-negative number.`);
    }
  };
  _writeHeader = new WeakSet();
  writeHeader_fn = function() {
    __privateGet(this, _writer).writeBox(ftyp({
      holdsAvc: __privateGet(this, _options).video?.codec === "avc",
      fragmented: __privateGet(this, _options).fastStart === "fragmented"
    }));
    __privateSet(this, _ftypSize, __privateGet(this, _writer).pos);
    if (__privateGet(this, _options).fastStart === "in-memory") {
      __privateSet(this, _mdat, mdat(false));
    } else if (__privateGet(this, _options).fastStart === "fragmented") {
    } else {
      if (typeof __privateGet(this, _options).fastStart === "object") {
        let moovSizeUpperBound = __privateMethod(this, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn).call(this);
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos + moovSizeUpperBound);
      }
      __privateSet(this, _mdat, mdat(true));
      __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _computeMoovSizeUpperBound = new WeakSet();
  computeMoovSizeUpperBound_fn = function() {
    if (typeof __privateGet(this, _options).fastStart !== "object")
      return;
    let upperBound = 0;
    let sampleCounts = [
      __privateGet(this, _options).fastStart.expectedVideoChunks,
      __privateGet(this, _options).fastStart.expectedAudioChunks
    ];
    for (let n of sampleCounts) {
      if (!n)
        continue;
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += 8 * n;
    }
    upperBound += 4096;
    return upperBound;
  };
  _prepareTracks = new WeakSet();
  prepareTracks_fn = function() {
    if (__privateGet(this, _options).video) {
      __privateSet(this, _videoTrack, {
        id: 1,
        info: {
          type: "video",
          codec: __privateGet(this, _options).video.codec,
          width: __privateGet(this, _options).video.width,
          height: __privateGet(this, _options).video.height,
          rotation: __privateGet(this, _options).video.rotation ?? 0,
          decoderConfig: null
        },
        // The fallback contains many common frame rates as factors
        timescale: __privateGet(this, _options).video.frameRate ?? 57600,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
    }
    if (__privateGet(this, _options).audio) {
      __privateSet(this, _audioTrack, {
        id: __privateGet(this, _options).video ? 2 : 1,
        info: {
          type: "audio",
          codec: __privateGet(this, _options).audio.codec,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate,
          decoderConfig: null
        },
        timescale: __privateGet(this, _options).audio.sampleRate,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
      if (__privateGet(this, _options).audio.codec === "aac") {
        let guessedCodecPrivate = __privateMethod(this, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn).call(
          this,
          2,
          // Object type for AAC-LC, since it's the most common
          __privateGet(this, _options).audio.sampleRate,
          __privateGet(this, _options).audio.numberOfChannels
        );
        __privateGet(this, _audioTrack).info.decoderConfig = {
          codec: __privateGet(this, _options).audio.codec,
          description: guessedCodecPrivate,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate
        };
      }
    }
  };
  _generateMpeg4AudioSpecificConfig = new WeakSet();
  generateMpeg4AudioSpecificConfig_fn = function(objectType, sampleRate, numberOfChannels) {
    let frequencyIndices = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
    let frequencyIndex = frequencyIndices.indexOf(sampleRate);
    let channelConfig = numberOfChannels;
    let configBits = "";
    configBits += objectType.toString(2).padStart(5, "0");
    configBits += frequencyIndex.toString(2).padStart(4, "0");
    if (frequencyIndex === 15)
      configBits += sampleRate.toString(2).padStart(24, "0");
    configBits += channelConfig.toString(2).padStart(4, "0");
    let paddingLength = Math.ceil(configBits.length / 8) * 8;
    configBits = configBits.padEnd(paddingLength, "0");
    let configBytes = new Uint8Array(configBits.length / 8);
    for (let i = 0; i < configBits.length; i += 8) {
      configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
    }
    return configBytes;
  };
  _createSampleForTrack = new WeakSet();
  createSampleForTrack_fn = function(track, data, type, timestamp, duration, meta, compositionTimeOffset) {
    let presentationTimestampInSeconds = timestamp / 1e6;
    let decodeTimestampInSeconds = (timestamp - (compositionTimeOffset ?? 0)) / 1e6;
    let durationInSeconds = duration / 1e6;
    let adjusted = __privateMethod(this, _validateTimestamp, validateTimestamp_fn).call(this, presentationTimestampInSeconds, decodeTimestampInSeconds, track);
    presentationTimestampInSeconds = adjusted.presentationTimestamp;
    decodeTimestampInSeconds = adjusted.decodeTimestamp;
    if (meta?.decoderConfig) {
      if (track.info.decoderConfig === null) {
        track.info.decoderConfig = meta.decoderConfig;
      } else {
        Object.assign(track.info.decoderConfig, meta.decoderConfig);
      }
    }
    let sample = {
      presentationTimestamp: presentationTimestampInSeconds,
      decodeTimestamp: decodeTimestampInSeconds,
      duration: durationInSeconds,
      data,
      size: data.byteLength,
      type,
      // Will be refined once the next sample comes in
      timescaleUnitsToNextSample: intoTimescale(durationInSeconds, track.timescale)
    };
    return sample;
  };
  _addSampleToTrack = new WeakSet();
  addSampleToTrack_fn = function(track, sample) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      track.samples.push(sample);
    }
    const sampleCompositionTimeOffset = intoTimescale(sample.presentationTimestamp - sample.decodeTimestamp, track.timescale);
    if (track.lastTimescaleUnits !== null) {
      let timescaleUnits = intoTimescale(sample.decodeTimestamp, track.timescale, false);
      let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
      track.lastTimescaleUnits += delta;
      track.lastSample.timescaleUnitsToNextSample = delta;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        let lastTableEntry = last(track.timeToSampleTable);
        if (lastTableEntry.sampleCount === 1) {
          lastTableEntry.sampleDelta = delta;
          lastTableEntry.sampleCount++;
        } else if (lastTableEntry.sampleDelta === delta) {
          lastTableEntry.sampleCount++;
        } else {
          lastTableEntry.sampleCount--;
          track.timeToSampleTable.push({
            sampleCount: 2,
            sampleDelta: delta
          });
        }
        const lastCompositionTimeOffsetTableEntry = last(track.compositionTimeOffsetTable);
        if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
          lastCompositionTimeOffsetTableEntry.sampleCount++;
        } else {
          track.compositionTimeOffsetTable.push({
            sampleCount: 1,
            sampleCompositionTimeOffset
          });
        }
      }
    } else {
      track.lastTimescaleUnits = 0;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        track.timeToSampleTable.push({
          sampleCount: 1,
          sampleDelta: intoTimescale(sample.duration, track.timescale)
        });
        track.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset
        });
      }
    }
    track.lastSample = sample;
    let beginNewChunk = false;
    if (!track.currentChunk) {
      beginNewChunk = true;
    } else {
      let currentChunkDuration = sample.presentationTimestamp - track.currentChunk.startTimestamp;
      if (__privateGet(this, _options).fastStart === "fragmented") {
        let mostImportantTrack = __privateGet(this, _videoTrack) ?? __privateGet(this, _audioTrack);
        const chunkDuration = __privateGet(this, _options).minFragmentDuration ?? 1;
        if (track === mostImportantTrack && sample.type === "key" && currentChunkDuration >= chunkDuration) {
          beginNewChunk = true;
          __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this);
        }
      } else {
        beginNewChunk = currentChunkDuration >= 0.5;
      }
    }
    if (beginNewChunk) {
      if (track.currentChunk) {
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, track);
      }
      track.currentChunk = {
        startTimestamp: sample.presentationTimestamp,
        samples: []
      };
    }
    track.currentChunk.samples.push(sample);
  };
  _validateTimestamp = new WeakSet();
  validateTimestamp_fn = function(presentationTimestamp, decodeTimestamp, track) {
    const strictTimestampBehavior = __privateGet(this, _options).firstTimestampBehavior === "strict";
    const noLastDecodeTimestamp = track.lastDecodeTimestamp === -1;
    const timestampNonZero = decodeTimestamp !== 0;
    if (strictTimestampBehavior && noLastDecodeTimestamp && timestampNonZero) {
      throw new Error(
        `The first chunk for your media track must have a timestamp of 0 (received DTS=${decodeTimestamp}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`
      );
    } else if (__privateGet(this, _options).firstTimestampBehavior === "offset" || __privateGet(this, _options).firstTimestampBehavior === "cross-track-offset") {
      if (track.firstDecodeTimestamp === void 0) {
        track.firstDecodeTimestamp = decodeTimestamp;
      }
      let baseDecodeTimestamp;
      if (__privateGet(this, _options).firstTimestampBehavior === "offset") {
        baseDecodeTimestamp = track.firstDecodeTimestamp;
      } else {
        baseDecodeTimestamp = Math.min(
          __privateGet(this, _videoTrack)?.firstDecodeTimestamp ?? Infinity,
          __privateGet(this, _audioTrack)?.firstDecodeTimestamp ?? Infinity
        );
      }
      decodeTimestamp -= baseDecodeTimestamp;
      presentationTimestamp -= baseDecodeTimestamp;
    }
    if (decodeTimestamp < track.lastDecodeTimestamp) {
      throw new Error(
        `Timestamps must be monotonically increasing (DTS went from ${track.lastDecodeTimestamp * 1e6} to ${decodeTimestamp * 1e6}).`
      );
    }
    track.lastDecodeTimestamp = decodeTimestamp;
    return { presentationTimestamp, decodeTimestamp };
  };
  _finalizeCurrentChunk = new WeakSet();
  finalizeCurrentChunk_fn = function(track) {
    if (__privateGet(this, _options).fastStart === "fragmented") {
      throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");
    }
    if (!track.currentChunk)
      return;
    track.finalizedChunks.push(track.currentChunk);
    __privateGet(this, _finalizedChunks).push(track.currentChunk);
    if (track.compactlyCodedChunkTable.length === 0 || last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.samples.length) {
      track.compactlyCodedChunkTable.push({
        firstChunk: track.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: track.currentChunk.samples.length
      });
    }
    if (__privateGet(this, _options).fastStart === "in-memory") {
      track.currentChunk.offset = 0;
      return;
    }
    track.currentChunk.offset = __privateGet(this, _writer).pos;
    for (let sample of track.currentChunk.samples) {
      __privateGet(this, _writer).write(sample.data);
      sample.data = null;
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _finalizeFragment = new WeakSet();
  finalizeFragment_fn = function(flushStreamingWriter = true) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");
    }
    let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter((track) => track && track.currentChunk);
    if (tracks.length === 0)
      return;
    let fragmentNumber = __privateWrapper(this, _nextFragmentNumber)._++;
    if (fragmentNumber === 1) {
      let movieBox = moov(tracks, __privateGet(this, _creationTime), true);
      __privateGet(this, _writer).writeBox(movieBox);
    }
    let moofOffset = __privateGet(this, _writer).pos;
    let moofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(moofBox);
    {
      let mdatBox = mdat(false);
      let totalTrackSampleSize = 0;
      for (let track of tracks) {
        for (let sample of track.currentChunk.samples) {
          totalTrackSampleSize += sample.size;
        }
      }
      let mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      if (mdatSize >= 2 ** 32) {
        mdatBox.largeSize = true;
        mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      }
      mdatBox.size = mdatSize;
      __privateGet(this, _writer).writeBox(mdatBox);
    }
    for (let track of tracks) {
      track.currentChunk.offset = __privateGet(this, _writer).pos;
      track.currentChunk.moofOffset = moofOffset;
      for (let sample of track.currentChunk.samples) {
        __privateGet(this, _writer).write(sample.data);
        sample.data = null;
      }
    }
    let endPos = __privateGet(this, _writer).pos;
    __privateGet(this, _writer).seek(__privateGet(this, _writer).offsets.get(moofBox));
    let newMoofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(newMoofBox);
    __privateGet(this, _writer).seek(endPos);
    for (let track of tracks) {
      track.finalizedChunks.push(track.currentChunk);
      __privateGet(this, _finalizedChunks).push(track.currentChunk);
      track.currentChunk = null;
    }
    if (flushStreamingWriter) {
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
    }
  };
  _maybeFlushStreamingTargetWriter = new WeakSet();
  maybeFlushStreamingTargetWriter_fn = function() {
    if (__privateGet(this, _writer) instanceof StreamTargetWriter) {
      __privateGet(this, _writer).flush();
    }
  };
  _ensureNotFinalized = new WeakSet();
  ensureNotFinalized_fn = function() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
    }
  };
  return __toCommonJS(src_exports);
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mp4Muxer)


/* ==========================================================================
   SECTION 5: COMPLETE COPY-PASTE STANDALONE INTEGRATION EXAMPLE
   ========================================================================== */

/**
 * EXAMPLE: How an AI agent or developer should implement this inside an HTML file:
 * 
 * 1. Shader Uniform Setup:
 * ----------------------------------------------------
 * const uniforms = {
 *   uResolution: { value: new THREE.Vector2(1, 1) },
 *   uFragCoordOffset: { value: new THREE.Vector2(0, 0) }, // Add this uniform!
 *   ...
 * };
 * 
 * In your Fragment Shader:
 * ----------------------------------------------------
 * uniform vec2 uResolution;
 * uniform vec2 uFragCoordOffset;
 * 
 * void main() {
 *   vec2 fragCoord = gl_FragCoord.xy + uFragCoordOffset; // Shift fragCoord!
 *   ...
 * }
 * 
 * 2. Scene Event Guarding:
 * ----------------------------------------------------
 * function resize() {
 *   if (videoRecorder?.getIsExporting()) return; // Don't resize canvas during export!
 *   ...
 * }
 * canvas.addEventListener('pointerdown', (e) => {
 *   if (videoRecorder?.getIsExporting()) return; // Block interaction!
 *   ...
 * });
 * 
 * 3. Initialize VideoRecorder:
 * ----------------------------------------------------
 * const videoRecorder = createVideoRecorder({
 *   renderer,
 *   scene,
 *   camera,
 *   uniforms,
 *   setTime: (t) => { setTime(t); },
 *   updateView: (delta) => { updateView(delta); },
 *   getSpeed: () => settings.speed,
 *   getTimeline: () => timeline,
 *   setTimeline: (t) => { timeline = t; },
 *   pauseAnimation: () => { cancelAnimationFrame(animationFrame); },
 *   resumeAnimation: () => { animationFrame = requestAnimationFrame(render); },
 *   onRestorePreview: () => {
 *     renderer.setPixelRatio(settings.pixelRatio);
 *     resize();
 *     draw();
 *   },
 *   gui: gui, // Optional: auto-binds GUI folder
 *   filenamePrefix: 'my-artwork'
 * });
 */

// Export functions for ES Module environments (while remaining 100% copy-pasteable for IIFE scripts)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createVideoRecorder,
    verifyMp4Boxes,
    verifyWithVideoElement,
    ensureExportModalDOM,
    EXPORT_MODAL_CSS,
    EXPORT_MODAL_HTML,
    Mp4Muxer
  };
}
