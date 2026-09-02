// URL slugs for companies and parties: lowercase ASCII words joined by dashes.
export function slugify(name: string, fallback = "startup"): string {
  const slug = name
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}
