import PartySocket from "partysocket";

const RELAY_HOST = import.meta.env.VITE_RELAY_HOST || "localhost:1999";
const MATCHMAKING_ROOM = "matchmaking";
const HOST_DECISION_DELAY = 600;
const STALE_THRESHOLD = 60_000;

/**
 * Connect to the matchmaking room and negotiate a role (host or joiner).
 *
 * @param {string} publicKey — this player's Stellar public key
 * @param {object} callbacks
 *   onHosting()                            — you are the host, create a game
 *   onFoundHost({ sessionId, hostPublicKey }) — a host is waiting, join their game
 *   onMatched({ asRole })                  — both sides confirmed, proceed
 *   onError(err)                           — something went wrong
 * @returns {{ cancel(), sendMessage(data) }}
 */
export function startMatchmaking(publicKey, callbacks) {
  let socket = null;
  let cancelled = false;
  let role = null;
  let hostDecisionTimer = null;

  socket = new PartySocket({
    host: RELAY_HOST,
    room: MATCHMAKING_ROOM,
    query: { role: "matchmaker" },
  });

  socket.addEventListener("open", () => {
    if (cancelled) return;
    socket.send(JSON.stringify({ type: "STATE_REQUEST" }));
  });

  socket.addEventListener("message", (event) => {
    if (cancelled) return;
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === "STATE_SNAPSHOT") {
      const hostingEvent = (data.events || [])
        .map((e) => {
          try { return typeof e === "string" ? JSON.parse(e) : e; } catch { return null; }
        })
        .find(
          (e) =>
            e &&
            e.type === "HOSTING" &&
            e.publicKey !== publicKey &&
            Date.now() - (e.ts || 0) < STALE_THRESHOLD
        );

      if (hostingEvent) {
        becomeJoiner(hostingEvent);
      } else {
        hostDecisionTimer = setTimeout(() => {
          if (!role && !cancelled) becomeHost();
        }, HOST_DECISION_DELAY);
      }
      return;
    }

    if (data.type === "HOSTING" && role !== "host" && data.publicKey !== publicKey) {
      if (Date.now() - (data.ts || 0) > STALE_THRESHOLD) return;
      clearTimeout(hostDecisionTimer);
      becomeJoiner(data);
      return;
    }

    if (data.type === "MATCHED" && role === "host") {
      callbacks.onMatched({ asRole: 1 });
      return;
    }

    if (data.type === "PLAYER_LEFT" && role === "joiner") {
      callbacks.onError(new Error("Opponent disconnected"));
      return;
    }
  });

  socket.addEventListener("error", () => {
    if (cancelled) return;
    callbacks.onError(new Error("Could not connect to matchmaking server"));
  });

  socket.addEventListener("close", (event) => {
    if (cancelled || role) return;
    if (event.reason === "Room is full") {
      callbacks.onError(new Error("Matchmaking busy — try again in a moment"));
    }
  });

  function becomeHost() {
    role = "host";
    callbacks.onHosting();
  }

  function becomeJoiner(hostingData) {
    role = "joiner";
    clearTimeout(hostDecisionTimer);
    callbacks.onFoundHost({
      sessionId: hostingData.sessionId,
      hostPublicKey: hostingData.publicKey,
    });
  }

  function sendMessage(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function cancel() {
    cancelled = true;
    clearTimeout(hostDecisionTimer);
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  return { cancel, sendMessage };
}
