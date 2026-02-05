import { useState } from "react";
import { computeSeedCommitment, generateRandomSeed } from "../lib/prover";
import { createGame, joinGame } from "../lib/soroban";
import "./GameLobby.css";

export default function GameLobby({ contractId, publicKey, onGameAction }) {
  const [mode, setMode] = useState(null); // "create" or "join"
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const seed = generateRandomSeed();
      const commitHex = await computeSeedCommitment(seed);

      const result = await createGame(
        contractId,
        parseInt(sessionId, 10),
        publicKey,
        commitHex,
        publicKey
      );

      if (!result.success) throw new Error(result.error);

      onGameAction({
        type: "created",
        sessionId: parseInt(sessionId, 10),
        seed,
        seedCommitHex: commitHex,
        playerRole: 1,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const seed = generateRandomSeed();
      const commitHex = await computeSeedCommitment(seed);

      const result = await joinGame(
        contractId,
        parseInt(sessionId, 10),
        commitHex,
        publicKey
      );

      if (!result.success) throw new Error(result.error);

      onGameAction({
        type: "joined",
        sessionId: parseInt(sessionId, 10),
        seed,
        seedCommitHex: commitHex,
        playerRole: 2,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mode) {
    return (
      <>
        <div className="game-lobby">
          <h2>Choose Yer Path</h2>
          <p className="lobby-subtitle">What'll it be, captain?</p>
          <div className="lobby-buttons">
            <button className="btn btn-primary" onClick={() => setMode("create")}>
              Create Game
            </button>
            <button className="btn btn-secondary" onClick={() => setMode("join")}>
              Join Game
            </button>
          </div>
        </div>
        <div className="game-rules">
          <h3>{"\uD83C\uDFF4\u200D\u2620\uFE0F"} Pirate Card Rules <span className="rules-aside">(Official-ish, Absolutely Questionable)</span></h3>

          <h4>{"\u2693"} The Deck</h4>
          <p>There be 25 cards in the deck, shuffled by fate, chance, and questionable math:</p>
          <ul>
            <li>{"\uD83E\uDD43"} <strong>Rum</strong> (8 cards) &mdash; Beats Skull &mdash; a drunk sailor fears no death.</li>
            <li>{"\u2620\uFE0F"} <strong>Skull</strong> (8 cards) &mdash; Beats Backstabber &mdash; a sharp mind smells treachery.</li>
            <li>{"\uD83D\uDDE1\uFE0F"} <strong>Backstabber</strong> (8 cards) &mdash; Beats Rum &mdash; you never see the knife when you're drunk.</li>
            <li>{"\uD83D\uDDA4"} <strong>The Black Spot</strong> (1 card) &mdash; There's only one&hellip; and ye don't want it.</li>
          </ul>

          <h4>{"\u2694\uFE0F"} Playing a Round</h4>
          <p>Each round, both pirates draw a card and reveal it.</p>
          <p>If yer card beats yer opponent's, you win the round.</p>
          <p>If the cards match, no one wins. Ye glare at each other and drink anyway.</p>
          <p>If someone draws the Black Spot&hellip; well&hellip;</p>

          <h4>{"\uD83D\uDDA4"} The Black Spot</h4>
          <p>If ye draw it:</p>
          <ul>
            <li>The game ends immediately.</li>
            <li>Ye lose.</li>
            <li>No appeals. No rematch. Everyone knows what it means.</li>
          </ul>

          <h4>{"\uD83C\uDFC6"} Winning the Game</h4>
          <p>The first pirate to win 3 rounds claims victory and bragging rights.</p>
          <p>If the deck runs dry before anyone hits 3 wins:</p>
          <ul>
            <li>The pirate with the most round wins takes it.</li>
            <li>If scores be tied&hellip; fate flips a coin and laughs at you both.</li>
          </ul>
        </div>
      </>
    );
  }

  return (
    <div className="game-lobby">
      <h2>{mode === "create" ? "Create New Game" : "Join Existing Game"}</h2>

      <div className="form-group">
        <label>Session ID</label>
        <input
          type="number"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="e.g., 42, 101, 2002"
          disabled={loading}
        />
      </div>

      <div className="lobby-actions">
        <button
          className="btn btn-primary"
          onClick={mode === "create" ? handleCreate : handleJoin}
          disabled={loading || !sessionId}
        >
          {loading ? "Submitting..." : mode === "create" ? "Create" : "Join"}
        </button>
        <button className="btn btn-ghost" onClick={() => setMode(null)} disabled={loading}>
          Back
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <p className="lobby-note">
        Keep this browser tab open until the game is finished.
      </p>
    </div>
  );
}
