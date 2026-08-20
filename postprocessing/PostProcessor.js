/**
 * =========================================================================================
 * POST PROCESSOR SUITE (Three.js Shader Post-Processing Pipeline)
 * =========================================================================================
 * Description:
 * A high-performance, modular post-processing pipeline for Three.js. It features:
 *   - Universal 3-Parameter Gaussian Bloom (Strength, Radius, Threshold)
 *   - Radial Chromatic Aberration distortion
 *   - Dynamic Film Grain Noise
 *   - Adjustable Vignette (Boost & Reduction)
 *   - Custom Gamma Correction & Min/Max Level controls
 *   - One-line lil-gui integration (`attachGUI(gui)`)
 *   - Offscreen scene target rendering (`renderScene(scene, camera)`)
 *
 * IMPORTANT USAGE NOTE:
 * DO NOT import this file directly via relative file path (e.g. `import { PostProcessor } from './postprocessing/PostProcessor.js'`)
 * when building standalone local HTML files that are opened directly via the `file://` protocol.
 * Browsers block relative ES module file imports under `file://` due to CORS origin policies.
 *
 * INSTEAD, copy and reuse the code from this file directly inline inside the target project's
 * HTML `<script type="module">` block whenever requested.
 * =========================================================================================
 */

import * as THREE from 'three';

// -------------------------------------------------------------
// Shaders: GLSL Code
// -------------------------------------------------------------
const orthoVertexShader = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position, 1.0);
}
`;

const brightFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform float bloomThreshold;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 color = texture(inputTexture, vUv);
  // Calculate relative luminance (Rec. 709)
  float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee thresholding
  float knee = 0.1;
  float soft = luminance - bloomThreshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 0.00001);
  float contribution = max(soft, luminance - bloomThreshold);
  contribution /= max(luminance, 0.00001);
  fragColor = vec4(color.rgb * contribution, color.a);
}
`;

const blur13ShaderChunk = `
vec4 blur13(sampler2D image, vec2 uv, vec2 direction) {
  vec2 resolution = vec2(textureSize(image, 0));
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.411764705882353) * direction;
  vec2 off2 = vec2(3.2941176470588234) * direction;
  vec2 off3 = vec2(5.176470588235294) * direction;
  color += texture(image, uv) * 0.1964825501511404;
  color += texture(image, uv + (off1 / resolution)) * 0.2969069646728344;
  color += texture(image, uv - (off1 / resolution)) * 0.2969069646728344;
  color += texture(image, uv + (off2 / resolution)) * 0.09447039785044732;
  color += texture(image, uv - (off2 / resolution)) * 0.09447039785044732;
  color += texture(image, uv + (off3 / resolution)) * 0.010381362401148057;
  color += texture(image, uv - (off3 / resolution)) * 0.010381362401148057;
  return color;
}
`;

const blurFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform vec2 direction;
in vec2 vUv;
out vec4 color;
${blur13ShaderChunk}
void main() {
  color = blur13(inputTexture, vUv, direction);
}
`;

const finalFragmentShader = `
precision highp float;
uniform vec2 resolution;
uniform sampler2D inputTexture;
uniform sampler2D blur0Texture;
uniform sampler2D blur1Texture;
uniform sampler2D blur2Texture;
uniform sampler2D blur3Texture;
uniform sampler2D blur4Texture;
uniform bool bloomEnabled;
uniform float bloomStrength;
uniform float vignetteBoost;
uniform float vignetteReduction;
uniform float noiseIntensity;
uniform float time;
in vec2 vUv;
out vec4 fragColor;

float vignette(vec2 uv, float boost, float reduction) {
  vec2 position = vUv - 0.5;
  return boost - length(position) * reduction;
}

float hash1(uint n) {
  n = (n << 13U) ^ n;
  n = n * (n * n * 15731U + 789221U) + 1376312589U;
  return float(n & uint(0x7fffffffU)) / float(0x7fffffff);
}

float noise(in vec2 uv, in float timeVal) {
  uvec2 p = uvec2(uv);
  return hash1(p.x + 1920U * p.y + (1920U * 1080U) * uint(timeVal));
}

