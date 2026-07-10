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

Toggle between three distinct scenarios in the **"Flight Scenario"** dropdown:

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
  3. **Attack Run**: Drones fly from the left background directly towards the observer camera, sweeping past the lens for a stunning, high-speed close-up flyby.
  4. **Crossfire**: Even drones fly left-to-right, odd drones fly right-to-left, crossing paths at various heights in the center.
  5. **Tactical Dive**: Drones start high in the sky (`Y = 70`–`90`m) and dive steeply down into the ruins corridor.
  6. **Slalom Weave**: Drones weave horizontally in smooth S-curves through the ruins structures.

### Scenario C: Product Presentation
In this mode, a single master drone remains at the screen origin to showcase its features as a 360-degree interactive product.
* **Turntable Rotation**: The drone spins continuously around the selected axis at a customizable rotation speed.
* **Rotation Axes**: Supports Yaw (Y-axis), Pitch (X-axis), Roll (Z-axis), or Diagonal Showcase (combined axes).
* **Pivot Point Offset**: Shift the center of rotation to any X, Y, Z offset on the drone (e.g. wings, nose, camera lens) using a negative/positive translation offset system.
* **Hover Floating**: A slow sin-wave hover oscillation simulates hovering float dynamics with adjustable amplitude and frequency.
* **Neon Glow Showcase Grid Floor**: Renders a custom glowing grid shader plane at `Y = 0.05`. Features a fully customizable Cyan-to-Blue color gradient, an anti-aliased mathematical core (`fwidth`), a soft radial vignette fading out at the edges, and slow radial wave pulsations propagating from the center.
* **Camera Integration**: The camera stands still looking at the drone, supporting scroll wheel zoom, panning, and yaw/pitch rotation offsets around the centered showcase.

---

## 3. Settings & GUI Controllers

The control interface (press **"H"** to show/hide) is grouped into five logical panels:

### Global & Environmental Controls
* **Greenscreen (Background)**: Turns background green (`#00ff00`), hides the ruins ground, and disables ground rendering for clean green-screen keying.
* **Drone Material**: Selects the drone surface texture. Options include standard materials and 14 procedural shader presets.
* **Drone Scale**: Scales the physical size of all drone models.
* **Load Custom Skybox / Drone**: File uploaders to drag and drop custom panorama backgrounds and `.glb`/`.gltf` drone meshes directly into the browser.

### Swarm Chase Settings (Active in Tactical Chase)
* **Drone Count**: Sets the number of active drones (`1` to `1000`).
* **Formation Shape / Formation Spread**: Shape and spacing.
* **Chaos / Turbulence / Flight Speed**: Wind drift and trajectory velocity.

### Cinematic Flyover Settings (Active in Cinematic Flyover)
* **Drone Count**: Sets the number of active drones (`1` to `1000`).
* **Flight Pattern / Swarm Mode**: Selects flight path and enables compressed launch delays.
* **Launch Interval (Density)**: Adjusts launch timeline spacing.
* **Flight Speed & Speed Variation (Spread)**: Adjusts velocity and speed variations.
* **Horizontal & Vertical Spread**: Scales the corridor width (`[2.0, 80.0]`) and altitude height scattering (`[0.0, 50.0]`).
* **Camera Handshake**: Simulates organic handheld rig drift and panning tremor.

### Presentation Settings (Active in Product Presentation)
* **Rotation Speed & Rotation Axis**: Showcase turntable speed and axis alignment.
* **Base Altitude**: Centering height of the drone.
* **Enable Hover Float / Hover Amplitude / Hover Frequency**: Controls the sinusoidal auto-hovering physics.
* **Pivot Point Offset (Pivot X, Pivot Y, Pivot Z)**: Adjusts the rotation center of the showcase model in real-time.
* **Grid Floor Customizations**:
  * *Show Grid Floor*: Toggles floor helper plane.
  * *Grid Color*: HTML color picker for the core wireframe lines.
  * *Glow Color*: HTML color picker for the soft outer neon glow.
  * *Line Thickness*: Controls the pixel width scale (`[0.1, 5.0]`) of both core and outer lines.
  * *Glow Intensity*: Multiplier (`[0.0, 3.0]`) for the neon glow brightness and center wave pulses.

### Camera Offset & Pan Controls
* **Yaw & Pitch Offset**: Rotates the camera angle manually relative to the target anchor.
* **Auto Orbit Camera / Orbit Speed**: Slowly rotates camera around the target.
* **Camera Pan Offset (X, Y, Z)**: Translates the camera viewport parallel to the screen plane.

---

## 4. Proprietary Custom Drone Propeller Mapping
When custom GLB drone meshes are loaded:
* Meshes matching `"propeller"`, `"rotor"`, `"blade"`, `"spin"`, or `"baling"` in their naming hierarchy are mapped to spin on the **Y-axis (Yaw)** (default vertical-lift drone rotors).
* Meshes containing a `_x` or `x` suffix (e.g. `rotor_x`, `rotorx`), or containing `"rough aluminum"`, `"rough_aluminum"`, `"aluminum_0"`, or `"v_rough"`, are mapped to spin on the **X-axis (Pitch)**.
* Meshes containing a `_z` or `z` suffix (e.g. `rotor_z`, `rotorz`, `propellerz`) are mapped to spin on the **Z-axis (Roll)** (transverse/stabilizing propellers).

### Exclusion Filters (Stationary Spinner/Nose Cones)
To prevent nose cones or spinners from spinning independently of the fuselage, meshes containing `"cone"` in their naming hierarchy are automatically excluded from the animation arrays and remain stationary.

### Wobble-Free Quaternion Rotation
To prevent cross-axis wobbling (which happens when Euler rotation coordinates are added sequentially on top of pre-existing tilted model orientations), the simulation caches each propeller's initial orientation as a quaternion (`initialQuaternion`). Every frame, the propeller is restored to this base quaternion and rotated locally via `.rotateX()`, `.rotateY()`, or `.rotateZ()`, keeping the rotation strictly locked to the target local axis.

---

## 5. Hardware-Accelerated 4K Video Exporter

The simulation includes a high-fidelity video rendering button: **"Export 20s 4K MP4 Video"**.

* **Lag-Free Offline Rendering**: During rendering, the browser backing store is locked to exactly `3840x2160` (4K resolution) and the animation clock is stepped manually by `1/30`s per frame. This eliminates frame drops and lag, producing a mathematically perfect, fluid video.
* **WebCodecs API**: Frames are read directly from the WebGL context and sent to the browser's hardware-accelerated H.264 video encoder, generating a high-profile, high-bitrate (45 Mbps) H.264 stream.
* **Direct Download**: The encoded stream is wrapped into an MP4 container in real-time using `mp4-muxer` and downloaded automatically as a `.mp4` file upon completion of the 600-frame (20 seconds) sequence.
