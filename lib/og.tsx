import type { ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatAlpha, phaseLabel } from "@/lib/format";
import { iconMark, iconSources } from "@/lib/icon";
import { clip, OG_SIZE, OG_TYPE } from "@/lib/share";
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

const FONT_SANS_400 =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-400-normal.ttf";
const FONT_SANS_500 =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-500-normal.ttf";
const FONT_SANS_600 =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-600-normal.ttf";
const FONT_MONO_500 =
  "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-mono@5.2.5/latin-500-normal.ttf";

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

function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", marginRight: Math.round(size * 0.38) }}>
        <Face size={size} />
      </div>
      <div style={{ display: "flex", fontSize: size, fontWeight: 500, fontFamily: SANS, color: INK }}>
        Tradeviction
      </div>
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

function Split({ long, short }: { long: number; short: number }) {
  const total = long + short;
  const longPct = total === 0 ? 0 : Math.round((long / total) * 100);
  const shortPct = total === 0 ? 0 : 100 - longPct;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ display: "flex", width: "100%", height: 14, backgroundColor: LINE }}>
        {total === 0 ? (
          <div style={{ display: "flex", width: "100%", height: 14, backgroundColor: LINE }} />
        ) : (
          <>
            <div
              style={{
                display: "flex",
                width: `${Math.max(longPct, 0)}%`,
                height: 14,
                backgroundColor: LONG,
              }}
            />
            <div
              style={{
                display: "flex",
                width: `${Math.max(shortPct, 0)}%`,
                height: 14,
                backgroundColor: SHORT,
              }}
            />
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 14,
          fontSize: 22,
          fontFamily: MONO,
          fontWeight: 500,
        }}
      >
        {total === 0 ? (
          <div style={{ display: "flex", color: MUTE }}>no book yet</div>
        ) : (
          <>
            <div style={{ display: "flex", color: LONG }}>{`${long} long`}</div>
            <div style={{ display: "flex", color: MUTE, marginLeft: 12, marginRight: 12 }}>·</div>
            <div style={{ display: "flex", color: SHORT }}>{`${short} short`}</div>
          </>
        )}
      </div>
    </div>
  );
}

function Mark({
  name,
  domain,
  src,
  size = 72,
}: {
  name: string;
  domain: string;
  src: string | null;
  size?: number;
}) {
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
      {src ? (
        <img src={src} width={size} height={size} alt="" style={{ objectFit: "contain" }} />
      ) : (
        <div style={{ display: "flex", fontSize: size > 56 ? 28 : 20, fontFamily: MONO, fontWeight: 500 }}>
          {iconMark(name, domain, size)}
        </div>
      )}
    </div>
  );
}

function Shell({
  children,
  accent,
  meta,
}: {
  children: ReactNode;
  accent?: Direction;
  meta?: ReactNode;
}) {
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
        <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>
          tradeviction.com
        </div>
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
          fontSize: 52,
          fontWeight: 500,
          fontFamily: SANS,
          lineHeight: 1.2,
          letterSpacing: "-0.03em",
        }}
      >
        Long or short a startup.
        <div style={{ display: "flex", color: MUTE, marginTop: 8 }}>Put it in a book.</div>
      </div>
    </Shell>
  );
}

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
  return (
    <Shell accent={intent}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={24} />
        <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>
          {phaseLabel(market.phase).toLowerCase()}
        </div>
      </div>
      {intent ? (
        <div style={{ display: "flex", marginTop: 32 }}>
          <Pill side={intent} filled />
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", marginTop: intent ? 24 : 40 }}>
        <Mark name={startup.name} domain={startup.domain} src={icon} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: intent ? 44 : 52,
              fontWeight: 600,
              fontFamily: SANS,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {clip(startup.name, 28)}
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 22, color: MUTE, fontFamily: SANS }}>
            {startup.domain}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 18, color: MUTE, fontFamily: SANS, marginBottom: 4 }}>
            pulse
          </div>
          <div style={{ display: "flex", fontSize: 96, fontFamily: MONO, fontWeight: 500, lineHeight: 0.9 }}>
            {String(market.pulse)}
          </div>
        </div>
        {forming ? (
          <div
            style={{
              display: "flex",
              marginLeft: 36,
              marginBottom: 10,
              fontSize: 24,
              color: MUTE,
              fontFamily: SANS,
            }}
          >
            {`${market.depth} in · still forming`}
          </div>
        ) : null}
      </div>
      {forming ? null : <Split long={market.publicLong} short={market.publicShort} />}
    </Shell>
  );
}

