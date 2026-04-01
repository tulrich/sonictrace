/**
 * @fileoverview Main entry point for SonicTrace.
 * Handles UI, 3D scene setup, and marker controls.
 * @license Apache-2.0
 */

import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';

/**
 * SonicTrace Application class.
 */
export class SonicTraceApp {
  /**
   * Initializes the application.
   */
  constructor() {
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
    const geometry = new THREE.BoxGeometry(10, 5, 8);
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
    const grid = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    grid.position.y = -2.501;
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
   * Updates renderer and camera on window resize.
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
