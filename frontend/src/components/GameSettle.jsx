import { useState, useEffect, useRef } from "react";
import { generateProof } from "../lib/prover";
import { settleGame } from "../lib/soroban";
import "./GameSettle.css";

export default function GameSettle({ contractId, publicKey, gameState, onSettled }) {
  const { sessionId, seed, playerRole, opponentSeed } = gameState;
  const [stage, setStage] = useState("ready"); // ready | proving | proved | settling | error
  const [proofData, setProofData] = useState(null);
  const [error, setError] = useState(null);
  const autoStarted = useRef(false);

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
      setStage("proved");
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

  const handleSettle = async () => {
    if (!proofData) return;
    setStage("settling");
    setError(null);
    try {
      const result = await settleGame(
        contractId,
        sessionId,
        proofData.proof,
        proofData.publicInputs,
        publicKey
      );

      if (!result.success) throw new Error(result.error);
      onSettled({ winner: proofData.winner, gameLog: proofData.gameLog });
    } catch (err) {
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
          {proofData.gameLog && (
            <div className="game-log">
              <h3>Game Replay</h3>
              {proofData.gameLog.map((entry, i) => (
                <div key={i} className="log-entry">
                  <span className="log-round">
                    {entry.round === "end" ? "End" : `R${entry.round}`}
                  </span>
                  <span className="log-result">{entry.result}</span>
                  {entry.score && (
                    <span className="log-score">{entry.score[0]}-{entry.score[1]}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleSettle}>
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

      {stage === "error" && (
        <>
          <p className="error-text">{error}</p>
          <button className="btn btn-ghost" onClick={() => setStage("ready")}>
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
