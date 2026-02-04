#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, log};

#[contract]
pub struct MockOhloss;

#[contractimpl]
impl MockOhloss {
    pub fn start_game(
        env: Env,
        _game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
    ) {
        log!(
            &env,
            "mock start_game: session={}, p1={}, p2={}",
            session_id,
            player1,
            player2
        );
    }

    pub fn end_game(env: Env, session_id: u32, player1_won: bool) {
        log!(
            &env,
            "mock end_game: session={}, player1_won={}",
            session_id,
            player1_won
        );
    }
}
