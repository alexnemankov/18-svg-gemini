/**
 * =========================================================================================
 *  THREE.JS & WEBGL CINEMATIC POST-PROCESSING SUITE
 * =========================================================================================
 * 
 *  WHAT IS THIS MODULE?
 *  -------------------
 *  This ES Module provides a unified post-processing suite and preset management system for
 *  Three.js and TroisJS applications. It contains 13 individual post-processing pass handlers
 *  and 9 curated cinematic style presets (Cyberpunk Neon, Hollywood Blockbuster, Retro 8-Bit,
 *  Sobel Line-Art, God Rays Sunset, Vintage Film Noir, Miniature Diorama, Warp Velocity, Clean 3D).
 * 
 *  HOW POST-PROCESSING WORKS & IMPLEMENTATION ARCHITECTURE:
 *  ------------------------------------------------------
 *  1. Render Target Pipeline (EffectComposer):
 *     Instead of rendering 3D geometry directly to the canvas, the 3D scene is rendered into
 *     an off-screen frame buffer (RenderPass).
 * 
 *  2. Sequential Shader Pass Chaining:
 *     Subsequent post-processing passes receive the rendered texture (tDiffuse), execute custom
 *     GLSL fragment shaders, and pass the modified output to the next pass in line.
 * 
 *  3. Dual-Pass Component Handling (e.g., TiltShiftPass):
 *     Certain complex passes (like TiltShift) instantiate multiple sub-passes (`pass` for horizontal
 *     blur and `pass1` for vertical blur). To fully enable/disable these passes without residual blur,
 *     both sub-passes must have their `.enabled` property toggled simultaneously.
 * 
 *  4. Uniform & State Manipulation:
 *     Shader values (luminance thresholds, blur radii, scanline frequencies, pixel sizes, kernel matrices)
 *     are updated dynamically by targeting shader uniforms (`pass.uniforms.[uniformName].value`).
 * =========================================================================================
 */

/**
 * -----------------------------------------------------------------------------------------
 *  CINEMATIC PRESET DEFINITIONS
 * -----------------------------------------------------------------------------------------
 *  Each key in CINEMATIC_PRESETS corresponds to a unique visual aesthetic.
 *  The object defines the boolean `.enabled` state and uniform configuration parameters
 *  for all 13 supported passes.
 */
