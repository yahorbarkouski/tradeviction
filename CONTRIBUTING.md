# Contributing

Thanks for looking. Bug reports, questions, and pull requests are all welcome. For anything larger than a fix, open an issue first so we can agree on the shape before you spend time on it.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` starts a Postgres in Docker and the Next.js dev server. If you would rather run your own Postgres, set `DATABASE_URL` and run `npx next dev`. Register the username `admin` to see the moderation controls.

## Before you push

```bash
npm run check   # eslint, tsc, knip (unused code), prettier
npm test        # unit and integration suites; the latter needs Docker or TEST_DATABASE_URL
```

CI runs the same two commands. `npm run format` fixes formatting; `npm run test:unit` runs the pure tests in under a second.

## Where things live

Read [docs/architecture.md](docs/architecture.md) once. In short: routes and server actions in `app/`, components in `components/`, everything else in `lib/`, SQL in `lib/db/` by domain, formulas in `lib/market.ts`, and every rule about the numbers in [docs/scoring.md](docs/scoring.md).

## Conventions

- **Plain SQL, decoded at the edge.** Queries live in `lib/db/<domain>.ts`, use `?` placeholders, and read rows through `lib/db/codec.ts`. No ORM, no query builder.
- **Every write expires what it changed.** A server action ends with `expire(...)` for the tags its write touched. `test/cache.test.ts` pins them; update it when you add a reader or a writer.
- **Rate limits live in `lib/guard.ts`.** Wrap every user-driven write in `guarded(kind, user, write)`.
- **Pure where it can be.** Formulas and planning (`lib/market.ts`, `lib/book.ts`, `lib/domain.ts`) take values and return values, so they run in the browser and in unit tests without a database.
- **Comments say why.** The codebase leans on short comments above functions that explain the reason for a rule, not what the code does. Keep that up; skip comments that restate the code.
- **Copy is part of the product.** Error messages and labels are written for the person reading them. Match the voice around you.
- **Scoring changes are documented.** A change to any number in `docs/scoring.md` updates that page and comes with a test in `test/unit/market.test.ts` or `test/market.test.ts`.

## Schema changes

Edit `lib/db/schema.ts`. If an existing database needs an `ALTER`, add it to `lib/db/migrate.ts` guarded by a column check. The schema's fingerprint changes with the text, and the next server instance applies it once. `test/migrate.test.ts` covers the replay.

## Pull requests

Keep them focused. Say what changed and why in the description; the template asks for both. A reviewer should be able to read the diff top to bottom without opening other files.
