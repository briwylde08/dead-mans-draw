#![cfg(test)]
extern crate mock_ohloss;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

use crate::{
    types::Game, Error, PirateCardsContract, PirateCardsContractClient, PHASE_CREATED,
    PHASE_JOINED, PHASE_REVEALED,
};

fn setup_env() -> (
    Env,
    Address,                       // contract id
    PirateCardsContractClient<'static>,
    Address,                       // admin
    Address,                       // ohloss (mock)
    Address,                       // player1
    Address,                       // player2
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let ohloss_id = env.register(mock_ohloss::MockOhloss, ());
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    let contract_id =
        env.register(PirateCardsContract, (&admin, &ohloss_id));
    let client = PirateCardsContractClient::new(&env, &contract_id);

    (env, contract_id, client, admin, ohloss_id, player1, player2)
}

fn fake_commit(env: &Env, val: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[31] = val;
    BytesN::from_array(env, &arr)
}

#[test]
fn test_create_game() {
    let (env, _, client, _, _, p1, _) = setup_env();

    let commit1 = fake_commit(&env, 0xAA);
    client.create_game(&1u32, &p1, &commit1);

    let game: Game = client.get_game(&1u32).unwrap();
    assert_eq!(game.player1, p1);
    assert_eq!(game.player2, p1); // sentinel: player2 == player1 until join
    assert_eq!(game.seed_commit1, commit1);
    assert_eq!(game.phase, PHASE_CREATED);
    assert_eq!(game.winner, 0);
}

#[test]
fn test_self_play_rejected() {
    let (env, _, client, _, _, p1, _) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);

    client.create_game(&1u32, &p1, &commit1);
    let result = client.try_join_game(&1u32, &p1, &commit2);
    assert_eq!(result.err().unwrap().unwrap(), Error::SelfPlay);
}

#[test]
fn test_duplicate_session_rejected() {
    let (env, _, client, _, _, p1, _) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);

    client.create_game(&1u32, &p1, &commit1);
    let result = client.try_create_game(&1u32, &p1, &commit1);
    assert_eq!(result.err().unwrap().unwrap(), Error::GameAlreadyExists);
}

#[test]
fn test_join_game() {
    let (env, _, client, _, _, p1, p2) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);

    client.create_game(&1u32, &p1, &commit1);
    client.join_game(&1u32, &p2, &commit2);

    let game = client.get_game(&1u32).unwrap();
    assert_eq!(game.player2, p2);
    assert_eq!(game.seed_commit2, commit2);
    assert_eq!(game.phase, PHASE_JOINED);
}

#[test]
fn test_join_wrong_phase() {
    let (env, _, client, _, _, p1, p2) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);

    client.create_game(&1u32, &p1, &commit1);
    client.join_game(&1u32, &p2, &commit2);

    // Joining again should fail
    let p3 = Address::generate(&env);
    let result = client.try_join_game(&1u32, &p3, &commit2);
    assert_eq!(result.err().unwrap().unwrap(), Error::InvalidState);
}

#[test]
fn test_reveal_seed() {
    let (env, _, client, _, _, p1, p2) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);
    let seed1 = fake_commit(&env, 0x11);
    let seed2 = fake_commit(&env, 0x22);

    client.create_game(&1u32, &p1, &commit1);
    client.join_game(&1u32, &p2, &commit2);

    // P1 reveals
    client.reveal_seed(&1u32, &p1, &seed1);
    let game = client.get_game(&1u32).unwrap();
    assert_eq!(game.seed1, seed1);
    assert_eq!(game.phase, PHASE_JOINED); // Still joined, only one revealed

    // P2 reveals
    client.reveal_seed(&1u32, &p2, &seed2);
    let game = client.get_game(&1u32).unwrap();
    assert_eq!(game.seed2, seed2);
    assert_eq!(game.phase, PHASE_REVEALED); // Now both revealed
}

