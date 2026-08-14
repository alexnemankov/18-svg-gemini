# Universal Geospatial Trade Flow Engine — Architecture & Implementation Guide
### *Core Reference: 74 - Globe Oil.html / Adaptable to Any Commodity, Country, or Supply Chain*

This document provides a generalized, modular engineering guide and visual architecture specification for creating high-precision geospatial flow visualizations on interactive 3D globes and 2D planar maps.

While implemented with the Strait of Hormuz oil flow as a reference case study in [74 - Globe Oil.html](file:///f:/Front/18-codepen/74%20-%20Globe%20Oil.html), the mathematical models, routing logic, multi-lane lane-splitting algorithms, particle physics, and control specifications in this guide are **completely commodity-agnostic and geography-agnostic**. You can use this blueprint to recreate visualizations for **LNG, agricultural grain, semiconductors, critical minerals, containerized shipping, aviation corridors, financial flows, or supply chains** across any region on Earth.

---

## 1. Executive System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                GEOSPATIAL FLOW SYSTEM ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  [1. Origin-Destination Matrix] ──► [2. Waypoint Router] ──► [3. MapSankeySeries Engine]        │
│   • Source/Target Geocodes           • Land Obstacle Avoidance • Dynamic Curvature Splines      │
│   • Volume Weights (Value)           • Multi-Lane Offsets      • Translucent Polygon Meshes     │
│   • Commodity Metadata               • Choke Bypass (.slice)   • Proportional Nodal Sizing      │
│                                                                                                 │
│                                              │                                                  │
│                                              ▼                                                  │
│                                 [4. Glowing Particle System]                                    │
│                                  • Small Glowing Concentric Circles                             │
│                                  • Real-Time Tangent Auto-Rotation                              │
│                                  • Geodesic Velocity Normalization                              │
│                                  • Stochastic Phase Staggering                                  │
│                                                                                                 │
│                                              │                                                  │
│                                              ▼                                                  │
│  [5. Projection & Camera Engine] ◄───────────┴──────────► [6. Live Theme & Chroma Recolor]      │
│   • 3D Orthographic Globe                                  • 5 Curated Theme Presets            │
│   • 2D Cylindrical Mercator                                • Procedural Click Randomizer        │
│   • 5 Cinematic Motion Presets + Static                    • Custom 8-Token Color Palette       │
│   • Right-Click Screen Space Drag (dx/dy)                  • Studio Greenscreen (#00ff00)       │
│   • Scroll Wheel Zoom & Home Reset                         • Pixel Ratio (DPR) Scaler           │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Tech Stack
* **Geospatial & Vector Engine**: [amCharts 5](https://www.amcharts.com/docs/v5/) (`index.js`, `map.js`, `geodata/worldLow.js`, `themes/Animated.js`, `themes/Dark.js`).
* **Interactive Controls**: [`lil-gui` (v0.19.1)](https://unpkg.com/lil-gui@0.19.1/dist/lil-gui.esm.min.js) loaded natively via ES Module with zero external CSS dependencies.
* **Rendering Model**: Hardware-accelerated 2D/3D Canvas with device pixel ratio (DPR) scaling and vector bezier spline subdivision.
* **Architecture Paradigm**: Pure single-file modular HTML5 + ES Module (`type="module"`), requiring zero build tools, no backend, and no external stylesheets.

---

## 2. Universal Flow Data Model

The foundation of any trade or transport visualization is the **Origin-Destination-Volume (ODV) Matrix** enriched with intermediate navigation waypoints.

### 1. The Universal Flow Generator
```javascript
/**
 * Universal Flow Generator
 * @param {Object} src - Origin { lon: Number, lat: Number }
 * @param {string} srcName - Display name for origin terminal/hub
 * @param {Object} tgt - Destination { lon: Number, lat: Number }
 * @param {string} tgtName - Display name for destination terminal/port
 * @param {number} value - Volume metric (tonnes, bpd, TEU, USD, etc.)
 * @param {Array<Object>} [wp] - Array of { longitude: Number, latitude: Number }
 * @returns {Object} Formatted data object for MapSankeySeries
 */
function flow(src, srcName, tgt, tgtName, value, wp) {
    var result = {
        sourceLongitude: src.lon, sourceLatitude: src.lat,
        targetLongitude: tgt.lon, targetLatitude: tgt.lat,
        source: srcName, target: tgtName, value: value
    };
    if (wp) result.waypoints = wp;
    return result;
}
```

### 2. Universal Data Parameters:
1. **Source & Target Coordinates** (`sourceLongitude/Latitude`, `targetLongitude/Latitude`): Exact latitude and longitude coordinates of production sites, mine sites, ports, airports, or cities.
2. **Nodal Metadata** (`source`, `target`): Human-readable labels used for dynamic tooltips and analytics.
3. **Volume Value** (`value`): Numerical weight used by the engine to scale:
   - Ribbon width across the trade corridor.
   - Circular radius of source and target beacon pins.
4. **Intermediate Waypoints** (`waypoints`): An ordered array of geographical coordinates that curves the line around continents, islands, and airspace restrictions.

---

## 3. Universal Routing Logic & Spatial Geometry

### 1. The Landmass Obstacle Problem
Direct great-circle arcs between coordinates (e.g., Persian Gulf to Japan, or Brazil to China) draw straight lines across landmasses (India, Southeast Asia, Africa, or Central America). 

To achieve realistic maritime or land transportation flows, routes must navigate through **Navigational Waypoint Networks**.

```
[Naive Direct Line]:   Origin ● ───────────────────────────────► Destination ● (Cuts across continents)
                                         (Landmass)

[Waypoint Navigation]: Origin ● ──► [Choke A] ──► [Open Ocean] ──► [Choke B] ──► Destination ●
```

---

### 2. Multi-Lane Spatial Corridor Bundling (Anti-Overlap Algorithm)

When multiple high-volume flows share common transit corridors (e.g., 10 exporters shipping to China, Japan, and Korea through the Indian Ocean), routing them all through identical single waypoints causes ribbons to merge into a single muddy, illegible stroke.

#### The Multi-Lane Solution:
Offset intermediate waypoints across latitude and longitude based on destination geography or commodity type:

```
                                  ┌──► viaNorthernLane (e.g. Japan/Korea)   [Lat +2° to +4°]
                                  │
[Origin Hubs] ──► [Choke Gateway] ┼──► viaCentralLane  (e.g. Taiwan/East CN)[Mid-Ocean Baseline]
                                  │
                                  └──► viaSouthernLane (e.g. SE Asia/S China)[Lat -2° to -4°]
```

#### Code Implementation Pattern:
```javascript
// Northern Maritime Corridor (e.g. East Asia high-latitude ports)
var viaNorth = [
    { longitude: 58, latitude: 26 },
    { longitude: 80, latitude: 9 },
    { longitude: 104, latitude: 7 }
];

// Central Maritime Corridor (e.g. Mid-latitude destinations)
var viaCentral = [
    { longitude: 58, latitude: 24 },
    { longitude: 78, latitude: 6 },
    { longitude: 101, latitude: 3 }
];

// Southern Maritime Corridor (e.g. Equatorial destinations)
var viaSouth = [
    { longitude: 58, latitude: 22 },
    { longitude: 76, latitude: 3 },
    { longitude: 99, latitude: 1 }
];

// Extended Northern Turn (Adding an approach waypoint off the destination coastline)
var viaNorthExtended = [
    { longitude: 58, latitude: 22 },
    { longitude: 76, latitude: 3 },
    { longitude: 99, latitude: 1 },
    { longitude: 124, latitude: 32 } // Coastal turn around Yangtze delta / Yellow Sea
];
```

---

### 3. Choke Point Bypass Architecture (The `.slice()` Pattern)

In real-world logistics, some origins or destinations reside *outside* or *downstream* of a major choke point (e.g., overland pipelines, coastal bypass ports, or rail links).

To avoid creating duplicate waypoint arrays for every permutation, use JavaScript array slicing:

```javascript
// A full corridor includes [ChokePoint, OceanClearance, DestinationGateway]
var fullCorridor = [wpChoke, wpOcean, wpGateway];

// Origin A (Inside the choke point): uses the full array
flow(originInside, "Terminal Inside", dest, "Port", 500, fullCorridor);

// Origin B (Outside/Bypassing the choke point): slices off the first waypoint
flow(originBypass, "Terminal Outside", dest, "Port", 300, fullCorridor.slice(1));
```

---

### 4. Global Navigational Waypoint Reference Library

Use this library of standard maritime and logistical choke points to build custom trade routes across any global theater:

| Region / Theater | Waypoint Variable | Coordinates (Lon, Lat) | Strategic Logistics Role |
| :--- | :--- | :---: | :--- |
| **Middle East** | `wpHormuz` | $(58.0^\circ\text{ E}, 24.0^\circ\text{ N})$ | Persian Gulf / Gulf of Oman gateway |
| **Middle East / Red Sea**| `wpAden` | $(47.0^\circ\text{ E}, 12.0^\circ\text{ N})$ | Bab el-Mandeb strait (Gulf of Aden / Red Sea) |
| **Egypt / Mediterranean**| `wpSuez` | $(34.0^\circ\text{ E}, 29.0^\circ\text{ N})$ | Suez Canal passage |
| **South Asia** | `wpArabianSea` | $(64.0^\circ\text{ E}, 18.0^\circ\text{ N})$ | Open Arabian Sea clearance south of Pakistan/India |
| **South Asia** | `wpSouthIndia` | $(78.0^\circ\text{ E}, 6.0^\circ\text{ N})$ | Deep-water passage south of Sri Lanka / Dondra Head |
| **Southeast Asia** | `wpMalacca` | $(101.0^\circ\text{ E}, 3.0^\circ\text{ N})$ | Strait of Malacca central transit |
| **Southeast Asia** | `wpSingapore` | $(103.8^\circ\text{ E}, 1.2^\circ\text{ N})$ | Singapore Strait / South China Sea gateway |
| **Southeast Asia** | `wpSunda` | $(105.8^\circ\text{ E}, -6.0^\circ\text{ S})$ | Sunda Strait (Java / Sumatra bypass) |
| **Southeast Asia** | `wpLombok` | $(115.7^\circ\text{ E}, -8.5^\circ\text{ S})$ | Lombok Strait (Deep-water Capesize route) |
| **East Asia** | `wpTaiwanStrait` | $(119.5^\circ\text{ E}, 24.0^\circ\text{ N})$ | Taiwan Strait corridor |
| **Southern Europe** | `wpSouthGreece` | $(22.0^\circ\text{ E}, 35.0^\circ\text{ N})$ | South Mediterranean / Aegean bypass |
| **Adriatic Sea** | `wpOtranto` | $(18.5^\circ\text{ E}, 40.0^\circ\text{ N})$ | Strait of Otranto into Adriatic Sea |
| **Central Mediterranean**| `wpSicily` | $(13.0^\circ\text{ E}, 37.0^\circ\text{ N})$ | Strait of Sicily |
| **Western Europe** | `wpGibraltar` | $(-5.5^\circ\text{ E}, 36.0^\circ\text{ N})$ | Strait of Gibraltar (Med $\leftrightarrow$ Atlantic) |
| **Western Europe** | `wpPortugal` | $(-10.0^\circ\text{ E}, 39.0^\circ\text{ N})$ | Atlantic clearance off Cabo da Roca |
| **Northwest Europe** | `wpEnglishChannel` | $(0.0^\circ\text{ E}, 50.0^\circ\text{ N})$ | English Channel / Dover Strait to North Sea |
| **Southern Africa** | `wpCapeGoodHope` | $(18.5^\circ\text{ E}, -34.5^\circ\text{ S})$ | Cape of Good Hope (Europe $\leftrightarrow$ Asia bypass) |
| **Americas (Central)** | `wpPanama` | $(-79.6^\circ\text{ E}, 9.0^\circ\text{ N})$ | Panama Canal (Pacific $\leftrightarrow$ Atlantic) |
| **Americas (South)** | `wpCapeHorn` | $(-67.0^\circ\text{ E}, -56.0^\circ\text{ S})$ | Cape Horn / Drake Passage |
| **Americas (North)** | `wpStLawrence` | $(-69.0^\circ\text{ E}, 48.0^\circ\text{ N})$ | Saint Lawrence Seaway to Great Lakes |
| **Oceania** | `wpTorresStrait` | $(142.5^\circ\text{ E}, -10.5^\circ\text{ S})$ | Torres Strait (Australia $\leftrightarrow$ PNG) |

---

## 4. Visual Representation & Glowing Ship Bullet Particle System

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 VISUAL LAYER COMPOSITION                                         │
│                                                                                                  │
│  Layer 3: Glowing Ship Bullets  ──► Concentric Halo + Radiant Core (Size & Glow Sliders)         │
│  Layer 2: Terminal Node Pins    ──► Volumetric Beacons (stroke: flareColor, fill: amberColor)    │
│  Layer 1: Translucent Ribbons   ──► Smooth Bezier Splines (fillOpacity: 0.4, resolution: 60)     │
│  Layer 0: Geopolitical Maps     ──► Country Polygons (Exporter/Importer Tinted fills)            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Vector Flow Ribbons (`MapSankeySeries`)
The visual ribbons are configured to balance aesthetic elegance with high density:

```javascript
var sankeySeries = chart.series.push(am5map.MapSankeySeries.new(root, {
    polygonSeries: polygonSeries,
    maxWidth: 0.8,              // Max ribbon width ceiling
    controlPointDistance: 0.4,  // Tangent tension between waypoints
    resolution: 60,             // Number of vertices per arc segment
    nodePadding: 0.1            // Minimum clearance between adjacent nodes
}));

sankeySeries.mapPolygons.template.setAll({
    fill: am5.color(params.amberColor),
    fillOpacity: 0.4,           // Translucent fill shows underlying terrain
    strokeOpacity: 0,           // Borderless edges for glowing beam look
    tooltipText: "{source} > {target}\n{value}k bbl/day"
});
```

* **`maxWidth` Tuning Guide**:
  * `0.3`–`0.5`: Slender, delicate lines (ideal for high-density networks like 100+ global air routes).
  * `0.8`–`1.2`: Standard industrial corridors (ideal for maritime bulk, oil, grain, container trade).
  * `1.5`–`2.5`: Massive super-arteries (ideal for high-impact regional pipelines or single-commodity choke flows).
* **`fillOpacity` Tuning Guide**:
  * Set between `0.35` and `0.50` to let underlying coastlines and glowing particles shine through without visual occlusion.

---

### 2. Volumetric Origin & Destination Beacon Pins
```javascript
sankeySeries.nodes.mapPolygons.template.setAll({
    fill: am5.color(params.amberColor),
    stroke: am5.color(params.flareColor),
    strokeWidth: 1.5,
    fillOpacity: 0.95,
    strokeOpacity: 1,
    tooltipText: "{name}"
});
```
* **Dynamic Proportional Scaling**: The engine calculates node surface area based on total volume $\sum \text{values}_{\text{in}} + \sum \text{values}_{\text{out}}$, giving immediate visual hierarchy to mega-ports vs smaller regional terminals.
* **High-Contrast Flare Outlines**: A $1.5\text{px}$ crisp border (`flareColor`) pins the node precisely over the geographic coordinate.

---

### 3. Small Glowing Circle Ship Bullet System

Ships are rendered as **multi-layered glowing energy bullets** streaming along the ribbons:

```
                          (   Soft Halo Glow   )
                        ( (  Radiant Core •  ) )
                          (                    )
```

#### Bullet Hierarchy Configuration:
```javascript
sankeySeries.bullets.push(function() {
    var container = am5.Container.new(root, {
        centerX: am5.p50,
        centerY: am5.p50,
        visible: false
    });

    // 1. Outer Soft Glow Halo
    var halo = container.children.push(am5.Circle.new(root, {
        radius: params.shipSize * 2.5,
        fill: am5.color(params.shipGlowColor),
        fillOpacity: Math.min(0.55, Math.max(0.1, params.shipGlow * 0.035)),
        strokeOpacity: 0
    }));

    // 2. Inner Radiant Core Circle
    var core = container.children.push(am5.Circle.new(root, {
        radius: params.shipSize,
        fill: am5.color(params.shipColor),
        stroke: am5.color(params.flareColor),
        strokeWidth: 0.75,
        shadowColor: am5.color(params.shipGlowColor),
        shadowBlur: params.shipGlow * 1.5,
        shadowOpacity: 1
    }));

    return am5.Bullet.new(root, {
        locationX: 0,
        sprite: container
    });
});
```

* **Interactive Settings Controls**:
  * **`Ship Size`** (Slider `[1.0, 10.0]`, step `0.5`): Adjusts the base radius of the inner core and outer halo.
  * **`Glow Intensity`** (Slider `[0.0, 25.0]`, step `1.0`): Controls `shadowBlur` and halo opacity in real time.
  * **`Ship Core Color`** / **`Ship Halo Glow`**: Color pickers in the GUI panel.

---

### 4. Physics Engine: Geodesic Velocity Normalization & Phase Staggering

Without normalization, animation durations are fixed per segment, causing short routes (e.g. $1,000\text{ km}$) to race at supersonic speeds while long routes ($15,000\text{ km}$) crawl.

The engine normalizes speed using **Geodesic Arc-Length Scaling**:

```javascript
sankeySeries.events.on("datavalidated", function() {
    // 1. Calculate the longest active route in the global network
    var maxLength = 0;
    am5.array.each(sankeySeries.dataItems, function(dataItem) {
        var len = sankeySeries.getPathLength(dataItem);
        if (len > maxLength) maxLength = len;
    });

    var baseDuration = 8000; // Duration (ms) for the longest global path
    var minDuration  = 2000; // Minimum duration (ms) for short regional hops

    // 2. Scale each individual path duration proportionally to its length
    am5.array.each(sankeySeries.dataItems, function(dataItem) {
        var pathLength = sankeySeries.getPathLength(dataItem) || maxLength;
        var dur = maxLength > 0 
            ? Math.max(minDuration, (pathLength / maxLength) * baseDuration) 
            : baseDuration;

        var bullets = dataItem.bullets;
        if (bullets) {
            am5.array.each(bullets, function(bullet) {
                // 3. Add stochastic jitter (±20% variance) to avoid artificial uniformity
                var randomDur = dur * (0.8 + Math.random() * 0.4);
                
                // 4. Stagger initial departure time across the cycle
                var delay = Math.random() * randomDur;

                setTimeout(function() {
                    var sprite = bullet.get("sprite");
                    if (sprite) {
                        sprite.set("visible", true);
                    }
                    bullet.animate({
                        key: "locationX",
                        from: 0,
                        to: 1,
                        duration: randomDur,
                        easing: am5.ease.linear, // Steady cruise velocity
                        loops: Infinity
                    });
                }, delay);
            });
        }
    });
});
```

$$\text{duration}_i = \max\left(\text{minDuration}, \frac{\text{length}_i}{\text{maxLength}} \times \text{baseDuration}\right)$$

* **Uniform Velocity**: Ensures all vessels cruise at identical visual speeds across the planetary surface.
* **Organic Traffic**: Random delays eliminate artificial pulsing waves, creating realistic, continuous traffic streams.

---

## 5. Interaction Mechanics, Camera Controls & Screen-Space Translation

### 1. Dual-Mode Dragging Mechanics
* **Left-Click Drag**:
  * On 3D Globe: Modulates longitude (`panX: "rotateX"`) and latitude tilt (`panY: "rotateY"`).
  * On 2D Map: Pans across map coordinates (`panX: "translateX"`, `panY: "translateY"`).
* **Right-Click Drag (2-Axis Screen Space Translation)**:
  * Translates the entire chart in raw 2D pixel coordinates using `chart.set("dx", ...)` and `chart.set("dy", ...)`.
  * Allows users to reposition the globe off-center for broadcast overlays, video titles, and split-screen layouts.
  * Suppresses browser context menu via `window.addEventListener("contextmenu", e => e.preventDefault())`.
* **Home Button Reset**:
  * Clicking the Home button on the zoom controller automatically restores `dx: 0`, `dy: 0`, and smoothly animates the camera back to default orbital pose.

### 2. Scroll Wheel Zoom
* Enabled via `wheelY: "zoom"` on `MapChart`.
* Bi-directionally synchronized with the GUI **`Zoom Level`** slider (`[0.5, 15.0]`) via `chart.on("zoomLevel", ...)`.

### 3. Keyboard Hotkey (`H` / `h`)
* Pressing **`H`** toggles visibility of the entire UI (`lil-gui` panel, title header, globe/map switch button, zoom controls) for clean broadcast recordings and video captures.

---

## 6. Motion Engine & 5 Cinematic Presets (+ Static Mode)

The simulation maintains a `requestAnimationFrame` loop driving continuous, smooth orbital motion:

```javascript
function animateLoop(now) {
    var delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (delta > 0.1) delta = 0.1;

    if (params.autoAnimate && !isUserInteracting && !switchButton.get("active")) {
        animTime += delta * params.animSpeed;

        if (params.animPreset === 'Smooth Planetary Spin') {
            var curX = chart.get("rotationX", -74);
            chart.set("rotationX", curX + delta * 3.5 * params.animSpeed);
            chart.set("rotationY", -30);
        } else if (params.animPreset === 'Cinematic Orbit & Wobble') {
            var curX = chart.get("rotationX", -74);
            chart.set("rotationX", curX + delta * 3.0 * params.animSpeed);
            chart.set("rotationY", -28 + Math.sin(animTime * 0.35) * 14);
        } else if (params.animPreset === 'Producer to Importer Tour') {
            chart.set("rotationX", -60 - Math.sin(animTime * 0.15) * 55);
            chart.set("rotationY", -24 + Math.cos(animTime * 0.15) * 12);
        } else if (params.animPreset === 'Equatorial Oceanic Drift') {
            var curX = chart.get("rotationX", -74);
            chart.set("rotationX", curX + delta * 2.0 * params.animSpeed);
            var newZoom = 1.6 + Math.sin(animTime * 0.4) * 0.18;
            chart.set("zoomLevel", newZoom);
        }
        // 'Static (No Camera Motion)' leaves camera fixed while particles stream
    }
    requestAnimationFrame(animateLoop);
}
```

### The 5 Presets:
1. **`Smooth Planetary Spin` (Default)**: Constant 360° horizontal planetary revolution at fixed $-30^\circ$ latitude tilt.
2. **`Cinematic Orbit & Wobble`**: Continuous horizontal orbit combined with subtle sinusoidal polar nutation ($\pm 14^\circ$).
3. **`Producer to Importer Tour`**: Smooth oscillatory camera tour between exporter origins and major importer destination ports.
4. **`Equatorial Oceanic Drift`**: Slow horizontal drift paired with a harmonic breathing zoom ($1.6 \pm 0.18$).
5. **`Static (No Camera Motion)`**: Camera is completely frozen, allowing uninterrupted focus on glowing flow telemetry.

* **Interaction Interrupt & Resume**: When user left-drags the globe, camera rotation yields; 1800ms after release, auto-animation resumes smoothly.
* **Speed Multiplier**: The **`Animation Speed`** slider (`[0.1, 5.0]`) controls both camera velocity and particle motion.

---

## 7. Visual Themes, Greenscreen Mode & Procedural Universe Generator

### 1. 5 Curated High-Contrast Presets:

| Theme Name | Deep Crude / Ocean | Slick Land | Borders / Grid | Amber Flows | Secondary | Flare Highlights | Producer Land | Importer Land |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Crude & Tar (Default)** | `#0a0e12` | `#18221e` | `#2d3d34` | `#d98c11` | `#a89050` | `#ffd480` | `#735e16` | `#254536` |
| **Cyberpunk Neon** | `#080914` | `#121324` | `#282a50` | `#ff007f` | `#ffea00` | `#00f5ff` | `#00ff66` | `#9b5de5` |
| **Tactical Radar** | `#040d08` | `#0b1e13` | `#163824` | `#00ff66` | `#aaffcc` | `#39ff14` | `#1f5933` | `#0f3d20` |
| **Quantum Ice** | `#050d1a` | `#0f1d33` | `#1d375e` | `#00d4ff` | `#caf0f8` | `#ffffff` | `#185a9d` | `#0e3d6b` |
| **Solar Flare** | `#120806` | `#24120e` | `#4d2218` | `#ff4500` | `#ffd700` | `#ffff55` | `#8b2500` | `#4a180b` |

### 2. Greenscreen Chroma Key Mode (`#00ff00`)
* Checking **`Greenscreen (#00ff00)`** in the GUI converts the HTML body, container background, and ocean background sphere to pure chroma green (`#00ff00`).
* Country polygons, borders, Sankey flow ribbons, and glowing ship bullets remain cleanly isolated for transparent video compositing in OBS, Premiere, DaVinci Resolve, and After Effects.

### 3. Click-to-Randomize (Procedural Universe Generator)
* When **`Click to Randomize`** is enabled in settings:
  * Any left-click on the canvas ($\Delta\text{dist} < 6\text{px}$, $\Delta\text{time} < 350\text{ms}$) procedurally generates a new harmonious HSL palette, re-rolls ship size, glow bloom, animation speed, and camera motion preset, instantly updating all `lil-gui` controllers.

### 4. Pixel Ratio (DPR) Scaler
* Controlled via **`Pixel Ratio (DPR)`** slider (`[0.5, 3.0]`, step `0.25`) in `System & Display` to scale canvas resolution for performance or ultra-HD rendering.

---

## 8. GUI Controls Specification (`lil-gui`)

The interactive control interface is mounted natively with `lil-gui`:

```
┌────────────────────────────────────────────────────────┐
│                   OIL EXPORT FLOWS                     │
├────────────────────────────────────────────────────────┤
│ Color Scheme          [ Crude & Tar (Default)    ▼ ]   │
│ Greenscreen (#00ff00) [ ]                              │
│ ▼ Motion & Camera                                      │
│   Auto Animation      [x]                              │
│   Camera Preset       [ Smooth Planetary Spin    ▼ ]   │
│   Animation Speed     [============== 1.0 ==========]  │
│   Zoom Level          [========= 1.6 ===============]  │
│ ▼ Ship Glowing Bullets                                 │
│   Ship Size           [========= 3.0 ===============]  │
│   Glow Intensity      [========= 12.0 ==============]  │
│   Ship Core Color     [ #ffd480                     ]  │
│   Ship Halo Glow      [ #d98c11                     ]  │
│ ▼ System & Display                                     │
│   Pixel Ratio (DPR)   [========= 1.0 ===============]  │
│   Click to Randomize  [ ]                              │
│ ► Custom Color Palette                                 │
└────────────────────────────────────────────────────────┘
```

---

## 9. Plug-and-Play Case Studies (Recreation Recipes)

Use these concrete recipes to implement different global commodity flows:

---

### Case Study 1: Global LNG (Liquefied Natural Gas) Trade
* **Exporters**: Qatar (`QA`), United States (`US`), Australia (`AU`).
* **Importers**: Japan (`JP`), South Korea (`KR`), Germany (`DE`), China (`CN`).
* **Theme**: `Quantum Ice` (Cryogenic Blue/Cyan).

```javascript
// Terminals
const rasLaffan    = { lon: 51.56, lat: 25.93 };  // Qatar
const sabinePass   = { lon: -93.85, lat: 29.74 }; // USA Gulf Coast
const gladstone    = { lon: 151.25, lat: -23.84 };// Australia

const tokyoBay     = { lon: 139.75, lat: 35.60 }; // Japan
const incheon      = { lon: 126.60, lat: 37.45 }; // South Korea
const wilhelmshaven= { lon: 8.13,   lat: 53.53 }; // Germany (LNG Terminal)
const shanghai     = { lon: 121.50, lat: 31.23 }; // China

// Corridors
const viaPanama    = [{ longitude: -79.6, latitude: 9.0 }, { longitude: -140, latitude: 20 }];
const viaMalacca   = [{ longitude: 78, latitude: 6 }, { longitude: 101, latitude: 3 }];
const viaTorres    = [{ longitude: 142.5, latitude: -10.5 }, { longitude: 135, latitude: 10 }];

// Data
sankeySeries.data.setAll([
    // Qatar to Asia & Europe
    flow(rasLaffan, "Ras Laffan LNG", tokyoBay, "Tokyo Gas", 1200, viaMalacca),
    flow(rasLaffan, "Ras Laffan LNG", wilhelmshaven, "Uniper Terminal", 900, [wpHormuz, wpAden, wpSuez, wpSicily, wpPortugal]),
    // US to Asia via Panama & Europe via Atlantic
    flow(sabinePass, "Sabine Pass LNG", incheon, "KOGAS Incheon", 850, viaPanama),
    flow(sabinePass, "Sabine Pass LNG", wilhelmshaven, "Wilhelmshaven FSRU", 1100), // Direct Atlantic
    // Australia to East Asia
    flow(gladstone, "Gladstone LNG", shanghai, "Sinopec Shanghai", 950, viaTorres)
]);

var producerIds = ["QA", "US", "AU"];
var importerIds = ["JP", "KR", "DE", "CN"];
```

---

### Case Study 2: Global Agricultural Grain & Soybean Corridors
* **Exporters**: Brazil (`BR`), United States (`US`), Ukraine (`UA`).
* **Importers**: China (`CN`), Egypt (`EG`), Netherlands (`NL`).
* **Theme**: `Solar Flare` or `Crude & Tar`.

```javascript
// Terminals
const santosPort   = { lon: -46.30, lat: -23.95 }; // Brazil (Soybean Hub)
const newOrleans   = { lon: -90.07, lat: 29.95 };  // USA (Mississippi Grain Elevator)
const chornomorsk  = { lon: 30.65,  lat: 46.30 };  // Ukraine (Black Sea Port)

const qingdaoGrain = { lon: 120.38, lat: 36.07 };  // China (Sinograin)
const alexandria   = { lon: 29.89,  lat: 31.20 };  // Egypt (GASC Wheat Hub)
const rotterdamAgri= { lon: 4.12,   lat: 51.95 };  // Netherlands (Bunge/Cargill Silos)

// Corridors
const viaCapeGoodHope = [{ longitude: -20, latitude: -25 }, { longitude: 18.5, latitude: -34.5 }, { longitude: 80, latitude: -10 }, { longitude: 105, latitude: -6 }];
const viaBosphorus    = [{ longitude: 29.0, latitude: 41.2 }, { longitude: 26.0, latitude: 39.5 }];

// Data
sankeySeries.data.setAll([
    // Brazil Soybeans to China (via Cape of Good Hope) & Europe
    flow(santosPort, "Santos Terminal", qingdaoGrain, "Qingdao Silos", 3200, viaCapeGoodHope),
    flow(santosPort, "Santos Terminal", rotterdamAgri, "Rotterdam Agribulk", 1400),
    // US Grain to China & Europe
    flow(newOrleans, "Mississippi Grain Hub", qingdaoGrain, "COFCO Qingdao", 2800, [{ longitude: -79.6, latitude: 9.0 }, { longitude: -140, latitude: 20 }]),
    // Ukrainian Wheat to Egypt
    flow(chornomorsk, "Chornomorsk Port", alexandria, "Alexandria Silos", 950, viaBosphorus)
]);

var producerIds = ["BR", "US", "UA"];
var importerIds = ["CN", "EG", "NL"];
```

---

### Case Study 3: Semiconductor & Advanced Lithography Supply Chain
* **Exporters**: Netherlands (`NL` - ASML), Taiwan (`TW` - TSMC), South Korea (`KR` - Samsung).
* **Importers**: United States (`US`), Germany (`DE`), Japan (`JP`).
* **Theme**: `Cyberpunk Neon` or `Tactical Radar`.

```javascript
const veldhovenASML  = { lon: 5.40,   lat: 51.42 }; // Netherlands (EUV Lithography)
const hsinchuTSMC    = { lon: 120.96, lat: 24.81 }; // Taiwan (Fab Hub)
const suwonSamsung   = { lon: 127.02, lat: 37.26 }; // South Korea (Memory Fab)

const phoenixFab     = { lon: -112.07,lat: 33.45 }; // USA (TSMC Arizona Fab 21)
const dresdenFab     = { lon: 13.73,  lat: 51.05 }; // Germany (Silicon Saxony)
const kumamotoFab    = { lon: 130.74, lat: 32.80 }; // Japan (JASM Fab)

// Data
sankeySeries.data.setAll([
    // EUV Machines from Netherlands to Fabs
    flow(veldhovenASML, "ASML Veldhoven", hsinchuTSMC, "TSMC Fab 18", 450, [{ longitude: 40, latitude: 25 }, { longitude: 80, latitude: 15 }]),
    flow(veldhovenASML, "ASML Veldhoven", suwonSamsung, "Samsung Pyeongtaek", 350, [{ longitude: 40, latitude: 35 }, { longitude: 80, latitude: 40 }]),
    // Silicon Wafers to Packaging & Assembly Hubs
    flow(hsinchuTSMC, "TSMC Hsinchu", phoenixFab, "TSMC Arizona", 1200, [{ longitude: -170, latitude: 30 }]),
    flow(hsinchuTSMC, "TSMC Hsinchu", kumamotoFab, "JASM Kumamoto", 800),
    flow(suwonSamsung, "Samsung Suwon", dresdenFab, "Bosch/Infineon Dresden", 600, [{ longitude: 80, latitude: 50 }, { longitude: 40, latitude: 52 }])
]);

var producerIds = ["NL", "TW", "KR"];
var importerIds = ["US", "DE", "JP"];
```

---

### Case Study 4: The Reference Implementation (Hormuz Crude Oil Flow)
* **Reference File**: [74 - Globe Oil.html](file:///f:/Front/18-codepen/74%20-%20Globe%20Oil.html)
* **Exporters (6 Gulf Producers)**: Saudi Arabia (`SA`), Iraq (`IQ`), UAE (`AE`), Kuwait (`KW`), Iran (`IR`), Qatar (`QA`).
* **Importers (11 Port Hubs)**: China (`CN`), Japan (`JP`), South Korea (`KR`), India (`IN`), Singapore (`SG`), Italy (`IT`), Greece (`GR`), Netherlands (`NL`).
* **Total Network Volume**: $12,570\text{k bbl/day}$ across 32 flows.
* **Corridor Architecture**:
  * `viaJapan`: Northern corridor $(58, 26) \to (80, 9) \to (104, 7)$
  * `viaKorea`: Mid corridor $(58, 24) \to (78, 6) \to (101, 3)$
  * `viaChina`: Southern corridor $(58, 22) \to (76, 3) \to (99, 1)$
  * `viaChinaNorth`: Extended corridor $(58, 22) \to (76, 3) \to (99, 1) \to (124, 32)$
  * `fujairah`: Uses `.slice(1)` to launch directly into the Indian Ocean, bypassing `wpHormuz`.

---

## 10. Master Step-by-Step Creation Checklist

To build any new visualization from scratch:

1. **Assemble Coordinates**: Collect `lon` and `lat` for all source and target hubs.
2. **Select Choke Points**: Choose intermediate waypoints from the [Global Waypoint Library](#4-global-navigational-waypoint-reference-library) to route around land.
3. **Build Multi-Lane Offsets**: For shared corridors with $>3$ routes, create parallel lanes by varying intermediate latitudes $(\pm 2^\circ \dots 4^\circ)$.
4. **Configure Glowing Circle Ships**: Adjust `shipSize` and `shipGlow` for your network scale.
5. **Set Highlighted ISO Codes**: Update `producerIds` and `importerIds` with the 2-letter country ISO codes of your trade network.
6. **Calibrate Camera & Title**:
   * Set `homeRotationX` and `homeRotationY` to frame your primary theater.
   * Update title and subtitle strings in `titleLabel` and `subtitleLabel`.
7. **Select Visual Theme**: Choose one of the 5 pre-calibrated theme presets or customize the 8 palette tokens.
