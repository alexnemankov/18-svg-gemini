# Post-Processing & Cinematic Suite for Three.js

A modular, high-performance post-processing suite for Three.js providing film-grade visual shaders, custom bloom, vignette, chromatic aberration, noise grain, level adjustments, cinematic presets, and automated interactive `lil-gui` controls.

---

## 📁 Pack Contents

- **`PostProcessor.js`** — Main custom post-processing pipeline featuring multi-pass Gaussian bloom, chromatic aberration, film grain noise, vignette, levels adjustment, offscreen rendering, and one-line `lil-gui` binding.
- **`cinematic-pack.js`** — Preset definitions, pass updaters, and GUI attachment functions for standard Three.js `EffectComposer` passes.

---

## ⚡ `PostProcessor.js` Quick Start & Usage

### 1. Import & Instantiate
```js
import * as THREE from 'three';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.20/+esm';
import { PostProcessor } from './postprocessing/PostProcessor.js';

// Initialize renderer
const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);

// Create PostProcessor instance with custom default parameters
const postProcessor = new PostProcessor(renderer, {
  enabled: true,
  bloomStrength: 2.5,
  chromaticAberration: 0.08,
  vignetteBoost: 1.0,
  vignetteReduction: 0.5,
  noiseIntensity: 0.03
});
```

### 2. Auto-Attach Controls to `lil-gui`
```js
const gui = new GUI({ title: 'Scene Controls' });

// Binds all post-processor controls automatically into a GUI folder
postProcessor.attachGUI(gui, 'Post Processor');
```

### 3. Handle Window Resize
```js
function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);

  // Resize all offscreen render targets and shaders
  postProcessor.setSize(width, height, pixelRatio);
}
window.addEventListener('resize', onResize);
```

### 4. Render Loop
```js
function animate() {
  requestAnimationFrame(animate);

  // Automatically renders the scene to offscreen target and applies post-processing
  postProcessor.renderScene(scene, camera);
}
animate();
```

---

## 🛠️ `PostProcessor.js` Settings & API Reference

### Constructor Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `true` | Toggle post-processing on/off. |
| `bloomStrength` | `number` | `3.0` | Multi-pass Gaussian blur bloom intensity (0 to 10). |
| `chromaticAberration` | `number` | `0.1` | Radial RGB channel separation distortion (0 to 0.5). |
| `vignetteBoost` | `number` | `1.0` | Center brightness multiplier for vignette (0 to 2). |
| `vignetteReduction` | `number` | `0.5` | Edge darkening falloff rate (0 to 2). |
| `noiseIntensity` | `number` | `0.05` | Film grain noise strength (0 to 0.2). |
| `gamma` | `number` | `0.85` | Gamma correction exponent (0.1 to 2.0). |
| `minInputLevel` | `number` | `0.035` | Black point level threshold (0 to 0.5). |
| `maxInputLevel` | `number` | `0.93` | White point level threshold (0.5 to 1.0). |

---

### Instance Methods

- **`postProcessor.renderScene(scene, camera)`**  
  Renders the provided Three.js `scene` and `camera` through the post-processing pipeline. Falls back to standard direct scene rendering if disabled.

- **`postProcessor.render(sourceTexture)`**  
  Renders an existing `WebGLTexture` or `WebGLRenderTarget.texture` through the bloom, vignette, noise, and chromatic aberration passes directly to the screen canvas.

- **`postProcessor.setSize(width, height, dpr = 1)`**  
  Updates resolution for internal framebuffers (`sceneTarget`, ping-pong blur FBOs, final ShaderPass targets).

- **`postProcessor.attachGUI(gui, title = "Post Processor Settings")`**  
  Creates and returns a new `lil-gui` folder with interactive sliders for all post-processor parameters.

---

## 🎨 `cinematic-pack.js` Overview

For projects utilizing standard Three.js `EffectComposer` passes (`UnrealBloomPass`, `FilmPass`, `BokehPass`, `HalftonePass`):

### Included Cinematic Presets

1. **Cyberpunk Neon**: High-contrast glow, subtle halftone grid, film grain scanlines.
2. **Hollywood Blockbuster**: Warm bloom, depth-of-field focal blur, subtle film grain.
3. **Vintage 35mm Film Noir**: High-contrast monochrome film grain, deep shadows, bokeh blur.
4. **Sci-Fi Anamorphic Glow**: Ultra-bright lens flares, wide bloom, soft camera lens focus.
5. **Deep Space Abyss**: Fine halftone dot matrix, subtle starfield ambient bloom.
6. **Clean Pure 3D**: Disables post-processing passes for maximum performance.

### Quick Usage

```js
import { CINEMATIC_PRESETS, applyCinematicPreset, attachCinematicGUI } from './postprocessing/cinematic-pack.js';

const passes = {
  bloomPass,
  halftonePass,
  filmPass,
  bokehPass
};

// Apply preset programmatically
applyCinematicPreset('Hollywood Blockbuster', passes);

// Attach GUI controls
attachCinematicGUI(gui, passes);
```

---

## 💡 Usage Note for Local (`file://`) Protocol

When running standalone single HTML files locally without a web server (using `file://` protocol), inline `PostProcessor.js` directly within a `<script type="module">` block to avoid browser CORS restrictions on local module imports.
