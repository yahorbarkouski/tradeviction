// Companies: the rows behind /s/[slug]. A company is keyed by the identity
// of its URL (see lib/domain.ts), so one domain is one listing.
import { randomUUID } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { allRows, getRow, run, withTransaction } from "@/lib/db";
import { int, intNull, intish, str, strNull } from "@/lib/db/codec";
import { eraseCommentRows } from "@/lib/db/comments";
import { identityFromUrl } from "@/lib/domain";
import { slugify } from "@/lib/slug";
import { TAG, startupTag } from "@/lib/tags";
import { isSource, type LookupHit, type Source, type Startup } from "@/lib/types";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

function parseStartup(row: Record<string, unknown>): Startup {
  const sourceRaw = str(row, "source");
  if (!isSource(sourceRaw)) throw new Error("bad source");
  return {
    id: str(row, "id"),
    slug: str(row, "slug"),
    name: str(row, "name"),
    url: str(row, "url"),
    domain: str(row, "domain"),
    source: sourceRaw,
    sourceId: strNull(row, "source_id"),
    createdAt: int(row, "created_at"),
    opening: intNull(row, "opening"),
  };
}

const STARTUP_SELECT = `
  SELECT s.id, s.slug, s.name, s.url, s.domain, s.source, s.source_id, s.created_at, s.opening
  FROM startups s
`;

// The line a market opens at, or null for an even start.
export async function setOpening(startupId: string, opening: number | null): Promise<void> {
  if (opening !== null && (!Number.isInteger(opening) || opening < 0 || opening > 100)) {
    throw new Error("An opening line is an integer from 0 to 100.");
  }
  await run("UPDATE startups SET opening = ? WHERE id = ?", [opening, startupId]);
}

export async function getStartupBySlug(slug: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.slug = ?`, [slug]);
  return row ? parseStartup(row) : null;
}

export async function getStartupById(id: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.id = ?`, [id]);
  return row ? parseStartup(row) : null;
}

// Cached copies for rendering. Actions keep using the uncached lookups above.
export async function cachedStartupBySlug(slug: string): Promise<Startup | null> {
  "use cache";
  cacheTag(TAG.startups);
  const startup = await getStartupBySlug(slug);
  if (startup) {
    cacheTag(startupTag(startup.id));
    cacheLife("days");
  } else {
    // The next submit may create this slug.
    cacheLife("minutes");
  }
  return startup;
}

export async function getStartupByDomain(domain: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.domain = ?`, [domain]);
  return row ? parseStartup(row) : null;
}

async function getStartupByUrl(url: string): Promise<Startup | null> {
  const ident = identityFromUrl(url);
  if (ident) {
    const byDomain = await getStartupByDomain(ident.domain);
    if (byDomain) return byDomain;
  }
  const row = await getRow(`${STARTUP_SELECT} WHERE s.url = ?`, [url]);
  return row ? parseStartup(row) : null;
}

async function getStartupBySource(source: Source, sourceId: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.source = ? AND s.source_id = ?`, [source, sourceId]);
  return row ? parseStartup(row) : null;
}

export async function countStartups(): Promise<number> {
  const row = await getRow("SELECT COUNT(*) AS n FROM startups");
  return row ? intish(row, "n") : 0;
}

// Every company, newest first.
export async function listStartups(): Promise<Startup[]> {
  return (await allRows(`${STARTUP_SELECT} ORDER BY s.created_at DESC`)).map(parseStartup);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await getRow("SELECT 1 AS ok FROM startups WHERE slug = ?", [slug])) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

