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

### 5. The Antimeridian ($180^\circ$ Date Line) Boundary Rule & Planar Continuity

```
[2D Mercator Map Boundary at -180° / +180°]
-180° (West) <───────────────────────────────────────────────────> +180° (East)
  │                                                                 │
  │    [Target: US East -86°W]                 [Origin: East Asia +110°E]
  │              ▲                                      │
  │              │                                      ▼
  │       (Waypoint: -150°W)                     (Waypoint: +165°E)
  │              ▲                                      │
  └──────────────┼─── [ Interpolates backwards across ] ┼───────────┘
                 └─── [ the whole map: -315° of lon   ] ◄── [ FATAL WRAPPING BUG ]
```

#### The Antimeridian Problem:
In 2D Planar and Mercator projections (`geoMercator`), the map coordinate system is bounded from $-180^\circ$ to $+180^\circ$.
When a route transits across the Pacific from the Eastern Hemisphere (e.g. $+120^\circ \dots +165^\circ$) to the Western Hemisphere (e.g. $-150^\circ \dots -80^\circ$), vector spline and polygon generators (like `MapSankeySeries`) linearly interpolate between consecutive coordinates.
Jumping directly from $+165^\circ$ to $-150^\circ$ evaluates to $\Delta \lambda = -150 - (+165) = -315^\circ$. Instead of a $45^\circ$ eastward hop across the Pacific Date Line, the engine renders a ribbon stretching **$315^\circ$ westward across all of Asia, Europe, and the Atlantic Ocean**, producing horizontal visual "boomerangs" and hairpin loops in 2D map views.

#### The Golden Engineering Rules for Global Routing:
1. **Monotonic Longitude Continuity**: Ensure that longitude values in any waypoint sequence progress in a continuous directional sequence without jumping across the $\pm 180^\circ$ date line boundary.
2. **Continuous Westbound Maritime Highway for Asia $\leftrightarrow$ Americas**:
   - For intercontinental routes connecting East Asia / Oceania and North / South America, route westbound along the standard commercial maritime container highway:
     $$\text{East Asia} \to \text{Strait of Malacca} \to \text{Suez / Mediterranean} \to \text{Gibraltar} \to \text{Atlantic Ocean} \to \text{Americas}$$
     or via the **Cape of Good Hope** corridor for Southern Hemisphere flows.
   - Longitude decreases continuously from positive to negative:
     $$+110^\circ \to +101^\circ \to +78^\circ \to +34^\circ \to +13^\circ \to -5.5^\circ \to -45^\circ \to -86^\circ$$
   - **Guarantees $100\%$ mathematical and visual stability** in both 3D Orthographic Globe and 2D Mercator Map views with zero geometry artifacts.

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

