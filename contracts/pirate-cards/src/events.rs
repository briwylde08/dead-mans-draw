use soroban_sdk::{contractevent, Address, Env};

#[contractevent]
pub struct GameCreated {
    pub session_id: u32,
    pub player1: Address,
}

#[contractevent]
pub struct GameJoined {
    pub session_id: u32,
    pub player2: Address,
}

#[contractevent]
pub struct SeedRevealed {
    pub session_id: u32,
    pub player: Address,
}

#[contractevent]
pub struct GameSettled {
    pub session_id: u32,
    pub winner: Address,
}

pub fn emit_game_created(env: &Env, session_id: u32, player1: &Address) {
    GameCreated {
        session_id,
        player1: player1.clone(),
    }
    .publish(env);
}

pub fn emit_game_joined(env: &Env, session_id: u32, player2: &Address) {
    GameJoined {
        session_id,
        player2: player2.clone(),
    }
    .publish(env);
}

pub fn emit_seed_revealed(env: &Env, session_id: u32, player: &Address) {
    SeedRevealed {
        session_id,
        player: player.clone(),
    }
    .publish(env);
}

pub fn emit_game_settled(env: &Env, session_id: u32, winner: &Address) {
    GameSettled {
        session_id,
        winner: winner.clone(),
    }
    .publish(env);
}
