/**
 * @fileoverview Unit tests for SonicTraceApp.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SonicTraceApp } from './main.js';

// Mock WebGLRenderer because jsdom doesn't support WebGL.
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      domElement: document.createElement('canvas'),
    })),
  };
});

// Mock OrbitControls and TransformControls
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    enableDamping: true,
    enabled: true,
    addEventListener: vi.fn(),
  })),
}));

vi.mock('three/examples/jsm/controls/TransformControls.js', () => ({
  TransformControls: vi.fn().mockImplementation(() => {
    const group = new THREE.Group();
    group.attach = vi.fn();
    group.detach = vi.fn();
    group.addEventListener = vi.fn();
    return group;
  }),
}));

describe('SonicTraceApp', () => {
  let app;

  beforeEach(() => {
    // Clear the body and add container
    document.body.innerHTML = '<div id="canvas-container"></div>';
    app = new SonicTraceApp();
  });

  it('should initialize the scene', () => {
    expect(app.scene).toBeInstanceOf(THREE.Scene);
  });

  it('should have a source and listener marker', () => {
    expect(app.source.name).toBe('Source');
    expect(app.listener.name).toBe('Listener');
  });

  it('should have a room mesh', () => {
    expect(app.room).toBeInstanceOf(THREE.Mesh);
  });
});
