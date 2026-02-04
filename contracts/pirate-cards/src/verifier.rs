use soroban_sdk::{vec, Env, Vec};
use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr};

use crate::types::{Groth16Proof, PublicInputs, VerificationKey};

/// BN254 base field modulus p (big-endian, 32 bytes).
/// Used to negate G1 points: neg(x, y) = (x, p - y).
const BN254_P: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
    0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// Verify a Groth16 proof over BN254 using Protocol 25 host functions.
///
/// 6 public inputs: seed_commit1, seed_commit2, seed1, seed2, session_id, winner
/// IC vector has 7 entries (nPublic + 1).
///
/// Verification equation (multi-pairing):
///   e(A, B) * e(-alpha, beta) * e(-vk_x, gamma) * e(-C, delta) == 1
pub fn verify_groth16(
    env: &Env,
    proof: &Groth16Proof,
    vk: &VerificationKey,
    pub_inputs: &PublicInputs,
) -> bool {
    let bn254 = env.crypto().bn254();

    // 6 public inputs as Fr scalars
    let scalars: [Fr; 6] = [
        Fr::from_bytes(pub_inputs.seed_commit1.clone()),
        Fr::from_bytes(pub_inputs.seed_commit2.clone()),
        Fr::from_bytes(pub_inputs.seed1.clone()),
        Fr::from_bytes(pub_inputs.seed2.clone()),
        Fr::from_bytes(pub_inputs.session_id.clone()),
        Fr::from_bytes(pub_inputs.winner.clone()),
    ];

    // Compute vk_x = IC[0] + sum(IC[i+1] * scalars[i])
    let mut vk_x = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
    for i in 0u32..6 {
        let ic_point = Bn254G1Affine::from_bytes(vk.ic.get(i + 1).unwrap());
        let term = bn254.g1_mul(&ic_point, &scalars[i as usize]);
        vk_x = bn254.g1_add(&vk_x, &term);
    }

    // Negate G1 points for the pairing equation
    let neg_alpha = negate_g1(env, &Bn254G1Affine::from_bytes(vk.alpha_g1.clone()));
    let neg_vk_x = negate_g1(env, &vk_x);
    let neg_c = negate_g1(env, &Bn254G1Affine::from_bytes(proof.pi_c.clone()));

    let g1_points: Vec<Bn254G1Affine> = vec![
        env,
        Bn254G1Affine::from_bytes(proof.pi_a.clone()),
        neg_alpha,
        neg_vk_x,
        neg_c,
    ];

    let g2_points: Vec<Bn254G2Affine> = vec![
        env,
        Bn254G2Affine::from_bytes(proof.pi_b.clone()),
        Bn254G2Affine::from_bytes(vk.beta_g2.clone()),
        Bn254G2Affine::from_bytes(vk.gamma_g2.clone()),
        Bn254G2Affine::from_bytes(vk.delta_g2.clone()),
    ];

    bn254.pairing_check(g1_points, g2_points)
}

/// Negate a BN254 G1 affine point: (x, y) -> (x, p - y).
fn negate_g1(env: &Env, point: &Bn254G1Affine) -> Bn254G1Affine {
    let bytes = point.to_array();

    let mut x_bytes = [0u8; 32];
    let mut y_bytes = [0u8; 32];
    x_bytes.copy_from_slice(&bytes[0..32]);
    y_bytes.copy_from_slice(&bytes[32..64]);

    if y_bytes == [0u8; 32] {
        return Bn254G1Affine::from_array(env, &[0u8; 64]);
    }

    let neg_y = field_sub_be(&BN254_P, &y_bytes);

    let mut result = [0u8; 64];
    result[0..32].copy_from_slice(&x_bytes);
    result[32..64].copy_from_slice(&neg_y);

    Bn254G1Affine::from_array(env, &result)
}

/// Big-endian 32-byte subtraction: a - b. Assumes a >= b.
fn field_sub_be(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    let mut borrow: i32 = 0;
    for i in (0..32).rev() {
        let diff = (a[i] as i32) - (b[i] as i32) - borrow;
        if diff < 0 {
            result[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            result[i] = diff as u8;
            borrow = 0;
        }
    }
    result
}
