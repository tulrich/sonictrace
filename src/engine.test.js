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
    const solver = new module.FdtdSolver(20, 20, 20, 0.1);
    expect(solver).toBeDefined();
    
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
});