// The description column stays in the table but is always empty: the site
// dropped company one-liners.
export async function insertStartup(input: {
  name: string;
  url: string;
  source: Source;
  sourceId: string | null;
  createdAt: number;
}): Promise<Startup> {
  const ident = identityFromUrl(input.url);
  if (!ident) {
    const existingUrl = await getStartupByUrl(input.url);
    if (existingUrl) return existingUrl;
  } else {
    const existingDomain = await getStartupByDomain(ident.domain);
    if (existingDomain) return existingDomain;
  }
  if (input.sourceId) {
    const existingSource = await getStartupBySource(input.source, input.sourceId);
    if (existingSource) return existingSource;
  }
  const url = ident?.canonicalUrl ?? input.url;
  const domain = ident?.domain ?? url.toLowerCase();
  const existingUrl = await getRow(`${STARTUP_SELECT} WHERE s.url = ?`, [url]);
  if (existingUrl) return parseStartup(existingUrl);
  const id = randomUUID();
  const slug = await uniqueSlug(input.name);
  await run(
    `INSERT INTO startups (id, slug, name, description, url, domain, source, source_id, created_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`,
    [id, slug, input.name, url, domain, input.source, input.sourceId, input.createdAt],
  );
  return {
    id,
    slug,
    name: input.name,
    url,
    domain,
    source: input.source,
    sourceId: input.sourceId,
    createdAt: input.createdAt,
    opening: null,
  };
}

async function eraseStartupRows(startupId: string): Promise<void> {
  const commentIds = (await allRows("SELECT id FROM comments WHERE startup_id = ?", [startupId])).map((row) =>
    str(row, "id"),
  );
  await eraseCommentRows(commentIds);
  await run("DELETE FROM events WHERE startup_id = ?", [startupId]);
  await run("DELETE FROM lots WHERE startup_id = ?", [startupId]);
  await run("DELETE FROM positions WHERE startup_id = ?", [startupId]);
  await run("DELETE FROM startups WHERE id = ?", [startupId]);
}

export async function purgeHnStartups(): Promise<void> {
  await withTransaction(async () => {
    const ids = (await allRows("SELECT id FROM startups WHERE source = 'hn'")).map((row) => str(row, "id"));
    for (const id of ids) await eraseStartupRows(id);
  });
}

export async function updateStartup(input: { id: string; name: string; url: string }): Promise<Startup> {
  const current = await getStartupById(input.id);
  if (!current) throw new AdminError("Startup not found.");
  const ident = identityFromUrl(input.url);
  if (!ident) throw new AdminError("Need a real http(s) URL or domain.");
  const clash = await getStartupByDomain(ident.domain);
  if (clash && clash.id !== input.id) throw new AdminError("That domain is already listed.");
  await run("UPDATE startups SET name = ?, url = ?, domain = ? WHERE id = ?", [
    input.name,
    ident.canonicalUrl,
    ident.domain,
    input.id,
  ]);
  const updated = await getStartupById(input.id);
  if (!updated) throw new AdminError("Startup not found.");
  return updated;
}

export async function deleteStartup(id: string): Promise<void> {
  await withTransaction(async () => {
    await eraseStartupRows(id);
  });
}

export async function getStartupsByIds(ids: string[]): Promise<Map<string, Startup>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await allRows(`${STARTUP_SELECT} WHERE s.id IN (${placeholders})`, ids);
  const map = new Map<string, Startup>();
  for (const row of rows) {
    const startup = parseStartup(row);
    map.set(startup.id, startup);
  }
  return map;
}

function safeLike(term: string): string {
  return `%${term.replace(/[%_\\]/g, "")}%`;
}

export async function lookupStartups(q: string): Promise<LookupHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const ident = identityFromUrl(trimmed);
  const exact = ident ? await getStartupByDomain(ident.domain) : null;
  const needle = ident?.domain ?? trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (needle.replace(/[%_\\]/g, "").length < 2) return [];
  const like = safeLike(needle.toLowerCase());
  const rows = await allRows(
    `${STARTUP_SELECT}
     WHERE s.domain ILIKE ? 
        OR s.name ILIKE ? 
        OR s.url ILIKE ? 
     ORDER BY LOWER(s.name)
     LIMIT 8`,
    [like, like, like],
  );
  const hits: LookupHit[] = [];
  const seen = new Set<string>();
  if (exact) {
    hits.push({
      id: exact.id,
      slug: exact.slug,
      name: exact.name,
      domain: exact.domain,
      url: exact.url,
      exact: true,
    });
    seen.add(exact.id);
  }
  for (const row of rows) {
    const startup = parseStartup(row);
    if (seen.has(startup.id)) continue;
    hits.push({
      id: startup.id,
      slug: startup.slug,
      name: startup.name,
      domain: startup.domain,
      url: startup.url,
      exact: ident?.domain === startup.domain,
    });
    seen.add(startup.id);
  }
  return hits.slice(0, 8);
}
