// Cache tags. Cached reads declare them with cacheTag; Server Actions expire
// them with updateTag after a write.
export const TAG = {
  // The scoring world: users, startups, positions, lots, events, comments.
  world: "world",
  // Startup rows: lookups by slug or id, and the feed listing.
  startups: "startups",
  // The front page list of theses.
  front: "front",
  // Every cached comment thread, for moderation that touches many at once.
  threads: "threads",
  // The leaderboard on /top.
  leaders: "leaders",
  // Browser-only caches derived from the session cookie.
  session: "session",
} as const;

export function startupTag(startupId: string): string {
  return `startup:${startupId}`;
}
