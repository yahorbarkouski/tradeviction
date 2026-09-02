import type { ReactElement } from "react";
import { emptyMarket } from "@/lib/engine";
import { pulseDisplay, pulseP } from "@/lib/market";
import { HomeOg, ProfileOg, StartupOg, ThesisOg, avatarSrc, bookIcons, faviconSrc } from "@/lib/og";
import { PartyOg, partyIcons } from "@/lib/og-party";
import { partyAlt } from "@/lib/party";
import { bookAlt, clip, marketAlt, stanceAlt, thesisAlt } from "@/lib/share";
import type { BookLine, Comment, Direction, Market, PartyBet, PartyRow, Phase, Startup } from "@/lib/types";

// Every Open Graph card the site can emit, on fixtures that each stress one
// thing: a phase, a length, a script, a missing icon. The hidden /og/gallery
// page lists them next to the live routes; /og/gallery/[id] renders one.

export const GALLERY_GROUPS = ["home", "market", "intent", "profile", "party", "thesis"] as const;
export type GalleryGroup = (typeof GALLERY_GROUPS)[number];

export const GROUP_LABELS: Record<GalleryGroup, string> = {
  home: "Home",
  market: "Market",
  intent: "Long / short intent",
  profile: "Profile book",
  party: "Party",
  thesis: "Thesis",
};

export const GROUP_ROUTES: Record<GalleryGroup, string> = {
  home: "/ · app/opengraph-image.tsx",
  market: "/s/[slug] · app/s/[slug]/opengraph-image.tsx",
  intent: "/s/[slug]/long and /short · app/s/[slug]/[side]/opengraph-image.tsx",
  profile: "/u/[username] · app/u/[username]/opengraph-image.tsx",
  party: "/p/[slug] and /join/[code] · app/p/[slug]/opengraph-image.tsx · lib/og-party.tsx",
  thesis: "/s/[slug]/c/[id] · app/og/thesis/[id]/route.tsx",
};

export type GalleryCase = {
  id: string;
  group: GalleryGroup;
  label: string;
  note: string;
  // The page family this card is attached to.
  route: string;
  // What the page's <head> carries next to the image.
  title: string;
  description: string;
  alt: string;
  render: () => Promise<ReactElement>;
};

const SITE_DESCRIPTION = "The market of record for expressed startup conviction.";

// The static alt exports of the opengraph-image routes, repeated so the
// caption shows what a crawler actually reads.
const MARKET_ALT = "Tradeviction market";
const STANCE_ALT = "Tradeviction";
const BOOK_ALT = "Tradeviction book";
const PARTY_ALT = "Tradeviction party";
const HOME_ALT = "Bet your beliefs before they become common knowledge.";

// A stable public avatar for fixtures that have a linked X account.
const AVATAR_URL = "https://github.com/octocat.png?size=112";

function titled(title: string): string {
  return `${title} | Tradeviction`;
}

function startup(name: string, domain: string): Startup {
  const slug = domain.split(".")[0] ?? "gallery";
  return {
    id: `gallery-${slug}`,
    slug,
    name,
    url: `https://${domain}`,
    domain,
    source: "manual",
    sourceId: null,
    createdAt: 0,
  };
}

function market(input: {
  long: number;
  short: number;
  phase?: Phase;
  forming?: boolean;
  hotness?: number;
  quietDays?: number;
  // Seven days of pulse as a share of long, oldest first.
  series?: (number | null)[];
  delta?: number | null;
  comments?: number;
}): Market {
  const phase = input.phase ?? "active";
  const p = pulseP(input.long, input.short);
  return {
    ...emptyMarket(),
    pulse: pulseDisplay(p),
    p,
    depth: input.long + input.short,
    publicLong: input.long,
    publicShort: input.short,
    forming: input.forming ?? phase === "forming",
    phase,
    hotness: input.hotness ?? 0,
    heatActors: input.hotness ? 19 : 0,
    quietDays: input.quietDays ?? 0,
    series: input.series ?? Array.from({ length: 7 }, () => null),
    delta: input.delta ?? null,
    comments: input.comments ?? 0,
  };
}

