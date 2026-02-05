import { useState, useRef, useEffect } from "react";
import { computeSeedCommitment, generateRandomSeed } from "../lib/prover";
import { createGame, joinGame } from "../lib/soroban";
import { startMatchmaking } from "../lib/matchmaking";
import "./GameLobby.css";

export default function GameLobby({ contractId, publicKey, onGameAction, onActivity }) {
  const [mode, setMode] = useState(null); // "create" | "join" | "play"
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState("");
  const matchmakingRef = useRef(null);
  const pendingGameRef = useRef(null);

  // Cleanup matchmaking on unmount
  useEffect(() => {
    return () => {
      if (matchmakingRef.current) {
        matchmakingRef.current.cancel();
      }
    };
  }, []);

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

      if (onActivity) onActivity({ action: "Game Created", txHash: result.txHash, detail: `Session #${sessionId}` });

      onGameAction({
        type: "created",
        sessionId: parseInt(sessionId, 10),
        seed,
        seedCommitHex: commitHex,
        playerRole: 1,
      });
    } catch (err) {
      if (err.message && (err.message.includes("SessionExists") || err.message.includes("#2"))) {
        setError("Sorry, that number's been used. Please pick a new session ID.");
      } else {
        setError(err.message);
      }
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

      if (onActivity) onActivity({ action: "Game Joined", txHash: result.txHash, detail: `Session #${sessionId}` });

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

  // ── Matchmaking ──

  const doHostGame = async () => {
    try {
      const seed = generateRandomSeed();
      const commitHex = await computeSeedCommitment(seed);
      const sid = Math.floor(Math.random() * 2_000_000_000) + 1;

      setMatchmakingStatus("Creating game on-chain...");
      const result = await createGame(contractId, sid, publicKey, commitHex, publicKey);
      if (!result.success) throw new Error(result.error);

      if (onActivity) onActivity({ action: "Game Created", txHash: result.txHash, detail: `Session #${sid}` });

      // Store pending game data for when MATCHED arrives
      pendingGameRef.current = { sessionId: sid, seed, commitHex };

      setMatchmakingStatus("Game created! Waiting for opponent...");
      matchmakingRef.current.sendMessage({
        type: "HOSTING",
        sessionId: sid,
        publicKey,
        ts: Date.now(),
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
      if (matchmakingRef.current) matchmakingRef.current.cancel();
    }
  };

  const doJoinGame = async (sid) => {
    try {
      const seed = generateRandomSeed();
      const commitHex = await computeSeedCommitment(seed);

      setMatchmakingStatus("Joining game on-chain...");
      const result = await joinGame(contractId, sid, commitHex, publicKey);
      if (!result.success) throw new Error(result.error);

      if (onActivity) onActivity({ action: "Game Joined", txHash: result.txHash, detail: `Session #${sid}` });

      matchmakingRef.current.sendMessage({ type: "MATCHED", sessionId: sid });
      matchmakingRef.current.cancel();
      matchmakingRef.current = null;

      onGameAction({
        type: "joined",
        sessionId: sid,
        seed,
        seedCommitHex: commitHex,
        playerRole: 2,
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
      if (matchmakingRef.current) matchmakingRef.current.cancel();
    }
  };

  const handlePlay = () => {
    setMode("play");
    setError(null);
    setLoading(true);
    setMatchmakingStatus("Looking for an opponent...");

    matchmakingRef.current = startMatchmaking(publicKey, {
      onHosting: () => {
        doHostGame();
      },
      onFoundHost: ({ sessionId: sid }) => {
        doJoinGame(sid);
      },
      onMatched: () => {
        // Host side: opponent confirmed, proceed to game
        const pg = pendingGameRef.current;
        if (!pg) return;
        if (matchmakingRef.current) {
          matchmakingRef.current.cancel();
          matchmakingRef.current = null;
        }
        onGameAction({
          type: "created",
          sessionId: pg.sessionId,
          seed: pg.seed,
          seedCommitHex: pg.commitHex,
          playerRole: 1,
        });
      },
      onError: (err) => {
        setError(err.message);
        setLoading(false);
      },
    });
  };

  const handleCancelMatchmaking = () => {
    if (matchmakingRef.current) {
      matchmakingRef.current.cancel();
      matchmakingRef.current = null;
    }
    pendingGameRef.current = null;
    setMode(null);
    setLoading(false);
    setError(null);
  };

  // ── Render: lobby home ──

  if (!mode) {
    return (
      <>
        <div className="game-lobby">
          <h2>Choose Yer Path</h2>
          <p className="lobby-subtitle">What'll it be, captain?</p>
          <div className="lobby-buttons">
            <button className="btn btn-primary btn-play" onClick={handlePlay}>
              Play
            </button>
          </div>
          <p className="lobby-or">or play a private match <span className="btn-hint">(create and share a session ID, or join an existing one)</span></p>
          <div className="lobby-buttons">
            <button className="btn btn-secondary" onClick={() => setMode("create")}>
              Create Game
            </button>
            <button className="btn btn-secondary" onClick={() => setMode("join")}>
              Join Game
            </button>
          </div>
        </div>
        <div className="lobby-divider">{"\u2E3E"}<span className="divider-line" />{"\u2E3E"}</div>
        <div className="game-rules">
          <h2>The Code</h2>

          <h3><img src="/images/deck-icon.png" alt="The Card Deck" className="rules-icon" /> The Card Deck</h3>
          <p>There be 25 cards in the deck, shuffled by fate and chance:</p>
          <ul>
            <li><img src="/images/rum-icon.png" alt="Rum" className="rules-icon" /> <strong>Rum</strong> (8 cards) &mdash; Beats Skull &mdash; a drunk sailor fears no death.</li>
            <li><img src="/images/skull-icon.png" alt="Skull" className="rules-icon" /> <strong>Skull</strong> (8 cards) &mdash; Beats Backstabber &mdash; a sharp mind smells treachery.</li>
            <li><img src="/images/backstabber-icon.png" alt="Backstabber" className="rules-icon" /> <strong>Backstabber</strong> (8 cards) &mdash; Beats Rum &mdash; you never see the knife when you're drunk.</li>
            <li><img src="/images/black-spot-icon.png" alt="Black Spot" className="rules-icon" /> <strong>The Black Spot</strong> (1 card) &mdash; There's only one&hellip; and ye don't want it.</li>
          </ul>

          <h3><img src="/images/playing-icon.png" alt="Playing a Round" className="rules-icon" /> Playing a Round</h3>
          <p> - Each round, both pirates draw a card and reveal it.</p>
          <p> - If yer card beats yer opponent's, you win the round.</p>
          <p> - If the cards match, no one wins. Ye glare at each other and drink anyway.</p>
          <p> - If someone draws the Black Spot&hellip; well&hellip;</p>

          <h3><img src="/images/black-spot-icon.png" alt="Black Spot" className="rules-icon" /> The Black Spot</h3>
          <p>If ye draw it:</p>
          <ul>
            <li> - The game ends immediately.</li>
            <li> - Ye lose.</li>
          </ul>

          <h3><img src="/images/trophy-icon.png" alt="Winning the Game" className="rules-icon" /> Winning the Game</h3>
          <p> - The first pirate to win 3 rounds claims victory and bragging rights.</p>
          <p> - If the deck runs dry before anyone hits 3 wins:</p>
          <ul>
            <li> - The pirate with the most round wins takes it.</li>
            <li> - If scores be tied&hellip; fate flips a coin and laughs at you both.</li>
          </ul>
        </div>
      </>
    );
  }

  // ── Render: matchmaking ──

  if (mode === "play") {
    return (
      <div className="game-lobby">
        <h2>Searching for Opponent...</h2>
        <div className="matchmaking-status">
          <div className="spinner" />
          <p className="matchmaking-text">{matchmakingStatus}</p>
          {error && <p className="error-text">{error}</p>}
        </div>
        <div className="lobby-actions">
          {error && (
            <button className="btn btn-secondary" onClick={handlePlay}>
              Retry
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleCancelMatchmaking}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Render: create / join ──

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
