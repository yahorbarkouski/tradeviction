export function slugify(name: string, fallback = "startup"): string {
  const slug = name
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function parseUsername(raw: string): string | null {
  const username = raw.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,19}$/.test(username)) return null;
  return username;
}

export const NOTE_MAX = 500;

export function parseNote(raw: string): string | null {
  const note = raw.trim().replace(/\s+/g, " ");
  if (note.length > NOTE_MAX) return null;
  return note;
}