void main() {
  vec4 color = texture(inputTexture, vUv);

  if (bloomEnabled && bloomStrength > 0.001) {
    vec4 b0 = texture(blur0Texture, vUv);
    vec4 b1 = texture(blur1Texture, vUv);
    vec4 b2 = texture(blur2Texture, vUv);
    vec4 b3 = texture(blur3Texture, vUv);
    vec4 b4 = texture(blur4Texture, vUv);

    vec4 bloomSum = (b0 * 0.3 + b1 * 0.25 + b2 * 0.2 + b3 * 0.15 + b4 * 0.1);
    color += bloomSum * bloomStrength;
  }

  color.rgb *= vignette(vUv, vignetteBoost, vignetteReduction);
  color.rgb += noiseIntensity * noise(gl_FragCoord.xy, time);
  fragColor = vec4(color.rgb, 1.0);
}
`;

const chromaticAberrationShaderChunk = `
vec2 barrelDistortion(vec2 coord, float amt) {
  vec2 cc = coord - 0.5;
  float dist = dot(cc, cc);
  return coord + cc * dist * amt;
}
float sat(float t) { return clamp(t, 0.0, 1.0); }
float linterp(float t) { return sat(1.0 - abs(2.0 * t - 1.0)); }
float remap(float t, float a, float b) { return sat((t - a) / (b - a)); }
vec4 spectrum_offset(float t) {
  float lo = step(t, 0.5);
  float hi = 1.0 - lo;
  float w = linterp(remap(t, 1.0/6.0, 5.0/6.0));
  vec4 ret = vec4(lo, 1.0, hi, 1.0) * vec4(1.0 - w, w, 1.0 - w, 1.0);
  return pow(ret, vec4(1.0 / 2.2));
}
const float max_distort = 2.2;
const int num_iter = 8;
const float reci_num_iter_f = 1.0 / float(num_iter);
vec4 chromaticAberration(sampler2D inputTexture, vec2 uv, float amount, vec2 dir) {
  vec4 sumcol = vec4(0.0);
  vec4 sumw = vec4(0.0);
  for (int i = 0; i < num_iter; ++i) {
    float t = float(i) * reci_num_iter_f;
    vec4 w = spectrum_offset(t);
    sumw += w;
    sumcol += w * texture(inputTexture, barrelDistortion(uv, amount * max_distort * t));
  }
  return sumcol / sumw;
}
`;

const colorFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform float chromaticAberrationAmount;
uniform float minInputLevel;
uniform float maxInputLevel;
uniform float gammaLevel;
uniform float fisheyeStrength;
uniform float fisheyeRadius;
uniform float time;
in vec2 vUv;
out vec4 fragColor;

${chromaticAberrationShaderChunk}

vec2 applyFisheye(vec2 uv, float strength, float radius) {
  if (abs(strength) < 0.0001) return uv;
  vec2 p = uv - 0.5;
  float d = length(p);
  if (d > radius * 1.5) return uv;
  float r = d / max(radius, 0.001);
  float theta = atan(p.y, p.x);
  float rDist = r + strength * (r * r * r);
  return 0.5 + vec2(cos(theta), sin(theta)) * (rDist * radius);
}

vec3 gammaCorrect(vec3 color, vec3 gamma) {
  return pow(max(color, vec3(0.0)), 1.0 / gamma);
}
vec3 levelRange(vec3 color, vec3 minInput, vec3 maxInput) {
  return min(max(color - minInput, vec3(0.0)) / max(maxInput - minInput, vec3(0.0001)), vec3(1.0));
}
vec3 finalLevels(vec3 color, vec3 minInput, vec3 gamma, vec3 maxInput) {
  return gammaCorrect(levelRange(color, minInput, maxInput), gamma);
}
void main() {
  vec2 uv = applyFisheye(vUv, fisheyeStrength, fisheyeRadius);
  fragColor = chromaticAberration(inputTexture, uv, chromaticAberrationAmount, (uv - 0.5));
  fragColor.rgb = finalLevels(fragColor.rgb, vec3(minInputLevel), vec3(gammaLevel), vec3(maxInputLevel));
  fragColor.a = 1.0;
}
`;

const copyFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texture(inputTexture, vUv);
}
`;

// -------------------------------------------------------------
// Helper Classes (FBO & Passes)
// -------------------------------------------------------------
function createFBO(w, h, options = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    wrapS: options.wrapS || THREE.ClampToEdgeWrapping,
    wrapT: options.wrapT || THREE.ClampToEdgeWrapping,
    minFilter: options.minFilter || THREE.LinearFilter,
    magFilter: options.magFilter || THREE.LinearFilter,
    format: options.format || THREE.RGBAFormat,
    type: options.type || THREE.HalfFloatType,
    stencilBuffer: options.stencilBuffer || false,
    depthBuffer: options.depthBuffer !== undefined ? options.depthBuffer : true,
    samples: options.samples || 0,
  });
}

class ShaderPass {
  constructor(shader, options = {}) {
    this.shader = shader;
    this.orthoScene = new THREE.Scene();
    this.fbo = createFBO(1, 1, options);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.orthoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.shader);
    this.orthoScene.add(this.orthoQuad);
    this.texture = this.fbo.texture;
  }
  render(renderer, toScreen = false) {
    if (!toScreen) {
      renderer.setRenderTarget(this.fbo);
    }
    renderer.render(this.orthoScene, this.orthoCamera);
    if (!toScreen) {
      renderer.setRenderTarget(null);
    }
  }
  setSize(width, height) {
    this.fbo.setSize(Math.max(1, width), Math.max(1, height));
    this.orthoQuad.scale.set(width, height, 1);
  }
}

class ShaderPingPongPass {
  constructor(shader, options = {}) {
    this.shader = shader;
    this.orthoScene = new THREE.Scene();
    this.fbos = [createFBO(1, 1, options), createFBO(1, 1, options)];
    this.currentFBO = 0;
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.orthoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.shader);
    this.orthoScene.add(this.orthoQuad);
  }
  render(renderer) {
    renderer.setRenderTarget(this.fbos[1 - this.currentFBO]);
    renderer.render(this.orthoScene, this.orthoCamera);
    renderer.setRenderTarget(null);
    this.currentFBO = 1 - this.currentFBO;
  }
  get current() { return this.fbos[this.currentFBO]; }
  get texture() { return this.current.texture; }
  setSize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.orthoQuad.scale.set(w, h, 1);
    this.fbos[0].setSize(w, h);
    this.fbos[1].setSize(w, h);
  }
}

class BloomPass {
  constructor(strength = 0.8, radius = 0.5, threshold = 0.2, levels = 5) {
    this.strength = strength;
    this.radius = radius;
    this.threshold = threshold;
    this.enabled = true;
    this.levels = levels;

    this.brightShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        bloomThreshold: { value: this.threshold },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: brightFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    this.brightPass = new ShaderPass(this.brightShader, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    this.blurShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        direction: { value: new THREE.Vector2(0, 1) },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: blurFragmentShader,
      glslVersion: THREE.GLSL3,
    });

    this.blurPasses = [];
    for (let i = 0; i < this.levels; i++) {
      this.blurPasses.push(new ShaderPingPongPass(this.blurShader, {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      }));
    }
  }

  setSize(w, h) {
    let tw = Math.max(1, w);
    let th = Math.max(1, h);
    this.brightPass.setSize(tw, th);
    for (let i = 0; i < this.levels; i++) {
      tw = Math.max(1, Math.round(tw / 2));
      th = Math.max(1, Math.round(th / 2));
      this.blurPasses[i].setSize(tw, th);
    }
  }

  set source(texture) {
    this.brightShader.uniforms.inputTexture.value = texture;
  }

  render(renderer) {
    if (!this.enabled || this.strength <= 0.001) return;

    this.brightShader.uniforms.bloomThreshold.value = this.threshold;
    this.brightPass.render(renderer);

    const baseOffset = Math.max(0.1, this.radius * 2.0);
    const u = this.blurShader.uniforms;

    for (let j = 0; j < this.levels; j++) {
      const blurPass = this.blurPasses[j];
      const stepOffset = baseOffset * (1.0 + j * 0.5);

      // Horizontal blur pass
      u.direction.value.set(stepOffset, 0);
      u.inputTexture.value = (j === 0) ? this.brightPass.texture : this.blurPasses[j - 1].texture;
      blurPass.render(renderer);

      // Vertical blur pass
      u.direction.value.set(0, stepOffset * 0.5);
      u.inputTexture.value = blurPass.current.texture;
      blurPass.render(renderer);
    }
  }
}

// -------------------------------------------------------------
// Main Export Class
// -------------------------------------------------------------
export class PostProcessor {
  constructor(renderer, params = {}) {
    this.renderer = renderer;

    this.settings = {
      // Global Switch
      enabled: params.enabled !== undefined ? params.enabled : true,

      // 1. Universal 3-Param Bloom Engine
      bloomEnabled: params.bloomEnabled !== undefined ? params.bloomEnabled : true,
      bloomStrength: params.bloomStrength !== undefined ? params.bloomStrength : 0.8,
      bloomRadius: params.bloomRadius !== undefined ? params.bloomRadius : 0.5,
      bloomThreshold: params.bloomThreshold !== undefined ? params.bloomThreshold : 0.2,

      // 2. Lens & Camera Optics
      fisheyeStrength: params.fisheyeStrength !== undefined ? params.fisheyeStrength : 0.0,
      fisheyeRadius: params.fisheyeRadius !== undefined ? params.fisheyeRadius : 1.0,
      chromaticAberration: params.chromaticAberration !== undefined ? params.chromaticAberration : 0.04,
      vignetteBoost: params.vignetteBoost !== undefined ? params.vignetteBoost : 1.0,
      vignetteReduction: params.vignetteReduction !== undefined ? params.vignetteReduction : 0.5,
      noiseIntensity: params.noiseIntensity !== undefined ? params.noiseIntensity : 0.02,

      // 3. Color Grading & Tone
      gamma: params.gamma !== undefined ? params.gamma : 1.0,
      minInputLevel: params.minInputLevel !== undefined ? params.minInputLevel : 0.0,
      maxInputLevel: params.maxInputLevel !== undefined ? params.maxInputLevel : 1.0,
    };

    this.sceneTarget = createFBO(1, 1, { type: THREE.HalfFloatType });

    this.bloomPass = new BloomPass(
      this.settings.bloomStrength,
      this.settings.bloomRadius,
      this.settings.bloomThreshold,
      5
    );

    this.finalShader = new THREE.RawShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(1, 1) },
        bloomEnabled: { value: this.settings.bloomEnabled },
        bloomStrength: { value: this.settings.bloomStrength },
        vignetteBoost: { value: this.settings.vignetteBoost },
        vignetteReduction: { value: this.settings.vignetteReduction },
        noiseIntensity: { value: this.settings.noiseIntensity },
        inputTexture: { value: null },
        blur0Texture: { value: null },
        blur1Texture: { value: null },
        blur2Texture: { value: null },
        blur3Texture: { value: null },
        blur4Texture: { value: null },
        time: { value: 0 },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: finalFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    this.finalPass = new ShaderPass(this.finalShader);

    this.rgbShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: this.finalPass.texture },
        fisheyeStrength: { value: this.settings.fisheyeStrength },
        fisheyeRadius: { value: this.settings.fisheyeRadius },
        chromaticAberrationAmount: { value: this.settings.chromaticAberration },
        minInputLevel: { value: this.settings.minInputLevel },
        maxInputLevel: { value: this.settings.maxInputLevel },
        gammaLevel: { value: this.settings.gamma },
        time: { value: 0 },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: colorFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    this.rgbPass = new ShaderPass(this.rgbShader);

    this.copyShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: copyFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    this.copyPass = new ShaderPass(this.copyShader);
  }

  updateSettings() {
    this.bloomPass.enabled = this.settings.bloomEnabled;
    this.bloomPass.strength = this.settings.bloomStrength;
    this.bloomPass.radius = this.settings.bloomRadius;
    this.bloomPass.threshold = this.settings.bloomThreshold;

    this.finalShader.uniforms.bloomEnabled.value = this.settings.bloomEnabled;
    this.finalShader.uniforms.bloomStrength.value = this.settings.bloomStrength;
    this.finalShader.uniforms.vignetteBoost.value = this.settings.vignetteBoost;
    this.finalShader.uniforms.vignetteReduction.value = this.settings.vignetteReduction;
    this.finalShader.uniforms.noiseIntensity.value = this.settings.noiseIntensity;

    this.rgbShader.uniforms.fisheyeStrength.value = this.settings.fisheyeStrength;
    this.rgbShader.uniforms.fisheyeRadius.value = this.settings.fisheyeRadius;
    this.rgbShader.uniforms.chromaticAberrationAmount.value = this.settings.chromaticAberration;
    this.rgbShader.uniforms.gammaLevel.value = this.settings.gamma;
    this.rgbShader.uniforms.minInputLevel.value = this.settings.minInputLevel;
    this.rgbShader.uniforms.maxInputLevel.value = this.settings.maxInputLevel;
  }

  setSize(w0, h0, dpr = 1) {
    const w = Math.max(1, Math.floor(w0 * dpr));
    const h = Math.max(1, Math.floor(h0 * dpr));
    this.sceneTarget.setSize(w, h);
    this.finalPass.setSize(w, h);
    this.finalShader.uniforms.resolution.value.set(w, h);
    this.bloomPass.setSize(w, h);
    this.rgbPass.setSize(w, h);
    this.copyPass.setSize(w, h);
  }

  renderScene(scene, camera) {
    if (!this.settings.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.render(this.sceneTarget.texture);
  }

  render(sourceTexture) {
    if (!this.settings.enabled) {
      this.copyPass.shader.uniforms.inputTexture.value = sourceTexture;
      this.copyPass.render(this.renderer, true);
      return;
    }

    this.updateSettings();

    this.bloomPass.source = sourceTexture;
    this.finalPass.shader.uniforms.inputTexture.value = sourceTexture;
    this.bloomPass.render(this.renderer);

    this.finalPass.shader.uniforms.blur0Texture.value = this.bloomPass.blurPasses[0].texture;
    this.finalPass.shader.uniforms.blur1Texture.value = this.bloomPass.blurPasses[1].texture;
    this.finalPass.shader.uniforms.blur2Texture.value = this.bloomPass.blurPasses[2].texture;
    this.finalPass.shader.uniforms.blur3Texture.value = this.bloomPass.blurPasses[3].texture;
    this.finalPass.shader.uniforms.blur4Texture.value = this.bloomPass.blurPasses[4].texture;

    const randomTime = Math.random() * 100000;
    this.finalPass.shader.uniforms.time.value = randomTime;
    this.rgbPass.shader.uniforms.time.value = randomTime;

    this.finalPass.render(this.renderer);
    this.rgbPass.render(this.renderer, true);
  }

  attachGUI(gui, title = "Post-Processing Suite") {
    const root = gui.addFolder(title);
    root.add(this.settings, "enabled").name("Enable Suite");

    // Folder 1: Bloom (Standard 3-Param Optical Engine)
    const bloom = root.addFolder("Bloom");
    bloom.add(this.settings, "bloomEnabled").name("Enable Bloom").onChange(() => this.updateSettings());
    bloom.add(this.settings, "bloomStrength", 0, 3.0, 0.05).name("Strength").onChange(() => this.updateSettings());
    bloom.add(this.settings, "bloomRadius", 0, 2.0, 0.05).name("Radius").onChange(() => this.updateSettings());
    bloom.add(this.settings, "bloomThreshold", 0, 1.0, 0.01).name("Threshold").onChange(() => this.updateSettings());

    // Folder 2: Lens & Cinematic Effects
    const lens = root.addFolder("Lens, Optics & Fisheye");
    lens.add(this.settings, "fisheyeStrength", -1.0, 1.5, 0.01).name("Fisheye Distortion").onChange(() => this.updateSettings());
    lens.add(this.settings, "fisheyeRadius", 0.2, 2.0, 0.05).name("Fisheye Radius").onChange(() => this.updateSettings());
    lens.add(this.settings, "chromaticAberration", 0, 0.2, 0.005).name("Chromatic Aberration").onChange(() => this.updateSettings());
    lens.add(this.settings, "vignetteBoost", 0, 2.0, 0.05).name("Vignette Boost").onChange(() => this.updateSettings());
    lens.add(this.settings, "vignetteReduction", 0, 2.0, 0.05).name("Vignette Falloff").onChange(() => this.updateSettings());
    lens.add(this.settings, "noiseIntensity", 0, 0.1, 0.005).name("Film Grain").onChange(() => this.updateSettings());
    lens.add(this.settings, "gamma", 0.2, 2.0, 0.05).name("Gamma").onChange(() => this.updateSettings());
    lens.add(this.settings, "minInputLevel", 0, 0.5, 0.01).name("Black Level").onChange(() => this.updateSettings());
    lens.add(this.settings, "maxInputLevel", 0.5, 1.0, 0.01).name("White Level").onChange(() => this.updateSettings());

    return root;
  }
}
