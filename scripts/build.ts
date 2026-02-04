/**
 * Build Soroban contracts.
 *
 * Usage: bun scripts/build.ts
 */

import { $ } from "bun";

console.log("==> Building Soroban contracts...\n");

await $`stellar contract build`;

console.log("\n==> Contracts built successfully.");
console.log(
  "  WASM files are in target/wasm32-unknown-unknown/release/"
);
