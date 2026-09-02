// Where the site lives, for absolute URLs in metadata and link previews.
// Vercel sets the production host; anywhere else this is the dev server.
export function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(host ? `https://${host}` : "http://localhost:3000");
}
