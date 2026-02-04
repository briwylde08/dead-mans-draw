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
      <div className="game-lobby">
        <h2>Pirate Cards</h2>
        <p className="lobby-subtitle">Choose yer path, captain.</p>
        <div className="lobby-buttons">
          <button className="btn btn-primary" onClick={() => setMode("create")}>
            Create Game
          </button>
          <button className="btn btn-secondary" onClick={() => setMode("join")}>
            Join Game
          </button>
        </div>
      </div>
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
          placeholder="e.g. 42"
          disabled={loading}
        />
      </div>

      <div className="lobby-actions">
        <button
          className="btn btn-primary"
          onClick={mode === "create" ? handleCreate : handleJoin}
          disabled={loading || !sessionId}
        >
          {loading ? "Submitting..." : mode === "create" ? "Create & Commit Seed" : "Join & Commit Seed"}
        </button>
        <button className="btn btn-ghost" onClick={() => setMode(null)} disabled={loading}>
          Back
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <p className="lobby-note">
        {mode === "create"
          ? "Share the Session ID with your opponent so they can join."
          : "Enter the Session ID shared by the game creator."}
        {" "}A random seed will be generated and committed on-chain.
        Keep this browser tab open — you'll need the seed to reveal later.
      </p>
    </div>
  );
}
