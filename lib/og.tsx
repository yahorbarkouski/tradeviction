import type { ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatAlpha, formatRank, phaseLabel } from "@/lib/format";
import { iconSources } from "@/lib/icon";
import { fitBlock, fitThesis, measureText, SEMIBOLD, THESIS_TYPE, TITLE_TYPE, truncateToWidth } from "@/lib/og-fit";
import { OG_SIZE, OG_TYPE } from "@/lib/share";
import type { BookLine, Direction, Market, Startup } from "@/lib/types";

export { OG_SIZE, OG_TYPE };

const INK = "#292421";
const BG = "#fafafa";
const MUTE = "rgba(41, 36, 33, 0.62)";
const LINE = "rgba(41, 36, 33, 0.12)";
const LONG = "#2f6a4a";
const SHORT = "#b42318";

const SANS = "Inter";
const MONO = "IBM Plex Mono";

// Shared with the party card in lib/og-party.tsx.
export { INK, BG, MUTE, LINE, LONG, SHORT, SANS, MONO };

const FONT_SANS_400 = "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-400-normal.ttf";
const FONT_SANS_500 = "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-500-normal.ttf";
const FONT_SANS_600 = "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-600-normal.ttf";
const FONT_MONO_500 = "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-mono@5.2.5/latin-500-normal.ttf";

let fontCache: Promise<ArrayBuffer[]> | null = null;

function loadFonts(): Promise<ArrayBuffer[]> {
  if (!fontCache) {
    fontCache = Promise.all([
      fetch(FONT_SANS_400).then((res) => res.arrayBuffer()),
      fetch(FONT_SANS_500).then((res) => res.arrayBuffer()),
      fetch(FONT_SANS_600).then((res) => res.arrayBuffer()),
      fetch(FONT_MONO_500).then((res) => res.arrayBuffer()),
    ]);
  }
  return fontCache;
}

async function tightenIcon(buf: ArrayBuffer): Promise<Buffer | null> {
  try {
    const trimmed = await sharp(Buffer.from(buf)).ensureAlpha().trim({ threshold: 28 }).png().toBuffer({
      resolveWithObject: true,
    });
    const side = Math.max(trimmed.info.width, trimmed.info.height);
    const pad = Math.max(2, Math.round(side * 0.06));
    return await sharp(trimmed.data)
      .extend({
        top: pad,
        left: pad,
        bottom: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

// How long a card may sit at the CDN. Browsers and crawlers re-check on every
// visit; the edge keeps a card for five minutes and serves it stale while a
// fresh one renders. Left alone, @vercel/og marks every card immutable for a year.
const CARD_CACHE =
  process.env.NODE_ENV === "development"
    ? "no-cache, no-store"
    : "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

export async function ogImage(element: ReactElement): Promise<ImageResponse> {
  const [sans400, sans500, sans600, mono500] = await loadFonts();
  return new ImageResponse(element, {
    ...OG_SIZE,
    fonts: [
      { name: SANS, data: sans400, weight: 400, style: "normal" },
      { name: SANS, data: sans500, weight: 500, style: "normal" },
      { name: SANS, data: sans600, weight: 600, style: "normal" },
      { name: MONO, data: mono500, weight: 500, style: "normal" },
    ],
    headers: { "cache-control": CARD_CACHE },
  });
}

export async function faviconSrc(domain: string, size = 128): Promise<string | null> {
  const url = iconSources(domain, size)[0];
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const buf = await response.arrayBuffer();
    if (buf.byteLength < 32 || buf.byteLength > 200_000) return null;
    const mime = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    if (!mime.startsWith("image/")) return null;
    const tight = await tightenIcon(buf);
    const payload = tight ?? Buffer.from(buf);
    return `data:${tight ? "image/png" : mime};base64,${payload.toString("base64")}`;
  } catch {
    return null;
  }
}

function Face({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={INK} strokeWidth="2" />
      <path d="M15 10V9" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M9 10V9" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M16.472 15C16.472 17.8 7.529 17.8 7.529 15" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", marginRight: Math.round(size * 0.38) }}>
        <Face size={size} />
      </div>
      <div style={{ display: "flex", fontSize: size, fontWeight: 500, fontFamily: SANS, color: INK }}>Tradeviction</div>
    </div>
  );
}

function Pill({ side, filled }: { side: Direction; filled?: boolean }) {
  const color = side === "long" ? LONG : SHORT;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: filled ? "8px 20px" : "10px 22px",
        border: `2px solid ${color}`,
        backgroundColor: filled ? color : "transparent",
        color: filled ? BG : color,
        fontSize: filled ? 26 : 28,
        fontFamily: SANS,
        fontWeight: 500,
      }}
    >
      {`[ ${side} ]`}
    </div>
  );
}

