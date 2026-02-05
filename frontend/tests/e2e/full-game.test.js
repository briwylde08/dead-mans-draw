/**
 * End-to-end test: Full Dead Man's Draw game lifecycle on Stellar testnet.
 *
 * Uses two hardcoded testnet keypairs to run through the complete flow:
 *   createGame -> joinGame -> revealSeed (x2) -> generateProof -> settleGame
 *
 * Run with: npm run test:e2e
 */

import { Keypair } from "@stellar/stellar-sdk";
import {
  fundAccount,
  createGame,
  joinGame,
  revealSeed,
  settleGame,
  getGameParsed,
} from "./helpers/soroban-test.js";
import {
  generateRandomSeed,
  computeSeedCommitment,
  generateProof,
  simulateFullGame,
} from "./helpers/prover-test.js";

// ── Configuration ──

const CONTRACT_ID = process.env.CONTRACT_ID || "CCIAGQ6KVIFG4OLJK7TRYMW2BPAJV5VDKK3N32LHCTV4UIZQSYKDI7AB";
const PLAYER1_SECRET = process.env.PLAYER1_SECRET || "SCRQKXU37IPN4S4G7VII2NLYIIAFE2JKA5RPTJKPVLOBIK7TFTZBF7XF";
const PLAYER2_SECRET = process.env.PLAYER2_SECRET || "SBUIJHSMHKUMP65UBCH6UH5TEEIKYTA4ZP3IMPKC5YII4QHXVBBZ6IIG";

// ── Helpers ──

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  \x1b[31mFAIL:\x1b[0m ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`  \x1b[32mPASS:\x1b[0m ${message}`);
  passed++;
}

function step(name) {
  console.log(`\n\x1b[1m=== ${name} ===\x1b[0m`);
  return Date.now();
}

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1);
}

// ── Main Test ──

