import { HomeOg, ThesisOg, faviconSrc, ogImage } from "@/lib/og";
import { PartyOg, partyIcons } from "@/lib/og-party";
import type { Direction, PartyBet, PartyRow, Startup } from "@/lib/types";


const SAMPLE: Startup = {
  id: "preview",
  slug: "cursor",
  name: "Cursor",
  description: "",
  url: "https://cursor.com",
  domain: "cursor.com",
  source: "manual",
  sourceId: null,
  createdAt: 0,
};

const TEXTS: Record<string, string> = {
  xs: "Claude is what serious buyers actually deploy.",
  sm: "I like OpenAI. The brand is the company, and the API sits under too much of the stack to unwind.",
  md: "They already have the tab-complete muscle memory. Switching cost is the model of the codebase, not the editor chrome, and that is a much harder thing to copy than a theme.",
  lg: "I think the design-led approach misses the economic buyer. Strong product, wrong motion. The people who sign the contract still want a person on the hook, a roadmap they can escalate, and a vendor who will be in the room when the integration breaks at 2am.",
  xl: "Cursor is a feature until it is not. GitHub Copilot and a dozen forks eat the same workflow by Christmas if all you shipped is tab complete with a nicer font. The bet is that the model of the codebase, the agents that can actually edit, and the habit of staying in the loop compound into a product you cannot rip out without ripping out how the team writes software. That is a company. A wrapper with a theme is not.",
  xxl: "A wrapper on other people's models with a chrome theme is not a durable company, it is a distribution hack with a burn rate. SEO rents the front door, the models underneath can change the lock any quarter, and the moment a foundation lab ships a comparable answer box the whole thesis has to be rebuilt from the brand down. The people who are long it are underwriting a habit, not a moat: that search becomes the place you go to think with a model, that citations make it feel like research, and that being first in the query bar is enough. I do not buy it at this pulse. Distribution that you do not own is not distribution. It is a lease. When the landlord wants the building back you are a feature on someone else's homepage, and the book should say so before the multiple does.",
};

function bet(name: string, domain: string, direction: Direction, conviction: number): PartyBet {
  return { startupId: domain, slug: domain.split(".")[0] ?? domain, name, domain, direction, conviction };
}

function member(rank: number, username: string, alpha: number, karma: number, bets: PartyBet[]): PartyRow {
  return { userId: username, username, createdAt: 0, verified: false, alpha, karma, played: alpha !== 0 || bets.length > 0, bets, rank };
}

// A full board, so the card can be judged with every slot in use.
const PARTY_ROWS: PartyRow[] = [
  member(1, "alice", 12.4, 7, [bet("Cursor", "cursor.com", "long", 30), bet("Linear", "linear.app", "long", 20), bet("Anthropic", "anthropic.com", "short", 15)]),
  member(2, "bob", 3, 2, [bet("OpenAI", "openai.com", "long", 25), bet("Figma", "figma.com", "short", 10), bet("Glean", "glean.com", "short", 5), bet("Clay", "clay.com", "long", 5), bet("Databricks", "databricks.com", "long", 5), bet("Anduril", "anduril.com", "long", 5), bet("Cognition", "cognition.ai", "short", 5)]),
  member(3, "carol", 0, 0, [bet("ElevenLabs", "elevenlabs.io", "long", 0)]),
  member(4, "dave", -4.5, 1, [bet("Cursor", "cursor.com", "short", 40)]),
  member(5, "erin", 0, 0, []),
];

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("kind") === "home") return ogImage(<HomeOg />);
  if (url.searchParams.get("kind") === "party") {
    const rows = PARTY_ROWS.slice(0, Number(url.searchParams.get("n") ?? PARTY_ROWS.length) || PARTY_ROWS.length);
    return ogImage(
      <PartyOg name="Acme engineering" members={rows.length} rows={rows} icons={await partyIcons(rows)} />,
    );
  }
  const key = url.searchParams.get("len") ?? "sm";
  const text = TEXTS[key];
  if (!text) return new Response("unknown len", { status: 400 });
  const side: Direction = url.searchParams.get("side") === "short" ? "short" : "long";
  const name = url.searchParams.get("name") ?? SAMPLE.name;
  const domain = url.searchParams.get("domain") ?? SAMPLE.domain;
  const startup: Startup = {
    ...SAMPLE,
    name,
    domain,
    slug: domain.split(".")[0] ?? SAMPLE.slug,
    url: `https://${domain}`,
  };
  const icon = await faviconSrc(startup.domain);
  return ogImage(
    <ThesisOg
      startup={startup}
      text={text}
      username="alice"
      pulse={70}
      side={side}
      icon={icon}
    />,
  );
}
