/**
 * Soroban contract helpers for automated testing.
 *
 * Mirrors src/lib/soroban.js but signs with Keypair instead of Freighter,
 * so tests can run headlessly against the Stellar testnet.
 */

import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
  rpc,
} from "@stellar/stellar-sdk";

const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org:443";
const NETWORK_PASSPHRASE = Networks.TESTNET;

/**
 * Raw JSON-RPC helper for getTransaction. Avoids the SDK's automatic parsing
 * of resultMetaXdr which throws on Protocol 22's TransactionMeta v4.
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
 * Build, simulate, sign (with Keypair), and submit a Soroban transaction.
 */
async function submitTx(contractId, method, args, keypair) {
  const server = new rpc.Server(RPC_URL);
  const contract = new Contract(contractId);
  const publicKey = keypair.publicKey();
  const account = await server.getAccount(publicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);

  const sendResponse = await server.sendTransaction(prepared);
  const txHash = sendResponse.hash;

  if (sendResponse.status === "PENDING") {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const txResult = await rawGetTransaction(txHash);
      if (txResult.status !== "NOT_FOUND") {
        if (txResult.status === "SUCCESS") {
          return { success: true, txHash };
        }
        return { success: false, txHash, error: `Transaction failed: ${txResult.status}` };
      }
    }
    return { success: false, txHash, error: "Transaction polling timed out" };
  }

  return { success: false, txHash, error: `Send failed: ${sendResponse.status}` };
}

/**
 * Fund a testnet account via friendbot. Tolerates "already funded" errors.
 */
export async function fundAccount(publicKey) {
  const url = `https://friendbot.stellar.org?addr=${publicKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    // Already funded is fine
    if (text.includes("createAccountAlreadyExist") || text.includes("already exists")) {
      return { funded: false, reason: "already exists" };
    }
    throw new Error(`Friendbot failed: ${res.status} ${text}`);
  }
  return { funded: true };
}

/**
 * Create an open game: commit P1's seed.
 */
export async function createGame(contractId, sessionId, player1PublicKey, seedCommitHex, keypair) {
  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    new Address(player1PublicKey).toScVal(),
    nativeToScVal(Buffer.from(seedCommitHex, "hex"), { type: "bytes" }),
  ];
  return submitTx(contractId, "create_game", args, keypair);
}

/**
 * Join an open game: set yourself as player2 and commit your seed.
 */
export async function joinGame(contractId, sessionId, seedCommitHex, keypair) {
  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    new Address(keypair.publicKey()).toScVal(),
    nativeToScVal(Buffer.from(seedCommitHex, "hex"), { type: "bytes" }),
  ];
  return submitTx(contractId, "join_game", args, keypair);
}

/**
 * Reveal a seed on-chain.
 */
export async function revealSeed(contractId, sessionId, seedHex, keypair) {
  const args = [
    nativeToScVal(sessionId, { type: "u32" }),
    new Address(keypair.publicKey()).toScVal(),
    nativeToScVal(Buffer.from(seedHex, "hex"), { type: "bytes" }),
  ];
  return submitTx(contractId, "reveal_seed", args, keypair);
}

/**
 * Settle a game: submit ZK proof.
 */
export async function settleGame(contractId, sessionId, proof, pubInputs, keypair) {
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
  return submitTx(contractId, "settle_game", args, keypair);
}

/**
 * Query game state (read-only simulation).
 */
export async function getGameParsed(contractId, sessionId, publicKey) {
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
  if (!simResponse.result) return null;

  const native = scValToNative(simResponse.result.retval);

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
