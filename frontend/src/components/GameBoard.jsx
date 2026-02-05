import { useState, useEffect, useRef, useCallback } from "react";
import {
  simulateFullGame,
  CARD_TYPE_NAMES,
  CARD_SYMBOLS,
} from "../lib/gameSimulator";
import "./GameBoard.css";

const FALLBACK_DELAY = 2500; // Timer fallback when relay is unavailable

// Flavor text for matchups: key = "type1-type2" (sorted for ties)
const MATCHUP_FLAVOR = {
  "0-1": "Rum dulls the fear of death.",
  "1-2": "A clever mind senses the knife coming.",
  "2-0": "You never see the blade when you're drunk.",
  "0-0": "We can\u2019t both be drunk\u2026 or can we?",
  "1-1": "Two heads don\u2019t always think better than one.",
  "2-2": "Both were waiting for the other to turn around.",
};

function getRoundFlavor(type1, type2) {
  if (type1 === 3 || type2 === 3) return "That\u2019s unfortunate.";
  const key1 = `${type1}-${type2}`;
  const key2 = `${type2}-${type1}`;
  return MATCHUP_FLAVOR[key1] || MATCHUP_FLAVOR[key2] || "";
}

export default function GameBoard({ gameState, onGameComplete, relay, onRelayMessage }) {
  const { sessionId, seed, playerRole, opponentSeed } = gameState;
  const [game, setGame] = useState(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [myDrawn, setMyDrawn] = useState(false);
  const [oppDrawn, setOppDrawn] = useState(false);
  const [error, setError] = useState(null);
  const initRef = useRef(false);
  const fallbackTimer = useRef(null);

  const bothDrawn = myDrawn && oppDrawn;

  // Derive phase from draw states
  // ready: neither drawn | drawn: only me | opp_drawn: only opponent | revealed: both
  const phase = bothDrawn
    ? "revealed"
    : myDrawn
    ? "drawn"
    : oppDrawn
    ? "opp_drawn"
    : "ready";

  // Auto-start game simulation when component mounts with opponent seed
  useEffect(() => {
    if (initRef.current || !opponentSeed) return;
    initRef.current = true;

    const seed1 = playerRole === 1 ? seed : opponentSeed;
    const seed2 = playerRole === 2 ? seed : opponentSeed;

    simulateFullGame(seed1, seed2, BigInt(sessionId))
      .then((result) => setGame(result))
      .catch((err) => setError(err.message));
  }, [opponentSeed, seed, playerRole, sessionId]);

  // Handle relay messages
  const handleRelayMessage = useCallback(
    (data) => {
      if (data.type === "DRAW" && data.round === roundIndex) {
        setOppDrawn(true);
      }
      if (data.type === "NEXT_ROUND") {
        setRoundIndex((i) => i + 1);
        setMyDrawn(false);
        setOppDrawn(false);
      }
      // Replay events from STATE_SNAPSHOT on reconnect
      if (data.type === "STATE_SNAPSHOT" && Array.isArray(data.events)) {
        for (const raw of data.events) {
          try {
            const evt = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (evt.type === "DRAW" && evt.round === roundIndex) {
              setOppDrawn(true);
            }
          } catch {
            // skip
          }
        }
      }
    },
    [roundIndex]
  );

  // Register relay message handler
  useEffect(() => {
    if (onRelayMessage) onRelayMessage(handleRelayMessage);
  }, [onRelayMessage, handleRelayMessage]);

  // Fallback: if relay is unavailable or disconnected, auto-reveal after delay
  const relayConnected = relay?.socket?.readyState === WebSocket.OPEN;

  useEffect(() => {
    if (myDrawn && !oppDrawn && !relayConnected) {
      const delay = game?.rounds[roundIndex]?.gameOver ? 0 : FALLBACK_DELAY;
      fallbackTimer.current = setTimeout(() => {
        setOppDrawn(true);
      }, delay);
    }
    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [myDrawn, oppDrawn, relayConnected, roundIndex, game]);

  const handleDrawYourCard = () => {
    setMyDrawn(true);

    // Send DRAW event via relay
    if (relay) {
      relay.send({ type: "DRAW", round: roundIndex });
    }
  };

  const handleNextRound = () => {
    // Send NEXT_ROUND via relay
    if (relay) {
      relay.send({ type: "NEXT_ROUND" });
    }
    setRoundIndex((i) => i + 1);
    setMyDrawn(false);
    setOppDrawn(false);
  };

  const handleSettle = () => {
    onGameComplete({ opponentSeed });
  };

  // Current round data
  const round = game?.rounds[roundIndex] ?? null;
  const gameFinished = bothDrawn && round?.gameOver;

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
    if (bothDrawn) return [round.scoreP1, round.scoreP2];
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
  const historyEnd = bothDrawn ? roundIndex + 1 : roundIndex;

  // --- Loading / error state ---
  if (!game) {
    return (
      <div className="game-board">
        <h2>Draw Yer Cards</h2>
        <p className="board-info">
          Session #{sessionId} &mdash; Player {playerRole}
        </p>
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div className="spinner" />
            <p className="board-note">Shuffling the deck...</p>
          </div>
        )}
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
          <span className="score-label">Adversary</span>
          <span className="score-value">{oppScore}</span>
        </div>
      </div>

      {/* Cards — your card on left, opponent on right */}
      <div className="card-area">
        <CardSlot
          type={yourType}
          revealed={myDrawn}
          isWinner={bothDrawn && effectiveWinner === playerRole}
          label="You"
        />
        <CardSlot
          type={oppType}
          revealed={oppDrawn}
          isWinner={
            bothDrawn &&
            effectiveWinner !== 0 &&
            effectiveWinner !== playerRole
          }
          waiting={myDrawn && !oppDrawn}
          label="Adversary"
        />
      </div>

      {/* Phase-specific text */}
      {myDrawn && !bothDrawn && yourType !== null && (
        <div className="round-result draw-tease">
          You drew <strong>{CARD_TYPE_NAMES[yourType]}</strong>
          {yourType === 3
            ? "... the mark of death!"
            : ""}
          <br />
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            Waitin&rsquo; on the other hand&hellip;
          </span>
        </div>
      )}

      {!myDrawn && oppDrawn && (
        <div className="round-result draw-tease">
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            Your adversary has drawn. Your turn&hellip;
          </span>
        </div>
      )}

      {bothDrawn && round && (
        <RoundResult
          round={round}
          roundNum={roundIndex + 1}
          playerRole={playerRole}
        />
      )}

      {/* Flavor text */}
      {bothDrawn && round && (
        <p className="round-flavor">{getRoundFlavor(round.type1, round.type2)}</p>
      )}

      {/* Actions */}
      <div className="board-actions">
        {!myDrawn && (
          <button className="btn btn-primary" onClick={handleDrawYourCard}>
            Draw Yer Card
          </button>
        )}

        {bothDrawn && !gameFinished && (
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
  const typeClass = ["rum", "skull", "cutlass", "blackspot"][type];
  const cardImage = ["/images/rum1.png", "/images/skull1.png", "/images/cutlass1.png", "/images/black-spot.png"][type];

  return (
    <div
      className={`card card-face card-${typeClass} ${
        isWinner ? "card-winner" : ""
      } ${isBlack ? "card-death" : ""}`}
    >
      {cardImage ? (
        <img className="card-image" src={cardImage} alt={CARD_TYPE_NAMES[type]} />
      ) : (
        <div className="card-center-symbol">{CARD_SYMBOLS[type]}</div>
      )}
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
        {youWon ? "You win!" : "Adversary wins"}
      </span>
    </div>
  );
}