export const CINEMATIC_PRESETS = {

  /**
   * 1. Cyberpunk Neon:
   *    High contrast neon glow with cyan/pink light bleeding, subtle halftone dot matrix,
   *    chromatic lens fringing, and CRT scanlines.
   */
  'Cyberpunk Neon': {
    bloom: { enabled: true, strength: 1.8, radius: 0.4, threshold: 0.1 },
    chromatic: { enabled: true, amount: 0.008 },
    anamorphic: { enabled: true, scale: 1.5, threshold: 0.7 },
    halftone: { enabled: true, radius: 1.2, scatter: 0.2, shape: 1 },
    film: { enabled: true, noiseIntensity: 0.3, scanlinesIntensity: 0.1, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: false, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: false, focus: 300, aperture: 0.025, maxblur: 0.01 },
    tiltShift: { enabled: false, blurRadius: 10, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.2 },
    fxaa: { enabled: true },
    smaa: { enabled: false }
  },

  /**
   * 2. Hollywood Blockbuster:
   *    Simulates anamorphic movie camera lenses with subtle teal & orange bloom, soft depth-of-field
   *    focal blur, light volumetric god rays, and organic 35mm film grain.
   */
  'Hollywood Blockbuster': {
    bloom: { enabled: true, strength: 0.9, radius: 0.2, threshold: 0.2 },
    chromatic: { enabled: true, amount: 0.003 },
    anamorphic: { enabled: true, scale: 0.8, threshold: 0.8 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: true, noiseIntensity: 0.1, scanlinesIntensity: 0.02, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: true, exposure: 0.25, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: true, focus: 280, aperture: 0.035, maxblur: 0.015 },
    tiltShift: { enabled: false, blurRadius: 10, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: true },
    smaa: { enabled: false }
  },

  /**
   * 3. Retro 8-Bit Pixelated:
   *    Recreates 1980s arcade gaming visuals using UV coordinate quantization (pixelation)
   *    combined with color palette dither quantization.
   */
  'Retro 8-Bit Pixelated': {
    bloom: { enabled: false, strength: 0.0, radius: 0.0, threshold: 0.0 },
    chromatic: { enabled: false, amount: 0.0 },
    anamorphic: { enabled: false, scale: 0.0, threshold: 0.8 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: false, noiseIntensity: 0.0, scanlinesIntensity: 0.0, grayscale: false },
    pixel: { enabled: true, pixelSize: 8 },
    sobel: { enabled: false },
    godRays: { enabled: false, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: true, colorLevels: 5 },
    bokeh: { enabled: false, focus: 300, aperture: 0.025, maxblur: 0.01 },
    tiltShift: { enabled: false, blurRadius: 0, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: false },
    smaa: { enabled: false }
  },

  /**
   * 4. Sobel Edge Sketch:
   *    Applies a 3x3 Sobel convolution matrix operator to detect luminance gradients, rendering
   *    the 3D scene as high-contrast pencil lines / architectural wireframe drawings.
   */
  'Sobel Edge Sketch': {
    bloom: { enabled: false, strength: 0.0, radius: 0.0, threshold: 0.0 },
    chromatic: { enabled: false, amount: 0.0 },
    anamorphic: { enabled: false, scale: 0.0, threshold: 0.8 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: false, noiseIntensity: 0.0, scanlinesIntensity: 0.0, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: true },
    godRays: { enabled: false, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: false, focus: 300, aperture: 0.025, maxblur: 0.01 },
    tiltShift: { enabled: false, blurRadius: 0, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: true },
    smaa: { enabled: false }
  },

  /**
   * 5. God Rays Sunset:
   *    Simulates dramatic atmospheric light shafts streaming from light sources across the screen
   *    using radial decay march sampling.
   */
  'God Rays Sunset': {
    bloom: { enabled: true, strength: 1.5, radius: 0.5, threshold: 0.1 },
    chromatic: { enabled: true, amount: 0.004 },
    anamorphic: { enabled: true, scale: 2.0, threshold: 0.6 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: false, noiseIntensity: 0.0, scanlinesIntensity: 0.0, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: true, exposure: 0.45, decay: 0.96, weight: 0.5 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: true, focus: 300, aperture: 0.02, maxblur: 0.01 },
    tiltShift: { enabled: false, blurRadius: 0, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: true },
    smaa: { enabled: false }
  },

  /**
   * 6. Vintage 35mm Film Noir:
   *    High contrast black & white film simulation with deep shadows, high-grain noise,
   *    screen print halftone dots, and lens focal blur.
   */
  'Vintage 35mm Film Noir': {
    bloom: { enabled: true, strength: 0.5, radius: 0.1, threshold: 0.4 },
    chromatic: { enabled: true, amount: 0.006 },
    anamorphic: { enabled: false, scale: 0.0, threshold: 0.8 },
    halftone: { enabled: true, radius: 2.0, scatter: 0.5, shape: 1 },
    film: { enabled: true, noiseIntensity: 0.7, scanlinesIntensity: 0.25, grayscale: true },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: false, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: true, focus: 200, aperture: 0.04, maxblur: 0.02 },
    tiltShift: { enabled: false, blurRadius: 10, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: false },
    smaa: { enabled: false }
  },

  /**
   * 7. Miniature Diorama:
   *    Uses a dual-pass Tilt Shift gradient blur to simulate a tilt-shift camera lens macro effect,
   *    making full-scale 3D models look like miniature toys.
   */
  'Miniature Diorama': {
    bloom: { enabled: true, strength: 0.8, radius: 0.2, threshold: 0.2 },
    chromatic: { enabled: false, amount: 0.0 },
    anamorphic: { enabled: false, scale: 0.0, threshold: 0.8 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: false, noiseIntensity: 0.0, scanlinesIntensity: 0.0, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: false, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: false, focus: 300, aperture: 0.025, maxblur: 0.01 },
    tiltShift: { enabled: true, blurRadius: 18, gradientRadius: 80 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: true },
    smaa: { enabled: false }
  },

  /**
   * 8. Hyper Warp Velocity:
   *    High-speed action visual effect combining radial zoom motion blur with anamorphic streak flares
   *    and intense bright bloom.
   */
  'Hyper Warp Velocity': {
    bloom: { enabled: true, strength: 2.2, radius: 0.6, threshold: 0.05 },
    chromatic: { enabled: true, amount: 0.012 },
    anamorphic: { enabled: true, scale: 3.0, threshold: 0.5 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: true, noiseIntensity: 0.2, scanlinesIntensity: 0.1, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: true, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: false, focus: 300, aperture: 0.025, maxblur: 0.01 },
    tiltShift: { enabled: false, blurRadius: 10, gradientRadius: 100 },
    zoomBlur: { enabled: true, strength: 0.65 },
    fxaa: { enabled: true },
    smaa: { enabled: false }
  },

  /**
   * 9. Clean Pure 3D:
   *    Disables all post-processing passes completely, yielding crystal-clear 100% sharp
   *    standard WebGL geometry rendering for maximum framerate performance.
   */
  'Clean Pure 3D': {
    bloom: { enabled: false, strength: 0.0, radius: 0.0, threshold: 0.0 },
    chromatic: { enabled: false, amount: 0.0 },
    anamorphic: { enabled: false, scale: 0.0, threshold: 0.8 },
    halftone: { enabled: false, radius: 1.0, scatter: 0.0, shape: 1 },
    film: { enabled: false, noiseIntensity: 0.0, scanlinesIntensity: 0.0, grayscale: false },
    pixel: { enabled: false, pixelSize: 4 },
    sobel: { enabled: false },
    godRays: { enabled: false, exposure: 0.3, decay: 0.95, weight: 0.4 },
    retro: { enabled: false, colorLevels: 4 },
    bokeh: { enabled: false, focus: 300, aperture: 0.025, maxblur: 0.01 },
    tiltShift: { enabled: false, blurRadius: 0, gradientRadius: 100 },
    zoomBlur: { enabled: false, strength: 0.0 },
    fxaa: { enabled: false },
    smaa: { enabled: false }
  }
};

