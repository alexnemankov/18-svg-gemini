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
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const brightFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform float bloomThreshold;
in vec2 vUv;
out vec4 fragColor;

vec3 sanitize(vec3 v) {
  if (isnan(v.x) || isinf(v.x)) v.x = 0.0;
  if (isnan(v.y) || isinf(v.y)) v.y = 0.0;
  if (isnan(v.z) || isinf(v.z)) v.z = 0.0;
  return clamp(v, vec3(0.0), vec3(65000.0));
}

void main() {
  vec4 raw = texture(inputTexture, vUv);
  vec3 color = sanitize(raw.rgb);
  // Calculate relative luminance (Rec. 709)
  float luminance = max(0.0, dot(color, vec3(0.2126, 0.7152, 0.0722)));
  // Soft knee thresholding
  float knee = 0.1;
  float soft = luminance - bloomThreshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 0.00001);
  float contribution = max(soft, luminance - bloomThreshold);
  contribution /= max(luminance, 0.0001);
  vec3 result = color * contribution;
  fragColor = vec4(sanitize(result), clamp(raw.a, 0.0, 1.0));
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

vec4 sanitize(vec4 v) {
  if (isnan(v.x) || isinf(v.x)) v.x = 0.0;
  if (isnan(v.y) || isinf(v.y)) v.y = 0.0;
  if (isnan(v.z) || isinf(v.z)) v.z = 0.0;
  if (isnan(v.w) || isinf(v.w)) v.w = 0.0;
  return clamp(v, vec4(0.0), vec4(65000.0));
}

void main() {
  color = sanitize(blur13(inputTexture, vUv, direction));
}
`;

// -------------------------------------------------------------
// Three.js Godrays Shaders (Crytek Sousa2008 / three/addons/shaders/GodRaysShader.js)
// -------------------------------------------------------------
const godRaysDepthMaskShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform float threshold;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 color = texture(inputTexture, vUv);
  float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  float factor = smoothstep(threshold, threshold + 0.15, lum);
  fragColor = vec4(vec3(factor), 1.0);
}
`;

const godRaysGenerateShader = `
precision highp float;
#define TAPS_PER_PASS 6.0

uniform sampler2D inputTexture;
uniform vec3 vSunPositionScreenSpace;
uniform float fStepSize;
uniform float distanceAttenuation;
uniform float maxDensity;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 delta = vSunPositionScreenSpace.xy - vUv;
  float dist = length(delta);
  vec2 stepv = fStepSize * delta / max(dist, 0.0001);
  float iters = dist / max(fStepSize, 0.00001);

  vec2 uv = vUv;
  float col = 0.0;
  float f = min(1.0, max(vSunPositionScreenSpace.z, 0.0));

  float atten = 1.0 / (1.0 + pow(dist, distanceAttenuation));

  if (0.0 <= iters && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col += texture(inputTexture, uv).r * f;
  uv += stepv;
  if (1.0 <= iters && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col += texture(inputTexture, uv).r * f;
  uv += stepv;
  if (2.0 <= iters && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col += texture(inputTexture, uv).r * f;
  uv += stepv;
  if (3.0 <= iters && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col += texture(inputTexture, uv).r * f;
  uv += stepv;
  if (4.0 <= iters && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col += texture(inputTexture, uv).r * f;
  uv += stepv;
  if (5.0 <= iters && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col += texture(inputTexture, uv).r * f;

  float finalVal = min(col / TAPS_PER_PASS * atten, maxDensity);
  fragColor = vec4(vec3(finalVal), 1.0);
}
`;

