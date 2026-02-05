import { useState, useCallback, useRef, useEffect } from "react";
import ConnectWallet from "./components/ConnectWallet";
import GameLobby from "./components/GameLobby";
import WaitingRoom from "./components/WaitingRoom";
import GameBoard from "./components/GameBoard";
import GameSettle from "./components/GameSettle";
import GameResult from "./components/GameResult";
import { connectRelay } from "./lib/relay";

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || "";

// Stages: idle -> lobby -> waiting -> playing -> settling -> result
const STAGES = {
  IDLE: "idle",
  LOBBY: "lobby",
  WAITING: "waiting",
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
    setStage(STAGES.WAITING);
  }, []);

  const handleWaitingReady = useCallback(({ opponentSeed }) => {
    setGameState((prev) => ({ ...prev, opponentSeed }));
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

  const handleDisconnect = useCallback(() => {
    setPublicKey(null);
    setGameState(null);
    setResult(null);
    setStage(STAGES.IDLE);
  }, []);

  // Relay connection for real-time sync
  const relayRef = useRef(null);
  const relayHandlerRef = useRef(null);

  // Connect relay when entering WAITING, disconnect when leaving PLAYING
  useEffect(() => {
    const needsRelay =
      (stage === STAGES.WAITING || stage === STAGES.PLAYING) && gameState;

    if (needsRelay && !relayRef.current) {
      relayRef.current = connectRelay(
        gameState.sessionId,
        gameState.playerRole,
        (data) => {
          // Forward to current handler (set by GameBoard)
          if (relayHandlerRef.current) relayHandlerRef.current(data);
        }
      );
    }

    if (!needsRelay && relayRef.current) {
      relayRef.current.close();
      relayRef.current = null;
      relayHandlerRef.current = null;
    }

    return () => {
      if (!needsRelay && relayRef.current) {
        relayRef.current.close();
        relayRef.current = null;
        relayHandlerRef.current = null;
      }
    };
  }, [stage, gameState]);

  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef(null);

  const handleCopyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [publicKey]);

  return (
    <div className="app">
      {publicKey && (
        <div className="wallet-bar">
          <span className="wallet-address" onClick={handleCopyAddress} title="Click to copy full address">
            {copied ? "Copied!" : shortAddr}
          </span>
          <button className="btn btn-ghost" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      )}

      <h1 className="app-title">
        <span className="title-icon">&#x2620;</span>{" "}
        <span className="title-dead">Dead</span>{" "}
        <span className="title-mans">Man&rsquo;s</span>{" "}
        <span className="title-draw">Draw</span>{" "}
        <span className="title-icon">&#x2620;</span>
      </h1>
      <p className="app-subtitle">
        The plank's ready. And someone's takin' the long swim.
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

      {stage === STAGES.WAITING && gameState && (
        <WaitingRoom
          contractId={CONTRACT_ID}
          publicKey={publicKey}
          gameState={gameState}
          onReady={handleWaitingReady}
          onCancel={handleNewGame}
        />
      )}

      {stage === STAGES.PLAYING && gameState && (
        <GameBoard
          gameState={gameState}
          onGameComplete={handleGamePlayed}
          relay={relayRef.current}
          onRelayMessage={(handler) => { relayHandlerRef.current = handler; }}
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
