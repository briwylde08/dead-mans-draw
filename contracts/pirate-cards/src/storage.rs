use soroban_sdk::{contracttype, Address, Env};

use crate::types::{Game, VerificationKey};

const GAME_TTL_LEDGERS: u32 = 535_680; // ~30 days at 5s/ledger

#[contracttype]
pub enum DataKey {
    Admin,
    OhlossAddress,
    Vk,
    Game(u32),
}

// --- Admin ---

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

// --- Ohloss ---

pub fn get_ohloss(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::OhlossAddress)
        .unwrap()
}

pub fn set_ohloss(env: &Env, ohloss: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::OhlossAddress, ohloss);
}

// --- Verification Key ---

pub fn get_vk(env: &Env) -> VerificationKey {
    env.storage().instance().get(&DataKey::Vk).unwrap()
}

pub fn set_vk(env: &Env, vk: &VerificationKey) {
    env.storage().instance().set(&DataKey::Vk, vk);
}

pub fn has_vk(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Vk)
}

// --- Games ---

pub fn get_game(env: &Env, session_id: u32) -> Option<Game> {
    env.storage()
        .temporary()
        .get(&DataKey::Game(session_id))
}

pub fn set_game(env: &Env, session_id: u32, game: &Game) {
    let key = DataKey::Game(session_id);
    env.storage().temporary().set(&key, game);
    env.storage()
        .temporary()
        .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
}

pub fn has_game(env: &Env, session_id: u32) -> bool {
    env.storage()
        .temporary()
        .has(&DataKey::Game(session_id))
}
