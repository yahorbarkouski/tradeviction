export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "startup";
}

export function parseUsername(raw: string): string | null {
  const username = raw.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,19}$/.test(username)) return null;
  return username;
}

export function parseNote(raw: string): string | null {
  const note = raw.trim().replace(/\s+/g, " ");
  if (note.length > 500) return null;
  return note;
}
