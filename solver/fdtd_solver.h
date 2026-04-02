/**
 * @fileoverview FDTD (Finite Difference Time Domain) wave solver for low frequencies.
 * @license Apache-2.0
 */

#ifndef SOLVER_FDTD_SOLVER_H_
#define SOLVER_FDTD_SOLVER_H_

#include <Eigen/Core>
#include <cstdint>
#include <vector>

namespace sonictrace {

/**
 * Frequency-dependent material coefficients for IIR filters.
 * Models boundary as a spring-mass-damper system.
 */
struct MaterialParams {
  float b0, b1, b2; // Numerator
  float a1, a2;     // Denominator
};

/**
 * Stores state for a boundary voxel.
 */
struct BoundaryVoxel {
  size_t index;
  int material_id;
  float s1, s2; // Filter state variables
};

/**
 * 3D Wave Solver for pressure-time history.
 */
class FdtdSolver {
 public:
  /**
   * Initializes the solver with grid dimensions.
   */
  FdtdSolver(int nx, int ny, int nz, float dx);

  /**
   * Resets the pressure grids and filter states.
   */
  void Reset();

  /**
   * Advances the simulation by one time step.
   * Δt = dx / (c * sqrt(3)) to satisfy Courant condition.
   */
  void Step();

  /**
   * Sets the pressure at a specific node.
   */
  void SetPressure(int x, int y, int z, float value);

  /**
   * Gets the pressure at a specific node.
   */
  float GetPressure(int x, int y, int z) const;

  /**
   * Adds a boundary voxel with an associated material.
   */
  void AddBoundary(int x, int y, int z, int material_id);

  /**
   * Configures material parameters by index.
   */
  void SetMaterial(int material_id, const MaterialParams& params);

  /**
   * Runs the simulation for a given duration and records pressure at a node.
   * @param rx, ry, rz Receiver coordinates.
   * @param sx, sy, sz Source coordinates.
   * @param num_steps Number of steps to simulate.
   * @param impulse_value Initial pressure at source.
   * @return Vector of recorded pressure values.
   */
  std::vector<float> RunSimulation(int rx, int ry, int rz,
                                  int sx, int sy, int sz,
                                  int num_steps, float impulse_value);

 private:
  int nx_, ny_, nz_;
  float dx_;
  float dt_;
  const float c_ = 343.0f;

  // Double buffered pressure grids
  Eigen::VectorXf p_a_;
  Eigen::VectorXf p_b_;
  int current_ = 0;

  // Linear list of boundary voxels for specialized updates
  std::vector<BoundaryVoxel> boundaries_;

  // Material property table
  std::vector<MaterialParams> materials_;

  /**
   * Helper to index the 1D vector as 3D.
   */
  size_t Index(int x, int y, int z) const {
    return static_cast<size_t>(x) +
           static_cast<size_t>(y) * nx_ +
           static_cast<size_t>(z) * nx_ * ny_;
  }
};

} // namespace sonictrace

#endif // SOLVER_FDTD_SOLVER_H_
