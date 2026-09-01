export function asciiSplit(longCount: number, shortCount: number, width: number): { long: string; short: string } {
  const total = longCount + shortCount;
  if (total <= 0) return { long: "", short: ".".repeat(width) };
  const nLong = Math.round((longCount / total) * width);
  return { long: "#".repeat(nLong), short: "#".repeat(width - nLong) };
}