function line(id: string, name: string, direction: Direction, conviction: number, domain = `${id}.example`): BookLine {
  const s = startup(name, domain);
  return {
    position: {
      id: `gallery-pos-${id}`,
      startupId: s.id,
      userId: "gallery",
      username: "gallery",
      direction,
      conviction,
      note: "",
      openedAt: 0,
      updatedAt: 0,
      closedAt: null,
    },
    startup: s,
    pulse: 50,
    liveAlpha: 0,
    priceAlpha: 0,
    discoveryAlpha: 0,
    carryAlpha: 0,
    entryPulse: 50,
    entryDepth: 0,
    daysEarly: null,
  };
}

function comment(text: string, username: string, side: Direction | null, startupId: string): Comment {
  return {
    id: "gallery",
    startupId,
    userId: "gallery",
    username,
    parentId: null,
    positionId: side ? "gallery" : null,
    text,
    createdAt: 0,
    points: 0,
    score: 0,
    voted: false,
    own: false,
    dead: false,
    flagged: false,
    vouched: false,
    authorCreatedAt: 0,
    authorVerified: false,
    position: side ? { direction: side, conviction: 20 } : null,
  };
}

// icon: null skips the favicon fetch and forces the letter mark.
type IconChoice = { icon?: null };

function iconFor(domain: string, choice: IconChoice): () => Promise<string | null> {
  if (choice.icon === null) return async () => null;
  return () => faviconSrc(domain);
}

function avatarFor(url: string | undefined): () => Promise<string | null> {
  if (!url) return async () => null;
  return () => avatarSrc(url);
}

function marketCase(
  input: IconChoice & {
    id: string;
    label: string;
    note: string;
    startup: Startup;
    market: Market;
    intent?: Direction;
  },
): GalleryCase {
  const { startup: s, market: m, intent } = input;
  const icon = iconFor(s.domain, input);
  return {
    id: input.id,
    group: intent ? "intent" : "market",
    label: input.label,
    note: input.note,
    route: intent ? `/s/${s.slug}/${intent}` : `/s/${s.slug}`,
    title: titled(intent ? `${intent} ${s.name}` : s.name),
    description: intent ? stanceAlt(intent, s, m.pulse) : marketAlt(s, m.pulse, m.forming),
    alt: intent ? STANCE_ALT : MARKET_ALT,
    render: async () => <StartupOg startup={s} market={m} intent={intent} icon={await icon()} />,
  };
}

function profileCase(input: {
  id: string;
  label: string;
  note: string;
  username: string;
  alpha: number;
  lines: BookLine[];
  avatarUrl?: string;
  rank?: number;
}): GalleryCase {
  const long = input.lines.filter((l) => l.position.direction === "long").length;
  const short = input.lines.length - long;
  const avatar = avatarFor(input.avatarUrl);
  return {
    id: input.id,
    group: "profile",
    label: input.label,
    note: input.note,
    route: `/u/${input.username}`,
    title: titled(input.username),
    description: bookAlt(input.username, input.alpha, long, short),
    alt: BOOK_ALT,
    render: async () => {
      const [avatarSrcValue, icons] = await Promise.all([avatar(), bookIcons(input.lines)]);
      return (
        <ProfileOg
          username={input.username}
          alpha={input.alpha}
          lines={input.lines}
          avatar={avatarSrcValue}
          rank={input.rank ?? null}
          icons={icons}
        />
      );
    },
  };
}

function bet(name: string, domain: string, direction: Direction, conviction: number): PartyBet {
  return { startupId: `gallery-${domain}`, slug: domain.split(".")[0] ?? domain, name, domain, direction, conviction };
}

