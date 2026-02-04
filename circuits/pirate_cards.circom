pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "deck_shuffle.circom";
include "game_sim.circom";

/// PirateCards: main circuit for the ZK pirate card game.
///
/// Proves that given two revealed seeds and a session ID, the game
/// outcome (winner) is correctly computed from the deterministic
/// deck shuffle and game simulation.
///
/// Public inputs (6):
///   seed_commit1  - Poseidon(seed1), committed before game
///   seed_commit2  - Poseidon(seed2), committed before game
///   seed1         - revealed seed from player 1
///   seed2         - revealed seed from player 2
///   session_id    - unique game identifier
///   winner        - 1 (player 1 wins) or 2 (player 2 wins)
///
/// Private inputs:
///   deck[25]          - the shuffled card order (permutation of 0..24)
///   trunc_weights[25] - lower 128 bits of card weights (for sort verification)
///   high_weights[25]  - upper 126 bits of card weights
///
/// Card encoding: 0-7=Triangle, 8-15=Square, 16-23=Line, 24=BlackSpot
/// RPS: Triangle > Square > Line > Triangle
/// Black spot: instant loss for the player who draws it
/// First to 3 round wins, or most wins at deck exhaustion, coin flip if tied.
template PirateCards() {
    // Public inputs
    signal input seed_commit1;
    signal input seed_commit2;
    signal input seed1;
    signal input seed2;
    signal input session_id;
    signal input winner;

    // Private inputs
    signal input deck[25];
    signal input trunc_weights[25];
    signal input high_weights[25];

    // --- 1. Verify seed commitments ---
    component hash1 = Poseidon(1);
    hash1.inputs[0] <== seed1;
    hash1.out === seed_commit1;

    component hash2 = Poseidon(1);
    hash2.inputs[0] <== seed2;
    hash2.out === seed_commit2;

    // --- 2. Compute combined seed ---
    component cs = Poseidon(3);
    cs.inputs[0] <== seed1;
    cs.inputs[1] <== seed2;
    cs.inputs[2] <== session_id;

    // --- 3. Verify deck shuffle ---
    component shuffle = DeckShuffle(25);
    shuffle.combined_seed <== cs.out;
    for (var i = 0; i < 25; i++) {
        shuffle.deck[i] <== deck[i];
        shuffle.trunc_weights[i] <== trunc_weights[i];
        shuffle.high_weights[i] <== high_weights[i];
    }

    // --- 4. Simulate game ---
    component game = GameSim(25);
    for (var i = 0; i < 25; i++) {
        game.deck[i] <== deck[i];
    }
    game.combined_seed <== cs.out;

    // --- 5. Verify winner ---
    game.winner === winner;
}

component main {public [seed_commit1, seed_commit2, seed1, seed2, session_id, winner]} = PirateCards();