### Case Study 5: Global Rare Earths & Permanent Magnet Supply Chain
* **Reference File**: [213.html](file:///f:/Front/18-codepen/213.html)
* **Origins (Mining & Processing)**:
  * China: Baotou (`baotou`: $109.83^\circ\text{ E}, 41.57^\circ\text{ N}$), Ganzhou (`ganzhou`: $114.93^\circ\text{ E}, 25.83^\circ\text{ N}$).
  * Allied Alternative Chain: MP Materials Mountain Pass (`mountainPass`: $-115.53^\circ\text{ E}, 35.48^\circ\text{ N}$), MP Independence Magnet Plant Fort Worth (`fortWorth`: $-97.33^\circ\text{ E}, 32.75^\circ\text{ N}$), Lynas Mt Weld (`mtWeld`: $122.53^\circ\text{ E}, -28.87^\circ\text{ S}$), Lynas Kuantan (`kuantan`: $103.33^\circ\text{ E}, 3.80^\circ\text{ N}$), Iluka Eneabba (`eneabba`: $115.27^\circ\text{ E}, -29.83^\circ\text{ S}$).
* **Destinations (Industrial & Defense Consumers)**:
  * Huntsville (`huntsville`: $-86.59^\circ\text{ E}, 34.73^\circ\text{ N}$), Nagoya (`nagoya`: $136.91^\circ\text{ E}, 35.18^\circ\text{ N}$), Wolfsburg (`wolfsburg`: $10.79^\circ\text{ E}, 52.42^\circ\text{ N}$), Ulsan (`ulsan`: $129.31^\circ\text{ E}, 35.54^\circ\text{ N}$).
* **Geopolitical Classification**:
  * `producerIds = ["CN"]` (China — dominant heavy & light REE monopoly).
  * `alternativeIds = ["US", "AU", "MY"]` (Allied Alternative Supply Chain).
  * `importerIds = ["JP", "DE", "KR", "US"]` (Major industrial/defense consumers).
* **Key Innovations**:
  * **Two-Tone Dominance vs Fragility**: China network rendered with thick glowing crimson/amber ribbons (~98% share), contrasted with ultra-thin, dashed, electric cyan allied ribbons (~2% share).
  * **Truce Countdown & Scenario Toggle**: Live countdown to November 1, 2026 US-China export truce expiration, paired with binary scenario toggle ("Current Flows" vs "Post-Truce Restriction Scenario") simulating bilateral dual-use restrictions, buffer depletion, and allied supply acceleration.

---

### Case Study 6: AI Data Center Grid Demand vs. Local Friction & Opposition Map
* **Reference File**: [214.html](file:///f:/Front/18-codepen/214.html)
* **Architecture Paradigm**: Dual `MapPointSeries` Capacity + Friction Model (no Sankey flow routing required).
* **Layer 1 — Hub Layer (DC Capacity Bubbles)**:
  * Bubble radius proportional to power demand: $\text{radius} = \sqrt{\text{GW}_{2026}} \times \text{SCALE\_FACTOR}$ (with fallback emerging size for unreleased metrics).
  * Major Clusters: Northern Virginia (16.6 GW / 33 GW 2030 proj), Texas (13 GW / 28 GW 2030 proj / ~474 GW ERCOT review), Phoenix AZ (tax-pause hub), Dublin Ireland (2.0 GW / 20% national load), Abu Dhabi UAE (Stargate UAE AI campus).
* **Layer 2 — Friction Layer (Local Opposition & Policy Taxonomy)**:
  * 9 Visual Outcome Classifications: `rejected` (red ✕), `moratorium` (orange ⏸), `moratorium-failed` (coral hollow pause), `paused` (amber ⏳), `escalated` (crimson ⚖), `referendum` (yellow 🗳), `protest` (rose 📢), `state-policy` (slate-blue 📜), `proceeding` (green ✓).
  * 13 Active Events: Palm Beach FL ($2B Project Tango rejected), Prince George's MD (moratorium extended), Little Rock AR (4-4 tie vote), Genesee NY (statewide fight), Boulder City NV (federal litigation), Cheyenne WY (referendum drive), Fayetteville NC (wastewater protest), Texas statewide (Gov. Abbott grid pause), Virginia statewide (SCC cost-shift order), Arizona statewide (3-yr tax pause), New Jersey (Fair Share Act), Loudoun VA & Conshohocken PA (economic impact / proceeding).
* **Key Innovations**:
  * **Interactive Multi-Level Filtering**: Real-time filtering via `lil-gui` dropdown and clickable HUD taxonomy chips.
  * **Live Active Telemetry Counter**: Dynamic HUD badge updating visible event count, state coverage, ERCOT queue review metric, and federal S.4214 bill tracking.
  * **Regional Camera Presets**: One-click orbital transitions between North America Hubs, Transatlantic / Dublin, Abu Dhabi AI Campus, and Global Overview.

---

### Case Study 7: The Great Chip Bifurcation (AI Semiconductor Supply Chains)
* **Reference File**: [215.html](file:///f:/Front/18-codepen/215.html)
* **Origins & Foundries**:
  * Western Chain: ASML Veldhoven (`veldhoven`: $5.40^\circ\text{ E}, 52.40^\circ\text{ N}$), TSMC Hsinchu (`hsinchu`: $120.97^\circ\text{ E}, 24.80^\circ\text{ N}$), TSMC Kaohsiung (`kaohsiung`: $120.31^\circ\text{ E}, 22.63^\circ\text{ N}$), TSMC Fab 21 Arizona (`phoenixFab`: $-112.07^\circ\text{ E}, 33.45^\circ\text{ N}$).
  * Chinese Chain: SMIC Shanghai (`smicShanghai`: $121.47^\circ\text{ E}, 31.23^\circ\text{ N}$), SMIC Beijing (`smicBeijing`: $116.40^\circ\text{ E}, 39.90^\circ\text{ N}$).
* **Design, Packaging & Hyperscale AI Destinations**:
  * Nvidia HQ Santa Clara (`santaClara`: $-121.97^\circ\text{ E}, 37.35^\circ\text{ N}$), Oak Ridge National Laboratory (`oakRidge`: $-84.31^\circ\text{ E}, 35.93^\circ\text{ N}$), Northern Virginia (`nVirginia`: $-77.44^\circ\text{ E}, 39.03^\circ\text{ N}$), Texas Hub (`texasHub`: $-97.09^\circ\text{ E}, 32.78^\circ\text{ N}$).
  * Domestic Packaging Shenzhen (`shenzhenPack`: $114.06^\circ\text{ E}, 22.54^\circ\text{ N}$), Guizhou AI Compute Cluster Guiyang (`guiyang`: $106.71^\circ\text{ E}, 26.57^\circ\text{ N}$).
* **Geopolitical Classification**:
  * `westernFabIds = ["TW", "US", "NL"]` (Western Allied AI Hardware Network).
  * `chineseFabIds = ["CN"]` (Chinese Domestic Semiconductor Network).
* **Key Innovations**:
  * **Two-Network Parallel Globe Architecture**: Highlighting the contrast between the massive, advanced Western network (TSMC >60% foundry share, $265B total US commitment) and China's constrained but growing 7nm multi-patterning domestic alternative.
  * **2-State Market-Share Shift Toggle**: Binary toggle switching between `Early 2026 Baseline` (Nvidia >90% China share) and `Aug 2026 Shift` (50/50 bifurcation due to tariffs and Beijing domestic preference push), with live ribbon scaling, custom dashed textures, and telemetry badges.
  * **Monotonic Global Highway Routing (Zero Antimeridian Wrap)**: Continuous westbound maritime & overland transit for Asia-to-Americas corridors (Taiwan $\to$ Malacca $\to$ Suez $\to$ Atlantic $\to$ US) that eliminates $\pm 180^\circ$ Date Line geometry tears in both 3D Orthographic and 2D Planar modes.


---

### Case Study 8: Global AI Regulatory Landscape & US State Patchwork (Choropleth & Status Map)
* **Reference File**: [216.html](file:///f:/Front/18-codepen/216.html)
* **Architecture Paradigm**: Dual `MapPolygonSeries` Categorical Choropleth Engine with Slide-in HTML Legal Detail Drawer and Point-Series Federal Overlays (structurally distinct departure from the Sankey flow engine).
* **Layer 0 — World Jurisdictions (`am5geodata_worldLow`)**:
  * **Categorical Fill Model**: 5 distinct philosophical models mapped across sovereign nations (not a single-hue continuous heat gradient):
    * `comprehensive-binding` (`#2E5EAA`): All 27 EU Member States (EU AI Act - Regulation 2024/1689: risk tiers, banned practices, GPAI systemic risk mandates) and South Korea (`KR` - AI Basic Act effective Jan 22, 2026).
    * `state-content-control` (`#B5342A`): China (`CN` - Cybersecurity Law AI Amendments Jan 1, 2026, CAC algorithm filing, pre-deployment security review, socialist core values alignment, dual synthetic watermarking).
    * `fragmented-patchwork` (`#C98A2E`): United States (`US` - No omnibus federal statute; mosaic of state statutes + sectoral agency guidance).
    * `voluntary-pending` (`#8A8A8A`): United Kingdom (`GB` - AISI voluntary red-teaming, binding frontier legislation delayed into 2026/2027), Japan (`JP`), Switzerland (`CH`).
    * `sector-emerging` (`#4E9C6E`): Singapore (`SG` - World's first Model AI Governance Framework for Generative & Agentic AI Jan 2026, AI Verify testing foundation), Australia (`AU` - AI Safety Institute, mandatory guardrails), UAE (`AE` - DIFC/ADGM sandbox regimes), Saudi Arabia (`SA` - 'Year of AI' PDPL enforcement), Canada (`CA` - AIDA Bill C-27).
    * `no-data` (`#252d3a`): ~120 unclassified nations with neutral slate fill.
* **Layer 1 — US Sub-National State Patchwork (`am5geodata_usaLow`)**:
  * Activated on View Scope toggle to `us-detail` or camera zoom to the US.
  * Rendered with high-contrast distinct borders (`strokeWidth: 1.2`, `#ffffff` / theme accent).
  * State Legal Taxonomy:
    * `two-law-state` (`#3b82f6`): Colorado (`US-CO` - Colorado AI Act SB 24-205 amended May 2026 to push effective date to Jan 1, 2027 and streamline scope + HB 26-1014 Chatbot Safety Act protecting minors).
    * `multi-law-state` (`#06b6d4`): California (`US-CA` - AI Transparency Act SB 942, Training Data Transparency AB 2013, AI Companion Safety SB 243).
    * `narrowed-law` (`#f59e0b`): Texas (`US-TX` - TRAIGA HB 1840 effective Jan 1, 2026: stripped affirmative assessments, categorical bans on manipulation/biometric capture, exclusive AG enforcement).
    * `adjacent-law` (`#a855f7`): Illinois (`US-IL` - BIPA 740 ILCS 14 biometric consent acting as de facto AI restriction + AIVIA hiring video audits).
    * `narrow-local-law` (`#ec4899`): New York (`US-NY` - NYC Local Law 144 automated employment decision tool bias audits).
    * `emerging-state` (`#10b981`): Utah (`US-UT` - AI Policy Act SB 149, Office of AI Policy sandbox), Connecticut (`US-CT`), Indiana (`US-IN`), Virginia (`US-VA`), Florida (`US-FL`).
    * `no-specific-law` (`#1e293b`): Remaining states governed by general consumer protection / UDAP acts.
* **Layer 2 — Federal Defense & Scientific Point Markers**:
  * Distinct glowing badge pins over Washington, DC $(-77.04^\circ\text{ E}, 38.91^\circ\text{ N})$:
    * `GOLD EAGLE Initiative` (Treasury / DHS CISA / DOD): Frontier AI model swarms for automated vulnerability detection across critical energy, water, and financial infrastructure.
    * `Genesis Mission` (EO 14363): Aggregating NIH biomedical data and DOE exascale supercomputing (Frontier/Aurora/El Capitan) for sovereign scientific AI discovery.
* **Key Innovations**:
  * **Interactive Slide-in HTML Legal Drawer**: Full slide-in panel (not a cramped tooltip) delivering comprehensive narrative text, statutory citations, key compliance checklists, effective dates, enforcement authorities, and strategic impact callouts.
  * **Context-Aware Dynamic HUD Legend**: Interactive category chips displaying live counts and isolating matching national/state jurisdictions on click.
  * **Seamless 3D Globe to 2D Planar & Projection Switching**: Supports `3D Orthographic Globe`, `2D Mercator`, and `2D Natural Earth`.
  * **Full Keyboard & Broadcast Integration**: Hotkeys `H` (clean HUD toggle), `Esc` (close drawer), `1` (World Scope), `2` (US Scope), and Greenscreen (`#00ff00`) mode.

---

## 10. Master Step-by-Step Creation Checklist

To build any new visualization from scratch:

1. **Assemble Coordinates**: Collect `lon` and `lat` for all source and target hubs.
2. **Select Choke Points & Enforce Planar Continuity**: Choose intermediate waypoints from the [Global Waypoint Library](#4-global-navigational-waypoint-reference-library) to route around land. **Verify Monotonic Longitude Continuity** (per [Section 3.5](#5-the-antimeridian-180-date-line-boundary-rule--planar-continuity)) to prevent Antimeridian $\pm 180^\circ$ wrapping bugs in 2D map views.
3. **Build Multi-Lane Offsets**: For shared corridors with $>3$ routes, create parallel lanes by varying intermediate latitudes $(\pm 2^\circ \dots 4^\circ)$.
4. **Configure Glowing Circle Ships**: Adjust `shipSize` and `shipGlow` for your network scale.
5. **Set Highlighted ISO Codes**: Update `producerIds`, `alternativeIds`, and `importerIds` with the 2-letter country ISO codes of your trade network.
6. **Calibrate Camera & Title**:
   * Set `homeRotationX` and `homeRotationY` to frame your primary theater.
   * Update title and subtitle strings in `titleLabel` and `subtitleLabel`.
7. **Select Visual Theme**: Choose one of the 5 pre-calibrated theme presets or customize the 8 palette tokens.