function member(rank: number, username: string, alpha: number, bets: PartyBet[]): PartyRow {
  return {
    userId: `gallery-${username}`,
    username,
    createdAt: 0,
    verified: false,
    alpha,
    karma: 0,
    played: alpha !== 0 || bets.length > 0,
    bets,
    rank,
  };
}

function partyCase(input: {
  id: string;
  label: string;
  note: string;
  name: string;
  members: number;
  rows: PartyRow[];
}): GalleryCase {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: input.id,
    group: "party",
    label: input.label,
    note: input.note,
    route: `/p/${slug}`,
    title: titled(input.name),
    description: partyAlt(input.name, input.members, input.rows),
    alt: PARTY_ALT,
    render: async () => (
      <PartyOg name={input.name} members={input.members} rows={input.rows} icons={await partyIcons(input.rows)} />
    ),
  };
}

function thesisCase(
  input: IconChoice & {
    id: string;
    label: string;
    note: string;
    startup: Startup;
    text: string;
    username: string;
    pulse: number;
    side: Direction | null;
    avatarUrl?: string;
  },
): GalleryCase {
  const c = comment(input.text, input.username, input.side, input.startup.id);
  const lead = input.side
    ? `${input.username} ${input.side} ${input.startup.name}`
    : `${input.username} on ${input.startup.name}`;
  const icon = iconFor(input.startup.domain, input);
  const avatar = avatarFor(input.avatarUrl);
  return {
    id: input.id,
    group: "thesis",
    label: input.label,
    note: input.note,
    route: `/s/${input.startup.slug}/c/[id]`,
    title: titled(clip(input.text, 70)),
    description: `${lead} · pulse ${input.pulse}`,
    alt: thesisAlt(c, input.startup, input.pulse),
    render: async () => {
      const [iconSrc, avatarSrcValue] = await Promise.all([icon(), avatar()]);
      return (
        <ThesisOg
          startup={input.startup}
          text={input.text}
          username={input.username}
          pulse={input.pulse}
          side={input.side}
          icon={iconSrc}
          avatar={avatarSrcValue}
        />
      );
    },
  };
}

const CURSOR = startup("Cursor", "cursor.com");
const PERPLEXITY = startup("Perplexity", "perplexity.ai");
const OPENAI = startup("OpenAI", "openai.com");
const ANTHROPIC = startup("Anthropic", "anthropic.com");
const MISTRAL = startup("Mistral", "mistral.ai");
const DEEPMIND = startup("Google DeepMind", "deepmind.google");
const LONG_NAME = startup("Thinking Machines Lab Research Collective", "thinkingmachines.ai");
const NO_ICON = startup("Quietfold", "quietfold.example");

const RISING = [0.61, 0.64, 0.7, 0.72, 0.74, 0.77, 0.8];
const FALLING = [0.48, 0.44, 0.4, 0.36, 0.33, 0.3, 0.27];
const CHOPPY = [0.55, 0.47, 0.52, 0.49, 0.51, 0.48, 0.5];
const FLAT = [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6];

