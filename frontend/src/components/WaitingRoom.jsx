import { useState, useEffect, useRef, useCallback } from "react";
import { revealSeed, getGameParsed } from "../lib/soroban";
import "./WaitingRoom.css";

const POLL_INTERVAL = 3000;

export default function WaitingRoom({ contractId, publicKey, gameState, onReady, onCancel }) {
  const { sessionId, seed, playerRole } = gameState;

  // Stages: waiting_opponent | revealing | waiting_reveal | done
  const [stage, setStage] = useState(
    playerRole === 1 ? "waiting_opponent" : "revealing"
  );
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const revealStarted = useRef(false);
  const doneRef = useRef(false);

  const seedHex = seed.toString(16).padStart(64, "0");

  const doReveal = useCallback(async () => {
    if (revealStarted.current) return;
    revealStarted.current = true;
    setStage("revealing");
    setError(null);

    try {
      const result = await revealSeed(contractId, sessionId, seedHex, publicKey);
      if (!result.success) {
        // AlreadyRevealed is OK — means we refreshed after revealing
        if (result.error && result.error.includes("AlreadyRevealed")) {
          setStage("waiting_reveal");
          return;
        }
        throw new Error(result.error);
      }
      setStage("waiting_reveal");
    } catch (err) {
      // Contract error 6 = AlreadyRevealed
      if (err.message && (err.message.includes("AlreadyRevealed") || err.message.includes("#6"))) {
        setStage("waiting_reveal");
        return;
      }
      setError(err.message);
      revealStarted.current = false;
      setStage("error");
    }
  }, [contractId, sessionId, seedHex, publicKey]);

  const pollGameState = useCallback(async () => {
    try {
      const game = await getGameParsed(contractId, sessionId, publicKey);
      if (!game || doneRef.current) return;

      const myRevealed = playerRole === 1 ? game.seed1Revealed : game.seed2Revealed;
      const oppRevealed = playerRole === 1 ? game.seed2Revealed : game.seed1Revealed;
      const oppSeedHex = playerRole === 1 ? game.seed2Hex : game.seed1Hex;

      // Both revealed — we're done
      if (myRevealed && oppRevealed && game.phase >= 2) {
        doneRef.current = true;
        const opponentSeed = BigInt("0x" + oppSeedHex);
        onReady({ opponentSeed });
        return;
      }

      // Opponent joined (phase >= 1) but we haven't revealed yet
      if (game.phase >= 1 && !myRevealed && !revealStarted.current) {
        doReveal();
        return;
      }

      // We've revealed but opponent hasn't — keep polling
      if (myRevealed && !oppRevealed) {
        setStage("waiting_reveal");
      }
    } catch {
      // Silently retry on poll errors
    }
  }, [contractId, sessionId, publicKey, playerRole, doReveal, onReady]);

  // Start polling on mount
  useEffect(() => {
    // P2 can reveal immediately (both committed when P2 joins)
    if (playerRole === 2 && !revealStarted.current) {
      doReveal();
    }

    pollRef.current = setInterval(pollGameState, POLL_INTERVAL);
    // Run once immediately
    pollGameState();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [playerRole, doReveal, pollGameState]);

  const handleRetry = () => {
    revealStarted.current = false;
    setError(null);
    setStage(playerRole === 1 ? "waiting_opponent" : "revealing");
    pollGameState();
  };

  return (
    <div className="waiting-room">
      <div className="waiting-status">
        <div className="spinner" />
        <p>Waiting for Adversary</p>
        <p className="waiting-session">Session #{sessionId}</p>
        <div className="waiting-flourish">﹏</div>
      </div>

      {stage === "revealing" && (
        <p className="waiting-hint">Approve the transaction in your wallet.</p>
      )}

      {stage === "error" && (
        <div className="waiting-status">
          <p className="error-text">{error}</p>
          <button className="btn btn-ghost" onClick={handleRetry}>
            Try Again
          </button>
        </div>
      )}

      {onCancel && (
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
