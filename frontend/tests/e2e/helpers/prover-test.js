/**
 * ZK prover and game simulator for Node.js testing.
 *
 * Copies logic from src/lib/prover.js and src/lib/gameSimulator.js
 * but loads circuit files from the filesystem instead of browser URLs.
 */

import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const WASM_PATH = path.join(PROJECT_ROOT, "public", "circuits", "pirate_cards.wasm");
const ZKEY_PATH = path.join(PROJECT_ROOT, "public", "keys", "pirate_cards_final.zkey");

const N_CARDS = 25;

let poseidonInstance = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

function cardType(c) {
  if (c < 8) return 0;   // Rum
  if (c < 16) return 1;  // Skull
  if (c < 24) return 2;  // Backstabber
  return 3;              // Black Spot
}

function rpsWinner(type1, type2) {
  if (type1 === type2) return 0;
  if ((type1 + 1) % 3 === type2) return 1;
  return 2;
}

/**
 * Generate a random seed as a BigInt (31 bytes, < BN254 field size).
 */
export function generateRandomSeed() {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""));
}

/**
 * Compute Poseidon(seed) commitment as a 32-byte hex string.
 */
export async function computeSeedCommitment(seedBigint) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const hash = F.toObject(poseidon([seedBigint]));
  return hash.toString(16).padStart(64, "0");
}

/**
 * Generate a Groth16 proof for the pirate cards game.
 * Uses filesystem paths for WASM and zkey (Node.js compatible).
 */
export async function generateProof(seed1, seed2, sessionId) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  // Seed commitments
  const seedCommit1 = F.toObject(poseidon([seed1]));
  const seedCommit2 = F.toObject(poseidon([seed2]));

  // Combined seed
  const combinedSeed = F.toObject(poseidon([seed1, seed2, sessionId]));

  // Compute card weights with truncated values
  const mask128 = (1n << 128n) - 1n;
  const weights = [];
  for (let i = 0; i < N_CARDS; i++) {
    const w = F.toObject(poseidon([combinedSeed, BigInt(i)]));
    weights.push({ card: i, weight: w, truncWeight: w & mask128 });
  }

  // Sort by truncated weight (matches circuit's LessEqThan(128))
  weights.sort((a, b) => {
    if (a.truncWeight < b.truncWeight) return -1;
    if (a.truncWeight > b.truncWeight) return 1;
    return 0;
  });

  const deck = weights.map(w => w.card);
  const truncWeights = weights.map(w => w.truncWeight);
  const highWeights = weights.map(w => w.weight >> 128n);

  // Simulate game
  let scoreP1 = 0, scoreP2 = 0, winner = 0, gameOver = false;
  const gameLog = [];
  const nRounds = Math.floor((N_CARDS - 1) / 2);

  for (let i = 0; i < nRounds && !gameOver; i++) {
    const c1 = deck[2 * i];
    const c2 = deck[2 * i + 1];
    const t1 = cardType(c1);
    const t2 = cardType(c2);
    let roundResult;

    if (t1 === 3) {
      winner = 2; gameOver = true;
      roundResult = `P1 draws BlackSpot - P2 WINS`;
    } else if (t2 === 3) {
      winner = 1; gameOver = true;
      roundResult = `P2 draws BlackSpot - P1 WINS`;
    } else {
      const rps = rpsWinner(t1, t2);
      if (rps === 1) { scoreP1++; roundResult = `P1 wins`; }
      else if (rps === 2) { scoreP2++; roundResult = `P2 wins`; }
      else { roundResult = `Tie`; }

      if (scoreP1 >= 3) { winner = 1; gameOver = true; roundResult += " - P1 reaches 3!"; }
      else if (scoreP2 >= 3) { winner = 2; gameOver = true; roundResult += " - P2 reaches 3!"; }
    }

    gameLog.push({ round: i + 1, c1, c2, result: roundResult, score: [scoreP1, scoreP2] });
  }

  if (!gameOver) {
    if (scoreP1 > scoreP2) {
      winner = 1;
      gameLog.push({ round: "end", result: `Deck exhausted: P1 wins ${scoreP1}-${scoreP2}` });
    } else if (scoreP2 > scoreP1) {
      winner = 2;
      gameLog.push({ round: "end", result: `Deck exhausted: P2 wins ${scoreP2}-${scoreP1}` });
    } else {
      const coinHash = F.toObject(poseidon([combinedSeed, BigInt(N_CARDS)]));
      winner = Number(coinHash & 1n) + 1;
      gameLog.push({ round: "end", result: `Tied ${scoreP1}-${scoreP2}, coin flip: P${winner}` });
    }
  }

  // Circuit inputs
  const circuitInput = {
    seed_commit1: seedCommit1.toString(),
    seed_commit2: seedCommit2.toString(),
    seed1: seed1.toString(),
    seed2: seed2.toString(),
    session_id: sessionId.toString(),
    winner: winner.toString(),
    deck: deck.map(c => c.toString()),
    trunc_weights: truncWeights.map(w => w.toString()),
    high_weights: highWeights.map(w => w.toString()),
  };

  // Generate proof using filesystem paths
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    WASM_PATH,
    ZKEY_PATH
  );

  // Serialize for Soroban
  return {
    proof: {
      pi_a: g1ToHex(proof.pi_a),
      pi_b: g2ToHex(proof.pi_b),
      pi_c: g1ToHex(proof.pi_c),
    },
    publicInputs: {
      seed_commit1: bigintToHex32(publicSignals[0]),
      seed_commit2: bigintToHex32(publicSignals[1]),
      seed1: bigintToHex32(publicSignals[2]),
      seed2: bigintToHex32(publicSignals[3]),
      session_id: bigintToHex32(publicSignals[4]),
      winner: bigintToHex32(publicSignals[5]),
    },
    gameLog,
    winner,
  };
}

