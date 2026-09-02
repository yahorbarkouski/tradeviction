# Security

If you find a vulnerability, please report it privately through
[GitHub's private vulnerability reporting](https://github.com/yahorbarkouski/tradeviction/security/advisories/new)
rather than opening a public issue. You should hear back within a few days.

Things worth knowing when you look:

- Sessions are an HMAC-signed cookie. The secret is `SESSION_SECRET`; a production deploy refuses to start without one.
- Every write goes through `lib/guard.ts`: a rate limit per account and per address, enforced inside the same transaction as the write under an advisory lock.
- Sign-up and login can sit behind Cloudflare Turnstile; public text can go through OpenAI's moderation endpoint. Both are optional and off when their keys are absent.
- The `admin` account is whoever registers that username. Register it first on a fresh deploy.
