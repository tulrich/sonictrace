/**
 * @fileoverview FDTD solver implementation.
 * @license Apache-2.0
 */

#include "fdtd_solver.h"
#include <cmath>
#include <algorithm>

namespace sonictrace {

FdtdSolver::FdtdSolver(int nx, int ny, int nz, float dx)
    : nx_(nx), ny_(ny), nz_(nz), dx_(dx) {
  // Courant condition for stability: dt <= dx / (c * sqrt(3))
  dt_ = dx_ / (c_ * std::sqrt(3.0f));

  size_t size = static_cast<size_t>(nx_) * ny_ * nz_;
  p_a_.assign(size, 0.0f);
  p_b_.assign(size, 0.0f);
}

void FdtdSolver::Reset() {
  std::fill(p_a_.begin(), p_a_.end(), 0.0f);
  std::fill(p_b_.begin(), p_b_.end(), 0.0f);
  current_ = 0;
}

void FdtdSolver::Step() {
  // Precompute constants for the stencil
  const float lambda = (c_ * dt_ / dx_);
  const float lambda_sq = lambda * lambda;

  std::vector<float>& curr = current_ ? p_b_ : p_a_;
  std::vector<float>& next = current_ ? p_a_ : p_b_;

  const size_t dx_stride = 1;
  const size_t dy_stride = nx_;
  const size_t dz_stride = static_cast<size_t>(nx_) * ny_;

  // 7-point stencil loop
  // Skip boundary nodes for now (simplest Dirichlet BC: pressure = 0 at walls)
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

  // Update buffers - swap for next time
  current_ = current_ ^ 1;
}

void FdtdSolver::SetPressure(int x, int y, int z, float value) {
  std::vector<float>& curr = current_ ? p_b_ : p_a_;
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    curr[Index(x, y, z)] = value;
  }
}

float FdtdSolver::GetPressure(int x, int y, int z) const {
  const std::vector<float>& curr = current_ ? p_b_ : p_a_;
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    return curr[Index(x, y, z)];
  }
  return 0.0f;
}

} // namespace sonictrace
