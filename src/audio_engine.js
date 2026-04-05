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
    this.worker = null;
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
      
      // Only initialize worker in a browser environment
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      } else {
        // Fallback for Node.js/tests
        this.wasmModule = await createEngine();
      }

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

    const sVoxel = this.getVoxelCoords(sourcePos, bbox, nx, ny, nz);
    const lVoxel = this.getVoxelCoords(listenerPos, bbox, nx, ny, nz);

    // dt = dx / (c * sqrt(3))
    const dt = this.dx / (this.c * Math.sqrt(3.0));
    const fs = 1.0 / dt;
    const numSteps = Math.floor(durationSeconds * fs);

    // Materials
    const materials = {
      1: this.absorptionProfileToIirParams({
        125: 0.99, 250: 0.99, 500: 0.99, 1000: 0.99, 2000: 0.99, 4000: 0.99
      }),
      2: this.absorptionProfileToIirParams({
        31: 0.05, 62: 0.20, 125: 0.40, 250: 0.50, 500: 0.60, 1000: 0.70, 2000: 0.80, 4000: 0.85
      })
    };

    let resultData;

    if (this.worker) {
      resultData = await new Promise((resolve) => {
        this.worker.onmessage = (e) => {
          if (e.data.type === 'completed') resolve(e.data.result);
        };
        this.worker.postMessage({
          type: 'compute',
          data: {
            nx, ny, nz, dx: this.dx,
            materials,
            sourceVoxel: sVoxel,
            listenerVoxel: lVoxel,
            numSteps
          }
        });
      });
    } else {
      // Direct call for tests
      if (this.solver) this.solver.delete();
      this.solver = new this.wasmModule.FdtdSolver(nx, ny, nz, this.dx);
      for (const [id, params] of Object.entries(materials)) {
        this.solver.setMaterial(Number(id), params);
      }
      this.setupBoxBoundaries(nx, ny, nz);
      
      const recording = this.solver.runSimulation(
        lVoxel.x, lVoxel.y, lVoxel.z,
        sVoxel.x, sVoxel.y, sVoxel.z,
        numSteps, 1.0
      );
      
      resultData = new Float32Array(recording.size());
      for (let i = 0; i < recording.size(); i++) {
        resultData[i] = recording.get(i);
      }
      recording.delete();
    }

    // 6. Convert to AudioBuffer
    const buffer = this.audioCtx.createBuffer(1, resultData.length, fs);
    const channelData = buffer.getChannelData(0);
    channelData.set(resultData);
    
    this.impulseResponseBuffer = buffer;
    console.log('IR computed (Worker:', !!this.worker, ')');
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
            this.solver.addBoundary(x, y, z, 2);
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
   * Creates material IIR parameters from an absorption profile.
   * @param {Object<number, number>} absorption - Octave-band absorption coefficients (freq -> alpha).
   * @return {Object} MaterialParams
   */
  absorptionProfileToIirParams(absorption) {
    const pairs = Object.entries(absorption)
      .map(([f, alpha]) => [Number(f), alpha])
      .sort((a, b) => a[0] - b[0]);

    // dt = dx / (c * sqrt(3))
    const dt = this.dx / (this.c * Math.sqrt(3.0));
    const fs = 1.0 / dt;

    const coeffs = this.fitBoundaryIir(pairs, fs);

    const result = {
      "b0": coeffs.b[0], "b1": coeffs.b[1], "b2": coeffs.b[2],
      "a1": coeffs.a[1], "a2": coeffs.a[2]
    };
    console.log('Computed IIR params:', result);
    return result;
  }

  /**
   * Fits a 2nd-order IIR to octave-band reflection coefficients.
   * @param {Array<[number, number]>} pairs - Pairs of [freq, alpha]
   * @param {number} fs - FDTD sampling rate
   */
  fitBoundaryIir(pairs, fs) {
    // Target admittance for reflection R is Y = (1-R)/(1+R).
    const Y_scale = 1.0;

    const data = pairs
      .filter(p => p[0] <= fs / 2) // Nyquist limit
      .map(p => {
        const r = Math.sqrt(Math.max(0, 1 - p[1]));
        const yMag = Y_scale * (1 - r) / (1 + r);
        return [p[0], yMag];
      });

    // Add DC anchor if not present
    if (data.length > 0 && !data.find(p => p[0] === 0)) {
      data.unshift([0, data[0][1]]);
    }

    if (data.length === 0) {
      return { b: [0.01, 0, 0], a: [1.0, 0, 0] };
    }

    const rows = [];
    data.forEach(([f, targetYMag]) => {
      const omega = (2 * Math.PI * f) / fs;
      
      // Target uses a 1st-order all-pass structure that provides 0.5-sample delay at DC.
      // This is exactly what the user's "good" parameters do and is much more stable
      // for the FDTD solver than a pure z^-0.5 delay at high frequencies.
      const z1 = { re: Math.cos(-omega), im: Math.sin(-omega) };
      const num = { re: 1/3 + z1.re, im: z1.im };
      const den = { re: 1 + 1/3 * z1.re, im: 1/3 * z1.im };
      const denMagSq = den.re * den.re + den.im * den.im;
      
      const targetYRe = targetYMag * (num.re * den.re + num.im * den.im) / denMagSq;
      const targetYIm = targetYMag * (num.im * den.re - num.re * den.im) / denMagSq;
      
      const cos1 = Math.cos(omega);
      const cos2 = Math.cos(2 * omega);
      const sin1 = Math.sin(omega);
      const sin2 = Math.sin(2 * omega);

      // Model: B(z) = Y(z) * A(z)
      // (b0 + b1*z^-1 + b2*z^-2) = (Yre + jYim) * (1 + a1*z^-1 + a2*z^-2)
      
      // Real part: b0 + b1*cos1 + b2*cos2 - a1*(Yre*cos1 + Yim*sin1) - a2*(Yre*cos2 + Yim*sin2) = Yre
      rows.push([
        1, cos1, cos2,
        -(targetYRe * cos1 + targetYIm * sin1),
        -(targetYRe * cos2 + targetYIm * sin2),
        targetYRe
      ]);
      
      // Imaginary part: -b1*sin1 - b2*sin2 - a1*(Yim*cos1 - Yre*sin1) - a2*(Yim*cos2 - Yre*sin2) = Yim
      rows.push([
        0, -sin1, -sin2,
        -(targetYIm * cos1 - targetYRe * sin1),
        -(targetYIm * cos2 - targetYRe * sin2),
        targetYIm
      ]);
    });

    const x = this.solveLeastSquares(rows);

    // x = [b0, b1, b2, a1, a2]
    let b = [x[0], x[1], x[2]];
    let a = [1.0, x[3], x[4]];

    // Basic stability check for the denominator: 1 + a1*z^-1 + a2*z^-2
    const a1 = a[1];
    const a2 = a[2];
    // Relaxed stability for low frequencies, but keep away from unit circle
    const isUnstable = isNaN(a1) || isNaN(a2) || Math.abs(a2) >= 0.98 || Math.abs(a1) >= 1 + a2 - 0.001;

    if (isUnstable) {
      console.warn('IIR fit unstable, falling back to 0th order constant absorption.');
      const avgY = data.reduce((sum, p) => sum + p[1], 0) / data.length;
      b = [avgY, 0, 0];
      a = [1.0, 0, 0];
    }

    return { b, a };
  }

  /**
   * Solves M*x = Y using Normal Equations and Gaussian Elimination.
   * @param {Array<Array<number>>} rows - Matrix rows [M | Y]
   * @return {Array<number>} solution vector x
   */
  solveLeastSquares(rows) {
    const n = rows[0].length - 1; // Number of variables (5)

    // Construct Normal Equations: (M^T * M) * x = M^T * Y
    const A = Array.from({ length: n }, () => new Float64Array(n + 1));
    for (const row of rows) {
      const Y = row[n];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          A[i][j] += row[i] * row[j];
        }
        A[i][n] += row[i] * Y;
      }
    }

    // Regularization to prevent singularity at low frequencies
    for (let i = 0; i < n; i++) {
      A[i][i] += 1e-5;
    }

    // Gaussian Elimination with partial pivoting
    for (let i = 0; i < n; i++) {
      let max = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[max][i])) max = k;
      }
      [A[i], A[max]] = [A[max], A[i]];

      const pivot = A[i][i];
      if (Math.abs(pivot) < 1e-15) continue;

      for (let k = i + 1; k < n; k++) {
        const factor = A[k][i] / pivot;
        for (let j = i; j <= n; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }

    // Back substitution
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = A[i][n];
      for (let j = i + 1; j < n; j++) {
        sum -= A[i][j] * x[j];
      }
      x[i] = sum / A[i][i];
    }

    return x;
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