#[test]
fn test_reveal_before_join() {
    let (env, _, client, _, _, p1, _) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let seed1 = fake_commit(&env, 0x11);

    client.create_game(&1u32, &p1, &commit1);

    // Reveal before P2 joins should fail
    let result = client.try_reveal_seed(&1u32, &p1, &seed1);
    assert_eq!(result.err().unwrap().unwrap(), Error::InvalidState);
}

#[test]
fn test_double_reveal_rejected() {
    let (env, _, client, _, _, p1, p2) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);
    let seed1 = fake_commit(&env, 0x11);

    client.create_game(&1u32, &p1, &commit1);
    client.join_game(&1u32, &p2, &commit2);
    client.reveal_seed(&1u32, &p1, &seed1);

    // P1 revealing again should fail
    let result = client.try_reveal_seed(&1u32, &p1, &seed1);
    assert_eq!(result.err().unwrap().unwrap(), Error::AlreadyRevealed);
}

#[test]
fn test_non_player_reveal_rejected() {
    let (env, _, client, _, _, p1, p2) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);
    let outsider = Address::generate(&env);

    client.create_game(&1u32, &p1, &commit1);
    client.join_game(&1u32, &p2, &commit2);

    let result = client.try_reveal_seed(&1u32, &outsider, &fake_commit(&env, 0x99));
    assert_eq!(result.err().unwrap().unwrap(), Error::NotPlayer);
}

#[test]
fn test_settle_before_reveals_rejected() {
    let (env, _, client, _, _, p1, p2) = setup_env();
    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);

    client.create_game(&1u32, &p1, &commit1);
    client.join_game(&1u32, &p2, &commit2);

    // Try to settle before revealing seeds
    let fake_proof = crate::types::Groth16Proof {
        pi_a: BytesN::from_array(&env, &[0u8; 64]),
        pi_b: BytesN::from_array(&env, &[0u8; 128]),
        pi_c: BytesN::from_array(&env, &[0u8; 64]),
    };
    let fake_inputs = crate::types::PublicInputs {
        seed_commit1: commit1,
        seed_commit2: commit2,
        seed1: fake_commit(&env, 0x11),
        seed2: fake_commit(&env, 0x22),
        session_id: fake_commit(&env, 1),
        winner: fake_commit(&env, 1),
    };

    let result = client.try_settle_game(&1u32, &fake_proof, &fake_inputs);
    assert_eq!(result.err().unwrap().unwrap(), Error::SeedsNotRevealed);
}

#[test]
fn test_game_not_found() {
    let (_, _, client, _, _, _, _) = setup_env();

    let result = client.get_game(&999u32);
    assert!(result.is_none());
}

#[test]
fn test_full_game_flow_until_settlement() {
    let (env, _, client, _, _, p1, p2) = setup_env();

    let commit1 = fake_commit(&env, 0xAA);
    let commit2 = fake_commit(&env, 0xBB);
    let seed1 = fake_commit(&env, 0x11);
    let seed2 = fake_commit(&env, 0x22);

    // 1. Create open game
    client.create_game(&1u32, &p1, &commit1);
    assert_eq!(client.get_game(&1u32).unwrap().phase, PHASE_CREATED);

    // 2. P2 joins
    client.join_game(&1u32, &p2, &commit2);
    let game = client.get_game(&1u32).unwrap();
    assert_eq!(game.phase, PHASE_JOINED);
    assert_eq!(game.player2, p2);

    // 3. Both reveal (in either order)
    client.reveal_seed(&1u32, &p2, &seed2);
    assert_eq!(client.get_game(&1u32).unwrap().phase, PHASE_JOINED);

    client.reveal_seed(&1u32, &p1, &seed1);
    assert_eq!(client.get_game(&1u32).unwrap().phase, PHASE_REVEALED);

    // 4. Settlement would happen here with a real ZK proof
    let game = client.get_game(&1u32).unwrap();
    assert_eq!(game.seed1, seed1);
    assert_eq!(game.seed2, seed2);
    assert_eq!(game.seed_commit1, commit1);
    assert_eq!(game.seed_commit2, commit2);
}
