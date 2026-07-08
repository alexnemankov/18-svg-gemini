# Tactical Drone Surveillance Simulation (106.html)

This document provides a technical description of the high-performance Three.js drone surveillance simulation implemented inside [106.html](file:///f:/Front/18-codepen/106.html). 

---

## 1. Project Overview

The project is a self-contained, real-time 3D simulation of a tactical drone swarm patrolling a ruined urban environment. It combines advanced WebGL rendering, custom vertex and fragment shaders, flexible camera motion behaviors, and a zero-lag hardware-accelerated 4K MP4 video exporter. 

### Core Tech Stack:
* **WebGL Engine**: Three.js (v0.148.0)
* **User Interface**: `lil-gui` (v0.19.1)
* **Video Encoding**: WebCodecs API (browser-native hardware encoding) + `mp4-muxer` (v5.2.2)
* **Optimization**: Memory-instanced cloning (shared `BufferGeometry` and `Material` pipelines) to support up to **1000 interactive drones** simultaneously at high frame rates.

---

## 2. Flight Scenarios & Motion Patterns

Toggle between two distinct scenarios in the **"Flight Scenario"** dropdown:

### Scenario A: Tactical Chase
In this mode, the camera follows a swarm flying along a 480-meter winding 3D spline trajectory through the ruins corridor.
* **Trajectory**: The path is defined by a `CatmullRomCurve3` spline.
* **Swarm Formations**: Drones maintain formation relative to the lead drone. Spacings scale dynamically based on wingspan to prevent collisions.
* **Swarm Turbulence**: Independent low-frequency wind drift offsets are applied to each clone, causing organic floating and pitching.
* **Camera Perspectives**: Features **5 selectable chase modes** relative to the target's local coordinate frame:
  1. *Chase Rear (Low)* (Default): Classic third-person view.
  2. *Chase Front (Head-On)*: Positioned in front of the drone, facing backwards.
  3. *Chase Left Wing / Right Wing*: Mounted on the sides looking forward.
  4. *Chase Top-Down*: Directly above looking straight down.
  * *Zoom Modulation*: Mouse wheel scroll adjusts camera.zoom dynamically to zoom closer or pull back while remaining locked to the selected chase angle.

### Scenario B: Cinematic Flyover
In this mode, the camera remains stationary at `X = -120` looking across the corridor, while waves of drones fly past the viewport from left to right.
* **Unified Auto-Orientation**: Drones steer and pitch naturally along their actual flight vector by sampling the trajectory at `t_i + 0.002`.
* **Zero-Deadtime Looping**: The loop timeline is calculated dynamically based on when the slowest drone leaves the screen, instantly triggering the next wave with zero visual pause.
* **6 Predefined Flight Patterns**:
  1. **Straight L-to-R** (Default): Parallel lines from left (`Z = -280`) to right (`Z = 200`).
  2. **Fan Out**: Drones launch from the left and diverge in randomized 3D directions.
  3. **Attack Run**: Drones fly from the left background directly towards the observer camera, sweeping past the lens for a dramatic close-up.
  4. **Crossfire**: Even drones fly left-to-right, odd drones fly right-to-left, crossing paths at various heights in the center.
  5. **Tactical Dive**: Drones start high in the sky (`Y = 70`–`90`m) and dive steeply down into the ruins corridor.
  6. **Slalom Weave**: Drones weave horizontally in smooth S-curves through the ruins structures.

---

## 3. Settings & GUI Controllers

The control interface (press **"H"** to show/hide) is grouped into five logical panels:

### Global & Environmental Controls
* **Greenscreen (Background)**: Turns background green (`#00ff00`), hides the ruins ground, and disables fog for clean green-screen keying.
* **Drone Material**: Selects the drone surface texture. Options include:
  * *Standard*: Original, Military Olive, Stealth Black, Desert Camo, Rusty Scrap, Polished Chrome.
  * *Procedural Shaders*: Toon Shading, Manual PBR, Velvet Cloth, Tron Grid, Procedural Marble, Thermal Camera, Hologram Scanlines, Hex Force Field, Iridescent, Lava Lamp, Comic Halftone, Digital Glitch, Wave Distortion, Pulse Glow.
* **Drone Scale** (Range: `0.1` to `2.5`): Scales the physical size of all drone models.
* **Load Custom Skybox / Drone**: File uploaders to drag and drop custom panorama backgrounds and `.glb`/`.gltf` drone meshes directly into the browser.

### Swarm Chase Settings (Active in Tactical Chase)
* **Drone Count**: Sets the number of active drones (`1` to `1000`).
* **Formation Shape**: Sets the shape (`Line`, `V-Shape`, `Grid`, `Circle`, `Swarm (Sphere)`).
* **Formation Spread**: Spacing between individual slots.
* **Chaos / Turbulence**: Wind drift intensity.
* **Flight Speed**: Base velocity of the swarm along the spline.

### Cinematic Flyover Settings (Active in Cinematic Flyover)
* **Drone Count**: Sets the number of active drones (`1` to `1000`).
* **Flight Pattern**: Selects one of the 6 flight behaviors.
* **Swarm Mode (All Together)**: When enabled, compresses launch delays to a tight `2.5`-second window. Drones fly through the screen as a single massive cloud rather than a staggered stream.
* **Launch Interval (Density)**: Adjusts the timeline launch delay gaps.
* **Flight Speed & Speed Variation (Spread)**: Adjusts base velocity and introduces speed offsets between drones.
* **Horizontal & Vertical Spread**: Scales the corridor width (`[2.0, 80.0]`) and altitude height scattering (`[0.0, 50.0]`).
* **Camera Handshake** (Range: `0.0` to `3.0`): Simulates handheld camera tremor. Combines low-frequency rig drift (positional) and high-frequency panning tremor (rotational) using independent, prime-related wave frequencies.

### Camera Offset & Pan Controls
* **Yaw & Pitch Offset**: Rotates the camera angle manually relative to the target anchor.
* **Auto Orbit Camera**: Rotates the camera continuously around the target at a adjustable speed.
* **Camera Pan Offset (X, Y, Z)**: Translates the camera and lookAt target parallel to the screen plane, allowing manual frame adjustment without disrupting flight calculations.

---

## 4. Hardware-Accelerated 4K Video Exporter

The simulation includes a high-fidelity video rendering button: **"Export 20s 4K MP4 Video"**.

* **Lag-Free Offline Rendering**: During rendering, the browser backing store is locked to exactly `3840x2160` (4K resolution) and the animation clock is stepped manually by `1/30`s per frame. This eliminates frame drops and lag, producing a mathematically perfect, fluid video.
* **WebCodecs API**: Frames are read directly from the WebGL context and sent to the browser's hardware-accelerated H.264 video encoder, generating a high-profile, high-bitrate (45 Mbps) H.264 stream.
* **Direct Download**: The encoded stream is wrapped into an MP4 container in real-time using `mp4-muxer` and downloaded automatically as a `.mp4` file upon completion of the 600-frame (20 seconds) sequence.
