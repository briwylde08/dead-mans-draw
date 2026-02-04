/**
 * Deploy contracts to Soroban testnet.
 *
 * Usage: bun scripts/deploy.ts
 *
 * Requires STELLAR_SECRET_KEY env var (or Stellar CLI identity configured).
 */

import { $ } from "bun";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const WASM_DIR = join(ROOT, "target", "wasm32-unknown-unknown", "release");
const ENV_FILE = join(ROOT, ".env");
const NETWORK = "testnet";

async function deployContract(name: string, wasmFile: string): Promise<string> {
  const wasmPath = join(WASM_DIR, wasmFile);
  if (!existsSync(wasmPath)) {
    throw new Error(`WASM not found: ${wasmPath}. Run 'bun run build' first.`);
  }

  console.log(`\n==> Deploying ${name}...`);

  const result = await $`stellar contract deploy \
    --wasm ${wasmPath} \
    --network ${NETWORK} \
    --source default`.text();

  const contractId = result.trim();
  console.log(`  ${name} deployed: ${contractId}`);
  return contractId;
}

async function main() {
  console.log("==> Deploying contracts to testnet...");

  const ohlossId = await deployContract("mock-ohloss", "mock_ohloss.wasm");
  const pirateId = await deployContract("pirate-cards", "pirate_cards.wasm");

  // Write to .env
  const envContent = [
    `VITE_CONTRACT_ID=${pirateId}`,
    `OHLOSS_CONTRACT_ID=${ohlossId}`,
    `NETWORK=testnet`,
    "",
  ].join("\n");

  writeFileSync(ENV_FILE, envContent);
  console.log(`\n==> Contract IDs written to .env`);
  console.log(`  VITE_CONTRACT_ID=${pirateId}`);
  console.log(`  OHLOSS_CONTRACT_ID=${ohlossId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
