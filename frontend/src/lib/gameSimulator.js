/**
 * Deterministic game simulation for Pirate Cards.
 *
 * Computes the deck shuffle and plays out rounds using Poseidon hashing.
 * This is the same logic as the ZK circuit / prover, but without
 * generating a proof — used for the interactive game board.
 */

import { buildPoseidon } from "circomlibjs";

const N_CARDS = 25;

let poseidonInstance = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

export const CARD_TYPE_NAMES = ["Sails", "Cannon", "Cutlass", "Black Spot"];
export const CARD_SYMBOLS = ["\u25B2", "\u25A0", "\u2571", "\u25CF"];

export function cardType(c) {
  if (c < 8) return 0;  // Sails  (Triangle)
  if (c < 16) return 1; // Cannon  (Square)
  if (c < 24) return 2; // Cutlass (Line)
  return 3;             // Black Spot
}

function rpsWinner(type1, type2) {
  if (type1 === type2) return 0;
  if ((type1 + 1) % 3 === type2) return 1;
  return 2;
}

/**
 * Simulate the full pirate cards game from two seeds and a session ID.
 *
 * @param {BigInt} seed1 - Player 1's seed
 * @param {BigInt} seed2 - Player 2's seed
 * @param {BigInt} sessionId - Game session ID
 * @returns {{ deck: number[], rounds: object[], winner: number, endReason: string }}
 */
export async function simulateFullGame(seed1, seed2, sessionId) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const combinedSeed = F.toObject(poseidon([seed1, seed2, sessionId]));

  // Compute card weights, sort by truncated 128-bit values (matches circuit)
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

  const deck = weights.map((w) => w.card);

  // Play rounds
  let scoreP1 = 0;
  let scoreP2 = 0;
  let winner = 0;
  let gameOver = false;
  const rounds = [];
  const nRounds = Math.floor((N_CARDS - 1) / 2);

  for (let i = 0; i < nRounds && !gameOver; i++) {
    const c1 = deck[2 * i];
    const c2 = deck[2 * i + 1];
    const t1 = cardType(c1);
    const t2 = cardType(c2);
    let roundWinner = 0;
    let blackSpot = false;

    if (t1 === 3) {
      blackSpot = true;
      winner = 2;
      gameOver = true;
    } else if (t2 === 3) {
      blackSpot = true;
      winner = 1;
      gameOver = true;
    } else {
      const rps = rpsWinner(t1, t2);
      if (rps === 1) { roundWinner = 1; scoreP1++; }
      else if (rps === 2) { roundWinner = 2; scoreP2++; }

      if (scoreP1 >= 3) { winner = 1; gameOver = true; }
      else if (scoreP2 >= 3) { winner = 2; gameOver = true; }
    }

    rounds.push({
      card1: c1,
      card2: c2,
      type1: t1,
      type2: t2,
      roundWinner,
      blackSpot,
      scoreP1,
      scoreP2,
      gameOver,
    });
  }

  let endReason = "score";
  if (!gameOver) {
    if (scoreP1 > scoreP2) {
      winner = 1;
      endReason = "exhausted";
    } else if (scoreP2 > scoreP1) {
      winner = 2;
      endReason = "exhausted";
    } else {
      const coinHash = F.toObject(poseidon([combinedSeed, BigInt(N_CARDS)]));
      winner = Number(coinHash & 1n) + 1;
      endReason = "coinflip";
    }
  } else if (rounds.length > 0 && rounds[rounds.length - 1].blackSpot) {
    endReason = "blackspot";
  }

  return { deck, rounds, winner, endReason };
}
