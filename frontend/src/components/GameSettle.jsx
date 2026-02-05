import { useState, useEffect, useRef, useCallback } from "react";
import { generateProof } from "../lib/prover";
import { settleGame, getGameParsed } from "../lib/soroban";
import "./GameSettle.css";

const POLL_INTERVAL = 4000;

export default function GameSettle({ contractId, publicKey, gameState, onSettled, onActivity }) {
  const { sessionId, seed, playerRole, opponentSeed } = gameState;
  const [stage, setStage] = useState("ready"); // ready | proving | proved | settling | settled_by_opponent | error
  const [proofData, setProofData] = useState(null);
  const [error, setError] = useState(null);
  const autoStarted = useRef(false);
  const pollRef = useRef(null);
  const settledRef = useRef(false);

  // Poll for opponent settlement
  const pollSettlement = useCallback(async () => {
    if (settledRef.current) return;
    try {
      const game = await getGameParsed(contractId, sessionId, publicKey);
      if (!game || settledRef.current) return;
      if (game.winner !== 0) {
        settledRef.current = true;
        if (pollRef.current) clearInterval(pollRef.current);
        setStage("settled_by_opponent");
        // Auto-transition to results after a brief pause
        setTimeout(() => {
          onSettled({ winner: game.winner, gameLog: proofData?.gameLog ?? null });
        }, 3000);
      }
    } catch {
      // Silently retry
    }
  }, [contractId, sessionId, publicKey, onSettled, proofData]);

  // Start polling on mount
  useEffect(() => {
    pollRef.current = setInterval(pollSettlement, POLL_INTERVAL);
    pollSettlement();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollSettlement]);

  const handleGenerateProof = async () => {
    setStage("proving");
    setError(null);
    try {
      let oppSeed = opponentSeed;

      // Fallback to prompt if opponent seed wasn't passed from GameBoard
      if (!oppSeed) {
        const opponentSeedStr = prompt(
          "Enter your opponent's revealed seed (hex from on-chain).\n" +
          "Query it with: stellar contract invoke ... -- get_game --session_id " + sessionId
        );
        if (!opponentSeedStr) { setStage("ready"); return; }

        const trimmed = opponentSeedStr.trim().replace(/^0x/i, "");
        oppSeed = BigInt("0x" + trimmed);
      }

      const seed1 = playerRole === 1 ? seed : oppSeed;
      const seed2 = playerRole === 2 ? seed : oppSeed;

      const result = await generateProof(seed1, seed2, BigInt(sessionId));
      setProofData(result);
      if (onActivity) onActivity({ action: "Proof Generated", detail: `Winner: Player ${result.winner}` });
      await submitProof(result);
    } catch (err) {
      setError(err.message);
      setStage("error");
    }
  };

  // Auto-start proof generation if opponent seed is already known
  useEffect(() => {
    if (opponentSeed && !autoStarted.current) {
      autoStarted.current = true;
      handleGenerateProof();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitProof = async (data) => {
    const pd = data || proofData;
    if (!pd) return;
    setStage("settling");
    setError(null);
    try {
      const result = await settleGame(
        contractId,
        sessionId,
        pd.proof,
        pd.publicInputs,
        publicKey
      );

      if (!result.success) {
        // Check if game was already settled by opponent
        if (result.error && (result.error.includes("AlreadySettled") || result.error.includes("#"))) {
          const game = await getGameParsed(contractId, sessionId, publicKey);
          if (game && game.winner !== 0) {
            settledRef.current = true;
            if (pollRef.current) clearInterval(pollRef.current);
            setStage("settled_by_opponent");
            setTimeout(() => {
              onSettled({ winner: game.winner, gameLog: pd.gameLog });
            }, 3000);
            return;
          }
        }
        throw new Error(result.error);
      }
      if (onActivity) onActivity({ action: "Game Settled", txHash: result.txHash });
      settledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      onSettled({ winner: pd.winner, gameLog: pd.gameLog });
    } catch (err) {
      // Could be already settled
      const game = await getGameParsed(contractId, sessionId, publicKey).catch(() => null);
      if (game && game.winner !== 0) {
        settledRef.current = true;
        if (pollRef.current) clearInterval(pollRef.current);
        setStage("settled_by_opponent");
        setTimeout(() => {
          onSettled({ winner: game.winner, gameLog: pd.gameLog });
        }, 3000);
        return;
      }
      setError(err.message);
      setStage("error");
    }
  };

  return (
    <div className="game-settle">
      <h2>Settle the Game</h2>
      <p className="settle-info">
        Session #{sessionId} &mdash; Player {playerRole}
      </p>

      {stage === "ready" && (
        <button className="btn btn-primary" onClick={handleGenerateProof}>
          Generate ZK Proof
        </button>
      )}

      {stage === "proving" && (
        <div className="settle-status">
          <div className="spinner" />
          <p>Generating zero-knowledge proof... This may take a minute.</p>
        </div>
      )}

      {stage === "proved" && proofData && (
        <div className="settle-proved">
          <p className="status-ok">Proof generated. Winner: Player {proofData.winner}</p>
          <button className="btn btn-primary" onClick={() => submitProof()}>
            Submit Proof On-Chain
          </button>
        </div>
      )}

      {stage === "settling" && (
        <div className="settle-status">
          <div className="spinner" />
          <p>Signing with Freighter & submitting to Soroban...</p>
        </div>
      )}

      {stage === "settled_by_opponent" && (
        <div className="settle-status">
          <p className="status-ok">Proof has been submitted on-chain by your adversary.</p>
          <p className="settle-hint">Redirecting to results...</p>
        </div>
      )}

      {stage === "error" && (
        <>
          <p className="error-text">{error}</p>
          <button className="btn btn-ghost" onClick={proofData ? () => submitProof() : handleGenerateProof}>
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