// A company favicon; nothing at all when there is none, so the name stands alone.
function Mark({ src, size = 72 }: { src: string | null; size?: number }) {
  if (!src) return null;
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img src={src} width={size} height={size} alt="" style={{ objectFit: "contain" }} />
    </div>
  );
}

export function Shell({ children, accent, meta }: { children: ReactNode; accent?: Direction; meta?: ReactNode }) {
  const bar = accent === "long" ? LONG : accent === "short" ? SHORT : null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: BG,
        color: INK,
        padding: "52px 64px 40px",
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 8, marginBottom: 36 }}>
        {bar ? (
          <div style={{ display: "flex", width: "100%", height: 8, backgroundColor: bar }} />
        ) : (
          <div style={{ display: "flex", width: "100%", height: 8, backgroundColor: LINE }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>{children}</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 24,
        }}
      >
        <div style={{ display: "flex" }}>{meta}</div>
        <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>tradeviction.com</div>
      </div>
    </div>
  );
}

export function HomeOg() {
  return (
    <Shell
      meta={
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", marginRight: 16 }}>
            <Pill side="long" />
          </div>
          <Pill side="short" />
        </div>
      }
    >
      <Wordmark size={32} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 72,
          fontSize: 62,
          fontWeight: 500,
          fontFamily: SANS,
          lineHeight: 1.2,
          letterSpacing: "-0.03em",
        }}
      >
        <div style={{ display: "flex" }}>Bet your beliefs before</div>
        <div style={{ display: "flex" }}>they become common knowledge.</div>
      </div>
    </Shell>
  );
}

