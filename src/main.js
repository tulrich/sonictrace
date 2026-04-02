/**
 * @fileoverview Main entry point for SonicTrace.
 * Handles UI, 3D scene setup, and marker controls.
 * @license Apache-2.0
 */

import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';
import {AudioEngine} from './audio_engine.js';

/**
 * SonicTrace Application class.
 */
export class SonicTraceApp {
  /**
   * Initializes the application.
   */
  constructor() {
    this.audioEngine = new AudioEngine();
    this.autoUpdate = false;
    this.playInterval = null;
    this.irDirty = true;
    this.container = document.getElementById('canvas-container');
    if (!this.container) {
      // In tests, we might not have the container initially.
      this.container = document.createElement('div');
      this.container.id = 'canvas-container';
      document.body.appendChild(this.container);
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    this.camera = new THREE.PerspectiveCamera(
        75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(5, 5, 5);

    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.setupRoom();
    this.setupMarkers();
    this.setupControls();
    this.setupUI();

    window.addEventListener('resize', () => this.onWindowResize(), false);
    this.animate();
  }

  /**
   * Sets up lights in the scene.
   */
  setupLights() {
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 100);
    pointLight.position.set(2, 4, 2);
    this.scene.add(pointLight);
  }

  /**
   * Sets up the initial box room geometry.
   */
  setupRoom() {
    const geometry = new THREE.BoxGeometry(5, 3, 4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x444444,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.1,
    });
    this.room = new THREE.Mesh(geometry, material);
    this.scene.add(this.room);

    // Add a cleaner wireframe using EdgesGeometry
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({color: 0x888888});
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    this.room.add(wireframe);

    // Add a grid for ground reference, slightly offset to avoid z-fighting
    const grid = new THREE.GridHelper(10, 10, 0x333333, 0x222222);
    grid.position.y = -1.501;
    this.scene.add(grid);
  }

  /**
   * Sets up markers for Sound Source and Listener.
   */
  setupMarkers() {
    // Source Marker (Red Sphere)
    const sourceGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const sourceMat = new THREE.MeshStandardMaterial({color: 0xff0000});
    this.source = new THREE.Mesh(sourceGeo, sourceMat);
    this.source.position.set(-2, 0, 0);
    this.source.name = 'Source';
    this.scene.add(this.source);

    // Listener Marker (Blue Sphere)
    const listenerGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const listenerMat = new THREE.MeshStandardMaterial({color: 0x0000ff});
    this.listener = new THREE.Mesh(listenerGeo, listenerMat);
    this.listener.position.set(2, 0, 0);
    this.listener.name = 'Listener';
    this.scene.add(this.listener);
  }

  /**
   * Sets up camera and interaction controls.
   */
  setupControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.2;

    this.transformControls = new TransformControls(
        this.camera, this.renderer.domElement);
    this.scene.add(this.transformControls);

    // Stop orbit controls when interacting with markers
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value;
    });

    // Raycaster for selecting markers
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObjects([this.source, this.listener]);

      if (intersects.length > 0) {
        this.transformControls.attach(intersects[0].object);
      } else {
        // Only detach if we're not clicking on the gizmo itself
        // Note: transformControls has its own internal logic,
        // but this simple check helps.
      }
    };

    this.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  }

  /**
   * Sets up UI event listeners for buttons and controls.
   */
  setupUI() {
    const computeBtn = document.getElementById('compute-ir');
    const playBtn = document.getElementById('play-ir');
    const receiverType = document.getElementById('receiver-type');
    const autoUpdateToggle = document.getElementById('auto-update');

    if (computeBtn) {
      computeBtn.addEventListener('click', async () => {
        await this.performCompute();
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.audioEngine.playIR();
      });
    }

    if (receiverType) {
      receiverType.addEventListener('change', (e) => {
        console.log('Receiver type changed:', e.target.value);
        this.markDirty();
        if (this.autoUpdate) {
          this.performCompute();
        }
      });
    }

    if (autoUpdateToggle) {
      autoUpdateToggle.addEventListener('change', (e) => {
        this.updateAutoUpdate(e.target.checked);
      });
    }

    this.transformControls.addEventListener('change', () => {
      this.markDirty();
    });

    this.transformControls.addEventListener('dragging-changed', (event) => {
      if (!event.value) {
        console.log('Marker moved, ready to recompute IR');
        if (this.autoUpdate) {
          this.performCompute();
        }
      }
    });

    this.updateComputeButtonStyle();
  }

  /**
   * Marks the IR as dirty (out of date with parameters).
   */
  markDirty() {
    if (!this.irDirty) {
      this.irDirty = true;
      this.updateComputeButtonStyle();
    }
  }

  /**
   * Updates the "Compute IR" button style based on the dirty state.
   */
  updateComputeButtonStyle() {
    const computeBtn = document.getElementById('compute-ir');
    if (!computeBtn) return;

    if (this.irDirty) {
      computeBtn.classList.remove('bg-neutral-700', 'hover:bg-neutral-600');
      computeBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    } else {
      computeBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
      computeBtn.classList.add('bg-neutral-700', 'hover:bg-neutral-600');
    }
  }

  /**
   * Performs the IR computation and updates UI.
   */
  async performCompute() {
    const computeBtn = document.getElementById('compute-ir');
    const originalText = computeBtn ? computeBtn.textContent : 'Compute IR';
    
    if (computeBtn) {
      computeBtn.disabled = true;
      computeBtn.textContent = 'Computing...';
    }

    // Pass the room mesh and markers to the audio engine
    await this.audioEngine.computeIR(this.room, this.source.position, this.listener.position);
    
    this.irDirty = false;
    this.updateComputeButtonStyle();
    this.updateWaveform();

    if (computeBtn) {
      computeBtn.disabled = false;
      computeBtn.textContent = originalText;
    }
  }

  /**
   * Updates the waveform visualization.
   */
  updateWaveform() {
    const container = document.getElementById('waveform-container');
    const canvas = document.getElementById('waveform-canvas');
    if (container && canvas) {
      container.classList.remove('hidden');
      // Set canvas internal resolution to match display size
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      this.audioEngine.drawWaveform(canvas);
    }
  }

  /**
   * Updates the auto-update state and manages the playback interval.
   * @param {boolean} enabled - Whether auto-update is enabled.
   */
  async updateAutoUpdate(enabled) {
    this.autoUpdate = enabled;
    if (enabled) {
      console.log('Auto-Update enabled: playing IR every 1s');
      if (this.irDirty) {
        await this.performCompute();
      }
      
      // Start interval
      if (this.playInterval) clearInterval(this.playInterval);
      this.playInterval = setInterval(() => {
        this.audioEngine.playIR();
      }, 1000);
      
      // Also play immediately
      this.audioEngine.playIR();
    } else {
      console.log('Auto-Update disabled');
      if (this.playInterval) {
        clearInterval(this.playInterval);
        this.playInterval = null;
      }
    }
  }

  /**
   * Updates renderer and camera on window resize.
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateWaveform(); // redraw waveform on resize
  }

  /**
   * Main animation loop.
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate application.
window.addEventListener('DOMContentLoaded', () => {
  new SonicTraceApp();
});
