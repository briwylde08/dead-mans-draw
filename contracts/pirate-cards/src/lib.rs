#![no_std]

mod events;
mod storage;
pub mod types;
mod verifier;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, Address, BytesN, Env,
};

use types::{Game, Groth16Proof, PublicInputs, VerificationKey};

// Game phases
const PHASE_CREATED: u32 = 0;
const PHASE_JOINED: u32 = 1;
const PHASE_REVEALED: u32 = 2;
const PHASE_SETTLED: u32 = 3;

/// Ohloss protocol interface. The `#[contractclient]` macro generates
/// `OhlossClient` for cross-contract calls to start_game / end_game.
#[contractclient(name = "OhlossClient")]
pub trait Ohloss {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    GameAlreadyExists = 2,
    NotPlayer = 3,
    InvalidState = 4,
    InvalidProof = 5,
    AlreadyRevealed = 6,
    SeedsNotRevealed = 7,
    GameAlreadySettled = 8,
    InvalidWinner = 9,
    NoVk = 10,
    PublicInputMismatch = 11,
    SelfPlay = 12,
}

#[contract]
pub struct PirateCardsContract;

fn zero32(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

#[contractimpl]
impl PirateCardsContract {
    /// Deploy: store admin and Ohloss contract address.
    pub fn __constructor(env: Env, admin: Address, ohloss: Address) {
        storage::set_admin(&env, &admin);
        storage::set_ohloss(&env, &ohloss);
    }

    /// Admin: set the Groth16 verification key.
    pub fn set_vk(env: Env, vk: VerificationKey) -> Result<(), Error> {
        let admin = storage::get_admin(&env);
        admin.require_auth();
        storage::set_vk(&env, &vk);
        Ok(())
    }

    /// P1 creates an open game. Anyone can join via join_game.
    pub fn create_game(
        env: Env,
        session_id: u32,
        player1: Address,
        seed_commit1: BytesN<32>,
    ) -> Result<(), Error> {
        if storage::has_game(&env, session_id) {
            return Err(Error::GameAlreadyExists);
        }

        player1.require_auth();

        let z = zero32(&env);
        let game = Game {
            player1: player1.clone(),
            player2: player1.clone(), // sentinel — no player2 yet
            seed_commit1,
            seed_commit2: z.clone(),
            seed1: z.clone(),
            seed2: z,
            phase: PHASE_CREATED,
            winner: 0,
        };
        storage::set_game(&env, session_id, &game);
        events::emit_game_created(&env, session_id, &player1);

        Ok(())
    }

    /// Any player can join an open game by providing the session ID.
    /// Sets player2, commits their seed, and registers the game with Ohloss.
    pub fn join_game(
        env: Env,
        session_id: u32,
        player2: Address,
        seed_commit2: BytesN<32>,
    ) -> Result<(), Error> {
        let mut game = storage::get_game(&env, session_id)
            .ok_or(Error::GameNotFound)?;
        if game.phase != PHASE_CREATED {
            return Err(Error::InvalidState);
        }
        if player2 == game.player1 {
            return Err(Error::SelfPlay);
        }

        player2.require_auth();

        game.player2 = player2.clone();
        game.seed_commit2 = seed_commit2;
        game.phase = PHASE_JOINED;

        // Both players now known — register with Ohloss
        let ohloss_addr = storage::get_ohloss(&env);
        let ohloss = OhlossClient::new(&env, &ohloss_addr);
        ohloss.start_game(
            &env.current_contract_address(),
            &session_id,
            &game.player1,
            &player2,
        );

        storage::set_game(&env, session_id, &game);
        events::emit_game_joined(&env, session_id, &player2);

        Ok(())
    }

    /// Either player reveals their seed. Both must reveal before settlement.
    pub fn reveal_seed(
        env: Env,
        session_id: u32,
        player: Address,
        seed: BytesN<32>,
    ) -> Result<(), Error> {
        let mut game = storage::get_game(&env, session_id)
            .ok_or(Error::GameNotFound)?;

        // Must be joined but not yet fully revealed
        if game.phase < PHASE_JOINED || game.phase >= PHASE_REVEALED {
            return Err(Error::InvalidState);
        }

        player.require_auth();

        let z = zero32(&env);

        if player == game.player1 {
            if game.seed1 != z {
                return Err(Error::AlreadyRevealed);
            }
            game.seed1 = seed;
        } else if player == game.player2 {
            if game.seed2 != z {
                return Err(Error::AlreadyRevealed);
            }
            game.seed2 = seed;
        } else {
            return Err(Error::NotPlayer);
        }

        // If both seeds revealed, advance phase
        if game.seed1 != z && game.seed2 != z {
            game.phase = PHASE_REVEALED;
        }

        let p = player.clone();
        storage::set_game(&env, session_id, &game);
        events::emit_seed_revealed(&env, session_id, &p);

        Ok(())
    }

    /// Anyone can settle by submitting a valid ZK proof.
    /// The proof determines the winner based on the revealed seeds.
    /// Calls ohloss.end_game() to report the result.
    pub fn settle_game(
        env: Env,
        session_id: u32,
        proof: Groth16Proof,
        pub_inputs: PublicInputs,
    ) -> Result<Address, Error> {
        let game = storage::get_game(&env, session_id)
            .ok_or(Error::GameNotFound)?;

        if game.phase < PHASE_REVEALED {
            return Err(Error::SeedsNotRevealed);
        }
        if game.phase >= PHASE_SETTLED {
            return Err(Error::GameAlreadySettled);
        }
        if !storage::has_vk(&env) {
            return Err(Error::NoVk);
        }

        // Verify public inputs match on-chain state
        if pub_inputs.seed_commit1 != game.seed_commit1
            || pub_inputs.seed_commit2 != game.seed_commit2
            || pub_inputs.seed1 != game.seed1
            || pub_inputs.seed2 != game.seed2
        {
            return Err(Error::PublicInputMismatch);
        }

        // session_id: u32 → 32-byte big-endian field element
        let mut sid_bytes = [0u8; 32];
        sid_bytes[28..32].copy_from_slice(&session_id.to_be_bytes());
        if pub_inputs.session_id != BytesN::from_array(&env, &sid_bytes) {
            return Err(Error::PublicInputMismatch);
        }

        // Winner must be 1 (player1) or 2 (player2)
        let mut w1_bytes = [0u8; 32];
        w1_bytes[31] = 1;
        let mut w2_bytes = [0u8; 32];
        w2_bytes[31] = 2;

        let player1_won = if pub_inputs.winner == BytesN::from_array(&env, &w1_bytes) {
            true
        } else if pub_inputs.winner == BytesN::from_array(&env, &w2_bytes) {
            false
        } else {
            return Err(Error::InvalidWinner);
        };

        // Verify ZK proof (expensive — last)
        let vk = storage::get_vk(&env);
        if !verifier::verify_groth16(&env, &proof, &vk, &pub_inputs) {
            return Err(Error::InvalidProof);
        }

        let winner_addr = if player1_won {
            game.player1.clone()
        } else {
            game.player2.clone()
        };

        // Update game state
        let mut settled = game;
        settled.winner = if player1_won { 1 } else { 2 };
        settled.phase = PHASE_SETTLED;
        storage::set_game(&env, session_id, &settled);

        // Report result to Ohloss
        let ohloss_addr = storage::get_ohloss(&env);
        let ohloss = OhlossClient::new(&env, &ohloss_addr);
        ohloss.end_game(&session_id, &player1_won);

        events::emit_game_settled(&env, session_id, &winner_addr);

        Ok(winner_addr)
    }

    /// Query game state.
    pub fn get_game(env: Env, session_id: u32) -> Option<Game> {
        storage::get_game(&env, session_id)
    }
}
