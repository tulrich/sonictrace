# PLAN.md: SonicTrace
**A Vision-to-Acoustics IR Generation Tool**

## 1. Project Overview

SonicTrace is a "serverless" single-file web application that
transforms photos of physical spaces into high-fidelity Acoustic
Impulse Responses (IR). By combining Computer Vision for geometry
reconstruction, BVH-accelerated ray tracing, and Web Audio
convolution, it allows musicians and engineers to virtually
respatialize audio through any room they can get images of.

## 2. Core Features
* **Vision-Driven Modeling:** Upload a photo (or generate one via AI) to automatically derive room dimensions and material properties.
* **3D Mesh Previewer:** A WebGL-based UI to inspect the reconstructed room and voxelization, rotate the perspective, and toggle material "heatmaps."
* **Interactive Spatial UI:** Drag-and-drop handles for the Sound Source (e.g., a bass amp) and the Listener (e.g., a microphone).
* **High-Performance Hybrid Acoustic Solver:** A Wasm-powered engine calculating wave equation response at lower frequencies combined with raytraced geometry at higher frequencies using frequency-dependent material properties.
* **Real-time Spatialization:** A "Listen" mode that loops a user-uploaded audio clip through a real-time convolution engine using the generated IR.
* **Export:** Download the final IR as a high-fidelity `.wav` file for use in external DAWs.

---

## 3. Architecture Outline

### A. Frontend & UI (The "Container")
* **Format:** Single `index.html` file using ES Modules.
  - Use Google Javascript coding style
    - (2-space indents, javadoc, type annotations, etc). See https://google.github.io/styleguide/jsguide.html
    - But use modern ES2024 features for type annotations etc. We will target up-to-date browsers and go for clean code.
* **UI Framework:** Tailwind CSS (via CDN) for a responsive, dark-mode "Studio" aesthetic.
* **3D Engine:** Three.js for rendering the room mesh and handling spatial transforms.
* **State Management:** Vanilla JS or a lightweight store (like Preact signals) to track source/listener coordinates and room parameters.
  - No server. No user data leaves the browser, except at the initiative of the user (e.g., for downloading an IR).

### B. The Geometry Pipeline (Vision → Mesh)
* **Orchestration:** Gemini 3 Pro (or similar VLM) accessed via client-side API calls.
* **Orchestration:** Gemini 3 Pro (or similar VLM) accessed via client-side API calls.
* **Prompt Strategy:** Instruct the model to analyze the image and return a structured JSON representing vertices, indices, and material labels (e.g., "ceiling": "popcorn_plaster", "floor": "hardwood").
* **Mesh Generation:** Convert JSON output into a `THREE.BufferGeometry`.
* **Voxelization:** Convert mesh to 3D occupancy grid for FDTD; tag boundary voxels with material types.

### C. The Acoustic Engine
* **Compiled Core deployed to the browser via WASM**
* **Finite Difference Time Domain Wave Solver:**
  - Used for frequencies up to ~500 Hz (fixed crossover).
  - Voxelize the mesh into a 3D occupancy grid (~7cm cells for 500Hz limit, ~10 nodes/wavelength).
  - Double-buffered pressure state matrix; iterate forward using a SIMD-friendly 7-point stencil.
  - **Frequency-dependent boundary conditions:** Each boundary voxel stores:
    - Material type index → lookup into coefficient table
    - 1-2 IIR filter state variables (models wall as spring-mass-damper system)
  - After bulk state update, iterate boundary nodes and apply IIR filter updates for frequency-dependent absorption.
  - Record pressure-time history at receiver node(s).
  - **Stability (Courant condition):** `Δt ≤ Δx / (c × √3)` → ~8.7kHz simulation rate for 7cm cells.
  - **Performance estimates (10m×10m×3m room):**
    - ~950k voxels, ~8MB for pressure grids
    - ~17 billion stencil ops for 2-second IR
    - Target: ~4 seconds with SIMD optimization
* **Ray Tracing Geometric Solver:**
  - Use for frequencies above ~500 Hz.
  - Use a bounding volume hierarchy (BVH) to accelerate intersection tests.
  - **Frequency bin strategy:**
    - 500Hz–2kHz: Separate traces per bin with full diffraction logic.
    - 2kHz+: Piggyback multiple bins on single rays (SIMD-friendly); simpler specular behavior.
  - **Diffraction via edge cylinders:**
    - Pre-identify silhouette/convex edges in mesh.
    - Insert "phantom" cylinders (~λ radius) into BVH for lower frequency bins.
    - On cylinder hit: calculate path difference (δ), apply Fresnel number attenuation, continue ray.
  - **Bounce modeling:** Energy loss per bounce via `E_new = E_old × (1 - α)` where α is frequency-dependent absorption coefficient.
  - **Scattering:** Stochastic reflection based on material scattering coefficient; Lambertian or glossy perturbation.
  - **Air absorption:** Apply frequency-dependent attenuation based on propagation distance.
  - **IR accumulation:** Time-domain summation with fractional delay interpolation (linear interp between samples).

* **IR Synthesis:**
  - Phase-align FDTD output and ray engine output (ensure direct sound arrives at same sample).
  - Apply Linkwitz-Riley crossover filters (500Hz low-pass to FDTD, 500Hz high-pass to ray output).
  - Sum filtered buffers and normalize for final IR.

* **Material Property Dictionary:**
  - Map visual labels (from AI) to acoustic coefficients per octave band (125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz).
  - JSON format:
    ```json
    "painted_brick": {
      "absorption": [0.01, 0.01, 0.02, 0.02, 0.02, 0.03],
      "scattering": [0.05, 0.05, 0.10, 0.20, 0.30, 0.40]
    }
    ```
  - Convert absorption (α) to IIR coefficients for FDTD boundary conditions.
  - Use α directly for ray energy loss: `R = 1 - α`.

### D. Audio Processing (The "Output")
* **Web Audio API:**
    * `ConvolverNode`: For real-time previewing.
    * `OfflineAudioContext`: For high-quality, faster-than-real-time rendering of the final `.wav` export.

---

## 4. Implementation Phases

### Phase 1: The "Hollow" App (UI & 3D)
* [ ] Set up the single HTML boilerplate with Three.js.
* [ ] Create a basic "Box" room with OrbitControls.
* [ ] Implement draggable 3D markers for Source and Listener.
* [ ] Create a unit test framework that can be run by npm.

### Phase 2: Ray Tracing & Physics
* [ ] Implement the audio engine in a compiled language compatible with WASM+SIMD.
* [ ] Provide intermediate outputs like pressure grids and ray clouds to see what the engine is doing.
* [ ] Validate against Bell Labs Box (simple rectangular room with known analytical solutions) and PTB Studio (more complex geometry).

### Phase 3: The Vision Bridge
* [ ] Integrate Gemini API to accept a photo.
* [ ] Develop the "Material Dictionary" mapping visual labels (brick, carpet, glass) to acoustic coefficients.
* [ ] Implement dynamic `BufferGeometry` generation from AI-provided JSON.

### Phase 4: Audio & Export
* [ ] Implement the Web Audio graph (Upload → Convolver → Output).
* [ ] Build the IR Waveform visualizer.
* [ ] Add the `.wav` encoder for the final export functionality.

### Phase 5: Polish & Niche Features
* [ ] Add "Presets" (e.g., "Brooklyn Basement," "Tiled Bathroom").
* [ ] Geometry upload from Sketchup or whatever.
