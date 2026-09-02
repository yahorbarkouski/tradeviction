// Text measuring and fitting for the cards.
//
// satori wraps text between Intl.Segmenter word pieces and measures each piece
// with the font's advance widths. This module does the same before the render,
// using the advance widths of the Inter 500 file the cards ship (read once from
// the font with fontTools), so a card can pick the largest size whose lines fit
// a box and then render each line itself. Widths outside ASCII are estimates
// that err wide: a line may end a little early, it never spills.

const ASCII_FIRST = 32;

// Advance widths in em for code points 32..126.
const INTER_500 = [
  0.267, 0.304, 0.494, 0.639, 0.646, 0.993, 0.653, 0.313, 0.369, 0.369, 0.521, 0.667, 0.303, 0.462, 0.303, 0.37, 0.646,
  0.415, 0.616, 0.627, 0.656, 0.603, 0.63, 0.571, 0.629, 0.63, 0.303, 0.315, 0.667, 0.667, 0.667, 0.527, 0.982, 0.709,
  0.657, 0.733, 0.722, 0.603, 0.589, 0.748, 0.745, 0.272, 0.575, 0.688, 0.565, 0.913, 0.756, 0.767, 0.642, 0.769, 0.648,
  0.646, 0.653, 0.74, 0.709, 1.003, 0.701, 0.696, 0.641, 0.369, 0.37, 0.369, 0.477, 0.463, 0.337, 0.568, 0.618, 0.577,
  0.618, 0.587, 0.379, 0.62, 0.602, 0.252, 0.252, 0.559, 0.252, 0.888, 0.602, 0.604, 0.618, 0.618, 0.387, 0.539, 0.34,
  0.602, 0.575, 0.829, 0.557, 0.575, 0.559, 0.44, 0.346, 0.44, 0.667,
] as const;

const EXTRA: Record<string, number> = {
  "…": 0.91,
  "·": 0.303,
  "“": 0.474,
  "”": 0.471,
  "‘": 0.277,
  "’": 0.277,
  "–": 0.5,
  "—": 1.0,
  "€": 0.672,
  "£": 0.62,
  "§": 0.568,
  "°": 0.457,
  "×": 0.667,
  "÷": 0.667,
  "«": 0.608,
  "»": 0.608,
  "¿": 0.527,
  "¡": 0.304,
};

// Scripts satori draws with a fetched fallback font, and emoji, which it draws
// as images about a square each.
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const COMBINING = /\p{M}/u;
const UNKNOWN_EM = 0.62;
const EMOJI_EM = 1.3;
const CJK_EM = 1;

// Inter 600 runs a little wider than the 500 the table describes.
export const SEMIBOLD = 1.035;

const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
const words = new Intl.Segmenter("und", { granularity: "word" });

function codePointWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= ASCII_FIRST && cp < ASCII_FIRST + INTER_500.length) {
    return INTER_500[cp - ASCII_FIRST] ?? UNKNOWN_EM;
  }
  const extra = EXTRA[ch];
  if (extra !== undefined) return extra;
  if (COMBINING.test(ch)) return 0;
  if (CJK.test(ch)) return CJK_EM;
  // Accented Latin measures as its base letter.
  const base = Array.from(ch.normalize("NFD"))[0];
  if (base !== undefined && base !== ch) return codePointWidth(base);
  return UNKNOWN_EM;
}

function graphemeWidth(grapheme: string): number {
  if (PICTOGRAPH.test(grapheme)) return EMOJI_EM;
  let em = 0;
  for (const ch of grapheme) em += codePointWidth(ch);
  return em;
}

export type Type = {
  // Letter spacing in em, negative for tight display text.
  tracking: number;
  // Width factor for weights other than 500.
  weight: number;
};

export const THESIS_TYPE: Type = { tracking: -0.02, weight: 1 };
export const TITLE_TYPE: Type = { tracking: -0.03, weight: SEMIBOLD };

// Width of a run of text in pixels at a size.
export function measureText(text: string, fontSize: number, type: Type = THESIS_TYPE): number {
  let em = 0;
  let count = 0;
  for (const { segment } of graphemes.segment(text)) {
    em += graphemeWidth(segment);
    count += 1;
  }
  return (em * type.weight + count * type.tracking) * fontSize;
}

function pieces(text: string): string[] {
  return Array.from(words.segment(text), (part) => part.segment);
}

function wrapParagraph(paragraph: string, fontSize: number, maxWidth: number, type: Type): string[] {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  const flush = () => {
    lines.push(line.trimEnd());
    line = "";
    width = 0;
  };
  for (const piece of pieces(paragraph)) {
    const blank = piece.trim() === "";
    if (blank && line === "") continue;
    const w = measureText(piece, fontSize, type);
    if (width + w <= maxWidth) {
      line += piece;
      width += w;
      continue;
    }
    if (blank) {
      flush();
      continue;
    }
    if (line !== "") flush();
    if (w <= maxWidth) {
      line = piece;
      width = w;
      continue;
    }
    // One piece wider than the line, an unbroken token: break it by grapheme.
    for (const { segment } of graphemes.segment(piece)) {
      const gw = measureText(segment, fontSize, type);
      if (line !== "" && width + gw > maxWidth) flush();
      line += segment;
      width += gw;
    }
  }
  if (line !== "") flush();
  return lines;
}

