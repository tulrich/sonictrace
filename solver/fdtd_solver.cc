/**
 * @fileoverview FDTD solver implementation using Eigen.
 * @license Apache-2.0
 */

#include "fdtd_solver.h"
#include <cmath>
#include <algorithm>
#include <vector>

namespace sonictrace {

FdtdSolver::FdtdSolver(int nx, int ny, int nz, float dx)
    : nx_(nx), ny_(ny), nz_(nz), dx_(dx) {
  // Courant condition for stability: dt <= dx / (c * sqrt(3))
  dt_ = dx_ / (c_ * std::sqrt(3.0f));

  size_t size = static_cast<size_t>(nx_) * ny_ * nz_;
  p_a_.resize(size);
  p_a_.setZero();
  p_b_.resize(size);
  p_b_.setZero();
}

void FdtdSolver::Reset() {
  p_a_.setZero();
  p_b_.setZero();
  current_ = 0;
  for (auto& b : boundaries_) {
    b.s1 = 0;
    b.s2 = 0;
  }
}

void FdtdSolver::AddBoundary(int x, int y, int z, int material_id) {
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    boundaries_.push_back({Index(x, y, z), material_id, 0.0f, 0.0f});
  }
}

void FdtdSolver::SetMaterial(int material_id, const MaterialParams& params) {
  if (material_id >= static_cast<int>(materials_.size())) {
    materials_.resize(material_id + 1);
  }
  materials_[material_id] = params;
}

void FdtdSolver::Step() {
  // Precompute constants for the stencil
  const float lambda = (c_ * dt_ / dx_);  // This is the Courant Number, aka S
  const float lambda_sq = lambda * lambda;

  Eigen::VectorXf& curr = current_ ? p_b_ : p_a_;
  Eigen::VectorXf& next = current_ ? p_a_ : p_b_;

  const size_t dx_stride = 1;
  const size_t dy_stride = nx_;
  const size_t dz_stride = static_cast<size_t>(nx_) * ny_;

  // 1. Bulk state update (7-point stencil)
  // Uniform update for all internal grid points.
  for (int z = 1; z < nz_ - 1; ++z) {
    for (int y = 1; y < ny_ - 1; ++y) {
      for (int x = 1; x < nx_ - 1; ++x) {
        size_t i = Index(x, y, z);

        float laplacian =
            curr[i + dx_stride] + curr[i - dx_stride] +
            curr[i + dy_stride] + curr[i - dy_stride] +
            curr[i + dz_stride] + curr[i - dz_stride] -
            6.0f * curr[i];

        next[i] = 2.0f * curr[i] - next[i] + lambda_sq * laplacian;
      }
    }
  }

  // 2. Boundary fixup pass (Apply frequency-dependent absorption)
  for (auto& b : boundaries_) {
    if (b.material_id < 0 || b.material_id >= static_cast<int>(materials_.size())) {
      continue;
    }

    const auto& m = materials_[b.material_id];
    float p = next[b.index];

    // Apply IIR filter for boundary impedance/absorption
    // Models boundary as a spring-mass-damper system.
    // v[n] = b0 * p[n] + s1[n-1]
    // s1[n] = b1 * p[n] - a1 * v[n] + s2[n-1]
    // s2[n] = b2 * p[n] - a2 * v[n]
    
    float v = m.b0 * p + b.s1;
    b.s1 = m.b1 * p - m.a1 * v + b.s2;
    b.s2 = m.b2 * p - m.a2 * v;

    // Correct the pressure at the boundary
    next[b.index] = p - v; 
  }

  // Update buffers - swap for next time
  current_ = current_ ^ 1;
}

void FdtdSolver::SetPressure(int x, int y, int z, float value) {
  Eigen::VectorXf& curr = current_ ? p_b_ : p_a_;
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    curr[Index(x, y, z)] = value;
  }
}

float FdtdSolver::GetPressure(int x, int y, int z) const {
  const Eigen::VectorXf& curr = current_ ? p_b_ : p_a_;
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    return curr[Index(x, y, z)];
  }
  return 0.0f;
}

std::vector<float> FdtdSolver::RunSimulation(int rx, int ry, int rz,
                                            int sx, int sy, int sz,
                                            int num_steps, float impulse_value) {
  Reset();
  SetPressure(sx, sy, sz, impulse_value);

  std::vector<float> recording;
  recording.reserve(num_steps);

  for (int i = 0; i < num_steps; ++i) {
    Step();
    recording.push_back(GetPressure(rx, ry, rz));
  }

  return recording;
}

} // namespace sonictrace
