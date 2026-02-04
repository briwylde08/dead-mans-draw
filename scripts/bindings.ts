/**
 * Generate TypeScript bindings for the pirate-cards contract.
 *
 * Usage: bun scripts/bindings.ts
 *
 * Reads VITE_CONTRACT_ID from .env (or pass as first argument).
 */

import { $ } from "bun";
import { join } from "path";
import { existsSync } from "fs";

const ROOT = join(import.meta.dir, "..");
const WASM_DIR = join(ROOT, "target", "wasm32-unknown-unknown", "release");
const OUTPUT_DIR = join(ROOT, "frontend", "src", "bindings");

async function main() {
  let contractId = process.argv[2];

  // Try reading from .env if not passed as argument
  if (!contractId) {
    const envPath = join(ROOT, ".env");
    if (existsSync(envPath)) {
      const envContent = await Bun.file(envPath).text();
      const match = envContent.match(/VITE_CONTRACT_ID=(.+)/);
      if (match) contractId = match[1].trim();
    }
  }

  const wasmPath = join(WASM_DIR, "pirate_cards.wasm");
  if (!existsSync(wasmPath)) {
    throw new Error(`WASM not found: ${wasmPath}. Run 'bun run build' first.`);
  }

  console.log("==> Generating TypeScript bindings...");

  await $`stellar contract bindings typescript \
    --wasm ${wasmPath} \
    --output-dir ${OUTPUT_DIR} \
    --overwrite`;

  console.log(`  Bindings written to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
