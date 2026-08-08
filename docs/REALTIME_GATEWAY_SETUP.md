# Massive realtime gateway

Kairo works immediately on Vercel through the server-side Massive REST adapter and visibility-aware near-live polling. The optional gateway in `services/realtime-gateway` adds true streaming without exposing the Massive key to browsers.

## Topology

`Massive WebSocket → gateway normalizer → Redis Pub/Sub → authenticated Kairo stream consumers`

The gateway accepts Massive trades, quotes and aggregates, normalizes them to one small contract, publishes each symbol to `kairo:market:<symbol>`, and can fan out over its `/stream` WebSocket. Production consumers should add their application authentication at the edge before exposing `/stream` publicly.

## Deploy

Deploy the subdirectory as an independent Node.js service on Railway, Render or Fly.io. Configure `MASSIVE_API_KEY` and `REDIS_URL` as secrets, optionally select `MASSIVE_SYMBOLS`, then run `npm install`, `npm run build`, and `npm start`. Never configure either secret as a `NEXT_PUBLIC_` variable.

The Next.js site does not depend on this service. If the gateway is absent or reconnecting, REST polling and the central provider cache continue to operate. The gateway reconnects after upstream disconnects and never logs credentials or raw authorization payloads.
