/**
 * @fileoverview Basic unit test for FDTD solver.
 * @license Apache-2.0
 */

#include "fdtd_solver.h"
#include <iostream>
#include <cassert>
#include <vector>

void TestImpulsePropagation() {
  std::cout << "Running TestImpulsePropagation..." << std::endl;

  // Small grid for testing
  const int nx = 20, ny = 20, nz = 20;
  const float dx = 0.1f;
  sonictrace::FdtdSolver solver(nx, ny, nz, dx);

  // Set an impulse in the center
  int cx = 10, cy = 10, cz = 10;
  solver.SetPressure(cx, cy, cz, 1.0f);

  // Take a few steps
  for (int i = 0; i < 5; ++i) {
    solver.Step();
    float p_center = solver.GetPressure(cx, cy, cz);
    float p_neighbor = solver.GetPressure(cx + 1, cy, cz);

    std::cout << "Step " << i << ": Center=" << p_center
              << ", Neighbor=" << p_neighbor << std::endl;
  }

  // After some steps, center pressure should decrease and neighbors should increase
  assert(solver.GetPressure(cx, cy, cz) < 1.0f);
  assert(solver.GetPressure(cx + 1, cy, cz) != 0.0f);

  std::cout << "TestImpulsePropagation PASSED!" << std::endl;
}

int main() {
  try {
    TestImpulsePropagation();
  } catch (const std::exception& e) {
    std::cerr << "Test failed with exception: " << e.what() << std::endl;
    return 1;
  }
  return 0;
}
