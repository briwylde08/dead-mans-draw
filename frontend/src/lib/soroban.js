/**
 * Soroban transaction builder + submitter for the Pirate Cards contract.
 *
 * All SDK imports come from a single "@stellar/stellar-sdk" entry point
 * (including rpc.Server) to avoid Vite bundling duplicate copies of
 * @stellar/stellar-base, which causes instanceof and XDR union mismatches.
 */

import {
  Contract,
  Transaction,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
  rpc,
} from "@stellar/stellar-sdk";
import { signTransaction } from "./wallet";

const RPC_URL = import.meta.env.VITE_RPC_URL || "https://soroban-testnet.stellar.org:443";
const NETWORK_PASSPHRASE = Networks.TESTNET;

/**
 * Raw JSON-RPC helper for getTransaction. Avoids the SDK's automatic parsing
 * of resultMetaXdr (xdr.TransactionMeta.fromXDR) which throws "Bad union
 * switch: 4" when the testnet returns Protocol 22's TransactionMeta v4 that
 * older SDK XDR schemas don't recognise.
 */
async function rawGetTransaction(hash) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash },
    }),
  });
  const json = await res.json();
  return json.result;
}

/**
 * Build, simulate, sign, and submit a Soroban transaction.
 */
async function submitTx(contractId, method, args, publicKey) {
  const server = new rpc.Server(RPC_URL);
  const contract = new Contract(contractId);
  const account = await server.getAccount(publicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);

  const signedXdr = await signTransaction(prepared.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = new Transaction(signedXdr, NETWORK_PASSPHRASE);

  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === "PENDING") {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const txResult = await rawGetTransaction(sendResponse.hash);
      if (txResult.status !== "NOT_FOUND") {
        if (txResult.status === "SUCCESS") {
          return { success: true };
        }
        return { success: false, error: `Transaction failed: ${txResult.status}` };
      }
    }
    return { success: false, error: "Transaction polling timed out" };
  }

  return { success: false, error: `Send failed: ${sendResponse.status}` };
}

/**
 * Create an open game: commit P1's seed. Anyone can join with the session ID.
 */
export async function createGame(contractId, sessionId, player1, seedCommitHex, publicKey) {
  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    new Address(player1).toScVal(),
    nativeToScVal(Buffer.from(seedCommitHex, "hex"), { type: "bytes" }),
  ];
  return submitTx(contractId, "create_game", args, publicKey);
}

/**
 * Join an open game: set yourself as player2 and commit your seed.
 */
export async function joinGame(contractId, sessionId, seedCommitHex, publicKey) {
  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    new Address(publicKey).toScVal(),
    nativeToScVal(Buffer.from(seedCommitHex, "hex"), { type: "bytes" }),
  ];
  return submitTx(contractId, "join_game", args, publicKey);
}

/**
 * Reveal a seed on-chain.
 */
export async function revealSeed(contractId, sessionId, seedHex, publicKey) {
  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    new Address(publicKey).toScVal(),
    nativeToScVal(Buffer.from(seedHex, "hex"), { type: "bytes" }),
  ];
  return submitTx(contractId, "reveal_seed", args, publicKey);
}

/**
 * Settle a game: submit ZK proof.
 */
export async function settleGame(contractId, sessionId, proof, pubInputs, publicKey) {
  // Encode Groth16Proof as ScvMap (alphabetically sorted keys)
  const proofVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("pi_a"),
      val: nativeToScVal(Buffer.from(proof.pi_a, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("pi_b"),
      val: nativeToScVal(Buffer.from(proof.pi_b, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("pi_c"),
      val: nativeToScVal(Buffer.from(proof.pi_c, "hex"), { type: "bytes" }),
    }),
  ]);

  // Encode PublicInputs as ScvMap (alphabetically sorted keys)
  const pubInputsVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("seed1"),
      val: nativeToScVal(Buffer.from(pubInputs.seed1, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("seed2"),
      val: nativeToScVal(Buffer.from(pubInputs.seed2, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("seed_commit1"),
      val: nativeToScVal(Buffer.from(pubInputs.seed_commit1, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("seed_commit2"),
      val: nativeToScVal(Buffer.from(pubInputs.seed_commit2, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("session_id"),
      val: nativeToScVal(Buffer.from(pubInputs.session_id, "hex"), { type: "bytes" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("winner"),
      val: nativeToScVal(Buffer.from(pubInputs.winner, "hex"), { type: "bytes" }),
    }),
  ]);

  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    proofVal,
    pubInputsVal,
  ];
  return submitTx(contractId, "settle_game", args, publicKey);
}

/**
 * Query game state (read-only simulation).
 */
export async function getGame(contractId, sessionId, publicKey) {
  const server = new rpc.Server(RPC_URL);
  const contract = new Contract(contractId);
  const account = await server.getAccount(publicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_game", nativeToScVal(sessionId, { type: "u32" })))
    .setTimeout(30)
    .build();

  const simResponse = await server.simulateTransaction(tx);
  if (simResponse.result) {
    return simResponse.result.retval;
  }
  return null;
}

/**
 * Query game state and return a parsed JS object.
 * Returns null if game not found.
 */
export async function getGameParsed(contractId, sessionId, publicKey) {
  const scVal = await getGame(contractId, sessionId, publicKey);
  if (!scVal) return null;

  const native = scValToNative(scVal);

  const toHex = (buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const isZero = (buf) => new Uint8Array(buf).every((b) => b === 0);

  return {
    player1: native.player1,
    player2: native.player2,
    phase: Number(native.phase),
    winner: Number(native.winner),
    seed1Hex: toHex(native.seed1),
    seed2Hex: toHex(native.seed2),
    seed1Revealed: !isZero(native.seed1),
    seed2Revealed: !isZero(native.seed2),
  };
}
