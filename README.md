# League Match Analyzer

Look up any League of Legends player by Riot ID and see, minute by minute, where each of their games was won or lost.

See [docs/SCOPE.md](docs/SCOPE.md) for the plan, data model and stack.

## Running locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local   # then add your Riot API key
npm run dev
```

Open http://localhost:3000.

### Riot API key

Player pages call the Riot API, so they need a key in `RIOT_API_KEY`. It's only read on the server and never sent to the browser.

- **Local:** put it in `.env.local` (git ignores this file), then restart `npm run dev`.
- **Vercel:** Project → Settings → Environment Variables → add `RIOT_API_KEY` for Production and Preview, then redeploy.

Get a key at https://developer.riotgames.com. Development keys expire every 24 hours; a personal key doesn't.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit tests (Vitest) |

## Stack

Next.js (App Router) with TypeScript and Tailwind CSS, deployed on Vercel. Postgres (Supabase) and the Riot API come next.
