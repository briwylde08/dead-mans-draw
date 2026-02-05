import type * as Party from "partykit/server";

const MAX_ROOM_SIZE = 2;
const MAX_MESSAGE_SIZE = 1024; // 1KB
const MAX_EVENTS = 100;
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // messages per window

interface RateState {
  count: number;
  windowStart: number;
}

export default class RelayServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };
  rateLimits: Map<string, RateState> = new Map();

  constructor(readonly room: Party.Room) {}

  // Edge-level origin check — runs before request reaches the room
  static async onBeforeConnect(
    req: Party.Request,
    lobby: Party.Lobby
  ) {
    const allowed = lobby.env.ALLOWED_ORIGIN as string | undefined;
    if (allowed) {
      const origin = req.headers.get("Origin") ?? "";
      const allowedOrigins = allowed.split(",").map((o) => o.trim());
      if (!allowedOrigins.includes(origin)) {
        return new Response("Forbidden", { status: 403 });
      }
    }
    return req;
  }

  async onConnect(
    connection: Party.Connection,
    ctx: Party.ConnectionContext
  ) {
    // Enforce max room size
    const connections = [...this.room.getConnections()];
    if (connections.length > MAX_ROOM_SIZE) {
      connection.send(
        JSON.stringify({ type: "ERROR", message: "Room is full" })
      );
      connection.close();
      return;
    }

    // Read playerRole from query string
    const url = new URL(ctx.request.url);
    const playerRole = url.searchParams.get("role") ?? "unknown";
    connection.setState({ playerRole });

    // Notify other clients
    this.room.broadcast(
      JSON.stringify({
        type: "PLAYER_JOINED",
        playerRole,
        connectionId: connection.id,
      }),
      [connection.id]
    );
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    const raw = typeof message === "string" ? message : "";

    // Size check
    if (raw.length > MAX_MESSAGE_SIZE) {
      sender.send(
        JSON.stringify({ type: "ERROR", message: "Message too large" })
      );
      return;
    }

    // Rate limit
    if (!this.checkRateLimit(sender.id)) {
      return; // silently drop
    }

    // Parse
    let data: { type: string; [key: string]: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return; // drop malformed
    }

    // Handle state request (reconnect)
    if (data.type === "STATE_REQUEST") {
      const events =
        (await this.room.storage.get<string[]>("events")) ?? [];
      sender.send(
        JSON.stringify({ type: "STATE_SNAPSHOT", events })
      );
      return;
    }

    // Clear event log on MATCHED (matchmaking complete, clean slate for next pair)
    if (data.type === "MATCHED") {
      await this.room.storage.put("events", []);
      this.room.broadcast(raw, [sender.id]);
      return;
    }

    // Store event for reconnect replay (capped to prevent unbounded growth)
    let events =
      (await this.room.storage.get<string[]>("events")) ?? [];
    events.push(raw);
    if (events.length > MAX_EVENTS) {
      events = events.slice(-MAX_EVENTS);
    }
    await this.room.storage.put("events", events);

    // Relay to everyone except sender
    this.room.broadcast(raw, [sender.id]);
  }

  async onClose(connection: Party.Connection) {
    this.rateLimits.delete(connection.id);

    // If room is now empty, clear event log (prevents stale matchmaking events)
    const remaining = [...this.room.getConnections()].filter(
      (c) => c.id !== connection.id
    );
    if (remaining.length === 0) {
      await this.room.storage.put("events", []);
    }

    this.room.broadcast(
      JSON.stringify({
        type: "PLAYER_LEFT",
        connectionId: connection.id,
      }),
      [connection.id]
    );
  }

  private checkRateLimit(connectionId: string): boolean {
    const now = Date.now();
    let state = this.rateLimits.get(connectionId);

    if (!state || now - state.windowStart > RATE_LIMIT_WINDOW) {
      state = { count: 1, windowStart: now };
      this.rateLimits.set(connectionId, state);
      return true;
    }

    state.count++;
    if (state.count > RATE_LIMIT_MAX) {
      return false;
    }
    return true;
  }
}
