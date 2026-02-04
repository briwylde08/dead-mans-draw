import { useState } from "react";
import { connectWallet } from "../lib/wallet";
import "./ConnectWallet.css";

export default function ConnectWallet({ onConnected }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const publicKey = await connectWallet();
      onConnected(publicKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-wallet">
      <button
        className="btn btn-primary"
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
