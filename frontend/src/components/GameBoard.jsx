import { useState } from "react";
import {
  simulateFullGame,
  CARD_TYPE_NAMES,
  CARD_SYMBOLS,
} from "../lib/gameSimulator";
import "./GameBoard.css";

export default function GameBoard({ gameState, onGameComplete }) {
  const { sessionId, seed, playerRole } = gameState;
  const [opponentSeedInput, setOpponentSeedInput] = useState("");
  const [game, setGame] = useState(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState("ready"); // ready | drawn | revealed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [storedOpponentSeed, setStoredOpponentSeed] = useState(null);

  const handleStart = async () => {
    if (!opponentSeedInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const trimmed = opponentSeedInput.trim().replace(/^0x/i, "");
      const oppSeed = BigInt("0x" + trimmed);
      setStoredOpponentSeed(oppSeed);

      const seed1 = playerRole === 1 ? seed : oppSeed;
      const seed2 = playerRole === 2 ? seed : oppSeed;

      const result = await simulateFullGame(seed1, seed2, BigInt(sessionId));
      setGame(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrawYourCard = () => setPhase("drawn");

  const handleRevealOpponent = () => setPhase("revealed");

  const handleNextRound = () => {
    setRoundIndex((i) => i + 1);
    setPhase("ready");
  };

  const handleSettle = () => {
    onGameComplete({ opponentSeed: storedOpponentSeed });
  };

  // Current round data
  const round = game?.rounds[roundIndex] ?? null;
  const gameFinished = phase === "revealed" && round?.gameOver;

  // Your card / opponent card based on playerRole
  const yourType = round
    ? playerRole === 1 ? round.type1 : round.type2
    : null;
  const oppType = round
    ? playerRole === 1 ? round.type2 : round.type1
    : null;

  // Effective round winner (handles blackspot where roundWinner stays 0)
  const effectiveWinner = round?.blackSpot
    ? (round.type1 === 3 ? 2 : 1)
    : round?.roundWinner ?? 0;

  // Scores: update only after opponent card is revealed
  const visibleScore = () => {
    if (!game) return [0, 0];
    if (phase === "revealed") return [round.scoreP1, round.scoreP2];
    if (roundIndex > 0) {
      const prev = game.rounds[roundIndex - 1];
      return [prev.scoreP1, prev.scoreP2];
    }
    return [0, 0];
  };
  const [sp1, sp2] = visibleScore();
  const yourScore = playerRole === 1 ? sp1 : sp2;
  const oppScore = playerRole === 1 ? sp2 : sp1;

  // History: show fully-revealed rounds only
  const historyEnd = phase === "revealed" ? roundIndex + 1 : roundIndex;

  // --- Seed input form ---
  if (!game) {
    return (
      <div className="game-board">
        <h2>Draw Yer Cards</h2>
        <p className="board-info">
          Session #{sessionId} &mdash; Player {playerRole}
        </p>

        <p className="board-note">
          Both seeds are revealed on-chain. Enter your opponent&rsquo;s seed to
          shuffle the deck and start drawing.
        </p>

        <div className="form-group">
          <label htmlFor="opp-seed">Opponent&rsquo;s Revealed Seed (hex)</label>
          <input
            id="opp-seed"
            type="text"
            value={opponentSeedInput}
            onChange={(e) => setOpponentSeedInput(e.target.value)}
            placeholder="00abcdef..."
            disabled={loading}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={loading || !opponentSeedInput.trim()}
        >
          {loading ? "Shuffling deck..." : "Shuffle & Play"}
        </button>

        {error && <p className="error-text">{error}</p>}

        <p className="board-hint">
          Query seeds with:{" "}
          <code>
            stellar contract invoke ... -- get_game --session_id {sessionId}
          </code>
        </p>
      </div>
    );
  }

  // --- Game board ---
  return (
    <div className="game-board">
      <h2>Draw Yer Cards</h2>
      <p className="board-info">
        Session #{sessionId} &mdash; Player {playerRole}
      </p>

      {/* Score bar */}
      <div className="score-bar">
        <div className="score-side score-you">
          <span className="score-label">You (P{playerRole})</span>
          <span className="score-value">{yourScore}</span>
        </div>
        <div className="score-vs">vs</div>
        <div className="score-side">
          <span className="score-label">Opponent</span>
          <span className="score-value">{oppScore}</span>
        </div>
      </div>

      {/* Cards — your card on left, opponent on right */}
      <div className="card-area">
        <CardSlot
          type={yourType}
          revealed={phase === "drawn" || phase === "revealed"}
          isWinner={phase === "revealed" && effectiveWinner === playerRole}
          label="You"
        />
        <CardSlot
          type={oppType}
          revealed={phase === "revealed"}
          isWinner={
            phase === "revealed" &&
            effectiveWinner !== 0 &&
            effectiveWinner !== playerRole
          }
          waiting={phase === "drawn"}
          label="Opponent"
        />
      </div>

      {/* Phase-specific text */}
      {phase === "drawn" && yourType !== null && (
        <div className="round-result draw-tease">
          You drew <strong>{CARD_TYPE_NAMES[yourType]}</strong>
          {yourType === 3
            ? "... the mark of death!"
            : ". What did your opponent draw?"}
        </div>
      )}

      {phase === "revealed" && round && (
        <RoundResult
          round={round}
          roundNum={roundIndex + 1}
          playerRole={playerRole}
        />
      )}

      {/* Actions */}
      <div className="board-actions">
        {phase === "ready" && (
          <button className="btn btn-primary" onClick={handleDrawYourCard}>
            {roundIndex === 0 ? "Draw Yer Card" : "Draw Yer Card"}
          </button>
        )}

        {phase === "drawn" && (
          <button className="btn btn-secondary" onClick={handleRevealOpponent}>
            Flip Opponent&rsquo;s Card
          </button>
        )}

        {phase === "revealed" && !gameFinished && (
          <button className="btn btn-primary" onClick={handleNextRound}>
            Next Round
          </button>
        )}

        {gameFinished && (
          <div className="game-over-area">
            <div
              className={`result-banner ${
                game.winner === playerRole ? "banner-win" : "banner-lose"
              }`}
            >
              <h3>{game.winner === playerRole ? "Victory!" : "Defeat"}</h3>
              <p className="result-detail">
                Player {game.winner} wins
                {game.endReason === "blackspot" && " by Black Spot"}
                {game.endReason === "coinflip" && " by coin flip"}
                {game.endReason === "exhausted" && " (deck exhausted)"}
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleSettle}>
              Settle On-Chain
            </button>
          </div>
        )}
      </div>

      {/* Round history */}
      {historyEnd > 0 && (
        <div className="round-history">
          <h3>Battle Log</h3>
          {game.rounds.slice(0, historyEnd).map((r, i) => {
            const w = r.blackSpot
              ? (r.type1 === 3 ? 2 : 1)
              : r.roundWinner;
            return (
              <div key={i} className="history-entry">
                <span className="history-round">R{i + 1}</span>
                <span className="history-cards">
                  {CARD_TYPE_NAMES[r.type1]} vs {CARD_TYPE_NAMES[r.type2]}
                </span>
                <span
                  className={`history-result ${
                    r.blackSpot
                      ? "history-blackspot"
                      : w === playerRole
                      ? "history-win"
                      : w === 0
                      ? "history-tie"
                      : "history-loss"
                  }`}
                >
                  {r.blackSpot
                    ? "Black Spot!"
                    : w === 0
                    ? "Tie"
                    : w === playerRole
                    ? "Won"
                    : "Lost"}
                </span>
                <span className="history-score">
                  {r.scoreP1}-{r.scoreP2}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardSlot({ type, revealed, isWinner, waiting, label }) {
  if (!revealed || type === null || type === undefined) {
    return (
      <div className={`card card-back ${waiting ? "card-waiting" : ""}`}>
        <div className="card-back-pattern" />
        <div className="card-player-label">{label}</div>
      </div>
    );
  }

  const isBlack = type === 3;
  const typeClass = ["sails", "cannon", "cutlass", "blackspot"][type];

  return (
    <div
      className={`card card-face card-${typeClass} ${
        isWinner ? "card-winner" : ""
      } ${isBlack ? "card-death" : ""}`}
    >
      <div className="card-corner">{CARD_SYMBOLS[type]}</div>
      <div className="card-center-symbol">{CARD_SYMBOLS[type]}</div>
      <div className="card-type-name">{CARD_TYPE_NAMES[type]}</div>
      <div className="card-player-label">{label}</div>
    </div>
  );
}

function RoundResult({ round, roundNum, playerRole }) {
  if (round.blackSpot) {
    const drawer = round.type1 === 3 ? 1 : 2;
    const youDrew = drawer === playerRole;
    return (
      <div className="round-result result-blackspot-text">
        Round {roundNum}: {youDrew ? "You" : "Your opponent"} drew the Black
        Spot! {youDrew ? "Your opponent wins" : "You win"}!
      </div>
    );
  }

  if (round.roundWinner === 0) {
    return (
      <div className="round-result result-tie-text">
        Round {roundNum}: Tie &mdash; both drew {CARD_TYPE_NAMES[round.type1]}
      </div>
    );
  }

  const youWon = round.roundWinner === playerRole;
  const yourType = playerRole === 1 ? round.type1 : round.type2;
  const oppTypeVal = playerRole === 1 ? round.type2 : round.type1;

  return (
    <div className="round-result">
      <span className="round-num">Round {roundNum}:</span>{" "}
      {CARD_TYPE_NAMES[yourType]} vs {CARD_TYPE_NAMES[oppTypeVal]}
      {" — "}
      <span className={youWon ? "result-you-win" : "result-opp-win"}>
        {youWon ? "You win!" : "Opponent wins"}
      </span>
    </div>
  );
}
