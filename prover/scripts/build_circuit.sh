#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$PROVER_DIR/.." && pwd)"
BUILD_DIR="$PROVER_DIR/build"

mkdir -p "$BUILD_DIR"

# Use local circom binary if available, else global
CIRCOM="${CIRCOM_BIN:-circom}"

echo "==> Compiling pirate_cards circuit..."
$CIRCOM "$PROJECT_DIR/circuits/pirate_cards.circom" \
  --r1cs \
  --wasm \
  --sym \
  -l "$PROVER_DIR/node_modules" \
  -o "$BUILD_DIR"

echo ""
echo "Circuit compiled successfully."
echo "  R1CS:  $BUILD_DIR/pirate_cards.r1cs"
echo "  WASM:  $BUILD_DIR/pirate_cards_js/pirate_cards.wasm"
echo "  SYM:   $BUILD_DIR/pirate_cards.sym"

# Print constraint count
npx snarkjs r1cs info "$BUILD_DIR/pirate_cards.r1cs" 2>/dev/null || true
