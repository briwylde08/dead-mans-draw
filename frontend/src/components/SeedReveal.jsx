import { useState } from "react";
import { revealSeed } from "../lib/soroban";
import "./SeedReveal.css";

export default function SeedReveal({ contractId, publicKey, gameState, onRevealed }) {
  const { sessionId, seed, playerRole } = gameState;
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);

  const seedHex = seed.toString(16).padStart(64, "0");

  const handleReveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await revealSeed(
        contractId,
        sessionId,
        seedHex,
        publicKey
      );

      if (!result.success) throw new Error(result.error);

      setRevealed(true);
      onRevealed();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="seed-reveal">
      <h2>Reveal Yer Seed</h2>
      <p className="reveal-info">
        Session #{sessionId} &mdash; You are Player {playerRole}
      </p>

      {!revealed ? (
        <>
          <p className="reveal-note">
            Both players must reveal their seeds before the game can be settled.
            Once you reveal, your seed is public on-chain.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleReveal}
            disabled={loading}
          >
            {loading ? "Revealing..." : "Reveal Seed"}
          </button>
        </>
      ) : (
        <div className="reveal-done">
          <p className="status-ok">Your seed has been revealed.</p>
          <p className="reveal-note">
            Waiting for your opponent to reveal their seed...
            Once both seeds are revealed, either player can settle the game.
          </p>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
