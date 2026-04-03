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

    // Determine grid dimensions based on room bounding box
    const bbox = new THREE.Box3().setFromObject(roomMesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const nx = Math.ceil(size.x / this.dx) + 2;
    const ny = Math.ceil(size.y / this.dx) + 2;
    const nz = Math.ceil(size.z / this.dx) + 2;

    console.log(`Grid dimensions: ${nx}x${ny}x${nz}, dx=${this.dx}`);

    // Initialize Solver
    if (this.solver) this.solver.delete();
    this.solver = new this.wasmModule.FdtdSolver(nx, ny, nz, this.dx);

    // Setup boundaries for a simple box room
    this.setupBoxBoundaries(nx, ny, nz);

    // Set Materials

    // Nearly anechoic.
    this.solver.setMaterial(1, {
      b0: 0.3333, b1: 1.0, b2: 0.0,
      a1: 0.3333, a2: 0.0
    });
    // Somewhat more reflective. TODO: helper functions to compute these params.
    this.solver.setMaterial(2, {
      b0: 0.2000, b1: 0.1, b2: 0.0,
      a1: 0.2000, a2: 0.0
    });

    // 5. Run Simulation
    const sVoxel = this.getVoxelCoords(sourcePos, bbox, nx, ny, nz);
    const lVoxel = this.getVoxelCoords(listenerPos, bbox, nx, ny, nz);

    console.log(`Source Voxel: ${sVoxel.x}, ${sVoxel.y}, ${sVoxel.z}`);
    console.log(`Listener Voxel: ${lVoxel.x}, ${lVoxel.y}, ${lVoxel.z}`);
    const voxelDist = Math.sqrt(
      Math.pow(sVoxel.x - lVoxel.x, 2) + 
      Math.pow(sVoxel.y - lVoxel.y, 2) + 
      Math.pow(sVoxel.z - lVoxel.z, 2)
    );
    console.log(`Voxel Distance: ${voxelDist.toFixed(2)}`);

    // dt = dx / (c * sqrt(3))
    const dt = this.dx / (this.c * Math.sqrt(3.0));
    const simSampleRate = 1.0 / dt;
    const numSteps = Math.floor(durationSeconds * simSampleRate);
    const expectedDelay = Math.floor(voxelDist / (this.c * dt / this.dx)); // Simplistic estimate
    console.log(`Expected arrival around sample: ${expectedDelay}`);

    console.log(`Simulation sample rate: ${simSampleRate.toFixed(1)} Hz`);
    console.log(`Running simulation for ${numSteps} steps...`);

    const recording = this.solver.runSimulation(
      lVoxel.x, lVoxel.y, lVoxel.z,
      sVoxel.x, sVoxel.y, sVoxel.z,
      numSteps, 1.0
    );

    // Diagnostic check on recording
    let firstArrival = -1;
    for (let i = 0; i < Math.min(recording.size(), 500); i++) {
      if (Math.abs(recording.get(i)) > 0.0001) {
        firstArrival = i;
        break;
      }
    }
    console.log(`Actual first arrival (threshold 0.0001): sample ${firstArrival}`);

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
   * Applying boundaries to the layer just inside the grid edge
   * because the bulk solver skips the actual edge voxels.
   */
  setupBoxBoundaries(nx, ny, nz) {
    for (let z = 1; z < nz - 1; ++z) {
      for (let y = 1; y < ny - 1; ++y) {
        for (let x = 1; x < nx - 1; ++x) {
          if (x === 1 || x === nx - 2 || y === 1 || y === ny - 2 || z === 1 || z === nz - 2) {
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

    // Find absolute peak for normalization
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > peak) peak = absVal;
    }
    
    // Normalization factor (avoid division by zero)
    const scale = peak > 0.0001 ? 1.0 / peak : 1.0;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#3b82f6'; // blue-500
    ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 0;
      let max = 0;
      let found = false;

      for (let j = 0; j < step; j++) {
        const idx = (i * step) + j;
        if (idx >= data.length) break;
        
        const datum = data[idx] * scale;
        if (!found) {
          min = max = datum;
          found = true;
        } else {
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      
      if (!found) break;

      // Draw a vertical line for this pixel
      ctx.beginPath();
      ctx.moveTo(i, (1 - min) * amp);
      ctx.lineTo(i, (1 - max) * amp);
      ctx.stroke();
    }
  }
}
