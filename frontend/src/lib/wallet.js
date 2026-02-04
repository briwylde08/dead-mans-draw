/**
 * Freighter wallet helpers (v2 API).
 */

import freighter from "@stellar/freighter-api";

export async function isFreighterInstalled() {
  // Freighter injects its API asynchronously — retry briefly if not found
  for (let i = 0; i < 5; i++) {
    try {
      const result = await freighter.isConnected();
      const connected = typeof result === "boolean" ? result : !!result?.isConnected;
      if (connected) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export async function connectWallet() {
  const installed = await isFreighterInstalled();
  if (!installed) {
    throw new Error("Freighter wallet not found. Install it from freighter.app");
  }

  await freighter.requestAccess();

  const publicKey = await freighter.getPublicKey();
  if (!publicKey) {
    throw new Error("Could not retrieve public key from Freighter");
  }

  return publicKey;
}

export async function getNetwork() {
  const network = await freighter.getNetwork();
  return network || "TESTNET";
}

export async function signTransaction(xdr, networkPassphrase) {
  const result = await freighter.signTransaction(xdr, {
    networkPassphrase,
  });

  // Freighter v2 returns { signedTxXdr, signerAddress } instead of a plain string
  const signedXdr = typeof result === "string" ? result : result?.signedTxXdr;

  if (!signedXdr) {
    throw new Error("Transaction signing failed");
  }

  return signedXdr;
}