const TEXT = {
  xs: "Claude is what serious buyers actually deploy.",
  sm: "I like OpenAI. The brand is the company, and the API sits under too much of the stack to unwind.",
  md: "They already have the tab-complete muscle memory. Switching cost is the model of the codebase, not the editor chrome, and that is a much harder thing to copy than a theme.",
  lg: "I think the design-led approach misses the economic buyer. Strong product, wrong motion. The people who sign the contract still want a person on the hook, a roadmap they can escalate, and a vendor who will be in the room when the integration breaks at 2am.",
  xl: "Cursor is a feature until it is not. GitHub Copilot and a dozen forks eat the same workflow by Christmas if all you shipped is tab complete with a nicer font. The bet is that the model of the codebase, the agents that can actually edit, and the habit of staying in the loop compound into a product you cannot rip out without ripping out how the team writes software. That is a company. A wrapper with a theme is not.",
  xxl: "A wrapper on other people's models with a chrome theme is not a durable company, it is a distribution hack with a burn rate. SEO rents the front door, the models underneath can change the lock any quarter, and the moment a foundation lab ships a comparable answer box the whole thesis has to be rebuilt from the brand down. The people who are long it are underwriting a habit, not a moat: that search becomes the place you go to think with a model, that citations make it feel like research, and that being first in the query bar is enough. I do not buy it at this pulse. Distribution that you do not own is not distribution. It is a lease. When the landlord wants the building back you are a feature on someone else's homepage, and the book should say so before the multiple does.",
  paragraphs:
    "Three things.\n\n1. Retention is the only number that matters here.\n2. The model layer is a cost centre, not a moat.\n3. Nobody has priced in the second year of enterprise churn.",
  emoji:
    "Shipping speed is unreal 🚀 but the margin math 📉 does not work at this price. Short until the pricing page changes 🤞",
  cyrillic:
    "Продукт отличный, но рынок переоценивает скорость перехода корпораций. Год держу шорт, пока не увижу повторные продажи.",
  cjk: "製品は素晴らしいが、企業導入のスピードは過大評価されている。再購入が見えるまでショートを維持する。",
  url: "Read their own numbers before you go long: https://example.com/investors/quarterly-letter-2026-q2-full-text-with-appendices-and-footnotes.pdf then tell me the margin story.",
} as const;

