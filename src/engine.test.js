/**
 * @fileoverview Unit tests for the WASM engine using Vitest.
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import createEngine from '../public/engine.js';

describe('WASM Engine', () => {
  it('should initialize and run simulation steps', async () => {
    const module = await createEngine();
    
    // nx, ny, nz, dx
    const nx = 20, ny = 20, nz = 20;
    const dx = 0.1;
    const solver = new module.FdtdSolver(nx, ny, nz, dx);
    expect(solver).toBeDefined();
    
    // Set material 1 to be highly absorbent (anechoic-ish)
    // For a simple frequency-independent absorbent boundary, 
    // we can use a small b0 and zero other coefficients.
    solver.setMaterial(1, {
      b0: 0.1, b1: 0.0, b2: 0.0,
      a1: 0.0, a2: 0.0
    });

    // Add boundaries at the edges
    for (let z = 0; z < nz; ++z) {
      for (let y = 0; y < ny; ++y) {
        for (let x = 0; x < nx; ++x) {
          if (x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1) {
            solver.addBoundary(x, y, z, 1);
          }
        }
      }
    }

    solver.setPressure(10, 10, 10, 1.0);
    
    // Step 0: Center pressure = 0.000000
    solver.step();
    const p0 = solver.getPressure(10, 10, 10);
    expect(p0).toBeCloseTo(0.0, 5);
    
    // Step 1: Center pressure = -0.333333
    solver.step();
    const p1 = solver.getPressure(10, 10, 10);
    expect(p1).toBeCloseTo(-0.333333, 5);
    
    // Step 2: Center pressure = -0.000000
    solver.step();
    const p2 = solver.getPressure(10, 10, 10);
    expect(p2).toBeCloseTo(0.0, 5);
    
    // Cleanup
    solver.delete();
  });

  it('should run a full simulation and return a vector', async () => {
    const module = await createEngine();
    const solver = new module.FdtdSolver(20, 20, 20, 0.1);
    
    solver.setMaterial(1, {
      b0: 0.01, b1: 0.0, b2: 0.0,
      a1: 0.0, a2: 0.0
    });

    const recording = solver.runSimulation(10, 10, 10, 10, 10, 10, 10, 1.0);
    expect(recording.size()).toBe(10);
    
    // First few values should match the step-by-step test
    // Note: runSimulation calls Step() inside the loop
    expect(recording.get(0)).toBeCloseTo(0.0, 5); // After Step 1
    expect(recording.get(1)).toBeCloseTo(-0.333333, 5); // After Step 2
    
    recording.delete();
    solver.delete();
  });
});
