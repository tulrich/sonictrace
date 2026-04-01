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
  p_curr_.assign(size, 0.0f);
  p_prev_.assign(size, 0.0f);
}

void FdtdSolver::Reset() {
  std::fill(p_curr_.begin(), p_curr_.end(), 0.0f);
  std::fill(p_prev_.begin(), p_prev_.end(), 0.0f);
}

void FdtdSolver::Step() {
  // Precompute constants for the stencil
  const float lambda = (c_ * dt_ / dx_);
  const float lambda_sq = lambda * lambda;

  // Temporary buffer to hold the NEXT state
  // In a real SIMD implementation, we'd ping-pong between pointers
  std::vector<float> p_next(p_curr_.size());

  // 7-point stencil loop
  // Skip boundary nodes for now (simplest Dirichlet BC: pressure = 0 at walls)
  for (int z = 1; z < nz_ - 1; ++z) {
    for (int y = 1; y < ny_ - 1; ++y) {
      for (int x = 1; x < nx_ - 1; ++x) {
        size_t i = Index(x, y, z);

        float laplacian =
            p_curr_[Index(x + 1, y, z)] + p_curr_[Index(x - 1, y, z)] +
            p_curr_[Index(x, y + 1, z)] + p_curr_[Index(x, y - 1, z)] +
            p_curr_[Index(x, y, z + 1)] + p_curr_[Index(x, y, z - 1)] -
            6.0f * p_curr_[i];

        p_next[i] = 2.0f * p_curr_[i] - p_prev_[i] + lambda_sq * laplacian;
      }
    }
  }

  // Update buffers
  p_prev_ = std::move(p_curr_);
  p_curr_ = std::move(p_next);
}

void FdtdSolver::SetPressure(int x, int y, int z, float value) {
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    p_curr_[Index(x, y, z)] = value;
  }
}

float FdtdSolver::GetPressure(int x, int y, int z) const {
  if (x >= 0 && x < nx_ && y >= 0 && y < ny_ && z >= 0 && z < nz_) {
    return p_curr_[Index(x, y, z)];
  }
  return 0.0f;
}

} // namespace sonictrace
