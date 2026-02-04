use soroban_sdk::{contracttype, Address, BytesN, Vec};

/// Game state stored in temporary storage (30-day TTL).
#[contracttype]
#[derive(Clone, Debug)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub seed_commit1: BytesN<32>,
    pub seed_commit2: BytesN<32>,
    pub seed1: BytesN<32>,
    pub seed2: BytesN<32>,
    pub phase: u32, // 0=created, 1=joined, 2=p1_revealed, 3=p2_revealed, 4=both_revealed, 5=settled
    pub winner: u32, // 0=none, 1=player1, 2=player2
}

/// Groth16 proof over BN254 (Protocol 25).
/// G1 points: 64 bytes (be(X) || be(Y), 32 bytes each).
/// G2 points: 128 bytes (be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)).
#[contracttype]
#[derive(Clone, Debug)]
pub struct Groth16Proof {
    pub pi_a: BytesN<64>,
    pub pi_b: BytesN<128>,
    pub pi_c: BytesN<64>,
}

/// Groth16 verification key stored on-chain.
/// IC length = nPublic + 1 (7 entries for 6 public inputs).
#[contracttype]
#[derive(Clone, Debug)]
pub struct VerificationKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

/// Public inputs for the pirate cards circuit.
/// 6 field elements, each 32 bytes big-endian:
///   seed_commit1, seed_commit2, seed1, seed2, session_id, winner
#[contracttype]
#[derive(Clone, Debug)]
pub struct PublicInputs {
    pub seed_commit1: BytesN<32>,
    pub seed_commit2: BytesN<32>,
    pub seed1: BytesN<32>,
    pub seed2: BytesN<32>,
    pub session_id: BytesN<32>,
    pub winner: BytesN<32>,
}
