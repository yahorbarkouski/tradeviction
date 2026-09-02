// What the sign-up and Book forms accept. Shared by the server actions and
// the Client Components that mirror their limits.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Two to twenty characters, starting with a letter: letters, digits, or _.
export function parseUsername(raw: string): string | null {
  const username = raw.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,19}$/.test(username)) return null;
  return username;
}

export const NOTE_MAX = 500;

// Headline casing, the way Hacker News titles end up looking. The first letter
// is uppercased, a shouted take is lowercased first, and a lone trailing
// period goes. Nothing else changes, so tickers and names like iPhone survive.
export function headline(raw: string): string {
  let note = raw.trim().replace(/\s+/g, " ");
  const letters = note.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) note = note.toLowerCase();
  if (/^[^.!?]*\.$/.test(note)) note = note.slice(0, -1).trimEnd();
  return note.charAt(0).toUpperCase() + note.slice(1);
}

export function parseNote(raw: string): string | null {
  const note = headline(raw);
  if (note.length > NOTE_MAX) return null;
  return note;
}
