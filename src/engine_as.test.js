/**
 * @fileoverview Tests for the AssemblyScript FDTD solver.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AudioEngine } from './audio_engine.js';
import * as THREE from 'three';

describe('AssemblyScript FDTD Solver', () => {
  let engine;

  beforeAll(async () => {
    engine = new AudioEngine();
    await engine.init();
  });

  it('should compute an IR using the solver directly', async () => {
    // Create a dummy room mesh
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial();
    const roomMesh = new THREE.Mesh(geometry, material);

    const sourcePos = new THREE.Vector3(0, 0, 0);
    const listenerPos = new THREE.Vector3(0.5, 0, 0);

    // This calls the solver directly in Node.js (via the fallback in init())
    const buffer = await engine.computeIR(roomMesh, sourcePos, listenerPos, 0.1);

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
    
    // Handle either AudioBuffer (browser) or Float32Array (Node/tests)
    const data = (typeof buffer.getChannelData === 'function') 
      ? buffer.getChannelData(0) 
      : buffer;
    
    // Check if there's any signal
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
    }
    
    console.log(`Peak impulse response value: ${peak}`);
    expect(peak).toBeGreaterThan(0);
  });
});