// Paragraph breaks are kept as line breaks; blank lines and runs of spaces collapse.
export function wrapText(text: string, fontSize: number, maxWidth: number, type: Type = THESIS_TYPE): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p !== "");
  const lines = paragraphs.flatMap((p) => wrapParagraph(p, fontSize, maxWidth, type));
  return lines.length > 0 ? lines : [""];
}

const ELLIPSIS = "…";
const TRAILING = /[\s\p{P}]+$/u;
const MIN_KEPT = 4;

function dropGraphemes(text: string, fontSize: number, maxWidth: number, type: Type): string {
  let kept = Array.from(graphemes.segment(text), (g) => g.segment);
  for (;;) {
    const candidate = kept.join("").replace(TRAILING, "") + ELLIPSIS;
    if (kept.length === 0 || measureText(candidate, fontSize, type) <= maxWidth) return candidate;
    kept = kept.slice(0, -1);
  }
}

// Shortens a line to a width with an ellipsis, cutting at a word boundary when
// that keeps something readable and inside the word otherwise.
export function truncateToWidth(text: string, fontSize: number, maxWidth: number, type: Type = THESIS_TYPE): string {
  if (measureText(text, fontSize, type) <= maxWidth) return text;
  let parts = pieces(text);
  for (;;) {
    const head = parts.join("").replace(TRAILING, "");
    const candidate = head + ELLIPSIS;
    if (measureText(candidate, fontSize, type) <= maxWidth) {
      return head.length >= MIN_KEPT ? candidate : dropGraphemes(text, fontSize, maxWidth, type);
    }
    parts = parts.slice(0, -1);
  }
}

// Display sizes sit tight; body sizes open up a little.
export function lineHeightFor(fontSize: number): number {
  return fontSize >= 50 ? 1.14 : 1.22;
}

export type ThesisFit = {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  clipped: boolean;
};

export type ThesisScale = {
  // Sizes to try, largest first. The first one is the hero size, kept for
  // takes that fit in heroLines.
  sizes: readonly number[];
  heroLines: number;
};

export const THESIS_SCALE: ThesisScale = { sizes: [56, 50, 46, 42, 38], heroLines: 2 };

// Estimates for fallback glyphs can run narrow, so measure against a slightly smaller box.
const WIDTH_SAFETY = 0.985;

export function fitThesis(
  text: string,
  box: { width: number; height: number },
  scale: ThesisScale = THESIS_SCALE,
): ThesisFit {
  const width = box.width * WIDTH_SAFETY;
  const hero = scale.sizes[0];
  for (const size of scale.sizes) {
    const lines = wrapText(text, size, width);
    const lineHeight = lineHeightFor(size);
    if (size === hero && lines.length > scale.heroLines) continue;
    if (lines.length * size * lineHeight <= box.height) {
      return { fontSize: size, lineHeight, lines, clipped: false };
    }
  }
  const size = scale.sizes[scale.sizes.length - 1] ?? 38;
  const lineHeight = lineHeightFor(size);
  const maxLines = Math.max(1, Math.floor(box.height / (size * lineHeight)));
  const lines = wrapText(text, size, width).slice(0, maxLines);
  const lastIndex = lines.length - 1;
  lines[lastIndex] = truncateToWidth(`${lines[lastIndex] ?? ""}${ELLIPSIS}`, size, width);
  if (!lines[lastIndex]?.endsWith(ELLIPSIS)) lines[lastIndex] = `${lines[lastIndex] ?? ""}${ELLIPSIS}`;
  return { fontSize: size, lineHeight, lines, clipped: true };
}

// A short block such as a name: the largest size whose wrap fits in maxLines,
// else the smallest size cut to maxLines with an ellipsis.
export function fitBlock(
  text: string,
  maxWidth: number,
  sizes: readonly number[],
  maxLines: number,
  type: Type = TITLE_TYPE,
): { fontSize: number; lines: string[]; fits: boolean } {
  const smallest = sizes[sizes.length - 1] ?? 16;
  for (const size of sizes) {
    const lines = wrapText(text, size, maxWidth, type);
    if (lines.length <= maxLines) return { fontSize: size, lines, fits: true };
  }
  const lines = wrapText(text, smallest, maxWidth, type);
  const head = lines.slice(0, maxLines - 1);
  const rest = lines.slice(maxLines - 1).join(" ");
  return { fontSize: smallest, lines: [...head, truncateToWidth(rest, smallest, maxWidth, type)], fits: false };
}
