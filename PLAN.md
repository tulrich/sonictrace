# PLAN.md: SonicTrace
**A Vision-to-Acoustics IR Generation Tool**

## 1. Project Overview
SonicTrace is a "serverless" single-file web
application that transforms photos of physical spaces into
high-fidelity Acoustic Impulse Responses (IR). By combining Computer
Vision for geometry reconstruction, BVH-accelerated ray tracing, and
Web Audio convolution, it allows musicians and engineers to virtually
"re-amp" audio through any room they can photograph.

## 2. Core Features
* **Vision-Driven Modeling:** Upload a photo (or generate one via AI) to automatically derive room dimensions and material properties.
* **3D Mesh Previewer:** A WebGL-based UI to inspect the reconstructed room, rotate the perspective, and toggle material "heatmaps."
* **Interactive Spatial UI:** Drag-and-drop handles for the Sound Source (e.g., a bass amp) and the Listener (e.g., a microphone).
* **High-Performance Ray Tracer:** A Wasm-powered engine calculating specular and diffuse reflections based on frequency-dependent absorption coefficients.
* **Real-time Re-amping:** A "Listen" mode that loops a user-uploaded audio clip through a real-time convolution engine using the generated IR.
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
  - No server. No user data leaves the browser, except at the initiative of the user (like for downloading an IR).

### B. The Geometry Pipeline (Vision → Mesh)
* **Orchestration:** Gemini 1.5 Pro (or similar VLM) accessed via client-side API calls.
* **Prompt Strategy:** Instruct the model to analyze the image and return a structured JSON representing vertices, indices, and material labels (e.g., "ceiling": "popcorn_plaster", "floor": "hardwood").
* **Mesh Generation:** Convert JSON output into a `THREE.BufferGeometry`.

### C. The Acoustic Engine (The "Brain")
* **Spatial Data Structure:** `three-mesh-bvh` to enable fast ray-casting against the geometry.
* **Tracer (WebAssembly):** A Rust or C++ core that:
    1.  Casts rays from the source.
    2.  Calculates energy loss per bounce (Frequency-dependent: $E_{new} = E_{old} \times (1 - \alpha)$).
    3.  Accounts for air absorption and distance attenuation.
    4.  Tracks propagation delay.
* **IR Synthesis:** Aggregating ray arrivals into a time-domain impulse response buffer.

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

### Phase 2: The Vision Bridge
* [ ] Integrate Gemini API to accept a photo.
* [ ] Develop the "Material Dictionary" mapping visual labels (brick, carpet, glass) to acoustic coefficients.
* [ ] Implement dynamic `BufferGeometry` generation from AI-provided JSON.

### Phase 3: Ray Tracing & Physics
* [ ] Integrate `three-mesh-bvh` for intersection testing.
* [ ] Port the core reflection logic to Wasm/Web Workers to prevent UI blocking.
* [ ] Generate a visual "Ray Cloud" to debug path calculations.

### Phase 4: Audio & Export
* [ ] Implement the Web Audio graph (Upload → Convolver → Output).
* [ ] Build the IR Waveform visualizer.
* [ ] Add the `.wav` encoder for the final export functionality.

### Phase 5: Polish & Niche Features
* [ ] Add "Presets" (e.g., "Brooklyn Basement," "Tiled Bathroom").
* [ ] Implement a simple low-pass "Diffraction Approximation" for bass frequencies.