/**
 * Simulate the full game without generating a proof.
 * Used for cross-verification.
 */
export async function simulateFullGame(seed1, seed2, sessionId) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const combinedSeed = F.toObject(poseidon([seed1, seed2, sessionId]));

  const mask128 = (1n << 128n) - 1n;
  const weights = [];
  for (let i = 0; i < N_CARDS; i++) {
    const w = F.toObject(poseidon([combinedSeed, BigInt(i)]));
    weights.push({ card: i, truncWeight: w & mask128 });
  }
  weights.sort((a, b) => {
    if (a.truncWeight < b.truncWeight) return -1;
    if (a.truncWeight > b.truncWeight) return 1;
    return 0;
  });

  const deck = weights.map(w => w.card);

  let scoreP1 = 0, scoreP2 = 0, winner = 0, gameOver = false;
  const nRounds = Math.floor((N_CARDS - 1) / 2);

  for (let i = 0; i < nRounds && !gameOver; i++) {
    const c1 = deck[2 * i];
    const c2 = deck[2 * i + 1];
    const t1 = cardType(c1);
    const t2 = cardType(c2);

    if (t1 === 3) { winner = 2; gameOver = true; }
    else if (t2 === 3) { winner = 1; gameOver = true; }
    else {
      const rps = rpsWinner(t1, t2);
      if (rps === 1) scoreP1++;
      else if (rps === 2) scoreP2++;
      if (scoreP1 >= 3) { winner = 1; gameOver = true; }
      else if (scoreP2 >= 3) { winner = 2; gameOver = true; }
    }
  }

  if (!gameOver) {
    if (scoreP1 > scoreP2) winner = 1;
    else if (scoreP2 > scoreP1) winner = 2;
    else {
      const coinHash = F.toObject(poseidon([combinedSeed, BigInt(N_CARDS)]));
      winner = Number(coinHash & 1n) + 1;
    }
  }

  return { deck, winner };
}

// -- Serialization helpers --

function bigintToHex32(s) {
  return BigInt(s).toString(16).padStart(64, "0");
}

function g1ToHex(g1) {
  const x = BigInt(g1[0]).toString(16).padStart(64, "0");
  const y = BigInt(g1[1]).toString(16).padStart(64, "0");
  return x + y;
}

function g2ToHex(g2) {
  const x_c0 = BigInt(g2[0][0]).toString(16).padStart(64, "0");
  const x_c1 = BigInt(g2[0][1]).toString(16).padStart(64, "0");
  const y_c0 = BigInt(g2[1][0]).toString(16).padStart(64, "0");
  const y_c1 = BigInt(g2[1][1]).toString(16).padStart(64, "0");
  return x_c1 + x_c0 + y_c1 + y_c0;
}
