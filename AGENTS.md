# AGENTS.md: Development & Testing Procedures

This document provides technical instructions for developers and AI agents working on SonicTrace.

## 1. Local Development

### Prerequisites
* **Node.js:** Ensure a modern version of Node.js is installed.
* **Emscripten (optional):** Required for recompiling the WASM engine in `solver/`.

### Commands
* **Install Dependencies:** `npm install`
* **Start Dev Server With Live Rebuilds:** `npm run dev` (Runs Vite on http://localhost:5173 by default)
* **Build for Production:** `npm run build`

## 2. Testing Strategy

The project uses `vitest` for most tests and direct `node` execution for engine verification.

### Running Tests
* **All Tests (Vitest):** `npm run test`
  * This runs `src/main.test.js` (using `jsdom` for UI tests) and `src/engine.test.js` (using `node` environment for WASM engine tests).
* **WASM Engine Verification (Direct Node):** `npm run test:engine`
  * This runs `src/test_engine.js` directly, which is useful for debugging the compiled core without Vitest's overhead.
* **Watch Mode:** `npm run test:watch`

## 3. WASM Compilation

The WASM core is located in `solver/` and is compiled to `public/engine.js` and `public/engine.wasm`.

### Compilation Command (if Emscripten is installed)
```bash
emcc --bind -O3 -msimd128 -I eigen-src/ \
  solver/fdtd_solver.cc \
  solver/engine_bridge.cc \
  -s WASM=1 \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='createEngine' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -o public/engine.js
```
*Note: This is also automated via GitHub Actions on push to `solver/**`.*
