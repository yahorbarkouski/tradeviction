# Deploying

Tradeviction runs as a normal Next.js app: one Node process (or Vercel's functions) and one Postgres. Nothing else.

## Vercel and Neon

1. Create a Neon project and copy its connection string.
2. Import the repository into Vercel. The framework preset is Next.js; `vercel.json` says so.
3. Set the environment variables below in the Vercel project. Deploy.
4. Open the site and register the username **`admin`**. That account gets the moderation controls (mute, trust, edit and delete listings and comments) and can see the Open Graph gallery in production. Register it before anyone else does.

The first request applies the schema and seeds the catalog; see [architecture.md](architecture.md#the-database).

## Anywhere else

`npm run build && npm start` serves the app on port 3000. `DATABASE_URL` may point at any Postgres 14+; the `citext` extension is created by the schema, so the role needs permission for that. A non-local host gets `sslmode=require` unless the URL sets one.

## Environment

| Variable              | Required       | What it does                                                                                                   |
| --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes            | Postgres connection string.                                                                                    |
| `SESSION_SECRET`      | yes            | Signs the session cookie. At least 16 characters. Rotating it signs everyone out.                              |
| `TURNSTILE_SITE_KEY`  | in production  | Cloudflare Turnstile widget on sign-up and login.                                                              |
| `TURNSTILE_SECRET`    | in production  | Its server secret. Cloudflare's dummy pass secret is recognized and skips the hostname check, for staging.     |
| `TURNSTILE_HOSTNAMES` | with Turnstile | Comma-separated hostnames the widget may answer for. `VERCEL_PROJECT_PRODUCTION_URL` is added automatically.   |
| `OPENAI_API_KEY`      | in production  | Runs usernames, takes, replies, party names, and listings through `omni-moderation-latest` before they land.   |
| `TWITTERIO_API_KEY`   | no             | Enables linking a checkmarked X account to a profile through twitterapi.io. Without it the link button errors. |
| `CRON_SECRET`         | no             | Bearer token for `GET /api/ingest`, which re-inserts any catalog company that was deleted.                     |

"In production" means the code refuses the relevant write when the key is missing and `NODE_ENV=production`; locally the check is skipped.

## The catalog

`data/catalog.json` lists the companies every deploy starts with, each with a name, a URL, and optionally an `opening` line from 0 to 100 that the market opens at. Edit it and deploy: the file's fingerprint changes, and the next instance inserts what is missing and updates the lines. Companies already in the database are matched by domain, so renaming one there is safe.

## Moderation

- The admin account can edit and delete listings and comments, mute or trust accounts, and delete accounts from their profile page.
- Members with 5 Karma can flag a comment; with 10 they can vouch for a flagged one. Enough flags without vouches kill it.
- A user can delete their own comments; replies by others stay, attached to the next living parent.
