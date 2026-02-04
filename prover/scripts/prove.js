/**
 * prove.js
 *
 * Generates a Groth16 proof for a pirate cards game.
 * Computes the deterministic deck shuffle, simulates the game,
 * and produces a proof of the winner.
 *
 * Usage: node scripts/prove.js <seed1> <seed2> <session_id>
 *
 * Output: build/proof_payload.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROVER_DIR = join(__dirname, "..");

const N_CARDS = 25;

// Card types: 0=Triangle(0-7), 1=Square(8-15), 2=Line(16-23), 3=BlackSpot(24)
function cardType(c) {
  if (c < 8) return 0;
  if (c < 16) return 1;
  if (c < 24) return 2;
  return 3; // black spot
}

function cardName(c) {
  const types = ["Triangle", "Square", "Line", "BlackSpot"];
  return `${types[cardType(c)]}(${c})`;
}

// RPS: P1 wins if (type1+1)%3 == type2 (only for types 0-2)
function rpsWinner(type1, type2) {
  if (type1 === type2) return 0; // tie
  if ((type1 + 1) % 3 === type2) return 1; // P1 wins
  return 2; // P2 wins
}

async function main() {
  const seed1Str = process.argv[2];
  const seed2Str = process.argv[3];
  const sessionIdStr = process.argv[4] || "1";

  if (!seed1Str || !seed2Str) {
    console.error("Usage: node scripts/prove.js <seed1> <seed2> [session_id]");
    console.error("  seed1, seed2: decimal bigint strings (player seeds)");
    console.error("  session_id: game identifier (default: 1)");
    process.exit(1);
  }

  const seed1 = BigInt(seed1Str);
  const seed2 = BigInt(seed2Str);
  const sessionId = BigInt(sessionIdStr);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Compute seed commitments
  const seedCommit1 = F.toObject(poseidon([seed1]));
  const seedCommit2 = F.toObject(poseidon([seed2]));

  console.log(`seed1:        ${seed1}`);
  console.log(`seed2:        ${seed2}`);
  console.log(`session_id:   ${sessionId}`);
  console.log(`seed_commit1: ${seedCommit1}`);
  console.log(`seed_commit2: ${seedCommit2}`);

  // Compute combined seed
  const combinedSeed = F.toObject(poseidon([seed1, seed2, sessionId]));

  // Compute card weights with truncated values for sorting
  const mask128 = (1n << 128n) - 1n;
  const weights = [];
  for (let i = 0; i < N_CARDS; i++) {
    const w = F.toObject(poseidon([combinedSeed, BigInt(i)]));
    weights.push({ card: i, weight: w, truncWeight: w & mask128 });
  }

  // Sort by truncated (128-bit) weight to match circuit's LessEqThan(128) check
  weights.sort((a, b) => {
    if (a.truncWeight < b.truncWeight) return -1;
    if (a.truncWeight > b.truncWeight) return 1;
    return 0;
  });

  const deck = weights.map((w) => w.card);

  // Extract truncated and high weights for circuit witnesses
  const truncWeights = weights.map((w) => w.truncWeight);
  const highWeights = weights.map((w) => w.weight >> 128n);

  console.log("\nDeck order:");
  for (let i = 0; i < N_CARDS; i++) {
    console.log(`  [${i}] ${cardName(deck[i])}`);
  }

  // Simulate game
  let scoreP1 = 0;
  let scoreP2 = 0;
  let winner = 0;
  let gameOver = false;

  console.log("\nGame simulation:");
  const nRounds = Math.floor((N_CARDS - 1) / 2);

  for (let i = 0; i < nRounds && !gameOver; i++) {
    const c1 = deck[2 * i];
    const c2 = deck[2 * i + 1];
    const t1 = cardType(c1);
    const t2 = cardType(c2);

    let roundResult;

    // Black spot check
    if (t1 === 3) {
      winner = 2;
      gameOver = true;
      roundResult = `P1 draws BlackSpot → P2 WINS`;
    } else if (t2 === 3) {
      winner = 1;
      gameOver = true;
      roundResult = `P2 draws BlackSpot → P1 WINS`;
    } else {
      const rps = rpsWinner(t1, t2);
      if (rps === 1) {
        scoreP1++;
        roundResult = `P1 wins (${cardName(c1)} > ${cardName(c2)})`;
      } else if (rps === 2) {
        scoreP2++;
        roundResult = `P2 wins (${cardName(c2)} > ${cardName(c1)})`;
      } else {
        roundResult = `Tie (${cardName(c1)} vs ${cardName(c2)})`;
      }

      // Check for 3 wins
      if (scoreP1 >= 3) {
        winner = 1;
        gameOver = true;
        roundResult += " → P1 reaches 3!";
      } else if (scoreP2 >= 3) {
        winner = 2;
        gameOver = true;
        roundResult += " → P2 reaches 3!";
      }
    }

    console.log(`  Round ${i + 1}: ${roundResult}  [${scoreP1}-${scoreP2}]`);
  }

  // Deck exhaustion tiebreaker
  if (!gameOver) {
    if (scoreP1 > scoreP2) {
      winner = 1;
      console.log(`  Deck exhausted: P1 wins ${scoreP1}-${scoreP2}`);
    } else if (scoreP2 > scoreP1) {
      winner = 2;
      console.log(`  Deck exhausted: P2 wins ${scoreP2}-${scoreP1}`);
    } else {
      // Coin flip
      const coinHash = F.toObject(poseidon([combinedSeed, BigInt(N_CARDS)]));
      const coinLsb = coinHash & 1n;
      winner = Number(coinLsb) + 1; // 0→P1(1), 1→P2(2)
      console.log(
        `  Deck exhausted: tied ${scoreP1}-${scoreP2}, coin flip → P${winner}`
      );
    }
  }

  console.log(`\nWinner: Player ${winner}`);

  // Prepare circuit inputs
  const circuitInput = {
    seed_commit1: seedCommit1.toString(),
    seed_commit2: seedCommit2.toString(),
    seed1: seed1.toString(),
    seed2: seed2.toString(),
    session_id: sessionId.toString(),
    winner: winner.toString(),
    deck: deck.map((c) => c.toString()),
    trunc_weights: truncWeights.map((w) => w.toString()),
    high_weights: highWeights.map((w) => w.toString()),
  };

  console.log("\nGenerating proof...");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    join(PROVER_DIR, "build", "pirate_cards_js", "pirate_cards.wasm"),
    join(PROVER_DIR, "keys", "pirate_cards_final.zkey")
  );

  // Verify locally
  const vk = JSON.parse(
    readFileSync(join(PROVER_DIR, "keys", "verification_key.json"), "utf8")
  );
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  if (!valid) {
    console.error("ERROR: Local verification failed!");
    process.exit(1);
  }
  console.log("Local verification passed.");

  // Serialize for Soroban contract
  const payload = {
    proof: {
      pi_a: g1ToHex(proof.pi_a, 32),
      pi_b: g2ToHex(proof.pi_b, 32),
      pi_c: g1ToHex(proof.pi_c, 32),
    },
    public_inputs: {
      seed_commit1: bigintToHex(publicSignals[0], 32),
      seed_commit2: bigintToHex(publicSignals[1], 32),
      seed1: bigintToHex(publicSignals[2], 32),
      seed2: bigintToHex(publicSignals[3], 32),
      session_id: bigintToHex(publicSignals[4], 32),
      winner: bigintToHex(publicSignals[5], 32),
    },
    _debug: { publicSignals, proof },
  };

  const buildDir = join(PROVER_DIR, "build");
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, "proof_payload.json"), JSON.stringify(payload, null, 2));

  console.log("\nProof payload saved to build/proof_payload.json");
  console.log(`  seed_commit1: 0x${payload.public_inputs.seed_commit1}`);
  console.log(`  seed_commit2: 0x${payload.public_inputs.seed_commit2}`);
  console.log(`  seed1:        0x${payload.public_inputs.seed1}`);
  console.log(`  seed2:        0x${payload.public_inputs.seed2}`);
  console.log(`  session_id:   0x${payload.public_inputs.session_id}`);
  console.log(`  winner:       0x${payload.public_inputs.winner}`);
}

function bigintToHex(s, byteLen) {
  return BigInt(s).toString(16).padStart(byteLen * 2, "0");
}

function g1ToHex(g1, coordBytes) {
  const x = bigintToHex(g1[0], coordBytes);
  const y = bigintToHex(g1[1], coordBytes);
  return x + y;
}

/**
 * G2 serialization with c0/c1 swap for Soroban BN254 encoding.
 * snarkjs: [[x_c0, x_c1], [y_c0, y_c1], ...]
 * Soroban: be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)
 */
function g2ToHex(g2, coordBytes) {
  const x_c0 = bigintToHex(g2[0][0], coordBytes);
  const x_c1 = bigintToHex(g2[0][1], coordBytes);
  const y_c0 = bigintToHex(g2[1][0], coordBytes);
  const y_c1 = bigintToHex(g2[1][1], coordBytes);
  return x_c1 + x_c0 + y_c1 + y_c0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
