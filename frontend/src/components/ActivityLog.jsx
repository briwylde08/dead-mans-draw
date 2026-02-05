import { useState } from "react";
import "./ActivityLog.css";

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusIcon({ status }) {
  if (status === "success") return <span className="activity-icon activity-icon-ok" title="Success">{"\u2713"}</span>;
  if (status === "failed") return <span className="activity-icon activity-icon-fail" title="Failed">{"\u2717"}</span>;
  return <span className="activity-icon activity-icon-pending spinner-small" />;
}

export default function ActivityLog({ entries, contractId, publicKey, opponentKey }) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0 && !contractId) return null;

  const shortAddr = (addr) =>
    addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "";

  return (
    <div className={`activity-log ${open ? "activity-log-open" : ""}`}>
      <button className="activity-header" onClick={() => setOpen((v) => !v)}>
        <span className="activity-title">
          On-Chain Activity{entries.length > 0 && ` (${entries.length})`}
        </span>
        <span className="activity-toggle">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <div className="activity-body">
          {contractId && (
            <div className="activity-links">
              <a href={`${EXPLORER_BASE}/contract/${contractId}`} target="_blank" rel="noopener noreferrer">
                Contract: {shortAddr(contractId)}
                <span className="activity-ext">{"\u2197"}</span>
              </a>
              {publicKey && (
                <a href={`${EXPLORER_BASE}/account/${publicKey}`} target="_blank" rel="noopener noreferrer">
                  You: {shortAddr(publicKey)}
                  <span className="activity-ext">{"\u2197"}</span>
                </a>
              )}
              {opponentKey && (
                <a href={`${EXPLORER_BASE}/account/${opponentKey}`} target="_blank" rel="noopener noreferrer">
                  Opponent: {shortAddr(opponentKey)}
                  <span className="activity-ext">{"\u2197"}</span>
                </a>
              )}
            </div>
          )}

          {entries.length === 0 && (
            <p className="activity-empty">No transactions yet.</p>
          )}

          {entries.map((entry) => (
            <div key={entry.id} className="activity-entry">
              <span className="activity-time">{formatTime(entry.timestamp)}</span>
              <span className="activity-action">{entry.action}</span>
              {entry.detail && <span className="activity-detail">{entry.detail}</span>}
              <StatusIcon status={entry.status} />
              {entry.txHash && (
                <a
                  className="activity-tx-link"
                  href={`${EXPLORER_BASE}/tx/${entry.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View tx<span className="activity-ext">{"\u2197"}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
