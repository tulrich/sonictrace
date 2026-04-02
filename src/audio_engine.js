/**
 * @fileoverview Manages the Web Audio API and WASM engine integration.
 * @license Apache-2.0
 */

import createEngine from '../public/engine.js';

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
      
      // Initial stub solver (20x20x20, 0.1m dx)
      this.solver = new this.wasmModule.FdtdSolver(20, 20, 20, 0.1);
      
      this.initialized = true;
      this.initializing = null;
      console.log('AudioEngine initialized');
    })();

    return this.initializing;
  }

  /**
   * Computes a new Impulse Response based on current parameters.
   * For now, this is a stub that returns a unit impulse.
   * @param {number} durationSeconds - Length of the IR to generate.
   */
  async computeIR(durationSeconds = 1.0) {
    await this.init();

    const sampleRate = this.audioCtx.sampleRate;
    const length = Math.floor(sampleRate * durationSeconds);
    const buffer = this.audioCtx.createBuffer(1, length, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Stub: Unit impulse at the start
    channelData[0] = 1.0;

    this.impulseResponseBuffer = buffer;
    console.log('IR computed (stub unit impulse)');
    return buffer;
  }

  /**
   * Plays the current impulse response.
   */
  async playIR() {
    await this.init();

    if (!this.impulseResponseBuffer) {
      await this.computeIR();
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
