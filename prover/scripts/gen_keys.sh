#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROVER_DIR/build"
KEYS_DIR="$PROVER_DIR/keys"

mkdir -p "$KEYS_DIR"

if [ ! -f "$BUILD_DIR/pirate_cards.r1cs" ]; then
  echo "Error: Circuit not compiled. Run 'npm run build' first."
  exit 1
fi

# Phase 1: Powers of Tau ceremony (bn128, 2^15 for ~20k constraints)
echo "==> Phase 1: Powers of Tau..."
npx snarkjs powersoftau new bn128 15 "$KEYS_DIR/pot15_0000.ptau" -v
npx snarkjs powersoftau contribute "$KEYS_DIR/pot15_0000.ptau" "$KEYS_DIR/pot15_0001.ptau" \
  --name="Dev contribution 1" -v -e="random entropy for pirate cards development"
npx snarkjs powersoftau prepare phase2 "$KEYS_DIR/pot15_0001.ptau" "$KEYS_DIR/pot15_final.ptau" -v

# Phase 2: Circuit-specific trusted setup
echo ""
echo "==> Phase 2: Circuit-specific setup..."
npx snarkjs groth16 setup "$BUILD_DIR/pirate_cards.r1cs" "$KEYS_DIR/pot15_final.ptau" "$KEYS_DIR/pirate_cards_0000.zkey"
npx snarkjs zkey contribute "$KEYS_DIR/pirate_cards_0000.zkey" "$KEYS_DIR/pirate_cards_final.zkey" \
  --name="Dev contribution" -v -e="more random entropy for pirate cards"

# Export verification key
echo ""
echo "==> Exporting verification key..."
npx snarkjs zkey export verificationkey "$KEYS_DIR/pirate_cards_final.zkey" "$KEYS_DIR/verification_key.json"

echo ""
echo "Keys generated successfully."
echo "  Final zkey:       $KEYS_DIR/pirate_cards_final.zkey"
echo "  Verification key: $KEYS_DIR/verification_key.json"

# Cleanup intermediate files
rm -f "$KEYS_DIR/pot15_0000.ptau" "$KEYS_DIR/pot15_0001.ptau" "$KEYS_DIR/pirate_cards_0000.zkey"
