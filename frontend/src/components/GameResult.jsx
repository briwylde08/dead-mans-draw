import "./GameResult.css";

export default function GameResult({ result, playerRole, onNewGame }) {
  const { winner, gameLog } = result;
  const youWon = winner === playerRole;

  return (
    <div className="game-result">
      <div className={`result-banner ${youWon ? "banner-win" : "banner-lose"}`}>
        <h2>{youWon ? "Victory!" : "Defeat"}</h2>
        <p className="result-player">Player {winner} wins</p>
      </div>

      {gameLog && gameLog.length > 0 && (
        <div className="game-log">
          <h3>Game Replay</h3>
          {gameLog.map((entry, i) => (
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

      <button className="btn btn-primary" onClick={onNewGame}>
        New Game
      </button>
    </div>
  );
}
