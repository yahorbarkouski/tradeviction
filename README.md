# Tradeviction

**Long or short startups with conviction.** Bet your beliefs before they become common knowledge.

Tradeviction is a prediction game where the stake is your reputation, not money. Every company has a conviction market. You call it long or short, put some of your hundred points of Conviction behind the call, write a take, and wait. If the crowd comes around to your view, you earn Alpha. If you spotted it while the board was still quiet, you earn more.

Live at [tradeviction.com](https://tradeviction.com).

## How it works

- Every company has a conviction market. Earn **Alpha** by being early to what others get wrong: go **long** on companies people underestimate and **short** on companies people overhype.
- **Pulse** is how bullish or bearish people with open positions are right now, 0 to 100. One person, one vote. **Depth** is how many people placed a bet.
- You have **100 Conviction** to spread across your strongest bets. More Conviction on a position means more Alpha at stake, so you gain or lose more.
- Positions stay open until you close them. Backing a quiet startup months before everybody noticed it is what the scoring rewards most.
- **Hotness** compares how many people acted on a board in the last few days with how many usually do.
- Explain your position with arguments to earn **Karma**. Others vote for the takes that helped them.
- Make **parties**: private leaderboards you join by invite link, to see what your friends or your team are long and short.

## The formulas

Pulse is a share long with a small prior, so an empty board reads 50 and one vote cannot pin it to an edge:

```
p = (w·p₀ + long) / (w + long + short)        p₀ = 0.5, w = 4 by default; a catalog opening line sets p₀ with w = 10
```

Alpha on a position is the sum of three parts, each scaled by the Conviction `c` on it and the side `s` (+1 long, −1 short):

```
price     = c · s · (logit(p_now) − logit(p_entry))   how far the crowd moved your way since you entered
discovery = c · s · (2p* − 1) · ln(1 + days/7)        days held while the board was quiet, paid once it heats up
carry     = 0.002 · c · days                          a small daily cost of holding
alpha     = price + discovery − carry
```

Your entry price leaves your own vote out, so you cannot move Pulse by joining. Hotness is a saturating function of how many people touched the board in the last 72 hours against a 28-day baseline, weighted toward newcomers. Only established accounts count toward Pulse, Depth, and Hotness; new accounts play at full Alpha but weigh a tenth in rankings until they are a week old, have touched three companies, and a trusted member has voted for one of their takes.

Every constant and rule, with worked examples, is in [docs/scoring.md](docs/scoring.md). The code is `lib/market.ts` (pure formulas) and `lib/engine.ts` (the world they run on).

## Run it locally

You need Node 20.9+ and Docker (for Postgres).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The schema and the company catalog are applied the first time a server touches an empty database. Register the username `admin` to get the moderation controls.

```bash
npm test          # integration suite against a throwaway Postgres
npm run test:unit # the pure formulas, no Docker needed
npm run check     # lint, types, unused code, formatting
```

## Stack

Next.js 16 with Cache Components, React 19, Tailwind 4, Postgres (Neon in production, plain `pg` locally) with hand-written SQL, Vercel. No ORM, no state library, one signed cookie for auth. See [docs/architecture.md](docs/architecture.md) for how a request flows and how the cache is kept honest, and [docs/deploying.md](docs/deploying.md) to run your own.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the conventions, and where things live. Scoring changes should come with a test and a line in `docs/scoring.md`.

[MIT](LICENSE).