/**
 * =========================================================================================
 *  applyCinematicPreset()
 * =========================================================================================
 *  WHAT IT DOES:
 *  Applies a target preset configuration dictionary to a collection of active post-processing pass
 *  instances.
 * 
 *  IMPLEMENTATION DETAILS:
 *  - Safely checks for existence of pass instances before updating (`pass && pass.pass`).
 *  - Handles single-pass ShaderPasses as well as multi-pass components like `tiltShiftPass`
 *    (`tiltShiftPass.pass` AND `tiltShiftPass.pass1`).
 *  - Dynamically updates ShaderPass uniform values (`pass.uniforms.[param].value`).
 * 
 *  @param {string} presetName - Key of the target preset in CINEMATIC_PRESETS
 *  @param {Object} passes - Dictionary of pass references: { bloomPass, halftonePass, filmPass,
 *                            bokehPass, tiltShiftPass, zoomBlurPass, chromaticPass, anamorphicPass,
 *                            pixelPass, sobelPass, godRaysPass, retroPass, fxaaPass, smaaPass }
 */
export function applyCinematicPreset(presetName, passes) {
  const preset = CINEMATIC_PRESETS[presetName];
  if (!preset) return;

  const {
    bloomPass, halftonePass, filmPass, bokehPass, tiltShiftPass, zoomBlurPass,
    chromaticPass, anamorphicPass, pixelPass, sobelPass, godRaysPass, retroPass, fxaaPass, smaaPass
  } = passes;

  // 1. Unreal Bloom Pass
  if (bloomPass && bloomPass.pass) {
    bloomPass.pass.enabled = preset.bloom.enabled;
    if (preset.bloom.strength !== undefined) bloomPass.pass.strength = preset.bloom.strength;
    if (preset.bloom.radius !== undefined) bloomPass.pass.radius = preset.bloom.radius;
    if (preset.bloom.threshold !== undefined) bloomPass.pass.threshold = preset.bloom.threshold;
  }

  // 2. Halftone Pass
  if (halftonePass && halftonePass.pass) {
    halftonePass.pass.enabled = preset.halftone.enabled;
    if (halftonePass.pass.uniforms) {
      if (preset.halftone.radius !== undefined) halftonePass.pass.uniforms.radius.value = preset.halftone.radius;
      if (preset.halftone.scatter !== undefined) halftonePass.pass.uniforms.scatter.value = preset.halftone.scatter;
      if (preset.halftone.shape !== undefined) halftonePass.pass.uniforms.shape.value = preset.halftone.shape;
    }
  }

  // 3. Film Pass (Noise & CRT Scanlines)
  if (filmPass && filmPass.pass) {
    filmPass.pass.enabled = preset.film.enabled;
    if (filmPass.pass.uniforms) {
      if (preset.film.noiseIntensity !== undefined) filmPass.pass.uniforms.nIntensity.value = preset.film.noiseIntensity;
      if (preset.film.scanlinesIntensity !== undefined) filmPass.pass.uniforms.sIntensity.value = preset.film.scanlinesIntensity;
      if (preset.film.grayscale !== undefined) filmPass.pass.uniforms.grayscale.value = preset.film.grayscale ? 1 : 0;
    }
  }

  // 4. Chromatic Aberration Pass
  if (chromaticPass && chromaticPass.pass) {
    chromaticPass.pass.enabled = preset.chromatic.enabled;
    if (chromaticPass.pass.uniforms && preset.chromatic.amount !== undefined) {
      chromaticPass.pass.uniforms.amount.value = preset.chromatic.amount;
    }
  }

  // 5. Anamorphic Lens Flare Pass
  if (anamorphicPass && anamorphicPass.pass) {
    anamorphicPass.pass.enabled = preset.anamorphic.enabled;
    if (anamorphicPass.pass.uniforms) {
      if (preset.anamorphic.scale !== undefined) anamorphicPass.pass.uniforms.scale.value = preset.anamorphic.scale;
      if (preset.anamorphic.threshold !== undefined) anamorphicPass.pass.uniforms.threshold.value = preset.anamorphic.threshold;
    }
  }

  // 6. Retro Pixelation Pass
  if (pixelPass && pixelPass.pass) {
    pixelPass.pass.enabled = preset.pixel.enabled;
    if (pixelPass.pass.uniforms && preset.pixel.pixelSize !== undefined) {
      pixelPass.pass.uniforms.pixelSize.value = preset.pixel.pixelSize;
    }
  }

  // 7. Sobel Line-Art Sketch Pass
  if (sobelPass && sobelPass.pass) {
    sobelPass.pass.enabled = preset.sobel.enabled;
  }

  // 8. Volumetric God Rays Pass
  if (godRaysPass && godRaysPass.pass) {
    godRaysPass.pass.enabled = preset.godRays.enabled;
    if (godRaysPass.pass.uniforms) {
      if (preset.godRays.exposure !== undefined) godRaysPass.pass.uniforms.exposure.value = preset.godRays.exposure;
      if (preset.godRays.decay !== undefined) godRaysPass.pass.uniforms.decay.value = preset.godRays.decay;
      if (preset.godRays.weight !== undefined) godRaysPass.pass.uniforms.weight.value = preset.godRays.weight;
    }
  }

  // 9. Retro Color Dithering Pass
  if (retroPass && retroPass.pass) {
    retroPass.pass.enabled = preset.retro.enabled;
    if (retroPass.pass.uniforms && preset.retro.colorLevels !== undefined) {
      retroPass.pass.uniforms.colorLevels.value = preset.retro.colorLevels;
    }
  }

  // 10. Bokeh Depth of Field Pass
  if (bokehPass && bokehPass.pass) {
    bokehPass.pass.enabled = preset.bokeh.enabled;
    if (bokehPass.pass.uniforms) {
      if (preset.bokeh.focus !== undefined) bokehPass.pass.uniforms.focus.value = preset.bokeh.focus;
      if (preset.bokeh.aperture !== undefined) bokehPass.pass.uniforms.aperture.value = preset.bokeh.aperture;
      if (preset.bokeh.maxblur !== undefined) bokehPass.pass.uniforms.maxblur.value = preset.bokeh.maxblur;
    }
  }

  // 11. Tilt Shift Blur Pass (Multi-pass handling for pass and pass1)
  if (tiltShiftPass) {
    if (tiltShiftPass.pass) tiltShiftPass.pass.enabled = preset.tiltShift.enabled;
    if (tiltShiftPass.pass1) tiltShiftPass.pass1.enabled = preset.tiltShift.enabled;
    if (tiltShiftPass.pass && tiltShiftPass.pass.uniforms) {
      if (preset.tiltShift.blurRadius !== undefined) tiltShiftPass.pass.uniforms.blurRadius.value = preset.tiltShift.blurRadius;
      if (preset.tiltShift.gradientRadius !== undefined) tiltShiftPass.pass.uniforms.gradientRadius.value = preset.tiltShift.gradientRadius;
    }
  }

  // 12. Radial Zoom Motion Blur Pass
  if (zoomBlurPass && zoomBlurPass.pass) {
    zoomBlurPass.pass.enabled = preset.zoomBlur.enabled;
    if (zoomBlurPass.pass.uniforms) {
      if (preset.zoomBlur.strength !== undefined) zoomBlurPass.pass.uniforms.strength.value = preset.zoomBlur.strength;
    }
  }

  // 13. FXAA Anti-Aliasing Pass
  if (fxaaPass && fxaaPass.pass) {
    fxaaPass.pass.enabled = preset.fxaa.enabled;
  }

  // 14. SMAA Anti-Aliasing Pass
  if (smaaPass && smaaPass.pass) {
    smaaPass.pass.enabled = preset.smaa.enabled;
  }
}

