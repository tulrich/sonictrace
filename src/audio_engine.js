/**
 * @fileoverview Manages the Web Audio API and WASM engine integration.
 * @license Apache-2.0
 */

import createEngine from '../public/engine.js';
import * as THREE from 'three';

/**
 * Handles audio processing and IR generation.
 */
export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.wasmModule = null;
    this.solver = null;
    this.impulseResponseBuffer = null;
    this.initialized = false;
    this.initializing = null;
    
    // Simulation parameters
    this.dx = 0.07; // ~7cm voxels for ~500Hz limit
    this.c = 343.0;
  }

  /**
   * Initializes the AudioContext and WASM module.
   */
  async init() {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      console.log('Initializing AudioEngine...');
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.wasmModule = await createEngine();
      this.initialized = true;
      this.initializing = null;
      console.log('AudioEngine initialized');
    })();

    return this.initializing;
  }

  /**
   * Computes a new Impulse Response based on current room geometry and markers.
   * @param {THREE.Mesh} roomMesh - The mesh representing the room.
   * @param {THREE.Vector3} sourcePos - Position of the source.
   * @param {THREE.Vector3} listenerPos - Position of the listener.
   * @param {number} durationSeconds - Length of the IR to generate.
   */
  async computeIR(roomMesh, sourcePos, listenerPos, durationSeconds = 0.5) {
    await this.init();

    // 1. Determine grid dimensions based on room bounding box
    const bbox = new THREE.Box3().setFromObject(roomMesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const nx = Math.ceil(size.x / this.dx) + 2;
    const ny = Math.ceil(size.y / this.dx) + 2;
    const nz = Math.ceil(size.z / this.dx) + 2;

    console.log(`Grid dimensions: ${nx}x${ny}x${nz}, dx=${this.dx}`);

    // 2. Initialize Solver
    if (this.solver) this.solver.delete();
    this.solver = new this.wasmModule.FdtdSolver(nx, ny, nz, this.dx);

    // 3. Setup boundaries for a simple box room
    this.setupBoxBoundaries(nx, ny, nz);

    // 4. Set Material (Hardcoded placeholder for now)
    // Models a slightly absorbent wall
    this.solver.setMaterial(1, {
      b0: 0.01, b1: 0.0, b2: 0.0,
      a1: 0.0, a2: 0.0
    });

    // 5. Run Simulation
    const sVoxel = this.getVoxelCoords(sourcePos, bbox, nx, ny, nz);
    const lVoxel = this.getVoxelCoords(listenerPos, bbox, nx, ny, nz);

    // dt = dx / (c * sqrt(3))
    const dt = this.dx / (this.c * Math.sqrt(3.0));
    const simSampleRate = 1.0 / dt;
    const numSteps = Math.floor(durationSeconds * simSampleRate);
    
    console.log(`Simulation sample rate: ${simSampleRate.toFixed(1)} Hz`);
    console.log(`Running simulation for ${numSteps} steps...`);
    
    const recording = this.solver.runSimulation(
      lVoxel.x, lVoxel.y, lVoxel.z,
      sVoxel.x, sVoxel.y, sVoxel.z,
      numSteps, 1.0
    );

    // 6. Convert to AudioBuffer
    const buffer = this.audioCtx.createBuffer(1, recording.size(), simSampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < recording.size(); i++) {
      channelData[i] = recording.get(i);
    }
    
    // Cleanup Emscripten vector
    recording.delete();

    this.impulseResponseBuffer = buffer;
    console.log('IR computed using FDTD solver');
    return buffer;
  }

  /**
   * Temporary helper to setup boundaries for a box.
   */
  setupBoxBoundaries(nx, ny, nz) {
    for (let z = 0; z < nz; ++z) {
      for (let y = 0; y < ny; ++y) {
        for (let x = 0; x < nx; ++x) {
          if (x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1) {
            this.solver.addBoundary(x, y, z, 1);
          }
        }
      }
    }
  }

  /**
   * Maps world coordinates to voxel grid coordinates.
   */
  getVoxelCoords(pos, bbox, nx, ny, nz) {
    const relX = pos.x - bbox.min.x;
    const relY = pos.y - bbox.min.y;
    const relZ = pos.z - bbox.min.z;

    return {
      x: Math.max(1, Math.min(nx - 2, Math.floor(relX / this.dx) + 1)),
      y: Math.max(1, Math.min(ny - 2, Math.floor(relY / this.dx) + 1)),
      z: Math.max(1, Math.min(nz - 2, Math.floor(relZ / this.dx) + 1))
    };
  }

  /**
   * Plays the current impulse response.
   */
  async playIR() {
    await this.init();

    if (!this.impulseResponseBuffer) {
      return;
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.impulseResponseBuffer;
    source.connect(this.audioCtx.destination);
    source.start();
  }

  /**
   * Draws the current impulse response waveform onto a canvas.
   * @param {HTMLCanvasElement} canvas - The canvas to draw on.
   */
  drawWaveform(canvas) {
    if (!this.impulseResponseBuffer) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const data = this.impulseResponseBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.strokeStyle = '#3b82f6'; // blue-500
    ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 - min) * amp);
      ctx.lineTo(i, (1 - max) * amp);
    }

    ctx.stroke();
  }
}
