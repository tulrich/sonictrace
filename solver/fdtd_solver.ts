/**
 * @fileoverview FDTD solver implementation in AssemblyScript.
 * @license Apache-2.0
 */

@inline
function Index(x: i32, y: i32, z: i32, nx: i32, ny: i32): i32 {
  return x + y * nx + z * nx * ny;
}

export class MaterialParams {
  b0: f32;
  b1: f32;
  b2: f32;
  a1: f32;
  a2: f32;
}

class BoundaryVoxel {
  index: i32;
  material_id: i32;
  s1: f32;
  s2: f32;
}

export class FdtdSolver {
  private nx: i32;
  private ny: i32;
  private nz: i32;
  private dx: f32;
  private dt: f32;
  private c: f32 = 343.0;

  private p_a: Float32Array;
  private p_b: Float32Array;
  private current: i32 = 0;

  private boundaries: Array<BoundaryVoxel> = new Array<BoundaryVoxel>();
  private materials: Array<MaterialParams> = new Array<MaterialParams>();

  constructor(nx: i32, ny: i32, nz: i32, dx: f32) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.dx = dx;
    this.dt = dx / (this.c * f32(Math.sqrt(3.0)));

    let size = nx * ny * nz;
    this.p_a = new Float32Array(size);
    this.p_b = new Float32Array(size);
  }

  public reset(): void {
    this.p_a.fill(0);
    this.p_b.fill(0);
    this.current = 0;
    for (let i = 0; i < this.boundaries.length; i++) {
      this.boundaries[i].s1 = 0;
      this.boundaries[i].s2 = 0;
    }
  }

  public addBoundary(x: i32, y: i32, z: i32, material_id: i32): void {
    if (x >= 0 && x < this.nx && y >= 0 && y < this.ny && z >= 0 && z < this.nz) {
      let b = new BoundaryVoxel();
      b.index = Index(x, y, z, this.nx, this.ny);
      b.material_id = material_id;
      b.s1 = 0;
      b.s2 = 0;
      this.boundaries.push(b);
    }
  }

  public setMaterial(material_id: i32, b0: f32, b1: f32, b2: f32, a1: f32, a2: f32): void {
    while (this.materials.length <= material_id) {
      this.materials.push(new MaterialParams());
    }
    let m = this.materials[material_id];
    m.b0 = b0; m.b1 = b1; m.b2 = b2;
    m.a1 = a1; m.a2 = a2;
  }

  public step(): void {
    const lambda = (this.c * this.dt / this.dx);
    const lambda_sq = lambda * lambda;

    const curr = this.current ? this.p_b : this.p_a;
    const next = this.current ? this.p_a : this.p_b;

    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;

    const dx_stride = 1;
    const dy_stride = nx;
    const dz_stride = nx * ny;

    const lambda_sq_v = f32x4.splat(lambda_sq);
    const two_v = f32x4.splat(2.0);
    const minus_six_v = f32x4.splat(-6.0);

    // 1. Bulk state update
    for (let z = 1; z < nz - 1; ++z) {
      for (let y = 1; y < ny - 1; ++y) {
        let x = 1;
        // Vector loop: process 4 voxels at once
        for (; x <= nx - 5; x += 4) {
          let i = Index(x, y, z, nx, ny);
          let offset = i << 2; // i * 4 bytes

          // Load current pressure and neighbors
          let p_curr = v128.load(curr.dataStart + offset);
          let p_dx_p = v128.load(curr.dataStart + offset + (dx_stride << 2));
          let p_dx_m = v128.load(curr.dataStart + offset - (dx_stride << 2));
          let p_dy_p = v128.load(curr.dataStart + offset + (dy_stride << 2));
          let p_dy_m = v128.load(curr.dataStart + offset - (dy_stride << 2));
          let p_dz_p = v128.load(curr.dataStart + offset + (dz_stride << 2));
          let p_dz_m = v128.load(curr.dataStart + offset - (dz_stride << 2));

          // Laplacian = (sum of neighbors) - 6 * p_curr
          let neighbors_sum = f32x4.add(
            f32x4.add(f32x4.add(p_dx_p, p_dx_m), f32x4.add(p_dy_p, p_dy_m)),
            f32x4.add(p_dz_p, p_dz_m)
          );
          let laplacian = f32x4.add(neighbors_sum, f32x4.mul(minus_six_v, p_curr));

          // next = 2 * p_curr - p_next + lambda_sq * laplacian
          let p_next = v128.load(next.dataStart + offset);
          let res = f32x4.add(
            f32x4.sub(f32x4.mul(two_v, p_curr), p_next),
            f32x4.mul(lambda_sq_v, laplacian)
          );

          v128.store(next.dataStart + offset, res);
        }
        // Scalar fallback for remaining x
        for (; x < nx - 1; ++x) {
          let i = Index(x, y, z, nx, ny);
          let laplacian =
            curr[i + dx_stride] + curr[i - dx_stride] +
            curr[i + dy_stride] + curr[i - dy_stride] +
            curr[i + dz_stride] + curr[i - dz_stride] -
            6.0 * curr[i];
          next[i] = 2.0 * curr[i] - next[i] + lambda_sq * laplacian;
        }
      }
    }

    // 2. Boundary fixup
    for (let i = 0; i < this.boundaries.length; i++) {
      let b = this.boundaries[i];
      if (b.material_id < 0 || b.material_id >= this.materials.length) continue;

      let m = this.materials[b.material_id];
      let p = next[b.index];

      let v = m.b0 * p + b.s1;
      b.s1 = m.b1 * p - m.a1 * v + b.s2;
      b.s2 = m.b2 * p - m.a2 * v;

      next[b.index] = p - v;
    }

    this.current = this.current ^ 1;
  }

  public setPressure(x: i32, y: i32, z: i32, value: f32): void {
    const curr = this.current ? this.p_b : this.p_a;
    if (x >= 0 && x < this.nx && y >= 0 && y < this.ny && z >= 0 && z < this.nz) {
      curr[Index(x, y, z, this.nx, this.ny)] = value;
    }
  }

  public getPressure(x: i32, y: i32, z: i32): f32 {
    const curr = this.current ? this.p_b : this.p_a;
    if (x >= 0 && x < this.nx && y >= 0 && y < this.ny && z >= 0 && z < this.nz) {
      return curr[Index(x, y, z, this.nx, this.ny)];
    }
    return 0;
  }

  public runSimulation(rx: i32, ry: i32, rz: i32,
                       sx: i32, sy: i32, sz: i32,
                       num_steps: i32, impulse_value: f32): Float32Array {
    this.reset();
    this.setPressure(sx, sy, sz, impulse_value);

    let recording = new Float32Array(num_steps);
    for (let i = 0; i < num_steps; i++) {
      this.step();
      recording[i] = this.getPressure(rx, ry, rz);
    }

    return recording;
  }
}