export function ProfileOg({
  username,
  alpha,
  lines,
}: {
  username: string;
  alpha: number;
  lines: BookLine[];
}) {
  const longs = lines.filter((line) => line.position.direction === "long").slice(0, 6);
  const shorts = lines.filter((line) => line.position.direction === "short").slice(0, 6);
  const extra =
    Math.max(0, lines.filter((line) => line.position.direction === "long").length - longs.length) +
    Math.max(0, lines.filter((line) => line.position.direction === "short").length - shorts.length);
  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={24} />
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
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: 52,
          fontWeight: 600,
          fontFamily: SANS,
          letterSpacing: "-0.03em",
        }}
      >
        {clip(username, 24)}
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
                <div
                  key={line.position.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    fontSize: 24,
                    fontFamily: SANS,
                  }}
                >
                  <div style={{ display: "flex" }}>{clip(line.startup.name, 18)}</div>
                  <div style={{ display: "flex", fontFamily: MONO, color: LONG, marginLeft: 12 }}>
                    {line.position.conviction}
                  </div>
                </div>
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
                <div
                  key={line.position.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    fontSize: 24,
                    fontFamily: SANS,
                  }}
                >
                  <div style={{ display: "flex" }}>{clip(line.startup.name, 18)}</div>
                  <div style={{ display: "flex", fontFamily: MONO, color: SHORT, marginLeft: 12 }}>
                    {line.position.conviction}
                  </div>
                </div>
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

function clipThesis(text: string, n: number): string {
  const t = text.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const brk = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  const head = (brk >= n * 0.55 ? cut.slice(0, brk) : cut).trimEnd();
  return `${head}…`;
}

const QUOTE_W = 1072;
const QUOTE_LH = 1.14;
const QUOTE_GLYPH = 0.49;
const QUOTE_SHORT = 76;
const QUOTE_FILL = 64;
const QUOTE_FILL_LINES = 4;

function quoteCap(fontSize: number, lines: number): number {
  return Math.floor((QUOTE_W / (fontSize * QUOTE_GLYPH)) * lines);
}

function fitThesis(text: string): { fontSize: number; shown: string; lines: number } {
  const t = text.trim();
  const two = quoteCap(QUOTE_SHORT, 2);
  if (t.length <= two) return { fontSize: QUOTE_SHORT, shown: t, lines: 2 };
  if (t.length <= quoteCap(QUOTE_FILL, 3)) {
    const fs = Math.min(QUOTE_SHORT, Math.floor(QUOTE_W / ((t.length / 3) * QUOTE_GLYPH)));
    return { fontSize: Math.max(QUOTE_FILL, fs), shown: t, lines: 3 };
  }
  const cap = quoteCap(QUOTE_FILL, QUOTE_FILL_LINES);
  return {
    fontSize: QUOTE_FILL,
    shown: t.length <= cap ? t : clipThesis(t, cap),
    lines: QUOTE_FILL_LINES,
  };
}

export function ThesisOg({
  startup,
  text,
  username,
  pulse,
  side,
  icon,
}: {
  startup: Startup;
  text: string;
  username: string;
  pulse: number;
  side: Direction | null;
  icon: string | null;
}) {
  const thesis = fitThesis(text);
  return (
    <Shell
      accent={side ?? undefined}
      meta={
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 22,
            fontFamily: SANS,
            color: MUTE,
          }}
        >
          <div style={{ display: "flex", color: INK, fontWeight: 500 }}>{username}</div>
          <div style={{ display: "flex", marginLeft: 10, marginRight: 10 }}>·</div>
          <div style={{ display: "flex", fontFamily: MONO, color: INK, fontWeight: 500 }}>
            {`pulse ${pulse}`}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={24} />
        {side ? <Pill side={side} filled /> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 28 }}>
        <Mark name={startup.name} domain={startup.domain} src={icon} size={56} />
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 600,
            fontFamily: SANS,
            letterSpacing: "-0.03em",
          }}
        >
          {clip(startup.name, 28)}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          marginTop: 20,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            fontSize: thesis.fontSize,
            fontWeight: 500,
            fontFamily: SANS,
            lineHeight: QUOTE_LH,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineClamp: thesis.lines,
          }}
        >
          {thesis.shown}
        </div>
      </div>
    </Shell>
  );
}
