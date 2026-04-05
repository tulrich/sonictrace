/**
 * @fileoverview Web Worker for running the FDTD solver off the main thread.
 * @license Apache-2.0
 */

import createEngine from '../public/engine.js';

let wasmModule = null;
let solver = null;

/**
 * Initializes the WASM module if not already initialized.
 */
async function init() {
  if (!wasmModule) {
    wasmModule = await createEngine();
  }
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    await init();
    self.postMessage({ type: 'initialized' });
  } else if (type === 'compute') {
    await init();
    const { nx, ny, nz, dx, materials, sourceVoxel, listenerVoxel, numSteps } = data;

    if (solver) solver.delete();
    solver = new wasmModule.FdtdSolver(nx, ny, nz, dx);

    // Set Materials
    for (const [id, params] of Object.entries(materials)) {
      solver.setMaterial(Number(id), params);
    }

    // Setup boundaries (simple box for now, matching audio_engine.js)
    for (let z = 1; z < nz - 1; ++z) {
      for (let y = 1; y < ny - 1; ++y) {
        for (let x = 1; x < nx - 1; ++x) {
          if (x === 1 || x === nx - 2 || y === 1 || y === ny - 2 || z === 1 || z === nz - 2) {
            solver.addBoundary(x, y, z, 2); // Material ID 2 is more reflective
          }
        }
      }
    }

    const recording = solver.runSimulation(
      listenerVoxel.x, listenerVoxel.y, listenerVoxel.z,
      sourceVoxel.x, sourceVoxel.y, sourceVoxel.z,
      numSteps, 1.0
    );

    // Convert Emscripten vector to a standard Float32Array to transfer
    const result = new Float32Array(recording.size());
    for (let i = 0; i < recording.size(); i++) {
      result[i] = recording.get(i);
    }

    recording.delete();

    self.postMessage({ type: 'completed', result }, [result.buffer]);
  }
};