// -------------------------------------------------------------
// Three.js Anamorphic Flare Shaders (three/examples/webgpu_postprocessing_anamorphic.html)
// -------------------------------------------------------------
const anamorphicBrightShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform float threshold;
uniform float smoothWidth;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 color = texture(inputTexture, vUv);
  float v = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  float alpha = smoothstep(threshold, threshold + smoothWidth, v);
  fragColor = mix(vec4(0.0), color, alpha);
}
`;

const anamorphicBlurShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform vec2 resolution;
uniform float samples;
uniform float intensity;
uniform vec3 tintColor;
uniform float bloomRadius;
in vec2 vUv;
out vec4 fragColor;

void main() {
  int halfSamples = max(1, int(samples) / 2);
  float fHalfSamples = float(halfSamples);
  vec2 invSize = 1.0 / resolution;
  vec4 total = vec4(0.0);

  for (int i = -64; i <= 64; i++) {
    if (i < -halfSamples || i > halfSamples) continue;
    float softness = 1.0 - abs(float(i)) / fHalfSamples;
    softness = pow(softness, 2.0);
    vec2 shiftedUV = vec2(vUv.x + invSize.x * float(i) * (4.0 + bloomRadius * 8.0), vUv.y);
    shiftedUV = clamp(shiftedUV, 0.001, 0.999);
    total += texture(inputTexture, shiftedUV) * softness;
  }

  fragColor = (total / (samples / 3.0)) * vec4(tintColor, 1.0) * intensity;
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
uniform sampler2D raysTexture;
uniform sampler2D anamorphicTexture;
uniform bool bloomEnabled;
uniform float bloomStrength;
uniform bool raysEnabled;
uniform float raysStrength;
uniform vec3 raysColor;
uniform bool anamorphicEnabled;
uniform float vignetteBoost;
uniform float vignetteReduction;
uniform float noiseIntensity;
uniform float time;
in vec2 vUv;
out vec4 fragColor;

vec3 sanitize(vec3 v) {
  if (isnan(v.x) || isinf(v.x)) v.x = 0.0;
  if (isnan(v.y) || isinf(v.y)) v.y = 0.0;
  if (isnan(v.z) || isinf(v.z)) v.z = 0.0;
  return clamp(v, vec3(0.0), vec3(65000.0));
}

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
  return hash1(p.x + 1920U * p.y + (1920U * 1080U) * (uint(timeVal) % 65536U));
}

void main() {
  vec4 raw = texture(inputTexture, vUv);
  vec3 color = sanitize(raw.rgb);

  if (bloomEnabled && bloomStrength > 0.001) {
    vec3 b0 = sanitize(texture(blur0Texture, vUv).rgb);
    vec3 b1 = sanitize(texture(blur1Texture, vUv).rgb);
    vec3 b2 = sanitize(texture(blur2Texture, vUv).rgb);
    vec3 b3 = sanitize(texture(blur3Texture, vUv).rgb);
    vec3 b4 = sanitize(texture(blur4Texture, vUv).rgb);

    vec3 bloomSum = (b0 * 0.3 + b1 * 0.25 + b2 * 0.2 + b3 * 0.15 + b4 * 0.1);
    color += bloomSum * bloomStrength;
  }

  // Three.js Godrays composite (additive with color tint & intensity attenuation)
  if (raysEnabled && raysStrength > 0.001) {
    vec3 r = sanitize(texture(raysTexture, vUv).rgb);
    color += r * raysColor * raysStrength;
  }

  // Three.js Anamorphic bloom composite (high-pass streak filter)
  if (anamorphicEnabled) {
    vec3 a = sanitize(texture(anamorphicTexture, vUv).rgb);
    color += a;
  }

  float vig = max(0.0, vignette(vUv, vignetteBoost, vignetteReduction));
  color *= vig;
  color += max(0.0, noiseIntensity) * noise(gl_FragCoord.xy, time);
  fragColor = vec4(sanitize(color), 1.0);
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
uniform float exposure;
uniform float fisheyeStrength;
uniform float fisheyeRadius;
uniform float time;
uniform int visionMode;
uniform float thermalSensitivity;
uniform float nightVisionNoise;
uniform float nightVisionGain;
uniform float crtIntensity;
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

vec3 ACESFilmicToneMapping(vec3 color) {
  color = max(vec3(0.0), color);
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  vec3 denom = max(color * (c * color + d) + e, vec3(0.0001));
  return clamp((color * (a * color + b)) / denom, 0.0, 1.0);
}

vec3 gammaCorrect(vec3 color, vec3 gamma) {
  return pow(max(color, vec3(0.0)), 1.0 / max(gamma, vec3(0.001)));
}
vec3 levelRange(vec3 color, vec3 minInput, vec3 maxInput) {
  return min(max(color - minInput, vec3(0.0)) / max(maxInput - minInput, vec3(0.0001)), vec3(1.0));
}
vec3 finalLevels(vec3 color, vec3 minInput, vec3 gamma, vec3 maxInput) {
  return gammaCorrect(levelRange(color, minInput, maxInput), gamma);
}

vec3 applyNightVision(vec3 color, vec2 uv, float timeVal, float noiseAmt, float gain, float crt) {
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  
  // High-gain night vision amplifier
  float amplified = pow(lum * gain, 0.72);
  
  // Phosphor green palette (P43 phosphor)
  vec3 phosphorColor = mix(vec3(0.02, 0.12, 0.03), vec3(0.18, 1.0, 0.32), clamp(amplified, 0.0, 1.0));
  // Saturated bright highlights
  phosphorColor += vec3(0.7, 1.0, 0.8) * max(0.0, amplified - 0.75) * 1.8;
  
  // Circular Dual-Tube NVG Mask
  vec2 p = uv - 0.5;
  float tubeDist = length(p);
  float tubeMask = smoothstep(0.72, 0.44, tubeDist);
  
  // Amplification grain & CRT scanlines (CRT lines are 0.0 by default)
  float n = fract(sin(dot(uv * 280.0 + timeVal * 0.05, vec2(12.9898, 78.233))) * 43758.5453);
  float scanline = sin(uv.y * 650.0) * crt;
  
  phosphorColor += (n - 0.5) * noiseAmt * 2.0 + scanline;
  return clamp(phosphorColor * tubeMask, 0.0, 1.0);
}

vec3 ironbow(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.02, 0.01, 0.18);
  vec3 c1 = vec3(0.22, 0.02, 0.48);
  vec3 c2 = vec3(0.82, 0.05, 0.25);
  vec3 c3 = vec3(1.0, 0.62, 0.02);
  vec3 c4 = vec3(1.0, 1.0, 0.92);
  
  if (t < 0.25) return mix(c0, c1, t * 4.0);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
  return mix(c3, c4, (t - 0.75) * 4.0);
}

vec3 applyThermal(vec3 color, vec2 uv, float sensitivity, float crt, bool whiteHot) {
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  float heat = clamp(lum * sensitivity, 0.0, 1.0);
  float sensorRaster = sin(uv.y * 900.0) * (crt * 0.3);
  heat = clamp(heat + sensorRaster, 0.0, 1.0);
  
  if (whiteHot) {
    float grad = pow(heat, 0.85);
    return vec3(grad);
  } else {
    return ironbow(heat);
  }
}

void main() {
  vec2 uv = applyFisheye(vUv, fisheyeStrength, fisheyeRadius);
  vec4 col = chromaticAberration(inputTexture, uv, chromaticAberrationAmount, (uv - 0.5));
  vec3 finalCol = col.rgb;
  if (isnan(finalCol.x) || isinf(finalCol.x)) finalCol.x = 0.0;
  if (isnan(finalCol.y) || isinf(finalCol.y)) finalCol.y = 0.0;
  if (isnan(finalCol.z) || isinf(finalCol.z)) finalCol.z = 0.0;
  finalCol = clamp(finalCol, vec3(0.0), vec3(65000.0));
  
  if (visionMode == 1) {
    // Night Vision Mode
    finalCol = applyNightVision(finalCol, uv, time, nightVisionNoise, nightVisionGain, crtIntensity);
  } else if (visionMode == 2) {
    // Thermal Vision (Ironbow FLIR)
    finalCol = applyThermal(finalCol, uv, thermalSensitivity, crtIntensity, false);
  } else if (visionMode == 3) {
    // Thermal Vision (White-Hot FLIR)
    finalCol = applyThermal(finalCol, uv, thermalSensitivity, crtIntensity, true);
  } else {
    // Normal Mode: Camera Exposure and ACES Filmic tone mapping
    vec3 exposedColor = finalCol * exposure;
    vec3 toneMappedColor = ACESFilmicToneMapping(exposedColor);
    finalCol = finalLevels(toneMappedColor, vec3(minInputLevel), vec3(gammaLevel), vec3(maxInputLevel));
    if (crtIntensity > 0.0001) {
      float scanline = sin(uv.y * 900.0 + time * 2.0) * crtIntensity;
      finalCol -= scanline;
    }
  }

  fragColor = vec4(finalCol, 1.0);
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

const fxaaFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform vec2 resolution;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 inverseVP = 1.0 / resolution;
  vec3 rgbNW = texture(inputTexture, vUv + vec2(-1.0, -1.0) * inverseVP).rgb;
  vec3 rgbNE = texture(inputTexture, vUv + vec2(1.0, -1.0) * inverseVP).rgb;
  vec3 rgbSW = texture(inputTexture, vUv + vec2(-1.0, 1.0) * inverseVP).rgb;
  vec3 rgbSE = texture(inputTexture, vUv + vec2(1.0, 1.0) * inverseVP).rgb;
  vec3 rgbM  = texture(inputTexture, vUv).rgb;

  vec3 luma = vec3(0.299, 0.587, 0.114);
  float lumaNW = dot(rgbNW, luma);
  float lumaNE = dot(rgbNE, luma);
  float lumaSW = dot(rgbSW, luma);
  float lumaSE = dot(rgbSE, luma);
  float lumaM  = dot(rgbM,  luma);

  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * (1.0 / 8.0)), 1.0 / 128.0);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);

  dir = min(vec2(8.0, 8.0), max(vec2(-8.0, -8.0), dir * rcpDirMin)) * inverseVP;

  vec3 rgbA = 0.5 * (
      texture(inputTexture, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture(inputTexture, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture(inputTexture, vUv + dir * -0.5).rgb +
      texture(inputTexture, vUv + dir * 0.5).rgb);

  float lumaB = dot(rgbB, luma);
  if ((lumaB < lumaMin) || (lumaB > lumaMax)) {
      fragColor = vec4(rgbA, 1.0);
  } else {
      fragColor = vec4(rgbB, 1.0);
  }
}
`;

const smaaFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform vec2 resolution;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 invRes = 1.0 / resolution;
  vec4 center = texture(inputTexture, vUv);
  
  vec3 cU = texture(inputTexture, vUv + vec2(0.0, -1.0) * invRes).rgb;
  vec3 cD = texture(inputTexture, vUv + vec2(0.0, 1.0) * invRes).rgb;
  vec3 cL = texture(inputTexture, vUv + vec2(-1.0, 0.0) * invRes).rgb;
  vec3 cR = texture(inputTexture, vUv + vec2(1.0, 0.0) * invRes).rgb;
  
  vec3 cUL = texture(inputTexture, vUv + vec2(-1.0, -1.0) * invRes).rgb;
  vec3 cUR = texture(inputTexture, vUv + vec2(1.0, -1.0) * invRes).rgb;
  vec3 cDL = texture(inputTexture, vUv + vec2(-1.0, 1.0) * invRes).rgb;
  vec3 cDR = texture(inputTexture, vUv + vec2(1.0, 1.0) * invRes).rgb;

  vec3 lumaW = vec3(0.299, 0.587, 0.114);
  float lM = dot(center.rgb, lumaW);
  float lU = dot(cU, lumaW);
  float lD = dot(cD, lumaW);
  float lL = dot(cL, lumaW);
  float lR = dot(cR, lumaW);

  float gx = (lR - lL) * 2.0 + (dot(cUR, lumaW) - dot(cUL, lumaW)) + (dot(cDR, lumaW) - dot(cDL, lumaW));
  float gy = (lD - lU) * 2.0 + (dot(cDL, lumaW) - dot(cUL, lumaW)) + (dot(cDR, lumaW) - dot(cUR, lumaW));
  float edgeStrength = length(vec2(gx, gy));

  if (edgeStrength < 0.04) {
    fragColor = center;
    return;
  }

  vec2 dir = normalize(vec2(-gy, gx)) * invRes * clamp(edgeStrength * 1.5, 0.5, 1.5);
  vec4 sampleA = texture(inputTexture, vUv + dir * 0.5);
  vec4 sampleB = texture(inputTexture, vUv - dir * 0.5);
  vec4 sampleC = texture(inputTexture, vUv + dir * 1.0);
  vec4 sampleD = texture(inputTexture, vUv - dir * 1.0);

  vec4 blended = (center * 2.0 + sampleA + sampleB + (sampleC + sampleD) * 0.5) / 5.0;
  fragColor = vec4(blended.rgb, center.a);
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
    depthBuffer: options.depthBuffer !== undefined ? options.depthBuffer : false,
    samples: options.samples !== undefined ? options.samples : 0,
  });
}

class ShaderPass {
  constructor(shader, options = {}) {
    this.shader = shader;
    this.shader.depthTest = false;
    this.shader.depthWrite = false;
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
  }
}

