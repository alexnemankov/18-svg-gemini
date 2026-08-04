/**
 * =========================================================================================
 * POST PROCESSOR SUITE (Three.js Shader Post-Processing Pipeline)
 * =========================================================================================
 * Description:
 * A high-performance, modular post-processing pipeline for Three.js. It features:
 *   - Multi-pass pyramid Gaussian Bloom (5 blur levels)
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

const blur13ShaderChunk = `
vec4 blur13(sampler2D image, vec2 uv, vec2 direction) {
  vec2 resolution = vec2(textureSize(image,0));
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

float noise(in vec2 uv, in float time) {
  uvec2 p = uvec2(uv);
  return hash1(p.x + 1920U * p.y + (1920U * 1080U) * uint(time));
}

vec4 screen(vec4 base, vec4 blend, float opacity) {
  vec4 color = 1.0 - (1.0 - base) * (1.0 - blend);
  return color * opacity + base * (1.0 - opacity);
}

void main() {
  vec4 b0 = texture(blur0Texture, vUv);
  vec4 b1 = texture(blur1Texture, vUv);
  vec4 b2 = texture(blur2Texture, vUv);
  vec4 b3 = texture(blur3Texture, vUv);
  vec4 b4 = texture(blur4Texture, vUv);
  
  vec4 color = texture(inputTexture, vUv);
  float factor = 40.0;
  vec4 b = b0 / factor;
  b += 2.0 * b1 / factor;
  b += 4.0 * b2 / factor;
  b += 8.0 * b3 / factor;
  b += 16.0 * b4 / factor;
  fragColor = color + b;
  float f = 0.25;
  b = clamp(b - f, vec4(0.0), vec4(1.0)) * (1.0 / (1.0 - f));
  fragColor = screen(color, b, 1.0);
  fragColor *= vignette(vUv, vignetteBoost, vignetteReduction);
  fragColor += noiseIntensity * noise(gl_FragCoord.xy, time);
  fragColor.a = 1.0;
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
uniform float time;
in vec2 vUv;
out vec4 fragColor;

${chromaticAberrationShaderChunk}

vec3 gammaCorrect(vec3 color, vec3 gamma) {
  return pow(color, 1.0 / gamma);
}
vec3 levelRange(vec3 color, vec3 minInput, vec3 maxInput) {
  return min(max(color - minInput, vec3(0.0)) / (maxInput - minInput), vec3(1.0));
}
vec3 finalLevels(vec3 color, vec3 minInput, vec3 gamma, vec3 maxInput) {
  return gammaCorrect(levelRange(color, minInput, maxInput), gamma);
}
void main() {
  vec2 uv = 0.8 * (vUv - 0.5) + 0.5;
  fragColor = chromaticAberration(inputTexture, uv, chromaticAberrationAmount, (vUv - 0.5));
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
    type: options.type || THREE.UnsignedByteType,
    stencilBuffer: options.stencilBuffer || false,
    depthBuffer: options.depthBuffer || true,
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
  constructor(strength = 3, levels = 5) {
    this.strength = strength;
    this.levels = levels;
    this.blurPasses = [];
    this.blurShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        direction: { value: new THREE.Vector2(0, 1) },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: blurFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    for (let i = 0; i < this.levels; i++) {
      this.blurPasses.push(new ShaderPingPongPass(this.blurShader, {
        format: THREE.RGBAFormat,
      }));
    }
  }
  setSize(w, h) {
    let tw = Math.max(1, w);
    let th = Math.max(1, h);
    for (let i = 0; i < this.levels; i++) {
      tw = Math.max(1, Math.round(tw / 2));
      th = Math.max(1, Math.round(th / 2));
      this.blurPasses[i].setSize(tw, th);
    }
  }
  set source(texture) {
    this.blurShader.uniforms.inputTexture.value = texture;
  }
  render(renderer) {
    const offset = this.strength;
    const u = this.blurShader.uniforms;
    for (let j = 0; j < this.levels; j++) {
      const blurPass = this.blurPasses[j];
      u.direction.value.set(offset, 0);
      blurPass.render(renderer);
      u.inputTexture.value = blurPass.current.texture;
      u.direction.value.set(0, offset / 2);
      blurPass.render(renderer);
      u.inputTexture.value = blurPass.current.texture;
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
      enabled: params.enabled !== undefined ? params.enabled : true,
      bloomStrength: params.bloomStrength !== undefined ? params.bloomStrength : 3.0,
      vignetteBoost: params.vignetteBoost !== undefined ? params.vignetteBoost : 1.0,
      vignetteReduction: params.vignetteReduction !== undefined ? params.vignetteReduction : 0.5,
      noiseIntensity: params.noiseIntensity !== undefined ? params.noiseIntensity : 0.05,
      chromaticAberration: params.chromaticAberration !== undefined ? params.chromaticAberration : 0.1,
      gamma: params.gamma !== undefined ? params.gamma : 0.85,
      minInputLevel: params.minInputLevel !== undefined ? params.minInputLevel : 9.0 / 255.0,
      maxInputLevel: params.maxInputLevel !== undefined ? params.maxInputLevel : 237.0 / 255.0,
    };

    this.sceneTarget = createFBO(1, 1);

    this.finalShader = new THREE.RawShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(1, 1) },
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

    this.bloomPass = new BloomPass(this.settings.bloomStrength, 5);
  }

  updateSettings() {
    this.bloomPass.strength = this.settings.bloomStrength;
    this.finalShader.uniforms.vignetteBoost.value = this.settings.vignetteBoost;
    this.finalShader.uniforms.vignetteReduction.value = this.settings.vignetteReduction;
    this.finalShader.uniforms.noiseIntensity.value = this.settings.noiseIntensity;
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

  attachGUI(gui, title = "Post Processor Settings") {
    const folder = gui.addFolder(title);

    folder.add(this.settings, "enabled").name("Enable PostProcess");
    folder.add(this.settings, "bloomStrength", 0, 10, 0.1).name("Bloom Strength").onChange(() => this.updateSettings());
    folder.add(this.settings, "chromaticAberration", 0, 0.5, 0.01).name("Chromatic Aberration").onChange(() => this.updateSettings());
    folder.add(this.settings, "vignetteBoost", 0, 2, 0.05).name("Vignette Boost").onChange(() => this.updateSettings());
    folder.add(this.settings, "vignetteReduction", 0, 2, 0.05).name("Vignette Reduction").onChange(() => this.updateSettings());
    folder.add(this.settings, "noiseIntensity", 0, 0.2, 0.005).name("Noise Intensity").onChange(() => this.updateSettings());
    folder.add(this.settings, "gamma", 0.1, 2.0, 0.05).name("Gamma Level").onChange(() => this.updateSettings());
    folder.add(this.settings, "minInputLevel", 0, 0.5, 0.005).name("Min Input Level").onChange(() => this.updateSettings());
    folder.add(this.settings, "maxInputLevel", 0.5, 1.0, 0.005).name("Max Input Level").onChange(() => this.updateSettings());

    return folder;
  }
}
