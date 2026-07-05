//useTerrain.js
import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { createPerlin } from '../lib/perlin';
import { generateTerrainColors } from '../lib/colorPresets';

// ─── Tiling constants ────────────────────────────────────────────────────────
// TILE_SIZE must match the PlaneGeometry dimensions (60×60 world units).
const TILE_SIZE = 60;
const BORDER_FRAC = 0.10;
const BORDER_W = TILE_SIZE * BORDER_FRAC;  // 6.0 world units
const HALF_TILE = TILE_SIZE / 2;            // 30.0

/** Standard cubic smoothstep, input clamped to [0, 1]. */
function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

export function useTerrain() {
  const terrainRef = useRef(null);
  const noiseRef = useRef(null);

  // Initialize noise with seed
  const initNoise = useCallback((seed) => {
    noiseRef.current = createPerlin(seed);
  }, []);

  // Generate terrain geometry
  const generateTerrain = useCallback((config) => {
    const {
      segments = 100,
      heightScale = 8,
      noiseFreq = 0.05,
      octaves = 4,
      colorPreset = 'grass',
      seed = Math.floor(Math.random() * 65536),
      source = 'perlin',
      tileable = false
    } = config;

    // Initialize noise
    initNoise(seed);
    const noise = noiseRef.current;

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(
      60, 60,
      segments, segments
    );

    // Rotate to lie flat
    geometry.rotateX(-Math.PI / 2);

    // Get position attribute
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;

    // ── Step 1: Generate raw heightmap ───────────────────────────────────────
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];

      let height = 0;

      if (source === 'perlin') {
        // Full-quality FBM noise — identical path for tileable and non-tileable
        height = noise.fbm2(x * noiseFreq, z * noiseFreq, octaves);
      } else if (source === 'island') {
        // Island shape — radial falloff (inherently non-tileable by design)
        const dist = Math.sqrt(x * x + z * z);
        const maxDist = 25;
        const falloff = Math.max(0, 1 - Math.pow(dist / maxDist, 2));
        height = noise.fbm2(x * noiseFreq, z * noiseFreq, octaves);
        height = height * falloff - (1 - falloff) * 5;
      }

      // Store raw (pre-scale) height — heightScale is applied in Step 3
      positions[i * 3 + 1] = height;
    }

    // ── Step 2: Edge-blending pass (tileable=true, perlin source only) ────────

    if (tileable && source === 'perlin') {
      for (let i = 0; i < vertexCount; i++) {
        const x = positions[i * 3];
        const z = positions[i * 3 + 2];

        // Distance from the nearest x-edge (x=±30) and z-edge (z=±30)
        const dx = HALF_TILE - Math.abs(x);  // 0 at edge, HALF_TILE at centre
        const dz = HALF_TILE - Math.abs(z);

        // Blend weights: 0 outside border zone, 0.5 at the exact edge
        const wx = dx < BORDER_W ? 0.5 * smoothstep(1 - dx / BORDER_W) : 0;
        const wz = dz < BORDER_W ? 0.5 * smoothstep(1 - dz / BORDER_W) : 0;

        // Interior vertex — entirely outside both border zones, nothing to do
        if (wx === 0 && wz === 0) continue;

        const h = positions[i * 3 + 1]; // original raw height for this vertex

        // Sample mirrored heights only for axes that are in the border zone.
        // hMXZ is computed once and cached here — never recalculated per axis.
        const hMX = wx > 0 ? noise.fbm2(-x * noiseFreq, z * noiseFreq, octaves) : 0;
        const hMZ = wz > 0 ? noise.fbm2(x * noiseFreq, -z * noiseFreq, octaves) : 0;
        const hMXZ = (wx > 0 && wz > 0) ? noise.fbm2(-x * noiseFreq, -z * noiseFreq, octaves) : 0;

        // Full 4-term bilinear blend — weights sum to exactly 1.0:
        //   (1-wx)(1-wz)·h + wx(1-wz)·hMX + (1-wx)wz·hMZ + wx·wz·hMXZ
        positions[i * 3 + 1] =
          h * (1 - wx) * (1 - wz) +
          hMX * wx * (1 - wz) +
          hMZ * (1 - wx) * wz +
          hMXZ * wx * wz;
      }
    }

    // ── Step 3: Apply height scale ────────────────────────────────────────────
    for (let i = 0; i < vertexCount; i++) {
      positions[i * 3 + 1] *= heightScale;
    }

    // Compute normals
    geometry.computeVertexNormals();

    // Generate vertex colors
    const colors = generateTerrainColors(positions, colorPreset, heightScale);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Update bounds
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    return geometry;
  }, [initNoise]);

  // Create terrain mesh
  const createTerrainMesh = useCallback((config, material = null) => {
    // Dispose old terrain
    if (terrainRef.current) {
      if (terrainRef.current.geometry) {
        terrainRef.current.geometry.dispose();
      }
      if (terrainRef.current.material && terrainRef.current.material !== material) {
        terrainRef.current.material.dispose();
      }
    }

    // Generate new geometry
    const geometry = generateTerrain(config);

    // Create material if not provided
    const mat = material || new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
      wireframe: config.wireframe || false
    });

    // Create mesh
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'Terrain';

    terrainRef.current = mesh;

    // Calculate stats
    const vertCount = geometry.attributes.position.count;
    const triCount = geometry.index ? geometry.index.count / 3 : vertCount / 3;

    return {
      mesh,
      vertCount,
      triCount
    };
  }, [generateTerrain]);

  // Update terrain material
  const updateTerrainMaterial = useCallback((material) => {
    if (terrainRef.current) {
      const oldMat = terrainRef.current.material;
      terrainRef.current.material = material;
      if (oldMat) oldMat.dispose();
    }
  }, []);

  // Update wireframe
  const setWireframe = useCallback((wireframe) => {
    if (terrainRef.current && terrainRef.current.material) {
      terrainRef.current.material.wireframe = wireframe;
    }
  }, []);

  // Get terrain mesh
  const getTerrainMesh = useCallback(() => {
    return terrainRef.current;
  }, []);

  // Dispose terrain
  const disposeTerrain = useCallback(() => {
    if (terrainRef.current) {
      if (terrainRef.current.geometry) {
        terrainRef.current.geometry.dispose();
      }
      if (terrainRef.current.material) {
        terrainRef.current.material.dispose();
      }
      terrainRef.current = null;
    }
  }, []);

  return {
    terrainRef,
    generateTerrain,
    createTerrainMesh,
    updateTerrainMaterial,
    setWireframe,
    getTerrainMesh,
    disposeTerrain,
    noise: noiseRef.current
  };
}

export default useTerrain;
