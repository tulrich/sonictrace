/**
 * @fileoverview Web Worker for running the FDTD solver off the main thread.
 * @license Apache-2.0
 */

import loader from '@assemblyscript/loader';

let wasmModule = null;
let solver = null;

/**
 * Initializes the WASM module if not already initialized.
 */
async function init() {
  if (!wasmModule) {
    // Note: In a Vite environment, we can use ?url or just the path if it's in public/
    const response = await fetch('/engine.wasm');
    wasmModule = await loader.instantiate(response);
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

    // In AS loader, classes are available on the exports
    if (solver) {
      // If we had a way to explicitly free, we would. AS has GC.
      solver = null;
    }
    
    solver = new wasmModule.exports.FdtdSolver(nx, ny, nz, dx);

    // Set Materials
    for (const [id, params] of Object.entries(materials)) {
      // params = {b0, b1, b2, a1, a2}
      solver.setMaterial(
        Number(id),
        params.b0, params.b1, params.b2,
        params.a1, params.a2
      );
    }

    // Setup boundaries (simple box for now, matching audio_engine.js)
    // Note: We could move this logic to AS side or pass it in.
    for (let z = 1; z < nz - 1; ++z) {
      for (let y = 1; y < ny - 1; ++y) {
        for (let x = 1; x < nx - 1; ++x) {
          if (x === 1 || x === nx - 2 || y === 1 || y === ny - 2 || z === 1 || z === nz - 2) {
            solver.addBoundary(x, y, z, 2); // Material ID 2 is more reflective
          }
        }
      }
    }

    const recordingPtr = solver.runSimulation(
      listenerVoxel.x, listenerVoxel.y, listenerVoxel.z,
      sourceVoxel.x, sourceVoxel.y, sourceVoxel.z,
      numSteps, 1.0
    );

    // Use loader to get the Float32Array from the pointer
    const resultRaw = wasmModule.exports.__getFloat32Array(recordingPtr);
    // Copy the data so we can transfer the buffer and let WASM GC the original
    const result = new Float32Array(resultRaw);

    self.postMessage({ type: 'completed', result }, [result.buffer]);
  }
};