class ShaderPingPongPass {
  constructor(shader, options = {}) {
    this.shader = shader;
    this.shader.depthTest = false;
    this.shader.depthWrite = false;
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

const VISION_MODE_MAP = {
  'Normal (Cinematic)': 0,
  'Night Vision (Phosphor)': 1,
  'Thermal (Ironbow)': 2,
  'Thermal (White-Hot)': 3,
};

// -------------------------------------------------------------
// Antialiasing Suite Modes & Presets
// -------------------------------------------------------------
export const ANTIALIAS_MODES = [
  "MSAA 4x (Standard)",
  "MSAA 2x (Fast)",
  "MSAA 8x (Ultra)",
  "FXAA (Fast Approximate)",
  "SMAA (Morphological)",
  "SSAA 1.5x (Super-Sampling)",
  "SSAA 2x (Ultra Super-Sampling)",
  "Hybrid (MSAA 4x + FXAA)",
  "Off (No Anti-Aliasing)"
];

function resolveAntialiasSettings(mode, antialias) {
  if (antialias === false && (!mode || mode === 'MSAA 4x (Standard)')) {
    mode = 'Off (No Anti-Aliasing)';
  }
  let msaaSamples = 0;
  let fxaaEnabled = false;
  let smaaEnabled = false;
  let ssaaScale = 1.0;

  switch (mode) {
    case 'MSAA 2x (Fast)':
    case 'MSAA 2x':
      msaaSamples = 2;
      break;
    case 'MSAA 4x (Standard)':
    case 'MSAA 4x':
      msaaSamples = 4;
      break;
    case 'MSAA 8x (Ultra)':
    case 'MSAA 8x (High Quality)':
    case 'MSAA 8x':
      msaaSamples = 8;
      break;
    case 'FXAA (Fast Approximate)':
    case 'FXAA':
      fxaaEnabled = true;
      break;
    case 'SMAA (Morphological)':
    case 'SMAA':
      smaaEnabled = true;
      break;
    case 'SSAA 1.5x (Super-Sampling)':
    case 'SSAA 1.5x':
      ssaaScale = 1.5;
      break;
    case 'SSAA 2x (Ultra Super-Sampling)':
    case 'SSAA 2x':
      ssaaScale = 2.0;
      break;
    case 'Hybrid (MSAA 4x + FXAA)':
    case 'MSAA 4x + FXAA':
      msaaSamples = 4;
      fxaaEnabled = true;
      break;
    case 'Off (No Anti-Aliasing)':
    case 'None (Off)':
    case 'Off':
    default:
      msaaSamples = 0;
      fxaaEnabled = false;
      smaaEnabled = false;
      ssaaScale = 1.0;
      break;
  }

  return {
    mode: mode || 'MSAA 4x (Standard)',
    msaaSamples,
    fxaaEnabled,
    smaaEnabled,
    ssaaScale,
    antialias: mode !== 'Off (No Anti-Aliasing)' && mode !== 'None (Off)' && mode !== 'Off',
    useFxaa: fxaaEnabled
  };
}

// -------------------------------------------------------------
// Main Export Class
// -------------------------------------------------------------
export class PostProcessor {
  constructor(renderer, params = {}) {
    this.renderer = renderer;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    const initialAa = resolveAntialiasSettings(params.antialiasMode, params.antialias);
    if (params.useFxaa !== undefined) initialAa.fxaaEnabled = !!params.useFxaa;
    if (params.msaaSamples !== undefined) initialAa.msaaSamples = params.msaaSamples;
    if (params.smaaEnabled !== undefined) initialAa.smaaEnabled = !!params.smaaEnabled;
    if (params.ssaaScale !== undefined) initialAa.ssaaScale = params.ssaaScale;

    this.settings = {
      // Global Switch & Antialiasing Suite
      enabled: params.enabled !== undefined ? params.enabled : true,
      antialias: initialAa.antialias,
      antialiasMode: initialAa.mode,
      msaaSamples: initialAa.msaaSamples,
      fxaaEnabled: initialAa.fxaaEnabled,
      smaaEnabled: initialAa.smaaEnabled,
      ssaaScale: initialAa.ssaaScale,
      useFxaa: initialAa.fxaaEnabled,

      // 1. Universal 3-Param Bloom Engine
      bloomEnabled: params.bloomEnabled !== undefined ? params.bloomEnabled : true,
      bloomStrength: params.bloomStrength !== undefined ? params.bloomStrength : 1.2,
      bloomRadius: params.bloomRadius !== undefined ? params.bloomRadius : 0.6,
      bloomThreshold: params.bloomThreshold !== undefined ? params.bloomThreshold : 0.15,

      // 2. Three.js Godrays Settings (Crytek multi-pass / webgl_postprocessing_godrays.html & GodRaysShader.js)
      raysEnabled: params.raysEnabled !== undefined ? params.raysEnabled : true,
      raysStrength: params.raysStrength !== undefined ? params.raysStrength : 0.85,
      raysDensity: params.raysDensity !== undefined ? params.raysDensity : 1.0,
      raysMaxDensity: params.raysMaxDensity !== undefined ? params.raysMaxDensity : 0.5,
      raysDistanceAttenuation: params.raysDistanceAttenuation !== undefined ? params.raysDistanceAttenuation : 2.0,
      raysThreshold: params.raysThreshold !== undefined ? params.raysThreshold : 0.12,
      raysColor: params.raysColor ? (params.raysColor.isColor ? params.raysColor.clone() : new THREE.Color(params.raysColor)) : new THREE.Color(0xf6aa1c),
      raysColorHex: params.raysColorHex || (typeof params.raysColor === 'string' ? params.raysColor : '#f6aa1c'),

      // 3. Three.js Anamorphic Flare Settings (webgpu_postprocessing_anamorphic.html)
      anamorphicEnabled: params.anamorphicEnabled !== undefined ? params.anamorphicEnabled : false,
      anamorphicIntensity: params.anamorphicIntensity !== undefined ? params.anamorphicIntensity : (params.anamorphicStrength !== undefined ? params.anamorphicStrength * 2.5 : 5.0),
      anamorphicThreshold: params.anamorphicThreshold !== undefined ? params.anamorphicThreshold : 0.3,
      anamorphicSamples: params.anamorphicSamples !== undefined ? params.anamorphicSamples : 64,
      anamorphicRadius: params.anamorphicRadius !== undefined ? params.anamorphicRadius : 0.0,
      anamorphicSmoothWidth: params.anamorphicSmoothWidth !== undefined ? params.anamorphicSmoothWidth : 0.05,
      anamorphicColor: params.anamorphicColor ? (params.anamorphicColor.isColor ? params.anamorphicColor.clone() : new THREE.Color(params.anamorphicColor)) : new THREE.Color(0x7a8aff),
      anamorphicColorHex: params.anamorphicColorHex || '#7a8aff',

      // 4. Special Vision Modes
      visionMode: params.visionMode !== undefined ? params.visionMode : 'Normal (Cinematic)',
      thermalSensitivity: params.thermalSensitivity !== undefined ? params.thermalSensitivity : 1.4,
      nightVisionGain: params.nightVisionGain !== undefined ? params.nightVisionGain : 2.1,
      nightVisionNoise: params.nightVisionNoise !== undefined ? params.nightVisionNoise : 0.05,
      crtIntensity: params.crtIntensity !== undefined ? params.crtIntensity : 0.0,

      // 5. Lens & Camera Optics
      fisheyeStrength: params.fisheyeStrength !== undefined ? params.fisheyeStrength : 0.0,
      fisheyeRadius: params.fisheyeRadius !== undefined ? params.fisheyeRadius : 1.0,
      chromaticAberration: params.chromaticAberration !== undefined ? params.chromaticAberration : 0.02,
      vignetteBoost: params.vignetteBoost !== undefined ? params.vignetteBoost : 1.1,
      vignetteReduction: params.vignetteReduction !== undefined ? params.vignetteReduction : 0.65,
      noiseIntensity: params.noiseIntensity !== undefined ? params.noiseIntensity : 0.015,

      // 6. Color Grading, Exposure & Tone
      gamma: params.gamma !== undefined ? params.gamma : 1.0,
      minInputLevel: params.minInputLevel !== undefined ? params.minInputLevel : 0.0,
      maxInputLevel: params.maxInputLevel !== undefined ? params.maxInputLevel : 1.0,
      exposure: params.exposure !== undefined ? params.exposure : 1.0,
    };

    const maxSamples = (this.renderer && this.renderer.capabilities) ? (this.renderer.capabilities.maxSamples || 4) : 4;
    const targetSamples = this.settings.antialias ? Math.min(this.settings.msaaSamples, maxSamples) : 0;
    this.sceneTarget = createFBO(1, 1, { type: THREE.HalfFloatType, samples: targetSamples, depthBuffer: true });

    this.bloomPass = new BloomPass(
      this.settings.bloomStrength,
      this.settings.bloomRadius,
      this.settings.bloomThreshold,
      5
    );

    this.moonScreenPos = new THREE.Vector3(0.5, 0.7, 1.0);
    this.moonInFront = true;

    // Three.js Godrays Passes
    this.godRaysMaskShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        threshold: { value: this.settings.raysThreshold },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: godRaysDepthMaskShader,
      glslVersion: THREE.GLSL3,
    });
    this.godRaysMaskPass = new ShaderPass(this.godRaysMaskShader, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    this.godRaysGenShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        vSunPositionScreenSpace: { value: this.moonScreenPos },
        fStepSize: { value: 1.0 },
        distanceAttenuation: { value: this.settings.raysDistanceAttenuation },
        maxDensity: { value: this.settings.raysMaxDensity },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: godRaysGenerateShader,
      glslVersion: THREE.GLSL3,
    });
    this.godRaysPingPong = new ShaderPingPongPass(this.godRaysGenShader, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    // Three.js Anamorphic Flare Passes
    this.anamorphicBrightShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        threshold: { value: this.settings.anamorphicThreshold },
        smoothWidth: { value: this.settings.anamorphicSmoothWidth },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: anamorphicBrightShader,
      glslVersion: THREE.GLSL3,
    });
    this.anamorphicBrightPass = new ShaderPass(this.anamorphicBrightShader, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    this.anamorphicBlurShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        samples: { value: this.settings.anamorphicSamples },
        intensity: { value: this.settings.anamorphicIntensity },
        tintColor: { value: this.settings.anamorphicColor },
        bloomRadius: { value: this.settings.anamorphicRadius },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: anamorphicBlurShader,
      glslVersion: THREE.GLSL3,
    });
    this.anamorphicBlurPass = new ShaderPass(this.anamorphicBlurShader, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    this.finalShader = new THREE.RawShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(1, 1) },
        bloomEnabled: { value: this.settings.bloomEnabled },
        bloomStrength: { value: this.settings.bloomStrength },
        raysEnabled: { value: this.settings.raysEnabled },
        raysStrength: { value: this.settings.raysStrength },
        raysColor: { value: this.settings.raysColor },
        anamorphicEnabled: { value: this.settings.anamorphicEnabled },
        vignetteBoost: { value: this.settings.vignetteBoost },
        vignetteReduction: { value: this.settings.vignetteReduction },
        noiseIntensity: { value: this.settings.noiseIntensity },
        inputTexture: { value: null },
        blur0Texture: { value: null },
        blur1Texture: { value: null },
        blur2Texture: { value: null },
        blur3Texture: { value: null },
        blur4Texture: { value: null },
        raysTexture: { value: null },
        anamorphicTexture: { value: null },
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
        exposure: { value: this.settings.exposure },
        visionMode: { value: VISION_MODE_MAP[this.settings.visionMode] ?? 0 },
        thermalSensitivity: { value: this.settings.thermalSensitivity },
        nightVisionGain: { value: this.settings.nightVisionGain },
        nightVisionNoise: { value: this.settings.nightVisionNoise },
        crtIntensity: { value: this.settings.crtIntensity },
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
    this.fxaaShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: fxaaFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    this.fxaaPass = new ShaderPass(this.fxaaShader);

    this.smaaShader = new THREE.RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: smaaFragmentShader,
      glslVersion: THREE.GLSL3,
    });
    this.smaaPass = new ShaderPass(this.smaaShader);
  }

  updateSettings() {
    this.bloomPass.enabled = this.settings.bloomEnabled;
    this.bloomPass.strength = this.settings.bloomStrength;
    this.bloomPass.radius = this.settings.bloomRadius;
    this.bloomPass.threshold = this.settings.bloomThreshold;

    this.godRaysMaskShader.uniforms.threshold.value = this.settings.raysThreshold;
    this.godRaysGenShader.uniforms.distanceAttenuation.value = this.settings.raysDistanceAttenuation;
    this.godRaysGenShader.uniforms.maxDensity.value = this.settings.raysMaxDensity;

    this.anamorphicBrightShader.uniforms.threshold.value = this.settings.anamorphicThreshold;
    this.anamorphicBrightShader.uniforms.smoothWidth.value = this.settings.anamorphicSmoothWidth;
    this.anamorphicBlurShader.uniforms.samples.value = this.settings.anamorphicSamples;
    this.anamorphicBlurShader.uniforms.intensity.value = this.settings.anamorphicIntensity;
    this.anamorphicBlurShader.uniforms.tintColor.value.copy(this.settings.anamorphicColor);
    this.anamorphicBlurShader.uniforms.bloomRadius.value = this.settings.anamorphicRadius;

    this.finalShader.uniforms.bloomEnabled.value = this.settings.bloomEnabled;
    this.finalShader.uniforms.bloomStrength.value = this.settings.bloomStrength;
    this.finalShader.uniforms.raysEnabled.value = this.settings.raysEnabled && this.moonInFront;
    this.finalShader.uniforms.raysStrength.value = this.settings.raysStrength;
    this.finalShader.uniforms.raysColor.value.copy(this.settings.raysColor);
    this.finalShader.uniforms.anamorphicEnabled.value = this.settings.anamorphicEnabled;
    this.finalShader.uniforms.vignetteBoost.value = this.settings.vignetteBoost;
    this.finalShader.uniforms.vignetteReduction.value = this.settings.vignetteReduction;
    this.finalShader.uniforms.noiseIntensity.value = this.settings.noiseIntensity;

    this.rgbShader.uniforms.fisheyeStrength.value = this.settings.fisheyeStrength;
    this.rgbShader.uniforms.fisheyeRadius.value = this.settings.fisheyeRadius;
    this.rgbShader.uniforms.chromaticAberrationAmount.value = this.settings.chromaticAberration;
    this.rgbShader.uniforms.gammaLevel.value = this.settings.gamma;
    this.rgbShader.uniforms.minInputLevel.value = this.settings.minInputLevel;
    this.rgbShader.uniforms.maxInputLevel.value = this.settings.maxInputLevel;
    this.rgbShader.uniforms.exposure.value = this.settings.exposure;
    this.rgbShader.uniforms.visionMode.value = VISION_MODE_MAP[this.settings.visionMode] ?? 0;
    this.rgbShader.uniforms.thermalSensitivity.value = this.settings.thermalSensitivity;
    this.rgbShader.uniforms.nightVisionGain.value = this.settings.nightVisionGain;
    this.rgbShader.uniforms.nightVisionNoise.value = this.settings.nightVisionNoise;
    this.rgbShader.uniforms.crtIntensity.value = this.settings.crtIntensity;
  }

  setSize(w0, h0, dpr = 1) {
    this.width = w0;
    this.height = h0;
    this.dpr = dpr;

    const baseW = Math.max(1, Math.floor(w0 * dpr));
    const baseH = Math.max(1, Math.floor(h0 * dpr));
    const ssaa = this.settings.ssaaScale || 1.0;
    const targetW = Math.max(1, Math.round(baseW * ssaa));
    const targetH = Math.max(1, Math.round(baseH * ssaa));

    this.sceneTarget.setSize(targetW, targetH);
    this.finalPass.setSize(baseW, baseH);
    this.finalShader.uniforms.resolution.value.set(baseW, baseH);
    this.bloomPass.setSize(baseW, baseH);

    const grW = Math.max(1, Math.round(baseW / 2));
    const grH = Math.max(1, Math.round(baseH / 2));
    this.godRaysMaskPass.setSize(grW, grH);
    this.godRaysPingPong.setSize(grW, grH);

    const anW = Math.max(1, Math.round(baseW / 4));
    const anH = Math.max(1, Math.round(baseH / 4));
    this.anamorphicBrightPass.setSize(anW, anH);
    this.anamorphicBlurPass.setSize(anW, anH);
    this.anamorphicBlurShader.uniforms.resolution.value.set(anW, anH);

    this.rgbPass.setSize(baseW, baseH);
    this.copyPass.setSize(baseW, baseH);
    if (this.fxaaPass) {
      this.fxaaPass.setSize(baseW, baseH);
      this.fxaaShader.uniforms.resolution.value.set(baseW, baseH);
    }
    if (this.smaaPass) {
      this.smaaPass.setSize(baseW, baseH);
      this.smaaShader.uniforms.resolution.value.set(baseW, baseH);
    }
  }

  setAntialiasMode(mode) {
    const resolved = resolveAntialiasSettings(mode, this.settings.antialias);
    this.setAntialiasConfig(resolved);
  }

  setAntialiasConfig(cfg) {
    if (!cfg) return;
    if (cfg.mode) this.settings.antialiasMode = cfg.mode;
    this.settings.msaaSamples = cfg.msaaSamples !== undefined ? cfg.msaaSamples : 0;
    this.settings.fxaaEnabled = !!cfg.fxaaEnabled;
    this.settings.smaaEnabled = !!cfg.smaaEnabled;
    this.settings.ssaaScale = cfg.ssaaScale || 1.0;
    this.settings.useFxaa = this.settings.fxaaEnabled;
    this.settings.antialias = (this.settings.antialiasMode !== "Off (No Anti-Aliasing)" && this.settings.antialiasMode !== "None (Off)" && this.settings.antialiasMode !== "Off");

    const maxSamples = (this.renderer && this.renderer.capabilities) ? (this.renderer.capabilities.maxSamples || 4) : 4;
    const reqSamples = Math.min(this.settings.msaaSamples, maxSamples);

    const baseW = Math.max(1, Math.floor(this.width * this.dpr));
    const baseH = Math.max(1, Math.floor(this.height * this.dpr));
    const targetW = Math.max(1, Math.round(baseW * this.settings.ssaaScale));
    const targetH = Math.max(1, Math.round(baseH * this.settings.ssaaScale));

    if (this.sceneTarget.samples !== reqSamples || this.sceneTarget.width !== targetW || this.sceneTarget.height !== targetH) {
      const oldTarget = this.sceneTarget;
      this.sceneTarget = createFBO(targetW, targetH, {
        type: THREE.HalfFloatType,
        samples: reqSamples,
        depthBuffer: true,
      });
      oldTarget.dispose();
    }
  }

  setAntialias(enabled) {
    if (typeof enabled === 'string') {
      this.setAntialiasMode(enabled);
    } else {
      this.setAntialiasMode(enabled ? 'MSAA 4x (Standard)' : 'Off (No Anti-Aliasing)');
    }
  }

  setMoonScreenPosition(camera, moonWorldPos) {
    if (!this._camDir) {
      this._camDir = new THREE.Vector3();
      this._toMoon = new THREE.Vector3();
      this._ndc = new THREE.Vector3();
    }
    camera.getWorldDirection(this._camDir);
    this._toMoon.copy(moonWorldPos).sub(camera.position).normalize();
    const dot = this._camDir.dot(this._toMoon);

    if (dot <= 0.02) {
      this.moonInFront = false;
      this.finalShader.uniforms.raysEnabled.value = false;
      return;
    }

    this.moonInFront = true;
    const fade = THREE.MathUtils.clamp((dot - 0.02) / 0.15, 0.0, 1.0);

    this._ndc.copy(moonWorldPos).project(camera);
    const screenX = this._ndc.x * 0.5 + 0.5;
    const screenY = this._ndc.y * 0.5 + 0.5;
    const screenZ = fade;

    this.moonScreenPos.set(screenX, screenY, screenZ);
    this.godRaysGenShader.uniforms.vSunPositionScreenSpace.value.set(screenX, screenY, screenZ);
  }

  renderScene(scene, camera) {
    if (!this.settings.enabled) {
      if (this.settings.fxaaEnabled || this.settings.smaaEnabled || (this.settings.msaaSamples && this.settings.msaaSamples > 0) || (this.settings.ssaaScale && this.settings.ssaaScale > 1.0)) {
        this.renderer.setRenderTarget(this.sceneTarget);
        this.renderer.render(scene, camera);
        this.renderer.setRenderTarget(null);
        if (this.settings.fxaaEnabled) {
          this.fxaaShader.uniforms.inputTexture.value = this.sceneTarget.texture;
          this.fxaaPass.render(this.renderer, true);
        } else if (this.settings.smaaEnabled) {
          this.smaaShader.uniforms.inputTexture.value = this.sceneTarget.texture;
          this.smaaPass.render(this.renderer, true);
        } else {
          this.copyPass.shader.uniforms.inputTexture.value = this.sceneTarget.texture;
          this.copyPass.render(this.renderer, true);
        }
      } else {
        this.renderer.setRenderTarget(null);
        this.renderer.render(scene, camera);
      }
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

    // 1. Atmospheric Bloom
    this.bloomPass.source = sourceTexture;
    this.finalPass.shader.uniforms.inputTexture.value = sourceTexture;
    this.bloomPass.render(this.renderer);

    this.finalPass.shader.uniforms.blur0Texture.value = this.bloomPass.blurPasses[0].texture;
    this.finalPass.shader.uniforms.blur1Texture.value = this.bloomPass.blurPasses[1].texture;
    this.finalPass.shader.uniforms.blur2Texture.value = this.bloomPass.blurPasses[2].texture;
    this.finalPass.shader.uniforms.blur3Texture.value = this.bloomPass.blurPasses[3].texture;
    this.finalPass.shader.uniforms.blur4Texture.value = this.bloomPass.blurPasses[4].texture;

    // 2. Three.js Godrays (3 Ping-Pong Passes: 6^3 = 216 effective samples)
    if (this.settings.raysEnabled && this.settings.raysStrength > 0.001 && this.moonInFront) {
      this.godRaysMaskShader.uniforms.inputTexture.value = sourceTexture;
      this.godRaysMaskShader.uniforms.threshold.value = this.settings.raysThreshold;
      this.godRaysMaskPass.render(this.renderer);

      const filterLen = this.settings.raysDensity;
      const tapsPerPass = 6.0;

      // Pass 1
      this.godRaysGenShader.uniforms.fStepSize.value = filterLen * Math.pow(tapsPerPass, -1.0);
      this.godRaysGenShader.uniforms.inputTexture.value = this.godRaysMaskPass.texture;
      this.godRaysPingPong.render(this.renderer);

      // Pass 2
      this.godRaysGenShader.uniforms.fStepSize.value = filterLen * Math.pow(tapsPerPass, -2.0);
      this.godRaysGenShader.uniforms.inputTexture.value = this.godRaysPingPong.texture;
      this.godRaysPingPong.render(this.renderer);

      // Pass 3
      this.godRaysGenShader.uniforms.fStepSize.value = filterLen * Math.pow(tapsPerPass, -3.0);
      this.godRaysGenShader.uniforms.inputTexture.value = this.godRaysPingPong.texture;
      this.godRaysPingPong.render(this.renderer);

      this.finalPass.shader.uniforms.raysTexture.value = this.godRaysPingPong.texture;
      this.finalPass.shader.uniforms.raysEnabled.value = true;
    } else {
      this.finalPass.shader.uniforms.raysEnabled.value = false;
    }

    // 3. Three.js Anamorphic Flare (High Pass + Quadratic Softness Horizontal Blur)
    if (this.settings.anamorphicEnabled && this.settings.anamorphicIntensity > 0.001) {
      this.anamorphicBrightShader.uniforms.inputTexture.value = sourceTexture;
      this.anamorphicBrightShader.uniforms.threshold.value = this.settings.anamorphicThreshold;
      this.anamorphicBrightShader.uniforms.smoothWidth.value = this.settings.anamorphicSmoothWidth;
      this.anamorphicBrightPass.render(this.renderer);

      this.anamorphicBlurShader.uniforms.inputTexture.value = this.anamorphicBrightPass.texture;
      this.anamorphicBlurShader.uniforms.samples.value = this.settings.anamorphicSamples;
      this.anamorphicBlurShader.uniforms.intensity.value = this.settings.anamorphicIntensity;
      this.anamorphicBlurShader.uniforms.tintColor.value.copy(this.settings.anamorphicColor);
      this.anamorphicBlurShader.uniforms.bloomRadius.value = this.settings.anamorphicRadius;
      this.anamorphicBlurPass.render(this.renderer);

      this.finalPass.shader.uniforms.anamorphicTexture.value = this.anamorphicBlurPass.texture;
      this.finalPass.shader.uniforms.anamorphicEnabled.value = true;
    } else {
      this.finalPass.shader.uniforms.anamorphicEnabled.value = false;
    }

    const randomTime = Math.random() * 100000;
    this.finalPass.shader.uniforms.time.value = randomTime;
    this.rgbPass.shader.uniforms.time.value = randomTime;

    this.finalPass.render(this.renderer);
    if (this.settings.fxaaEnabled || this.settings.useFxaa) {
      this.rgbPass.render(this.renderer, false);
      this.fxaaShader.uniforms.inputTexture.value = this.rgbPass.texture;
      this.fxaaPass.render(this.renderer, true);
    } else if (this.settings.smaaEnabled) {
      this.rgbPass.render(this.renderer, false);
      this.smaaShader.uniforms.inputTexture.value = this.rgbPass.texture;
      this.smaaPass.render(this.renderer, true);
    } else {
      this.rgbPass.render(this.renderer, true);
    }
  }

  attachGUI(gui, title = "Post-Processing Suite") {
    const root = gui.addFolder(title);
    root.add(this.settings, "enabled").name("Enable Post-Process");
    root.add(this.settings, "antialiasMode", ANTIALIAS_MODES).name("Antialiasing Mode").onChange((v) => this.setAntialiasMode(v));

    // 1. Special Vision Modes (Night Vision & Thermal)
    const vision = root.addFolder("Thermal & Night Vision");
    vision.add(this.settings, "visionMode", Object.keys(VISION_MODE_MAP)).name("Vision Mode").onChange(() => this.updateSettings());
    vision.add(this.settings, "nightVisionGain", 0.5, 5.0, 0.1).name("NVG Amplification").onChange(() => this.updateSettings());
    vision.add(this.settings, "nightVisionNoise", 0.0, 0.3, 0.01).name("NVG Sensor Noise").onChange(() => this.updateSettings());
    vision.add(this.settings, "thermalSensitivity", 0.5, 3.5, 0.05).name("Thermal Sensitivity").onChange(() => this.updateSettings());
    vision.add(this.settings, "crtIntensity", 0.0, 0.1, 0.005).name("CRT Scanlines").onChange(() => this.updateSettings());

    // 2. Three.js Godrays (Crytek Radial Blur / webgl_postprocessing_godrays.html)
    const rays = root.addFolder("Three.js Godrays");
    rays.add(this.settings, "raysEnabled").name("Enable Godrays").onChange(() => this.updateSettings());
    rays.add(this.settings, "raysStrength", 0, 3.0, 0.05).name("Intensity").onChange(() => this.updateSettings());
    rays.add(this.settings, "raysDensity", 0.1, 2.5, 0.05).name("Density (Spread)").onChange(() => this.updateSettings());
    rays.add(this.settings, "raysMaxDensity", 0.1, 1.0, 0.05).name("Max Density").onChange(() => this.updateSettings());
    rays.add(this.settings, "raysDistanceAttenuation", 0.5, 4.0, 0.1).name("Distance Atten").onChange(() => this.updateSettings());
    rays.add(this.settings, "raysThreshold", 0.0, 0.8, 0.01).name("Light Threshold").onChange(() => this.updateSettings());
    rays.addColor(this.settings, "raysColorHex").name("Ray Tint").onChange((v) => {
      this.settings.raysColor.set(v);
      this.updateSettings();
    });

    // 3. Three.js Anamorphic Flare (webgpu_postprocessing_anamorphic.html)
    const anamorphic = root.addFolder("Three.js Anamorphic Flare");
    anamorphic.add(this.settings, "anamorphicEnabled").name("Enable Anamorphic").onChange(() => this.updateSettings());
    anamorphic.add(this.settings, "anamorphicIntensity", 0, 10.0, 0.1).name("Intensity").onChange(() => this.updateSettings());
    anamorphic.add(this.settings, "anamorphicThreshold", 0.0, 0.9, 0.01).name("Threshold").onChange(() => this.updateSettings());
    anamorphic.add(this.settings, "anamorphicSamples", 2, 128, 1).name("Samples").onChange(() => this.updateSettings());
    anamorphic.add(this.settings, "anamorphicRadius", 0.0, 1.0, 0.01).name("Bloom Radius").onChange(() => this.updateSettings());
    anamorphic.addColor(this.settings, "anamorphicColorHex").name("Tint Color").onChange((v) => {
      this.settings.anamorphicColor.set(v);
      this.updateSettings();
    });

    // 4. Atmospheric Bloom
    const bloom = root.addFolder("Atmospheric Bloom");
    bloom.add(this.settings, "bloomEnabled").name("Enable Bloom").onChange(() => this.updateSettings());
    bloom.add(this.settings, "bloomStrength", 0, 3.0, 0.05).name("Bloom Strength").onChange(() => this.updateSettings());
    bloom.add(this.settings, "bloomRadius", 0, 2.0, 0.05).name("Bloom Radius").onChange(() => this.updateSettings());
    bloom.add(this.settings, "bloomThreshold", 0, 1.0, 0.01).name("Bloom Threshold").onChange(() => this.updateSettings());

    // 5. Lens, Optics & Film Grain
    const lens = root.addFolder("Lens, Optics & Film Grain");
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
