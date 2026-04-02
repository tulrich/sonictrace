/**
 * @fileoverview Emscripten bridge to expose C++ solver to JavaScript.
 * @license Apache-2.0
 */

#include <emscripten.h>
#include <emscripten/bind.h>
#include "fdtd_solver.h"

using namespace sonictrace;

// Using Embind for a cleaner C++ class interface in JS
EMSCRIPTEN_BINDINGS(sonictrace_engine) {
  emscripten::value_object<MaterialParams>("MaterialParams")
    .field("b0", &MaterialParams::b0)
    .field("b1", &MaterialParams::b1)
    .field("b2", &MaterialParams::b2)
    .field("a1", &MaterialParams::a1)
    .field("a2", &MaterialParams::a2);

  emscripten::register_vector<float>("FloatVector");

  emscripten::class_<FdtdSolver>("FdtdSolver")
    .constructor<int, int, int, float>()
    .function("reset", &FdtdSolver::Reset)
    .function("step", &FdtdSolver::Step)
    .function("setPressure", &FdtdSolver::SetPressure)
    .function("getPressure", &FdtdSolver::GetPressure)
    .function("addBoundary", &FdtdSolver::AddBoundary)
    .function("setMaterial", &FdtdSolver::SetMaterial)
    .function("runSimulation", &FdtdSolver::RunSimulation);
}