export const GALLERY_CASES: GalleryCase[] = [
  {
    id: "home",
    group: "home",
    label: "Home",
    note: "the only card without data",
    route: "/",
    title: "Tradeviction",
    description: SITE_DESCRIPTION,
    alt: HOME_ALT,
    render: async () => <HomeOg />,
  },

  marketCase({
    id: "market-new",
    label: "Just listed",
    note: "forming, nobody in yet",
    startup: MISTRAL,
    market: market({ long: 0, short: 0, phase: "forming" }),
  }),
  marketCase({
    id: "market-forming",
    label: "Forming, seven in",
    note: "split stays hidden until genesis",
    startup: OPENAI,
    market: market({ long: 5, short: 2, phase: "forming", comments: 3 }),
  }),
  marketCase({
    id: "market-long",
    label: "Established, long-heavy",
    note: "the everyday market card, rising week",
    startup: CURSOR,
    market: market({ long: 41, short: 9, series: RISING, delta: 8, hotness: 34, comments: 12 }),
  }),
  marketCase({
    id: "market-short",
    label: "Established, short-heavy",
    note: "red split, falling week",
    startup: PERPLEXITY,
    market: market({ long: 6, short: 20, series: FALLING, delta: -21, hotness: 58, comments: 31 }),
  }),
  marketCase({
    id: "market-contested",
    label: "Hot and contested",
    note: "phase hot, pulse at the midpoint, choppy week",
    startup: ANTHROPIC,
    market: market({ long: 33, short: 33, phase: "hot", hotness: 71, series: CHOPPY, delta: -5, comments: 64 }),
  }),
  marketCase({
    id: "market-quiet",
    label: "Quiet for a month",
    note: "phase quiet, flat week, no change",
    startup: MISTRAL,
    market: market({ long: 8, short: 5, phase: "quiet", quietDays: 31, series: FLAT, delta: 0, comments: 2 }),
  }),
  marketCase({
    id: "market-two-words",
    label: "Two-word name",
    note: "name at full size next to the number",
    startup: DEEPMIND,
    market: market({ long: 19, short: 14, series: CHOPPY, delta: 2, hotness: 27, comments: 9 }),
  }),
  marketCase({
    id: "market-long-name",
    label: "Long name",
    note: "name steps down and wraps to two lines",
    startup: LONG_NAME,
    market: market({ long: 26, short: 9, series: RISING, delta: 3, hotness: 12, comments: 5 }),
  }),
  marketCase({
    id: "market-no-icon",
    label: "No favicon",
    note: "name stands alone, one comment, partial week",
    startup: NO_ICON,
    market: market({ long: 11, short: 14, series: [null, null, 0.5, 0.48, 0.46, 0.45, 0.44], delta: -6, hotness: 22, comments: 1 }),
    icon: null,
  }),
  marketCase({
    id: "market-crowded",
    label: "Three-digit depth",
    note: "pulse near the ceiling, wide numbers",
    startup: OPENAI,
    market: market({ long: 412, short: 13, series: [0.95, 0.96, 0.96, 0.97, 0.97, 0.97, 0.97], delta: 1, hotness: 88, comments: 240 }),
  }),

  marketCase({
    id: "intent-long",
    label: "Long intent",
    note: "the /long link on a long-heavy market",
    startup: CURSOR,
    market: market({ long: 41, short: 9, series: RISING, delta: 8, hotness: 34, comments: 12 }),
    intent: "long",
  }),
  marketCase({
    id: "intent-short",
    label: "Short intent",
    note: "the /short link on a short-heavy market",
    startup: PERPLEXITY,
    market: market({ long: 6, short: 20, series: FALLING, delta: -21, hotness: 58, comments: 31 }),
    intent: "short",
  }),
  marketCase({
    id: "intent-contrarian",
    label: "Short against the crowd",
    note: "the argument-starter: short link, pulse 90",
    startup: ANTHROPIC,
    market: market({ long: 58, short: 4, series: [0.86, 0.88, 0.9, 0.9, 0.91, 0.9, 0.91], delta: 5, hotness: 40, comments: 22 }),
    intent: "short",
  }),
  marketCase({
    id: "intent-forming",
    label: "Long intent while forming",
    note: "stance in the corner, grey provisional number, no split",
    startup: MISTRAL,
    market: market({ long: 2, short: 1, phase: "forming" }),
    intent: "long",
  }),

  profileCase({
    id: "profile-empty",
    label: "Empty book",
    note: "fresh account, alpha zero, no avatar so no placeholder",
    username: "newcomer",
    alpha: 0,
    lines: [],
  }),
  profileCase({
    id: "profile-small",
    label: "Three positions",
    note: "positive alpha, linked X avatar",
    username: "alice",
    alpha: 12.4,
    lines: [
      line("cursor", "Cursor", "long", 35, "cursor.com"),
      line("anthropic", "Anthropic", "long", 20, "anthropic.com"),
      line("perplexity", "Perplexity", "short", 15, "perplexity.ai"),
    ],
    avatarUrl: AVATAR_URL,
    rank: 4,
  }),
  profileCase({
    id: "profile-full",
    label: "Fifteen positions",
    note: "six per side shown with favicons, bare names where none, plus-three-more line, negative alpha",
    username: "maxbook",
    alpha: -38.2,
    rank: 72,
    lines: [
      line("openai", "OpenAI", "long", 10, "openai.com"),
      line("anthropic", "Anthropic", "long", 10, "anthropic.com"),
      line("cursor", "Cursor", "long", 10, "cursor.com"),
      line("mistral", "Mistral", "long", 10, "mistral.ai"),
      line("glean", "Glean", "long", 5, "glean.com"),
      line("cognition", "Cognition", "long", 5, "cognition.ai"),
      line("ssi", "SSI", "long", 5, "ssi.inc"),
      line("xai", "xAI", "long", 5, "x.ai"),
      line("perplexity", "Perplexity", "short", 10, "perplexity.ai"),
      line("character", "Character.AI", "short", 10, "character.ai"),
      line("deepmind", "Google DeepMind", "short", 5, "deepmind.google"),
      line("tml", "Thinking Machines", "short", 5, "thinkingmachines.ai"),
      line("inflection", "Inflection", "short", 5),
      line("stability", "Stability AI", "short", 3),
      line("adept", "Adept", "short", 2),
    ],
  }),
  profileCase({
    id: "profile-long-names",
    label: "Long names",
    note: "long username and names, cut to the room they have",
    username: "the_quietest_short_seller_in_town",
    alpha: 3,
    lines: [
      line("tmlrc", "Thinking Machines Lab Research Collective", "long", 40),
      line("gdm", "Google DeepMind Applied Research", "short", 25),
    ],
  }),
  profileCase({
    id: "profile-one-sided",
    label: "Longs only",
    note: "empty short column, three-digit alpha",
    username: "permabull",
    alpha: 140,
    rank: 0.5,
    lines: [
      line("openai", "OpenAI", "long", 30, "openai.com"),
      line("anthropic", "Anthropic", "long", 30, "anthropic.com"),
      line("cursor", "Cursor", "long", 20, "cursor.com"),
      line("mistral", "Mistral", "long", 10, "mistral.ai"),
      line("glean", "Glean", "long", 10, "glean.com"),
    ],
  }),

  partyCase({
    id: "party-full",
    label: "Full board",
    note: "five ranked members: a full lane of ten chips, nine plus a count, a dimmed zero-conviction bet, an unplayed member",
    name: "Acme engineering",
    members: 12,
    rows: [
      member(1, "alice", 12.4, [bet("Cursor", "cursor.com", "long", 30), bet("Linear", "linear.app", "long", 20), bet("Anthropic", "anthropic.com", "short", 15)]),
      member(2, "bob", 3, [
        bet("OpenAI", "openai.com", "long", 25),
        bet("Figma", "figma.com", "short", 10),
        bet("Glean", "glean.com", "short", 5),
        bet("Clay", "clay.com", "long", 5),
        bet("Databricks", "databricks.com", "long", 5),
        bet("Anduril", "anduril.com", "long", 5),
        bet("Cognition", "cognition.ai", "short", 5),
        bet("Mistral", "mistral.ai", "long", 5),
        bet("Perplexity", "perplexity.ai", "short", 5),
        bet("Linear", "linear.app", "long", 5),
      ]),
      member(3, "chen", 1.5, [
        bet("OpenAI", "openai.com", "long", 10),
        bet("Anthropic", "anthropic.com", "long", 10),
        bet("Cursor", "cursor.com", "long", 10),
        bet("Mistral", "mistral.ai", "long", 5),
        bet("Glean", "glean.com", "long", 5),
        bet("Cognition", "cognition.ai", "short", 5),
        bet("Perplexity", "perplexity.ai", "short", 5),
        bet("Character.AI", "character.ai", "short", 5),
        bet("Google DeepMind", "deepmind.google", "short", 5),
        bet("Figma", "figma.com", "short", 5),
        bet("Linear", "linear.app", "long", 5),
        bet("Clay", "clay.com", "long", 5),
      ]),
      member(4, "carol", 0, [bet("ElevenLabs", "elevenlabs.io", "long", 0)]),
      member(5, "dave", -4.5, [bet("Cursor", "cursor.com", "short", 40)]),
    ],
  }),
  partyCase({
    id: "party-two",
    label: "Two members",
    note: "a small party, lots of room below",
    name: "Sunday shorts",
    members: 2,
    rows: [
      member(1, "mantegna", 8.2, [bet("Perplexity", "perplexity.ai", "short", 40), bet("Mistral", "mistral.ai", "long", 10)]),
      member(2, "yahor", -1.5, [bet("Cursor", "cursor.com", "short", 20)]),
    ],
  }),
  partyCase({
    id: "party-empty",
    label: "Nobody yet",
    note: "the invite card before anyone joins",
    name: "Fresh party",
    members: 1,
    rows: [],
  }),
  partyCase({
    id: "party-long-names",
    label: "Long names",
    note: "party name at the 40-character limit, long usernames",
    name: "The Very Long Party Name For Testing OK",
    members: 3,
    rows: [
      member(1, "the_quietest_short_seller_in_town", 22, [bet("Anthropic", "anthropic.com", "long", 50)]),
      member(2, "someone_with_a_really_long_handle", 1, [bet("OpenAI", "openai.com", "long", 10)]),
      member(3, "x", 0, []),
    ],
  }),
  partyCase({
    id: "party-no-icons",
    label: "No favicons",
    note: "chips fall back to letters",
    name: "Stealth picks",
    members: 2,
    rows: [
      member(1, "alice", 4, [bet("Quietfold", "quietfold.example", "long", 30), bet("Nimbus Labs", "nimbus.example", "short", 20)]),
      member(2, "bob", 0, [bet("Quietfold", "quietfold.example", "short", 0)]),
    ],
  }),

  thesisCase({ id: "thesis-xs", label: "Very short", note: "hero size, linked avatar", startup: ANTHROPIC, text: TEXT.xs, username: "alice", pulse: 70, side: "long", avatarUrl: AVATAR_URL }),
  thesisCase({ id: "thesis-sm", label: "Short", note: "hero size, two lines, no avatar so the name leads", startup: OPENAI, text: TEXT.sm, username: "alice", pulse: 70, side: "long" }),
  thesisCase({ id: "thesis-md", label: "Medium", note: "one step down from hero", startup: CURSOR, text: TEXT.md, username: "mantegna", pulse: 70, side: "long", avatarUrl: AVATAR_URL }),
  thesisCase({ id: "thesis-lg", label: "Long", note: "mid size, no clipping", startup: CURSOR, text: TEXT.lg, username: "alice", pulse: 70, side: "short" }),
  thesisCase({ id: "thesis-xl", label: "Very long", note: "smallest size, trimmed with an ellipsis", startup: CURSOR, text: TEXT.xl, username: "alice", pulse: 70, side: "long" }),
  thesisCase({ id: "thesis-xxl", label: "Wall of text", note: "clipped with an ellipsis at the smallest size", startup: PERPLEXITY, text: TEXT.xxl, username: "alice", pulse: 31, side: "short" }),
  thesisCase({ id: "thesis-no-side", label: "No position", note: "comment without a stance: reads as 'on', grey bar", startup: CURSOR, text: TEXT.md, username: "lurker", pulse: 70, side: null }),
  thesisCase({ id: "thesis-paragraphs", label: "Line breaks", note: "numbered list with blank lines", startup: MISTRAL, text: TEXT.paragraphs, username: "alice", pulse: 55, side: "short" }),
  thesisCase({ id: "thesis-emoji", label: "Emoji", note: "emoji come from twemoji, fetched at render time", startup: CURSOR, text: TEXT.emoji, username: "mantegna", pulse: 70, side: "short", avatarUrl: AVATAR_URL }),
  thesisCase({ id: "thesis-cyrillic", label: "Cyrillic", note: "latin-only fonts, falls back to a fetched Noto subset", startup: MISTRAL, text: TEXT.cyrillic, username: "yahor", pulse: 62, side: "short" }),
  thesisCase({ id: "thesis-cjk", label: "Japanese", note: "latin-only fonts, falls back to a fetched Noto subset", startup: PERPLEXITY, text: TEXT.cjk, username: "kenji", pulse: 44, side: "short" }),
  thesisCase({ id: "thesis-url", label: "Unbreakable token", note: "a long URL inside the take", startup: OPENAI, text: TEXT.url, username: "alice", pulse: 70, side: "long" }),
  thesisCase({
    id: "thesis-long-name",
    label: "Long everything",
    note: "long username and long startup name share the header line, no favicon",
    startup: LONG_NAME,
    text: TEXT.md,
    username: "the_quietest_short_seller_in_town",
    pulse: 70,
    side: "long",
    icon: null,
    avatarUrl: AVATAR_URL,
  }),
];

export function findGalleryCase(id: string): GalleryCase | null {
  return GALLERY_CASES.find((c) => c.id === id) ?? null;
}
