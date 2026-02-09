# Dead Man's Draw ☠

> **Disclaimer:** This project is purely experimental and a test. It is not intended for production use.

> **Live Demo:** https://dist-cyan-pi.vercel.app

**The plank's right there. And somebody's swimming home.**

A pirate card game on [Stellar](https://soroban.stellar.org/) with zero-knowledge proofs.

## How to Play

### What You Need

- [Freighter wallet](https://www.freighter.app/) browser extension
- A Stellar Testnet account with test XLM ([friendbot](https://friendbot.stellar.org/) can fund you)

### Game Flow

1. **Connect Wallet** — Link your Freighter wallet
2. **Create or Join** — Start a new game with a session ID, or join an existing one
3. **Wait** — The game handles seed commitment and reveal automatically
4. **Draw Cards** — Take turns drawing from the shuffled deck, round by round
5. **Settle On-Chain** — Submit a ZK proof to finalize the winner on the blockchain

### The Deck

25 cards total:

| Card | Count | Symbol |
|------|-------|--------|
| Rum | 8 | Beats Skull |
| Skull | 8 | Beats Backstabber |
| Backstabber | 8 | Beats Rum |
| Black Spot | 1 | Instant loss for whoever draws it |

### Winning

- **First to 3 round wins** takes the game
- **Black Spot** — draw it and you lose immediately
- **Deck exhausted** — if no one hits 3 wins, highest score wins; tied scores go to a deterministic coin flip

## How It Works

Dead Man's Draw uses a **commit-reveal scheme** so neither player can cheat:

1. Both players secretly generate a random seed and commit its hash on-chain
2. After both have committed, seeds are revealed
3. The combined seeds deterministically shuffle the deck via **Poseidon hashing**
4. Rounds play out locally with the same logic as the ZK circuit
5. A **Groth16 zero-knowledge proof** is generated in-browser and submitted on-chain, proving the game outcome is correct without exposing either player's original seed

The smart contract verifies the proof and records the winner. No server ever touches the game state.

## Tech Stack

- **Stellar Soroban** — Smart contracts in Rust (Soroban SDK 25.0.2)
- **Circom + snarkjs** — Groth16 over BN254 for ZK proof generation
- **React + Vite** — Frontend
- **Freighter** — Wallet integration for transaction signing
- **Poseidon hashing** — Deterministic deck shuffling from combined player seeds

## Project Structure

```
pirate-zk-project/
├── circuits/               # Circom ZK circuits
│   ├── pirate_cards.circom #   Main circuit (shuffles deck + simulates game)
│   ├── deck_shuffle.circom #   Deck shuffle verification
│   └── game_sim.circom     #   Game round simulation
│
├── contracts/
│   ├── pirate-cards/       # Main game contract (create, join, reveal, settle)
│   └── mock-ohloss/        # Game Hub stub for reporting results
│
├── frontend/               # React app
│   ├── src/
│   │   ├── components/     #   UI components (Lobby, Board, WaitingRoom, etc.)
│   │   └── lib/            #   Soroban client, wallet, prover, game simulator
│   └── public/images/      #   Card artwork and background
│
├── prover/                 # ZK proving infrastructure
│   ├── build/              #   Compiled circuit (R1CS, WASM)
│   ├── keys/               #   Proving key (.zkey) and verification key
│   └── scripts/            #   Circuit build and key generation scripts
│
└── scripts/                # Contract build, deploy, and binding scripts
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (or [Bun](https://bun.sh/))
- [Rust](https://rustup.rs/) + [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- [Freighter wallet](https://www.freighter.app/) browser extension

### Setup

```bash
git clone https://github.com/briwylde08/pirate-zk-project.git
cd pirate-zk-project

# Install dependencies and build/deploy contracts
bun install
bun run setup    # builds contracts, deploys to testnet, generates bindings

# Start the frontend
cd frontend
npm install
npm run dev
```

### Environment

Create `frontend/.env`:

```env
VITE_CONTRACT_ID=<your pirate-cards contract ID>
VITE_RPC_URL=https://soroban-testnet.stellar.org:443
```

### Other Commands

```bash
bun run build          # Build Soroban contracts
bun run deploy         # Deploy to testnet
bun run test           # Run contract tests
bun run circuit:build  # Compile Circom circuits
bun run circuit:keys   # Generate proving/verification keys
```

## Deployed Contracts (Testnet)

| Contract | ID |
|----------|----|
| Pirate Cards | `CCIAGQ6KVIFG4OLJK7TRYMW2BPAJV5VDKK3N32LHCTV4UIZQSYKDI7AB` |
| Mock Ohloss | `CCO2UAHWVH46WI2WVXRU33LGOLWRJBXJ5KR6VQXB4GRQBKSBTBDMSD2V` |
