# What Now?

Understand a confusing message, screenshot, or document and know exactly what to do next.

This is a real two-part app now:

- **`server/`** — a small Express backend. Your Gemini API key lives here, in an environment
  variable, never in any file the browser downloads.
- **`client/`** — the React (Vite) frontend. It talks to your server, never to Gemini directly.

## 1. Run the backend

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and paste your real key in:

```
GEMINI_API_KEY=your_real_key_here
```

Get a free key at https://aistudio.google.com/apikey if you don't have one yet.

```bash
npm run dev
```

This starts the backend on `http://localhost:8787`.

## 2. Run the frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). The frontend automatically proxies
`/api/*` requests to your local backend — no extra config needed.

## How it works

1. You add text, a screenshot, or a document, and pick what you need (explain it, what to do,
   help you reply, spot risks, or make a plan).
2. The frontend sends that to **your own server** at `/api/analyze`.
3. Your server attaches your Gemini key, calls Google, and sends back a short, plain-English
   answer.
4. Your key never reaches the browser, so it can't be read from page source or dev tools.

## Deploying for real

- **Backend**: deploy `server/` to any place that runs Node — Render, Railway, Fly.io, a small
  VPS, etc. Set `GEMINI_API_KEY` as an environment variable there (not in a committed file).
- **Frontend**: run `npm run build` inside `client/` to produce a static `dist/` folder, and
  deploy that to Vercel, Netlify, GitHub Pages, or similar.
- Since frontend and backend will live on different URLs once deployed, set `VITE_API_URL` in
  `client/.env` (copy from `client/.env.example`) to your backend's live URL before building, so
  the frontend knows where to send requests.

## What's intentionally not here

No login, no accounts, no payments, no dashboards. Add content, pick what you need, get a fast
answer, take action — that's the whole app.
