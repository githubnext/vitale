export type WebSocketHandlers = {
  ping: () => Promise<"pong">;
};

export type WebSocketEvents = {};
