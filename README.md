# Background Buster

Make backgrounds — for a phone, a desktop, a TV — from your own photo/GIF or
from a handful of built-in generators. Self-hosted, stateless, no accounts,
nothing you upload is ever written to disk.

See [DESIGN.md](./DESIGN.md) for the full design and the reasoning behind it.

## Run it

```bash
docker compose up --build
```

Then open `http://<host>:8081` — or, over Tailscale, `http://<tailnet-hostname>:8081`.

## Develop locally

```bash
npm install
npm run dev:server   # http://localhost:8081
npm run dev:web      # http://localhost:5173, proxies /api to the server
```

## Test

```bash
npm test
```