async function runTest() {
  const totalStart = Date.now();

  console.log("\x1b[1m\nDead Man's Draw — E2E Test\x1b[0m");
  console.log(`Contract: ${CONTRACT_ID}`);

  // Step 0: Setup
  const t0 = step("Step 0: Setup");

  const kp1 = Keypair.fromSecret(PLAYER1_SECRET);
  const kp2 = Keypair.fromSecret(PLAYER2_SECRET);
  const sessionId = Math.floor(Math.random() * 2_000_000_000) + 1;

  console.log(`  Player 1: ${kp1.publicKey()}`);
  console.log(`  Player 2: ${kp2.publicKey()}`);
  console.log(`  Session ID: ${sessionId}`);

  console.log("  Funding accounts...");
  const [fund1, fund2] = await Promise.all([
    fundAccount(kp1.publicKey()),
    fundAccount(kp2.publicKey()),
  ]);
  console.log(`  P1 fund: ${fund1.funded ? "funded" : fund1.reason}`);
  console.log(`  P2 fund: ${fund2.funded ? "funded" : fund2.reason}`);
  console.log(`  Step 0 completed in ${elapsed(t0)}s`);

  // Step 1: Generate seeds
  const t1 = step("Step 1: Generate Seeds");

  const seed1 = generateRandomSeed();
  const seed2 = generateRandomSeed();
  const commit1 = await computeSeedCommitment(seed1);
  const commit2 = await computeSeedCommitment(seed2);

  const seed1Hex = seed1.toString(16).padStart(64, "0");
  const seed2Hex = seed2.toString(16).padStart(64, "0");

  console.log(`  Seed 1: ${seed1Hex.slice(0, 16)}...`);
  console.log(`  Seed 2: ${seed2Hex.slice(0, 16)}...`);
  assert(seed1 !== seed2, "Seeds are unique");
  assert(commit1.length === 64, "Commitment 1 is 64 hex chars");
  assert(commit2.length === 64, "Commitment 2 is 64 hex chars");
  console.log(`  Step 1 completed in ${elapsed(t1)}s`);

  // Step 2: createGame
  const t2 = step("Step 2: Create Game");

  console.log("  Submitting createGame tx...");
  const createResult = await createGame(CONTRACT_ID, sessionId, kp1.publicKey(), commit1, kp1);
  assert(createResult.success, "createGame succeeded");
  console.log(`  TX Hash: ${createResult.txHash}`);

  console.log("  Querying game state...");
  const game2 = await getGameParsed(CONTRACT_ID, sessionId, kp1.publicKey());
  assert(game2 !== null, "Game exists on-chain");
  assert(game2.player1 === kp1.publicKey(), "player1 matches");
  assert(game2.phase === 0, "phase is 0 (waiting for P2)");
  assert(game2.winner === 0, "winner is 0 (not settled)");
  assert(!game2.seed1Revealed, "seed1 not yet revealed");
  assert(!game2.seed2Revealed, "seed2 not yet revealed");
  console.log(`  Step 2 completed in ${elapsed(t2)}s`);

  // Step 3: joinGame
  const t3 = step("Step 3: Join Game");

  console.log("  Submitting joinGame tx...");
  const joinResult = await joinGame(CONTRACT_ID, sessionId, commit2, kp2);
  assert(joinResult.success, "joinGame succeeded");
  console.log(`  TX Hash: ${joinResult.txHash}`);

  console.log("  Querying game state...");
  const game3 = await getGameParsed(CONTRACT_ID, sessionId, kp1.publicKey());
  assert(game3.player2 === kp2.publicKey(), "player2 matches");
  assert(game3.phase === 1, "phase is 1 (both committed)");
  console.log(`  Step 3 completed in ${elapsed(t3)}s`);

  // Step 4: revealSeed (P1)
  const t4 = step("Step 4: Reveal Seed (Player 1)");

  console.log("  Submitting revealSeed tx...");
  const reveal1Result = await revealSeed(CONTRACT_ID, sessionId, seed1Hex, kp1);
  assert(reveal1Result.success, "revealSeed P1 succeeded");
  console.log(`  TX Hash: ${reveal1Result.txHash}`);

  console.log("  Querying game state...");
  const game4 = await getGameParsed(CONTRACT_ID, sessionId, kp1.publicKey());
  assert(game4.seed1Revealed, "seed1 is revealed");
  assert(!game4.seed2Revealed, "seed2 not yet revealed");
  console.log(`  Step 4 completed in ${elapsed(t4)}s`);

  // Step 5: revealSeed (P2)
  const t5 = step("Step 5: Reveal Seed (Player 2)");

  console.log("  Submitting revealSeed tx...");
  const reveal2Result = await revealSeed(CONTRACT_ID, sessionId, seed2Hex, kp2);
  assert(reveal2Result.success, "revealSeed P2 succeeded");
  console.log(`  TX Hash: ${reveal2Result.txHash}`);

  console.log("  Querying game state...");
  const game5 = await getGameParsed(CONTRACT_ID, sessionId, kp1.publicKey());
  assert(game5.seed1Revealed, "seed1 is revealed");
  assert(game5.seed2Revealed, "seed2 is revealed");
  assert(game5.phase === 2, "phase is 2 (both revealed)");
  console.log(`  Step 5 completed in ${elapsed(t5)}s`);

  // Step 6: Generate ZK proof
  const t6 = step("Step 6: Generate ZK Proof");

  console.log("  Generating proof (this may take a minute)...");
  const proofResult = await generateProof(seed1, seed2, BigInt(sessionId));
  assert(proofResult.proof.pi_a.length > 0, "proof has pi_a");
  assert(proofResult.proof.pi_b.length > 0, "proof has pi_b");
  assert(proofResult.proof.pi_c.length > 0, "proof has pi_c");
  assert(proofResult.winner === 1 || proofResult.winner === 2, `winner is valid (Player ${proofResult.winner})`);

  console.log("  Game log:");
  for (const entry of proofResult.gameLog) {
    console.log(`    Round ${entry.round}: ${entry.result} [${entry.score?.[0] ?? ""}-${entry.score?.[1] ?? ""}]`);
  }
  console.log(`  Step 6 completed in ${elapsed(t6)}s`);

  // Step 7: settleGame
  const t7 = step("Step 7: Settle Game");

  console.log("  Submitting settleGame tx...");
  const settleResult = await settleGame(CONTRACT_ID, sessionId, proofResult.proof, proofResult.publicInputs, kp1);
  assert(settleResult.success, "settleGame succeeded");
  console.log(`  TX Hash: ${settleResult.txHash}`);

  console.log("  Querying final game state...");
  const gameFinal = await getGameParsed(CONTRACT_ID, sessionId, kp1.publicKey());
  assert(gameFinal.winner === proofResult.winner, `on-chain winner (${gameFinal.winner}) matches proof (${proofResult.winner})`);
  console.log(`  Step 7 completed in ${elapsed(t7)}s`);

  // Step 8: Cross-verify with simulator
  const t8 = step("Step 8: Cross-Verify");

  const simResult = await simulateFullGame(seed1, seed2, BigInt(sessionId));
  assert(simResult.winner === proofResult.winner, `simulator winner (${simResult.winner}) matches proof (${proofResult.winner})`);
  console.log(`  Step 8 completed in ${elapsed(t8)}s`);

  // Summary
  console.log(`\n\x1b[1m=== Results ===\x1b[0m`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
  console.log(`  Total time: ${elapsed(totalStart)}s`);
  console.log(`  Winner: Player ${proofResult.winner}`);
  console.log(`  Session: ${sessionId}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error(`\n\x1b[31mTest failed:\x1b[0m ${err.message}`);
  process.exit(1);
});
