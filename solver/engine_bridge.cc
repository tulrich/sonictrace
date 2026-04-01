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
  emscripten::class_<FdtdSolver>("FdtdSolver")
    .constructor<int, int, int, float>()
    .function("reset", &FdtdSolver::Reset)
    .function("step", &FdtdSolver::Step)
    .function("setPressure", &FdtdSolver::SetPressure)
    .function("getPressure", &FdtdSolver::GetPressure);
}
