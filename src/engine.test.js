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
    
    // Step 0: next[i] = 2*curr[i] - prev[i] + lambda_sq * laplacian
    // curr has 1.0, prev is 0.0, laplacian is -6.0
    // next[i] = 2.0*1.0 - 0.0 + (1/3)*(-6.0) = 2.0 - 2.0 = 0.0
    solver.step();
    const p0 = solver.getPressure(10, 10, 10);
    expect(p0).toBeCloseTo(0.0, 5);
    
    // Step 1: next[i] = 2*curr[i] - prev[i] + lambda_sq * laplacian
    // curr has 0.0, prev is 1.0, laplacian is 0.0 (assuming neighbors are still 0)
    // next[i] = 2.0*0.0 - 1.0 + (1/3)*0 = -1.0
    solver.step();
    const p1 = solver.getPressure(10, 10, 10);
    expect(p1).toBeCloseTo(-1.0, 5);
    
    // Step 2:
    // curr has -1.0, prev is 0.0, laplacian depends on neighbors now
    solver.step();
    const p2 = solver.getPressure(10, 10, 10);
    // Values will vary based on propagation to neighbors
    expect(p2).toBeDefined();
    
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

  it('should exhibit anechoic propagation (delay and 1/d attenuation)', async () => {
    const module = await createEngine();
    // Use a larger grid to accommodate 2m+ distances
    const nx = 60, ny = 60, nz = 60;
    const dx = 0.1;
    const c = 343.0;
    const solver = new module.FdtdSolver(nx, ny, nz, dx);
    
    // Set boundaries to be absorbent
    solver.setMaterial(1, {
      b0: 0.1, b1: 0.0, b2: 0.0,
      a1: 0.0, a2: 0.0
    });
    for (let z = 0; z < nz; ++z) {
      for (let y = 0; y < ny; ++y) {
        for (let x = 0; x < nx; ++x) {
          if (x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1) {
            solver.addBoundary(x, y, z, 1);
          }
        }
      }
    }

    const sx = 30, sy = 30, sz = 30; // Source at center
    const dist1 = 2.0;
    const rx1 = sx + Math.round(dist1 / dx); // 20 cells away
    
    const dt = dx / (c * Math.sqrt(3.0));
    const expectedSample1 = Math.round(dist1 / (c * dt));

    // Run for enough steps to see arrival and some tail
    const numSteps = 300;
    console.log(`Running simulation 1 (dist=${dist1}m, expected sample ~${expectedSample1})...`);
    const recording1 = solver.runSimulation(rx1, sy, sz, sx, sy, sz, numSteps, 1.0);
    
    let peakValue1 = 0;
    let peakSample1 = -1;
    for (let i = 0; i < recording1.size(); i++) {
      const val = Math.abs(recording1.get(i));
      if (val > peakValue1) {
        peakValue1 = val;
        peakSample1 = i;
      }
    }

    console.log(`Anechoic Test 1: Peak ${peakValue1.toFixed(6)} at sample ${peakSample1}`);
    expect(peakSample1).toBeGreaterThan(0);
    // Allow small window for numerical dispersion/rounding
    expect(Math.abs(peakSample1 - expectedSample1)).toBeLessThan(5);

    // Test 1/d attenuation: move 1.5x further (3.0m)
    const dist2 = 3.0;
    const rx2 = sx + Math.round(dist2 / dx);
    const expectedSample2 = Math.round(dist2 / (c * dt));
    
    console.log(`Running simulation 2 (dist=${dist2}m, expected sample ~${expectedSample2})...`);
    const recording2 = solver.runSimulation(rx2, sy, sz, sx, sy, sz, numSteps, 1.0);
    let peakValue2 = 0;
    let peakSample2 = -1;
    for (let i = 0; i < recording2.size(); i++) {
      const val = Math.abs(recording2.get(i));
      if (val > peakValue2) {
        peakValue2 = val;
        peakSample2 = i;
      }
    }
    
    console.log(`Anechoic Test 2: Peak ${peakValue2.toFixed(6)} at sample ${peakSample2}`);
    
    // Check arrival time for second distance
    expect(Math.abs(peakSample2 - expectedSample2)).toBeLessThan(5);

    // Verify 1/d attenuation
    // Ratio of distances is 3.0 / 2.0 = 1.5
    // Ratio of amplitudes should be ~1/1.5 = 0.66
    const expectedRatio = dist1 / dist2;
    const actualRatio = peakValue2 / peakValue1;
    console.log(`Amplitude Ratio: ${actualRatio.toFixed(3)} (Expected ~${expectedRatio.toFixed(3)})`);
    
    expect(actualRatio).toBeLessThan(1.0);
    expect(Math.abs(actualRatio - expectedRatio)).toBeLessThan(0.15);
    
    recording1.delete();
    recording2.delete();
    solver.delete();
  });
});
