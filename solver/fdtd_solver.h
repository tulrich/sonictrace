/**
 * @fileoverview FDTD (Finite Difference Time Domain) wave solver for low frequencies.
 * @license Apache-2.0
 */

#ifndef SOLVER_FDTD_SOLVER_H_
#define SOLVER_FDTD_SOLVER_H_

#include <Eigen/Core>
#include <cstdint>

namespace sonictrace {

/**
 * 3D Wave Solver for pressure-time history.
 */
class FdtdSolver {
 public:
  /**
   * Initializes the solver with grid dimensions.
   * @param nx Number of cells in X.
   * @param ny Number of cells in Y.
   * @param nz Number of cells in Z.
   * @param dx Voxel size in meters.
   */
  FdtdSolver(int nx, int ny, int nz, float dx);

  /**
   * Resets the pressure grids.
   */
  void Reset();

  /**
   * Advances the simulation by one time step.
   * Δt = dx / (c * sqrt(3)) to satisfy Courant condition.
   */
  void Step();

  /**
   * Sets the pressure at a specific node (Source).
   */
  void SetPressure(int x, int y, int z, float value);

  /**
   * Gets the pressure at a specific node (Listener).
   */
  float GetPressure(int x, int y, int z) const;

 private:
  int nx_, ny_, nz_;
  float dx_;
  float dt_;
  const float c_ = 343.0f; // Speed of sound in m/s

  // Double buffered pressure grids
  Eigen::VectorXf p_a_;
  Eigen::VectorXf p_b_;
  int current_ = 0;

  /**
   * Helper to index the 1D vector as 3D.
   */
  size_t Index(int x, int y, int z) const {
    return x + y * nx_ + z * nx_ * ny_;
  }
};

} // namespace sonictrace

#endif // SOLVER_FDTD_SOLVER_H_
