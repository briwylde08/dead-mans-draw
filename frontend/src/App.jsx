import { useState, useCallback } from "react";
import ConnectWallet from "./components/ConnectWallet";
import GameLobby from "./components/GameLobby";
import SeedReveal from "./components/SeedReveal";
import GameBoard from "./components/GameBoard";
import GameSettle from "./components/GameSettle";
import GameResult from "./components/GameResult";

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || "";

// Stages: idle -> lobby -> seed_committed -> revealed -> playing -> settling -> result
const STAGES = {
  IDLE: "idle",
  LOBBY: "lobby",
  SEED_COMMITTED: "seed_committed",
  REVEALED: "revealed",
  PLAYING: "playing",
  SETTLING: "settling",
  RESULT: "result",
};

export default function App() {
  const [stage, setStage] = useState(STAGES.IDLE);
  const [publicKey, setPublicKey] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [result, setResult] = useState(null);

  const shortAddr = publicKey
    ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`
    : "";

  const handleConnected = useCallback((key) => {
    setPublicKey(key);
    setStage(STAGES.LOBBY);
  }, []);

  const handleGameAction = useCallback((action) => {
    setGameState(action);
    setStage(STAGES.SEED_COMMITTED);
  }, []);

  const handleRevealed = useCallback(() => {
    setStage(STAGES.PLAYING);
  }, []);

  const handleGamePlayed = useCallback((gameResult) => {
    setGameState((prev) => ({ ...prev, opponentSeed: gameResult.opponentSeed }));
    setStage(STAGES.SETTLING);
  }, []);

  const handleSettled = useCallback((settlementResult) => {
    setResult(settlementResult);
    setStage(STAGES.RESULT);
  }, []);

  const handleNewGame = useCallback(() => {
    setGameState(null);
    setResult(null);
    setStage(STAGES.LOBBY);
  }, []);

  return (
    <div className="app">
      {publicKey && (
        <div className="wallet-bar">
          <span className="wallet-address">{shortAddr}</span>
        </div>
      )}

      <h1 className="app-title">Pirate Cards</h1>
      <p className="app-subtitle">
        Commit. Reveal. Prove. No quarter given.
      </p>

      {!CONTRACT_ID && stage !== STAGES.IDLE && (
        <p className="error-text" style={{ textAlign: "center", marginBottom: "1rem" }}>
          No contract ID set. Add VITE_CONTRACT_ID to your .env file.
        </p>
      )}

      {stage === STAGES.IDLE && (
        <ConnectWallet onConnected={handleConnected} />
      )}

      {stage === STAGES.LOBBY && (
        <GameLobby
          contractId={CONTRACT_ID}
          publicKey={publicKey}
          onGameAction={handleGameAction}
        />
      )}

      {stage === STAGES.SEED_COMMITTED && gameState && (
        <SeedReveal
          contractId={CONTRACT_ID}
          publicKey={publicKey}
          gameState={gameState}
          onRevealed={handleRevealed}
        />
      )}

      {stage === STAGES.PLAYING && gameState && (
        <GameBoard
          gameState={gameState}
          onGameComplete={handleGamePlayed}
        />
      )}

      {stage === STAGES.SETTLING && gameState && (
        <GameSettle
          contractId={CONTRACT_ID}
          publicKey={publicKey}
          gameState={gameState}
          onSettled={handleSettled}
        />
      )}

      {stage === STAGES.RESULT && result && (
        <GameResult
          result={result}
          playerRole={gameState?.playerRole}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  );
}
