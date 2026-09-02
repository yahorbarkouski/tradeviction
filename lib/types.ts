export const DIRECTIONS = ["long", "short"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const SORTS = ["hot", "new", "collapses"] as const;
export type Sort = (typeof SORTS)[number];

export const SOURCES = ["hn", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export const EVENT_KINDS = ["open", "close", "increase", "decrease", "flip", "thesis"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type User = {
  id: string;
  username: string;
  createdAt: number;
  muted: boolean;
  showDead: boolean;
  trusted: boolean;
  xHandle: string | null;
  xAvatar: string | null;
  xVerified: boolean;
};

export type XChallenge = {
  handle: string;
  code: string;
  expiresAt: number;
};

export type Startup = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  domain: string;
  source: Source;
  sourceId: string | null;
  createdAt: number;
};

export type LookupHit = {
  slug: string;
  name: string;
  description: string;
  domain: string;
  url: string;
  exact: boolean;
};

export type Phase = "forming" | "quiet" | "hot" | "active";

export type Market = {
  pulse: number;
  p: number;
  depth: number;
  publicLong: number;
  publicShort: number;
  convLong: number;
  convShort: number;
  convLongPct: number | null;
  comments: number;
  delta: number | null;
  series: (number | null)[];
  hotness: number;
  heatActors: number;
  forming: boolean;
  quietDays: number;
  weekActors: number;
  quietEndedDays: number | null;
  discovered: boolean;
  phase: Phase;
};

export type Receipt = {
  startup: Startup;
  direction: Direction;
  entryPulse: number;
  exitPulse: number;
  entryDepth: number;
  conviction: number;
  alpha: number;
  openedAt: number;
  closedAt: number | null;
  live: boolean;
};

export type FeedItem = Startup & { market: Market };

export type Position = {
  id: string;
  startupId: string;
  userId: string;
  username: string;
  direction: Direction;
  conviction: number;
  note: string;
  openedAt: number;
  updatedAt: number;
  closedAt: number | null;
};

export type Lot = {
  id: string;
  userId: string;
  startupId: string;
  positionId: string;
  direction: Direction;
  conviction: number;
  entryP: number;
  entryPulse: number;
  entryDepth: number;
  openedAt: number;
  closedAt: number | null;
  realizedAlpha: number | null;
};

export type BookEvent = {
  id: string;
  userId: string;
  username: string;
  startupId: string;
  kind: EventKind;
  direction: Direction | null;
  conviction: number | null;
  pulse: number;
  depth: number;
  note: string | null;
  createdAt: number;
};

export type Comment = {
  id: string;
  startupId: string;
  userId: string;
  username: string;
  parentId: string | null;
  positionId: string | null;
  text: string;
  createdAt: number;
  points: number;
  score: number;
  voted: boolean;
  own: boolean;
  dead: boolean;
  flagged: boolean;
  vouched: boolean;
  authorCreatedAt: number;
  authorVerified: boolean;
  position: { direction: Direction; conviction: number } | null;
};

export type FrontComment = Comment & {
  startupSlug: string;
  startupName: string;
  replies: number;
};

export type ThreadNode = Comment & { kids: ThreadNode[] };

export type BookLine = {
  position: Position;
  startup: Startup;
  pulse: number;
  liveAlpha: number;
  priceAlpha: number;
  discoveryAlpha: number;
  carryAlpha: number;
  entryPulse: number;
  entryDepth: number;
  daysEarly: number | null;
};

export type PlayerStats = {
  alpha: number;
  karma: number;
  deployed: number;
  movesLeft: number;
  established: boolean;
};

export type Leader = {
  userId: string;
  username: string;
  alpha: number;
  karma: number;
  rank: number;
};

export type Leaderboard = {
  alpha: Leader[];
  karma: Leader[];
};

// A private board, like an Advent of Code leaderboard: join by invite link,
// see every member ranked with what they are long and short.
export type Party = {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: number;
  members: number;
};

export type PartyBet = {
  startupId: string;
  slug: string;
  name: string;
  domain: string;
  direction: Direction;
  conviction: number;
};

export type PartyRow = {
  userId: string;
  username: string;
  createdAt: number;
  verified: boolean;
  alpha: number;
  karma: number;
  // False until the member has staked or opened anything.
  played: boolean;
  bets: PartyBet[];
  rank: number;
};

const DIRECTION_SET: ReadonlySet<string> = new Set(DIRECTIONS);
const SORT_SET: ReadonlySet<string> = new Set(SORTS);
const SOURCE_SET: ReadonlySet<string> = new Set(SOURCES);
const EVENT_SET: ReadonlySet<string> = new Set(EVENT_KINDS);

export function isDirection(value: string): value is Direction {
  return DIRECTION_SET.has(value);
}

export function isSort(value: string): value is Sort {
  return SORT_SET.has(value);
}

export function isSource(value: string): value is Source {
  return SOURCE_SET.has(value);
}

export function isEventKind(value: string): value is EventKind {
  return EVENT_SET.has(value);
}
