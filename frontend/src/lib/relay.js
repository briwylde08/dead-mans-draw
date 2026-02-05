import PartySocket from "partysocket";

const RELAY_HOST =
  import.meta.env.VITE_RELAY_HOST || "localhost:1999";

/**
 * Connect to the PartyKit relay for real-time game sync.
 *
 * @param {string|number} sessionId — game session ID (used as room name)
 * @param {number} playerRole — 1 or 2
 * @param {(data: object) => void} onMessage — called for each relayed event
 * @returns {{ send, close, socket }}
 */
export function connectRelay(sessionId, playerRole, onMessage) {
  const socket = new PartySocket({
    host: RELAY_HOST,
    room: String(sessionId),
    query: { role: String(playerRole) },
  });

  socket.addEventListener("open", () => {
    // Request state snapshot in case of reconnect
    socket.send(JSON.stringify({ type: "STATE_REQUEST" }));
  });

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      // ignore malformed
    }
  });

  return {
    send(data) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    },
    close() {
      socket.close();
    },
    socket,
  };
}
