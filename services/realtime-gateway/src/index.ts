import { createServer } from "node:http";
import Redis from "ioredis";
import WebSocket, { WebSocketServer } from "ws";

const key = process.env.MASSIVE_API_KEY ?? process.env.POLYGON_API_KEY;
const redisUrl = process.env.REDIS_URL;
if (!key || !redisUrl) throw new Error("MASSIVE_API_KEY and REDIS_URL are required");

const port = Number(process.env.PORT ?? 8080);
const upstreamUrl = process.env.MASSIVE_WEBSOCKET_URL ?? "wss://socket.massive.com/stocks";
const symbols = (process.env.MASSIVE_SYMBOLS ?? "AAPL,MSFT,NVDA,TSLA").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
const server = createServer((request, response) => { response.writeHead(request.url === "/health" ? 200 : 404, { "content-type": "application/json" }); response.end(JSON.stringify({ status: request.url === "/health" ? "ok" : "not_found" })); });
const clients = new WebSocketServer({ server, path: "/stream" });

function normalize(message: unknown) {
  if (!message || typeof message !== "object") return null;
  const row = message as Record<string, unknown>;
  const event = typeof row.ev === "string" ? row.ev : null;
  if (!event || !["T", "Q", "A", "AM"].includes(event)) return null;
  return { type: event === "T" ? "trade" : event === "Q" ? "quote" : "aggregate", symbol: row.sym ?? null, price: row.p ?? row.c ?? null, bid: row.bp ?? null, ask: row.ap ?? null, open: row.o ?? null, high: row.h ?? null, low: row.l ?? null, close: row.c ?? null, volume: row.v ?? null, sourceTimestamp: row.t ?? row.s ?? null, provider: "massive" };
}

function connect() {
  const upstream = new WebSocket(upstreamUrl);
  upstream.on("open", () => upstream.send(JSON.stringify({ action: "auth", params: key })));
  upstream.on("message", async (raw) => {
    let messages: unknown[] = [];
    try { const parsed: unknown = JSON.parse(raw.toString()); messages = Array.isArray(parsed) ? parsed : [parsed]; } catch { return; }
    if (messages.some((message) => (message as Record<string, unknown>)?.status === "auth_success")) upstream.send(JSON.stringify({ action: "subscribe", params: symbols.flatMap((symbol) => [`T.${symbol}`, `Q.${symbol}`, `A.${symbol}`]).join(",") }));
    for (const message of messages) {
      const normalized = normalize(message); if (!normalized) continue;
      const payload = JSON.stringify(normalized); await redis.publish(`kairo:market:${normalized.symbol}`, payload);
      for (const client of clients.clients) if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  });
  upstream.on("close", () => setTimeout(connect, 2_000));
  upstream.on("error", () => upstream.close());
}

await redis.connect(); connect(); server.listen(port);
