/**
 * @fileoverview Simple Node.js test for the WASM engine.
 */

import createEngine from '../public/engine.js';

async function test() {
  console.log('Initializing WASM engine...');
  const module = await createEngine();
  
  console.log('Creating FdtdSolver instance...');
  // nx, ny, nz, dx
  const solver = new module.FdtdSolver(20, 20, 20, 0.1);
  
  console.log('Running 5 simulation steps...');
  solver.setPressure(10, 10, 10, 1.0);
  
  for (let i = 0; i < 5; i++) {
    solver.step();
    const p = solver.getPressure(10, 10, 10);
    console.log(`Step ${i}: Center pressure = ${p.toFixed(6)}`);
  }
  
  console.log('Test successful!');
  
  // Cleanup
  solver.delete();
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