// A linked X avatar, resized small and inlined; null when it cannot be fetched.
export async function avatarSrc(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const buf = await response.arrayBuffer();
    if (buf.byteLength < 32 || buf.byteLength > 2_000_000) return null;
    const png = await sharp(Buffer.from(buf)).resize(112, 112, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

function Avatar({ src, size }: { src: string; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img src={src} width={size} height={size} alt="" style={{ objectFit: "cover" }} />
    </div>
  );
}

// The site's seven-character sparkline: # for a day with a book, coloured by
// the side that held it, and . for a day without one. Oldest on the left.
function AsciiSpark({ series }: { series: (number | null)[] }) {
  return (
    <div style={{ display: "flex", fontSize: 32, lineHeight: 1, fontFamily: MONO, fontWeight: 500 }}>
      {series.map((p, i) => (
        <div key={i} style={{ display: "flex", color: p === null ? MUTE : p >= 0.5 ? LONG : SHORT }}>
          {p === null ? "." : "#"}
        </div>
      ))}
    </div>
  );
}

function Arrow({ up, color }: { up: boolean; color: string }) {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14">
      <path d={up ? "M9 0 L18 14 L0 14 Z" : "M0 0 L18 0 L9 14 Z"} fill={color} />
    </svg>
  );
}

function Bar({ long, short, muted }: { long: number; short: number; muted: boolean }) {
  const total = long + short;
  const longPct = total === 0 ? 0 : Math.round((long / total) * 100);
  return (
    <div style={{ display: "flex", width: "100%", height: 16, backgroundColor: LINE }}>
      {muted || total === 0 ? null : (
        <>
          <div style={{ display: "flex", width: `${longPct}%`, height: 16, backgroundColor: LONG }} />
          <div style={{ display: "flex", width: `${100 - longPct}%`, height: 16, backgroundColor: SHORT }} />
        </>
      )}
    </div>
  );
}

// The same lucide glyphs the site uses for depth and hotness, plus a speech bubble for comments.
const GLYPHS = {
  depth: [
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
    "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
    "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  ],
  comments: [
    "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
  ],
  hotness: ["M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"],
} as const;

function Glyph({ id, size, color }: { id: keyof typeof GLYPHS; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {GLYPHS[id].map((d) => (
        <path key={d} d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function Stat({ id, value }: { id: keyof typeof GLYPHS; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginRight: 30 }}>
      <Glyph id={id} size={24} color={MUTE} />
      <div style={{ display: "flex", marginLeft: 9, fontSize: 24, fontFamily: MONO, fontWeight: 500, color: MUTE }}>
        {String(value)}
      </div>
    </div>
  );
}

export const CONTENT_W = 1200 - 64 * 2;
const MARKET_RIGHT_MIN = 260;
const MARKET_NAME_SIZES = [64, 56, 48] as const;
const PULSE_SIZE = 168;
const PULSE_TYPE = { tracking: -0.04, weight: SEMIBOLD };

export function StartupOg({
  startup,
  market,
  intent,
  icon,
}: {
  startup: Startup;
  market: Market;
  intent?: Direction;
  icon: string | null;
}) {
  const forming = market.forming || market.phase === "forming";
  const pulseText = String(market.pulse);
  const numberW = Math.max(MARKET_RIGHT_MIN, Math.ceil(measureText(pulseText, PULSE_SIZE, PULSE_TYPE)));
  // One line at the largest size that fits; only long names wrap, at the smallest.
  const nameW = CONTENT_W - numberW - 40 - (icon ? 88 : 0);
  // The header's right slot: the stance on an intent card, else a phase worth a word.
  const corner = intent ? (
    <Pill side={intent} filled />
  ) : market.phase === "hot" || market.phase === "quiet" ? (
    <div style={{ display: "flex", fontSize: 18, letterSpacing: "0.08em", color: MUTE, fontFamily: SANS }}>
      {phaseLabel(market.phase)}
    </div>
  ) : null;
  const oneLine = fitBlock(startup.name, nameW, MARKET_NAME_SIZES, 1);
  const name = oneLine.fits
    ? oneLine
    : fitBlock(startup.name, nameW, [MARKET_NAME_SIZES[MARKET_NAME_SIZES.length - 1] ?? 48], 2);
  const delta = market.delta;
  const deltaColor = delta === null || delta === 0 ? MUTE : delta > 0 ? LONG : SHORT;
  const hasWeek = !forming && market.series.some((p) => p !== null);
  const label = { fontSize: 24, fontFamily: MONO, fontWeight: 500 } as const;
  return (
    <Shell
      accent={intent}
      meta={
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", marginRight: 16 }}>
            <Pill side="long" />
          </div>
          <Pill side="short" />
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 52 }}>
        <Wordmark size={24} />
        {corner}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexGrow: 1,
          marginTop: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, paddingRight: 40 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Mark src={icon} size={80} />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: icon ? 8 : 0 }}>
              {name.lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    whiteSpace: "nowrap",
                    fontSize: name.fontSize,
                    lineHeight: 1.08,
                    fontWeight: 600,
                    fontFamily: SANS,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
            <Stat id="depth" value={market.depth} />
            <Stat id="comments" value={market.comments} />
            {forming ? null : <Stat id="hotness" value={market.hotness} />}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: numberW }}>
          <div
            style={{
              display: "flex",
              fontSize: PULSE_SIZE,
              lineHeight: 0.9,
              fontFamily: SANS,
              fontWeight: 600,
              letterSpacing: `${PULSE_TYPE.tracking}em`,
              color: forming ? MUTE : INK,
            }}
          >
            {pulseText}
          </div>
          {forming ? (
            <div style={{ display: "flex", marginTop: 14, fontSize: 24, color: MUTE, fontFamily: SANS }}>
              provisional
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
              {hasWeek ? <AsciiSpark series={market.series} /> : null}
              {delta === null ? null : (
                <div style={{ display: "flex", alignItems: "center", marginLeft: hasWeek ? 20 : 0 }}>
                  {delta === 0 ? null : <Arrow up={delta > 0} color={deltaColor} />}
                  <div
                    style={{
                      display: "flex",
                      marginLeft: delta === 0 ? 0 : 8,
                      fontSize: 32,
                      fontFamily: MONO,
                      fontWeight: 500,
                      color: deltaColor,
                    }}
                  >
                    {String(Math.abs(delta))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 28 }}>
        <Bar long={market.publicLong} short={market.publicShort} muted={forming} />
      </div>
      {forming ? null : (
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <div style={{ display: "flex", ...label, color: LONG }}>{`${market.publicLong} long`}</div>
          <div style={{ display: "flex", ...label, color: SHORT }}>{`${market.publicShort} short`}</div>
        </div>
      )}
    </Shell>
  );
}

const BOOK_ROWS = 6;

// The rows the profile card shows: the first six on each side.
export function bookRows(lines: BookLine[]): { longs: BookLine[]; shorts: BookLine[] } {
  return {
    longs: lines.filter((line) => line.position.direction === "long").slice(0, BOOK_ROWS),
    shorts: lines.filter((line) => line.position.direction === "short").slice(0, BOOK_ROWS),
  };
}

// Favicons for the shown rows, keyed by startup id, fetched together.
export async function bookIcons(lines: BookLine[]): Promise<Record<string, string | null>> {
  const { longs, shorts } = bookRows(lines);
  const shown = [...longs, ...shorts];
  const icons = await Promise.all(shown.map((line) => faviconSrc(line.startup.domain)));
  return Object.fromEntries(shown.map((line, i) => [line.startup.id, icons[i] ?? null]));
}

// Half the content width less the column gap, the conviction figure, and its gap.
const BOOK_NAME_W = CONTENT_W / 2 - 24 - 48 - 12;
const BOOK_TYPE = { tracking: 0, weight: 1 };

function BookRow({ line, icon, color }: { line: BookLine; icon: string | null; color: string }) {
  const name = truncateToWidth(line.startup.name, 24, BOOK_NAME_W - (icon ? 38 : 0), BOOK_TYPE);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Mark src={icon} size={30} />
        <div style={{ display: "flex", fontSize: 24, fontFamily: SANS }}>{name}</div>
      </div>
      <div style={{ display: "flex", fontSize: 24, fontFamily: MONO, color, marginLeft: 12 }}>
        {line.position.conviction}
      </div>
    </div>
  );
}

export function ProfileOg({
  username,
  alpha,
  lines,
  avatar = null,
  rank = null,
  icons = {},
}: {
  username: string;
  alpha: number;
  lines: BookLine[];
  avatar?: string | null;
  // Percentile from alphaRank, shown as "in top N%" for the upper half.
  rank?: number | null;
  // From bookIcons, keyed by startup id.
  icons?: Record<string, string | null>;
}) {
  const { longs, shorts } = bookRows(lines);
  const extra =
    Math.max(0, lines.filter((line) => line.position.direction === "long").length - longs.length) +
    Math.max(0, lines.filter((line) => line.position.direction === "short").length - shorts.length);
  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={24} />
        <div style={{ display: "flex", alignItems: "baseline" }}>
          {rank !== null && rank <= 50 && lines.length > 0 ? (
            <div style={{ display: "flex", marginRight: 14, fontSize: 20, color: MUTE, fontFamily: SANS }}>
              {formatRank(rank)}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontFamily: MONO,
              fontWeight: 500,
              color: alpha > 0 ? LONG : alpha < 0 ? SHORT : MUTE,
            }}
          >
            {formatAlpha(alpha)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 28 }}>
        {avatar ? <Avatar src={avatar} size={56} /> : null}
        <div
          style={{
            display: "flex",
            marginLeft: avatar ? 14 : 0,
            fontSize: 52,
            fontWeight: 600,
            fontFamily: SANS,
            letterSpacing: "-0.03em",
          }}
        >
          {truncateToWidth(username, 52, CONTENT_W - (avatar ? 70 : 0), TITLE_TYPE)}
        </div>
      </div>
      {lines.length === 0 ? (
        <div style={{ display: "flex", marginTop: 36, fontSize: 28, color: MUTE, fontFamily: SANS }}>
          no positions yet
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: 32, width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", width: "50%", paddingRight: 24 }}>
            <div
              style={{
                display: "flex",
                fontSize: 16,
                color: LONG,
                fontFamily: SANS,
                fontWeight: 500,
                marginBottom: 12,
              }}
            >
              long
            </div>
            {longs.length === 0 ? (
              <div style={{ display: "flex", fontSize: 22, color: MUTE, fontFamily: SANS }}>none</div>
            ) : (
              longs.map((line) => (
                <BookRow key={line.position.id} line={line} icon={icons[line.startup.id] ?? null} color={LONG} />
              ))
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: "50%", paddingLeft: 24 }}>
            <div
              style={{
                display: "flex",
                fontSize: 16,
                color: SHORT,
                fontFamily: SANS,
                fontWeight: 500,
                marginBottom: 12,
              }}
            >
              short
            </div>
            {shorts.length === 0 ? (
              <div style={{ display: "flex", fontSize: 22, color: MUTE, fontFamily: SANS }}>none</div>
            ) : (
              shorts.map((line) => (
                <BookRow key={line.position.id} line={line} icon={icons[line.startup.id] ?? null} color={SHORT} />
              ))
            )}
          </div>
        </div>
      )}
      {extra > 0 ? (
        <div style={{ display: "flex", marginTop: 8, fontSize: 20, color: MUTE, fontFamily: SANS }}>
          {`+${extra} more`}
        </div>
      ) : null}
    </Shell>
  );
}

const THESIS_BOX = { width: CONTENT_W, height: 360 };
const THESIS_HEAD = 34;
const HEAD_TYPE = TITLE_TYPE;

// Header widths: avatar, the gaps, the side pill or "on", and the company mark.
function thesisHeadBudget(side: Direction | null): number {
  const link = side
    ? measureText(`[ ${side} ]`, 26, { tracking: 0, weight: 1 }) + 44
    : measureText("on", 30, THESIS_TYPE);
  return CONTENT_W - 14 - link - 14 - 48;
}

// Two names sharing one line: each may take half; a short one lends its slack to the other.
function shareLine(a: string, b: string, fontSize: number, budget: number): [string, string] {
  const aw = measureText(a, fontSize, HEAD_TYPE);
  const bw = measureText(b, fontSize, HEAD_TYPE);
  if (aw + bw <= budget) return [a, b];
  const half = budget / 2;
  const aMax = aw <= half ? aw : bw <= half ? budget - bw : half;
  const bMax = budget - Math.min(aw, aMax);
  return [truncateToWidth(a, fontSize, aMax, HEAD_TYPE), truncateToWidth(b, fontSize, bMax, HEAD_TYPE)];
}

export function ThesisOg({
  startup,
  text,
  username,
  side,
  icon,
  avatar = null,
}: {
  startup: Startup;
  text: string;
  username: string;
  // Accepted for the callers that still pass it; the card no longer prints it.
  pulse?: number;
  side: Direction | null;
  icon: string | null;
  avatar?: string | null;
}) {
  const fit = fitThesis(text, THESIS_BOX);
  const lineHeight = Math.round(fit.fontSize * fit.lineHeight);
  const [who, what] = shareLine(
    username,
    startup.name,
    THESIS_HEAD,
    thesisHeadBudget(side) - (avatar ? 56 : 0) + (icon ? 0 : 48),
  );
  const head = {
    display: "flex",
    whiteSpace: "nowrap",
    fontSize: THESIS_HEAD,
    fontWeight: 600,
    fontFamily: SANS,
    letterSpacing: "-0.03em",
  } as const;
  return (
    <Shell accent={side ?? undefined}>
      <div style={{ display: "flex", alignItems: "center", height: 52 }}>
        {avatar ? <Avatar src={avatar} size={44} /> : null}
        <div style={{ ...head, marginLeft: avatar ? 12 : 0 }}>{who}</div>
        {side ? (
          <div style={{ display: "flex", marginLeft: 14, marginRight: 14 }}>
            <Pill side={side} filled />
          </div>
        ) : (
          <div
            style={{ display: "flex", marginLeft: 14, marginRight: 14, fontSize: 30, color: MUTE, fontFamily: SANS }}
          >
            on
          </div>
        )}
        <Mark src={icon} size={40} />
        <div style={head}>{what}</div>
      </div>
      {/* Lines are pre-wrapped and measured, so the box never grows into the footer. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: THESIS_BOX.height,
          marginTop: 24,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {fit.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              height: lineHeight,
              overflow: "hidden",
              whiteSpace: "nowrap",
              fontSize: fit.fontSize,
              lineHeight: fit.lineHeight,
              fontWeight: 500,
              fontFamily: SANS,
              letterSpacing: `${THESIS_TYPE.tracking}em`,
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </Shell>
  );
}
