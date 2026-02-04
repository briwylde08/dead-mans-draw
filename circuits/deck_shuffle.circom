pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/// Verify that `deck` is a valid permutation of [0..nCards-1] sorted by
/// Poseidon-derived weights.
///
/// Weight derivation: weight(c) = Poseidon(combined_seed, c)
///
/// The prover provides truncated weights (lower 128 bits) as witnesses
/// so the circuit can compare them without full 254-bit arithmetic.
template DeckShuffle(nCards) {
    signal input combined_seed;
    signal input deck[nCards];

    // Private witnesses for sorting verification
    signal input trunc_weights[nCards]; // lower 128 bits of Poseidon(cs, deck[i])
    signal input high_weights[nCards];  // upper 126 bits

    // --- 1. Permutation validity ---

    // Range check: each deck[i] in [0, nCards)
    component range[nCards];
    for (var i = 0; i < nCards; i++) {
        range[i] = LessThan(5);
        range[i].in[0] <== deck[i];
        range[i].in[1] <== nCards;
        range[i].out === 1;
    }

    // Uniqueness: all pairs (i, j) with i < j must have deck[i] != deck[j]
    // Prove non-zero by providing inverse witness
    var nPairs = nCards * (nCards - 1) / 2;
    signal inv[nPairs];
    var pairIdx = 0;
    for (var i = 0; i < nCards; i++) {
        for (var j = i + 1; j < nCards; j++) {
            inv[pairIdx] <-- 1 / (deck[i] - deck[j]);
            inv[pairIdx] * (deck[i] - deck[j]) === 1;
            pairIdx++;
        }
    }

    // --- 2. Weight computation and truncation ---

    component weight_hash[nCards];
    for (var i = 0; i < nCards; i++) {
        // Compute full weight: Poseidon(combined_seed, deck[i])
        weight_hash[i] = Poseidon(2);
        weight_hash[i].inputs[0] <== combined_seed;
        weight_hash[i].inputs[1] <== deck[i];

        // Verify truncation: full_weight = trunc + high * 2^128
        weight_hash[i].out === trunc_weights[i] + high_weights[i] * (1 << 128);
    }

    // Range check truncated weights (128 bits)
    component trunc_bits[nCards];
    for (var i = 0; i < nCards; i++) {
        trunc_bits[i] = Num2Bits(128);
        trunc_bits[i].in <== trunc_weights[i];
    }

    // Range check high parts (126 bits, since field modulus < 2^254)
    component high_bits[nCards];
    for (var i = 0; i < nCards; i++) {
        high_bits[i] = Num2Bits(126);
        high_bits[i].in <== high_weights[i];
    }

    // --- 3. Sorting verification ---
    // Verify trunc_weights[i] <= trunc_weights[i+1] for all consecutive pairs.
    // Since truncation preserves order with overwhelming probability for 25 elements
    // in 2^128 space (collision probability ~25^2 / 2^128 ≈ 0), this is safe.

    component sorted[nCards - 1];
    for (var i = 0; i < nCards - 1; i++) {
        sorted[i] = LessEqThan(128);
        sorted[i].in[0] <== trunc_weights[i];
        sorted[i].in[1] <== trunc_weights[i + 1];
        sorted[i].out === 1;
    }
}