/**
 * =========================================================================================
 *  attachCinematicGUI()
 * =========================================================================================
 *  WHAT IT DOES:
 *  Attaches a complete UI menu folder to any `lil-gui` instance, building interactive subfolders
 *  and sliders for all 13 post-processing passes.
 * 
 *  HOW TO USE:
 *  ```js
 *  import GUI from 'https://unpkg.com/lil-gui@0.19.1/dist/lil-gui.esm.min.js';
 *  import { attachCinematicGUI } from './postprocessing/cinematic-pack.js';
 * 
 *  const gui = new GUI({ title: 'My Project Controls' });
 *  attachCinematicGUI(gui, passesReferences);
 *  ```
 * 
 *  @param {GUI} gui - The parent lil-gui instance
 *  @param {Object} passes - Dictionary of pass references
 *  @param {Function} [onUpdate] - Optional callback executed when any slider/toggle is adjusted
 */
export function attachCinematicGUI(gui, passes, onUpdate = () => {}) {
  const fxFolder = gui.addFolder('Three.js Post-Processing Suite');

  const params = {
    preset: 'Cyberpunk Neon',
    bloomEnabled: true, bloomStrength: 1.8, bloomRadius: 0.4, bloomThreshold: 0.1,
    halftoneEnabled: true, halftoneRadius: 1.2, halftoneScatter: 0.2, halftoneShape: 1,
    filmEnabled: true, filmNoise: 0.35, filmScanlines: 0.15, filmScanlinesCount: 2048, filmGrayscale: false,
    bokehEnabled: false, bokehFocus: 300, bokehAperture: 0.025, bokehMaxblur: 0.01,
    tiltShiftEnabled: false, tiltBlurRadius: 10, tiltGradientRadius: 100,
    zoomBlurEnabled: false, zoomBlurStrength: 0.2,
    chromaticEnabled: true, chromaticAmount: 0.008,
    anamorphicEnabled: true, anamorphicScale: 1.5,
    pixelEnabled: false, pixelSize: 4,
    sobelEnabled: false,
    godRaysEnabled: false, godRaysExposure: 0.3, godRaysDecay: 0.95, godRaysWeight: 0.4,
    retroEnabled: false, retroLevels: 4,
    fxaaEnabled: true, smaaEnabled: false
  };

  // Preset Selection Dropdown
  fxFolder.add(params, 'preset', Object.keys(CINEMATIC_PRESETS)).name('Effect Preset').onChange((name) => {
    applyCinematicPreset(name, passes);
    const p = CINEMATIC_PRESETS[name];
    if (p) {
      params.bloomEnabled = p.bloom.enabled; params.bloomStrength = p.bloom.strength; params.bloomRadius = p.bloom.radius; params.bloomThreshold = p.bloom.threshold;
      params.halftoneEnabled = p.halftone.enabled; params.halftoneRadius = p.halftone.radius; params.halftoneScatter = p.halftone.scatter; params.halftoneShape = p.halftone.shape;
      params.filmEnabled = p.film.enabled; params.filmNoise = p.film.noiseIntensity; params.filmScanlines = p.film.scanlinesIntensity; params.filmGrayscale = p.film.grayscale;
      params.bokehEnabled = p.bokeh.enabled; params.bokehFocus = p.bokeh.focus; params.bokehAperture = p.bokeh.aperture; params.bokehMaxblur = p.bokeh.maxblur;
      params.tiltShiftEnabled = p.tiltShift.enabled; params.tiltBlurRadius = p.tiltShift.blurRadius; params.tiltGradientRadius = p.tiltShift.gradientRadius;
      params.zoomBlurEnabled = p.zoomBlur.enabled; params.zoomBlurStrength = p.zoomBlur.strength;
      params.chromaticEnabled = p.chromatic.enabled; params.chromaticAmount = p.chromatic.amount;
      params.anamorphicEnabled = p.anamorphic.enabled; params.anamorphicScale = p.anamorphic.scale;
      params.pixelEnabled = p.pixel.enabled; params.pixelSize = p.pixel.pixelSize;
      params.sobelEnabled = p.sobel.enabled;
      params.godRaysEnabled = p.godRays.enabled; params.godRaysExposure = p.godRays.exposure;
      params.retroEnabled = p.retro.enabled; params.retroLevels = p.retro.colorLevels;
      params.fxaaEnabled = p.fxaa.enabled; params.smaaEnabled = p.smaa.enabled;

      bloomToggle.updateDisplay(); halftoneToggle.updateDisplay(); filmToggle.updateDisplay(); bokehToggle.updateDisplay();
      tiltToggle.updateDisplay(); zoomToggle.updateDisplay(); chromaticToggle.updateDisplay(); anamorphicToggle.updateDisplay();
      pixelToggle.updateDisplay(); sobelToggle.updateDisplay(); godRaysToggle.updateDisplay(); retroToggle.updateDisplay();
      fxaaToggle.updateDisplay(); smaaToggle.updateDisplay();
    }
    onUpdate();
  });

  // 1. Unreal Bloom Controls
  const bloomF = fxFolder.addFolder('Unreal Bloom');
  const bloomToggle = bloomF.add(params, 'bloomEnabled').name('Enable Bloom').onChange(v => {
    if (passes.bloomPass && passes.bloomPass.pass) passes.bloomPass.pass.enabled = v;
    onUpdate();
  });
  bloomF.add(params, 'bloomStrength', 0, 5, 0.1).name('Strength').onChange(v => {
    if (passes.bloomPass && passes.bloomPass.pass) passes.bloomPass.pass.strength = v;
    onUpdate();
  });
  bloomF.add(params, 'bloomRadius', 0, 2, 0.05).name('Radius').onChange(v => {
    if (passes.bloomPass && passes.bloomPass.pass) passes.bloomPass.pass.radius = v;
    onUpdate();
  });
  bloomF.add(params, 'bloomThreshold', 0, 1, 0.05).name('Threshold').onChange(v => {
    if (passes.bloomPass && passes.bloomPass.pass) passes.bloomPass.pass.threshold = v;
    onUpdate();
  });

  // 2. Chromatic Aberration Controls
  const caF = fxFolder.addFolder('Chromatic Aberration');
  const chromaticToggle = caF.add(params, 'chromaticEnabled').name('Enable Chromatic').onChange(v => {
    if (passes.chromaticPass && passes.chromaticPass.pass) passes.chromaticPass.pass.enabled = v;
    onUpdate();
  });
  caF.add(params, 'chromaticAmount', 0, 0.03, 0.001).name('Offset Amount').onChange(v => {
    if (passes.chromaticPass && passes.chromaticPass.pass && passes.chromaticPass.pass.uniforms) {
      passes.chromaticPass.pass.uniforms.amount.value = v;
    }
    onUpdate();
  });

  // 3. Anamorphic Lens Flare Controls
  const anaF = fxFolder.addFolder('Anamorphic Lens Flare');
  const anamorphicToggle = anaF.add(params, 'anamorphicEnabled').name('Enable Anamorphic').onChange(v => {
    if (passes.anamorphicPass && passes.anamorphicPass.pass) passes.anamorphicPass.pass.enabled = v;
    onUpdate();
  });
  anaF.add(params, 'anamorphicScale', 0, 5, 0.1).name('Streak Length').onChange(v => {
    if (passes.anamorphicPass && passes.anamorphicPass.pass && passes.anamorphicPass.pass.uniforms) {
      passes.anamorphicPass.pass.uniforms.scale.value = v;
    }
    onUpdate();
  });

  // 4. Halftone Grid Controls
  const halftoneF = fxFolder.addFolder('Halftone Grid');
  const halftoneToggle = halftoneF.add(params, 'halftoneEnabled').name('Enable Halftone').onChange(v => {
    if (passes.halftonePass && passes.halftonePass.pass) passes.halftonePass.pass.enabled = v;
    onUpdate();
  });
  halftoneF.add(params, 'halftoneRadius', 0, 10, 0.5).name('Dot Radius').onChange(v => {
    if (passes.halftonePass && passes.halftonePass.pass && passes.halftonePass.pass.uniforms) {
      passes.halftonePass.pass.uniforms.radius.value = v;
    }
    onUpdate();
  });
  halftoneF.add(params, 'halftoneScatter', 0, 5, 0.1).name('Scatter').onChange(v => {
    if (passes.halftonePass && passes.halftonePass.pass && passes.halftonePass.pass.uniforms) {
      passes.halftonePass.pass.uniforms.scatter.value = v;
    }
  });
  halftoneF.add(params, 'halftoneShape', { Dot: 1, Ellipse: 2, Line: 3, Square: 4 }).name('Shape').onChange(v => {
    if (passes.halftonePass && passes.halftonePass.pass && passes.halftonePass.pass.uniforms) {
      passes.halftonePass.pass.uniforms.shape.value = parseInt(v);
    }
    onUpdate();
  });

  // 5. Film Grain Controls
  const filmF = fxFolder.addFolder('Film Grain');
  const filmToggle = filmF.add(params, 'filmEnabled').name('Enable Film').onChange(v => {
    if (passes.filmPass && passes.filmPass.pass) passes.filmPass.pass.enabled = v;
    onUpdate();
  });
  filmF.add(params, 'filmNoise', 0, 1, 0.05).name('Noise Intensity').onChange(v => {
    if (passes.filmPass && passes.filmPass.pass && passes.filmPass.pass.uniforms) {
      passes.filmPass.pass.uniforms.nIntensity.value = v;
    }
    onUpdate();
  });
  filmF.add(params, 'filmScanlines', 0, 0.5, 0.01).name('Scanlines Intensity').onChange(v => {
    if (passes.filmPass && passes.filmPass.pass && passes.filmPass.pass.uniforms) {
      passes.filmPass.pass.uniforms.sIntensity.value = v;
    }
    onUpdate();
  });
  filmF.add(params, 'filmGrayscale').name('Grayscale Mode').onChange(v => {
    if (passes.filmPass && passes.filmPass.pass && passes.filmPass.pass.uniforms) {
      passes.filmPass.pass.uniforms.grayscale.value = v ? 1 : 0;
    }
    onUpdate();
  });

  // 6. Bokeh Depth of Field Controls
  const bokehF = fxFolder.addFolder('Depth of Field (Bokeh)');
  const bokehToggle = bokehF.add(params, 'bokehEnabled').name('Enable Bokeh').onChange(v => {
    if (passes.bokehPass && passes.bokehPass.pass) passes.bokehPass.pass.enabled = v;
    onUpdate();
  });
  bokehF.add(params, 'bokehFocus', 0, 600, 10).name('Focus Distance').onChange(v => {
    if (passes.bokehPass && passes.bokehPass.pass && passes.bokehPass.pass.uniforms) {
      passes.bokehPass.pass.uniforms.focus.value = v;
    }
    onUpdate();
  });
  bokehF.add(params, 'bokehAperture', 0, 0.1, 0.005).name('Aperture').onChange(v => {
    if (passes.bokehPass && passes.bokehPass.pass && passes.bokehPass.pass.uniforms) {
      passes.bokehPass.pass.uniforms.aperture.value = v;
    }
  });

  // 7. Tilt Shift Controls
  const tiltF = fxFolder.addFolder('Tilt Shift Blur');
  const tiltToggle = tiltF.add(params, 'tiltShiftEnabled').name('Enable Tilt Shift').onChange(v => {
    if (passes.tiltShiftPass) {
      if (passes.tiltShiftPass.pass) passes.tiltShiftPass.pass.enabled = v;
      if (passes.tiltShiftPass.pass1) passes.tiltShiftPass.pass1.enabled = v;
    }
    onUpdate();
  });
  tiltF.add(params, 'tiltBlurRadius', 0, 30, 1).name('Blur Radius').onChange(v => {
    if (passes.tiltShiftPass && passes.tiltShiftPass.pass && passes.tiltShiftPass.pass.uniforms) {
      passes.tiltShiftPass.pass.uniforms.blurRadius.value = v;
    }
    onUpdate();
  });

  // 8. Zoom Blur Controls
  const zoomF = fxFolder.addFolder('Zoom Blur');
  const zoomToggle = zoomF.add(params, 'zoomBlurEnabled').name('Enable Zoom Blur').onChange(v => {
    if (passes.zoomBlurPass && passes.zoomBlurPass.pass) passes.zoomBlurPass.pass.enabled = v;
    onUpdate();
  });
  zoomF.add(params, 'zoomBlurStrength', 0, 1.5, 0.05).name('Strength').onChange(v => {
    if (passes.zoomBlurPass && passes.zoomBlurPass.pass && passes.zoomBlurPass.pass.uniforms) {
      passes.zoomBlurPass.pass.uniforms.strength.value = v;
    }
    onUpdate();
  });

  // 9. Retro Pixelation Controls
  const pixF = fxFolder.addFolder('Retro Pixelation');
  const pixelToggle = pixF.add(params, 'pixelEnabled').name('Enable Pixelation').onChange(v => {
    if (passes.pixelPass && passes.pixelPass.pass) passes.pixelPass.pass.enabled = v;
    onUpdate();
  });
  pixF.add(params, 'pixelSize', 1, 32, 1).name('Pixel Size').onChange(v => {
    if (passes.pixelPass && passes.pixelPass.pass && passes.pixelPass.pass.uniforms) {
      passes.pixelPass.pass.uniforms.pixelSize.value = v;
    }
    onUpdate();
  });

  // 10. Sobel Edge Sketch Controls
  const sobF = fxFolder.addFolder('Sobel Edge Sketch');
  const sobelToggle = sobF.add(params, 'sobelEnabled').name('Enable Sobel Lines').onChange(v => {
    if (passes.sobelPass && passes.sobelPass.pass) passes.sobelPass.pass.enabled = v;
    onUpdate();
  });

  // 11. Volumetric God Rays Controls
  const godF = fxFolder.addFolder('God Rays (Volumetric)');
  const godRaysToggle = godF.add(params, 'godRaysEnabled').name('Enable God Rays').onChange(v => {
    if (passes.godRaysPass && passes.godRaysPass.pass) passes.godRaysPass.pass.enabled = v;
    onUpdate();
  });
  godF.add(params, 'godRaysExposure', 0.1, 1.0, 0.05).name('Exposure').onChange(v => {
    if (passes.godRaysPass && passes.godRaysPass.pass && passes.godRaysPass.pass.uniforms) {
      passes.godRaysPass.pass.uniforms.exposure.value = v;
    }
    onUpdate();
  });

  // 12. Retro Color Dither Controls
  const retF = fxFolder.addFolder('Retro Color Dither');
  const retroToggle = retF.add(params, 'retroEnabled').name('Enable Dither').onChange(v => {
    if (passes.retroPass && passes.retroPass.pass) passes.retroPass.pass.enabled = v;
    onUpdate();
  });
  retF.add(params, 'retroLevels', 2, 16, 1).name('Color Levels').onChange(v => {
    if (passes.retroPass && passes.retroPass.pass && passes.retroPass.pass.uniforms) {
      passes.retroPass.pass.uniforms.colorLevels.value = v;
    }
    onUpdate();
  });

  // 13. Anti-Aliasing Controls
  const aaF = fxFolder.addFolder('Anti-Aliasing');
  const fxaaToggle = aaF.add(params, 'fxaaEnabled').name('Enable FXAA').onChange(v => {
    if (passes.fxaaPass && passes.fxaaPass.pass) passes.fxaaPass.pass.enabled = v;
    onUpdate();
  });
  const smaaToggle = aaF.add(params, 'smaaEnabled').name('Enable SMAA').onChange(v => {
    if (passes.smaaPass && passes.smaaPass.pass) passes.smaaPass.pass.enabled = v;
    onUpdate();
  });

  return { params, fxFolder };
}
