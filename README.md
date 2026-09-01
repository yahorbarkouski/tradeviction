# Tradeviction

You bet conviction, not money. LONG or SHORT a startup. Pulse is who is staking at least 1 Conviction. One person, one vote.

## Run

```bash
npm install
cp .env.example .env.local
```

Set `DATABASE_URL` to a Neon connection string and `SESSION_SECRET` to a long random value.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The catalog seeds itself on the home page.

## Stack

Next.js on Vercel. Postgres on Neon. Auth is username plus password in a signed cookie.
