import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(join(process.cwd(), "data/longorshort.db"));
db.exec("PRAGMA foreign_keys = ON");

const hasLots = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lots'").get();
if (!hasLots) {
  console.error("Market schema is missing. Start the app once, then seed.");
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(join(process.cwd(), "data/catalog.json"), "utf8"));
const PRIOR = 2;
const DAY = 86_400_000;

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "startup";
}

function domainOf(url) {
  return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
}

function pulseP(longCount, shortCount) {
  return (PRIOR + longCount) / (PRIOR * 2 + longCount + shortCount);
}

function pulseDisplay(p) {
  return Math.round(p * 100);
}

function user(username) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    username,
    hashPassword("testpass1"),
    Date.now() - 400 * DAY,
  );
  return id;
}

function ensureStartup(name, url, description, createdAt) {
  const domain = domainOf(url);
  const existing = db.prepare("SELECT id FROM startups WHERE domain = ?").get(domain);
  if (existing) {
    db.prepare("UPDATE startups SET created_at = ? WHERE id = ? AND created_at > ?").run(
      createdAt,
      existing.id,
      createdAt,
    );
    return existing.id;
  }
  const id = randomUUID();
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT 1 AS ok FROM startups WHERE slug = ?").get(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  db.prepare(
    `INSERT INTO startups (id, slug, name, description, url, domain, source, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', NULL, ?)`,
  ).run(id, slug, name, description, `https://${domain}`, domain, createdAt);
  return id;
}

function publicMark(startupId, at, excludeUserId) {
  const rows = db
    .prepare(
      `SELECT direction, user_id FROM lots
       WHERE startup_id = ? AND opened_at <= ? AND (closed_at IS NULL OR closed_at > ?)`,
    )
    .all(startupId, at, at);
  let longCount = 0;
  let shortCount = 0;
  const seen = new Set();
  for (const row of rows) {
    if (excludeUserId && row.user_id === excludeUserId) continue;
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    if (row.direction === "long") longCount += 1;
    else shortCount += 1;
  }
  const p = pulseP(longCount, shortCount);
  return { p, pulse: pulseDisplay(p), depth: longCount + shortCount };
}

function openPos(startupId, userId, direction, conviction, note, at) {
  const existing = db
    .prepare("SELECT id FROM positions WHERE startup_id = ? AND user_id = ? AND closed_at IS NULL")
    .get(startupId, userId);
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO positions
      (id, user_id, startup_id, direction, conviction, note, opened_at, updated_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(id, userId, startupId, direction, conviction, note, at, at);
  const mark = publicMark(startupId, at);
  const loo = publicMark(startupId, at, userId);
  if (conviction > 0) {
    db.prepare(
      `INSERT INTO lots
        (id, user_id, startup_id, position_id, direction, conviction, entry_p, entry_pulse, entry_depth, opened_at, closed_at, realized_alpha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(randomUUID(), userId, startupId, id, direction, conviction, loo.p, loo.pulse, mark.depth, at);
  }
  db.prepare(
    `INSERT INTO comments (id, startup_id, user_id, parent_id, position_id, text, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
  ).run(randomUUID(), startupId, userId, id, note, at);
  db.prepare(
    `INSERT INTO events (id, user_id, startup_id, kind, direction, conviction, pulse, depth, note, created_at)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, startupId, direction, conviction, mark.pulse, mark.depth, note, at);
  return id;
}

function closePos(startupId, userId, at) {
  const pos = db
    .prepare("SELECT * FROM positions WHERE startup_id = ? AND user_id = ? AND closed_at IS NULL")
    .get(startupId, userId);
  if (!pos) return;
  const mark = publicMark(startupId, at);
  const lots = db.prepare("SELECT * FROM lots WHERE position_id = ? AND closed_at IS NULL").all(pos.id);
  for (const lot of lots) {
    db.prepare("UPDATE lots SET closed_at = ?, realized_alpha = 0 WHERE id = ?").run(at, lot.id);
  }
  db.prepare("UPDATE positions SET closed_at = ?, updated_at = ? WHERE id = ?").run(at, at, pos.id);
  db.prepare(
    `INSERT INTO events (id, user_id, startup_id, kind, direction, conviction, pulse, depth, note, created_at)
     VALUES (?, ?, ?, 'close', ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, startupId, pos.direction, pos.conviction, mark.pulse, mark.depth, pos.note, at);
}

function vote(commentUserId, voterId, startupId) {
  const comment = db
    .prepare(
      "SELECT id FROM comments WHERE user_id = ? AND startup_id = ? AND parent_id IS NULL ORDER BY created_at LIMIT 1",
    )
    .get(commentUserId, startupId);
  if (!comment) return;
  db.prepare("INSERT OR IGNORE INTO comment_votes (comment_id, user_id, created_at) VALUES (?, ?, ?)").run(
    comment.id,
    voterId,
    Date.now() - DAY,
  );
}

db.exec("BEGIN IMMEDIATE");
try {
  const startupCols = db.prepare("PRAGMA table_info(startups)").all();
  if (startupCols.some((col) => col.name === "founder_id")) {
    db.exec("UPDATE startups SET founder_id = NULL");
  }
  db.exec("DROP TABLE IF EXISTS startup_updates");
  db.exec(`
    DELETE FROM comment_votes;
    DELETE FROM comments;
    DELETE FROM events;
    DELETE FROM lots;
    DELETE FROM moves;
    DELETE FROM positions;
    DELETE FROM users;
  `);

  const now = Date.now();
  for (let i = 0; i < catalog.length; i += 1) {
    const row = catalog[i];
    ensureStartup(row.name, row.url, row.description, now - i * 3_600_000);
  }

  ensureStartup(
    "TinyUnknownCo",
    "https://tinyunknown.dev",
    "A weird distribution loop nobody has a name for yet",
    now - 111 * DAY,
  );
  ensureStartup(
    "Interfere",
    "https://interfere.dev",
    "Design-led ops software that still has to find the economic buyer",
    now - 180 * DAY,
  );
  ensureStartup(
    "NimbusPath",
    "https://nimbuspath.dev",
    "Infra for teams that are still one messy repo away from a product",
    now - 80 * DAY,
  );

  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run("purged_hn", "1");
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

function idFor(slug) {
  return db.prepare("SELECT id FROM startups WHERE slug = ?").get(slug)?.id ?? null;
}

const alice = user("alice");
const bob = user("pgfan93");
const carol = user("anonvc");
const crowd = [];
for (let i = 1; i <= 220; i += 1) crowd.push(user(`n${i}`));

const openai = idFor("openai");
const anthropic = idFor("anthropic");
const perplexity = idFor("perplexity");
const cursor = idFor("cursor");
const cognition = idFor("cognition");
const granola = idFor("granola");
const clay = idFor("clay");
const stripe = idFor("stripe");
const linear = idFor("linear");
const figma = idFor("figma");
const ssi = idFor("ssi");
const tiny = idFor("tinyunknownco");
const interfere = idFor("interfere");
const nimbus = idFor("nimbuspath");
const now = Date.now();

if (!openai || !cursor || !tiny || !interfere || !stripe || !linear || !figma) {
  console.error("Need openai, cursor, tinyunknownco, interfere, stripe, linear, figma.");
  process.exit(1);
}

db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 90 * DAY, openai);
if (ssi) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 60 * DAY, ssi);
if (interfere) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 180 * DAY, interfere);
if (granola) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 60 * DAY, granola);
if (cursor) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 50 * DAY, cursor);
if (cognition) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 55 * DAY, cognition);
if (clay) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 30 * DAY, clay);
if (anthropic) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 40 * DAY, anthropic);
if (perplexity) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 25 * DAY, perplexity);
if (stripe) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 260 * DAY, stripe);
if (linear) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 260 * DAY, linear);
if (figma) db.prepare("UPDATE startups SET created_at = ? WHERE id = ?").run(now - 260 * DAY, figma);

const notes = {
  tinyAlice: "Founder has found a very weird distribution loop nobody seems to understand yet.",
  openaiAlice: "I like OpenAI. The brand is the company, and the API sits under too much of the stack to unwind.",
  interfereAlice: "I think the design-led approach misses the economic buyer. Strong product, wrong motion.",
  cursorBob: "Cursor is a feature. GitHub Copilot and a dozen forks eat the same workflow by Christmas.",
  cursorCarol: "Great product, no moat. The IDE is a skin on an API bill.",
  cursorAlice: "They already have the tab-complete muscle memory. Switching cost is the model of the codebase.",
  genericLong: "This still looks like an independent company with a real buyer.",
  genericShort: "This gets absorbed or copied before it becomes a standalone outcome.",
};

const everyone = [alice, bob, carol, ...crowd];

db.exec("BEGIN IMMEDIATE");
try {
  for (const id of everyone) {
    openPos(stripe, id, "long", 0, notes.genericLong, now - 250 * DAY);
    openPos(linear, id, "long", 0, notes.genericLong, now - 249 * DAY);
    openPos(figma, id, "long", 0, notes.genericLong, now - 248 * DAY);
  }
  for (const id of [alice, bob, carol]) {
    closePos(stripe, id, now - 247 * DAY);
    closePos(linear, id, now - 247 * DAY);
    closePos(figma, id, now - 247 * DAY);
  }

  openPos(tiny, alice, "long", 20, notes.tinyAlice, now - 110 * DAY);
    openPos(tiny, bob, "long", 1, notes.genericLong, now - 109 * DAY);
    openPos(tiny, carol, "long", 1, "Small, but the loop is real if they can keep it.", now - 108 * DAY);

  for (let i = 0; i < 18; i += 1) {
    openPos(tiny, crowd[i], "long", 1, notes.genericLong, now - 14 * DAY - i * 60_000);
  }
  for (let i = 18; i < 20; i += 1) {
    openPos(tiny, crowd[i], "short", 1, notes.genericShort, now - 14 * DAY - i * 60_000);
  }
  for (let i = 20; i < 55; i += 1) {
    const ago = 13 * DAY - ((i - 20) * DAY) / 7;
    openPos(tiny, crowd[i], "long", 1, notes.genericLong, now - ago);
  }

  if (nimbus) {
    openPos(nimbus, bob, "long", 1, notes.genericLong, now - 79 * DAY);
    openPos(nimbus, carol, "long", 1, notes.genericLong, now - 78 * DAY);
    for (let i = 160; i < 180; i += 1) {
      openPos(nimbus, crowd[i], "long", 1, notes.genericLong, now - 55 * 3_600_000 - (i - 160) * 60_000);
    }
    for (let i = 180; i < 195; i += 1) {
      openPos(nimbus, crowd[i], "long", 1, notes.genericLong, now - 20 * 3_600_000 - (i - 180) * 60_000);
    }
  }

  for (let i = 0; i < 25; i += 1) {
    openPos(openai, crowd[i], "long", 1, notes.genericLong, now - 90 * DAY - i * 120_000);
  }
  openPos(openai, alice, "long", 15, notes.openaiAlice, now - 20 * DAY);
  openPos(openai, bob, "long", 5, "They have the brand and the contracts everyone else is still chasing.", now - 18 * DAY);
  for (let i = 25; i < 40; i += 1) {
    openPos(openai, crowd[i], "long", 1, notes.genericLong, now - 19 * DAY - i * 3_600_000);
  }

  for (let i = 0; i < 70; i += 1) {
    openPos(interfere, crowd[i], "long", 1, notes.genericLong, now - 180 * DAY - i * 3_600_000);
  }
  for (let i = 70; i < 78; i += 1) {
    openPos(interfere, crowd[i], "short", 1, notes.genericShort, now - 100 * DAY);
  }
  openPos(interfere, alice, "short", 25, notes.interfereAlice, now - 90 * DAY);
  for (let i = 0; i < 35; i += 1) {
    closePos(interfere, crowd[i], now - 6 * DAY + i * 1000);
  }
  for (let i = 78; i < 120; i += 1) {
    openPos(interfere, crowd[i], "short", 1, notes.genericShort, now - 5 * DAY - i * 400_000);
  }
  for (let i = 35; i < 55; i += 1) {
    closePos(interfere, crowd[i], now - 2 * DAY + i * 1000);
  }
  for (let i = 120; i < 150; i += 1) {
    openPos(interfere, crowd[i], "short", 1, notes.genericShort, now - DAY - i * 200_000);
  }

  for (let i = 0; i < 35; i += 1) {
    openPos(cursor, crowd[i], "long", 1, notes.genericLong, now - 40 * DAY);
  }
  for (let i = 35; i < 47; i += 1) {
    openPos(cursor, crowd[i], "short", 1, notes.genericShort, now - 30 * DAY);
  }
  openPos(cursor, alice, "long", 10, notes.cursorAlice, now - 14 * DAY);
  openPos(cursor, bob, "short", 25, notes.cursorBob, now - 12 * DAY);
  openPos(cursor, carol, "short", 20, notes.cursorCarol, now - 11 * DAY);

  if (granola) {
    for (let i = 0; i < 25; i += 1) {
      openPos(granola, crowd[i + 100], "long", 1, notes.genericLong, now - 60 * DAY - i * 60_000);
    }
    openPos(granola, alice, "long", 20, "Meeting notes that stay out of the way is a habit, not a feature.", now - 45 * DAY);
    for (let i = 0; i < 40; i += 1) {
      openPos(granola, crowd[i + 10], "long", 1, notes.genericLong, now - 8 * DAY);
    }
    for (let i = 0; i < 8; i += 1) {
      openPos(granola, crowd[i + 60], "short", 1, notes.genericShort, now - 7 * DAY);
    }
  }

  if (clay) {
    openPos(clay, carol, "long", 8, "The account graph is the product. Outbound is just the first surface.", now - 21 * DAY);
    for (let i = 0; i < 18; i += 1) {
      openPos(clay, crowd[i + 80], "long", 1, notes.genericLong, now - 9 * DAY);
    }
  }

  if (cognition) {
    for (let i = 0; i < 22; i += 1) {
      openPos(cognition, crowd[i + 30], "long", 1, notes.genericLong, now - 50 * DAY);
    }
    openPos(cognition, alice, "short", 10, "Devin is a demo loop. The buyer still wants a person on the hook.", now - 25 * DAY);
    openPos(cognition, bob, "short", 10, "The software agent pitch still needs a human on the ticket.", now - 24 * DAY);
    for (let i = 0; i < 14; i += 1) {
      openPos(cognition, crowd[i + 90], "short", 1, notes.genericShort, now - 4 * DAY);
    }
  }

  if (anthropic) {
    openPos(anthropic, alice, "long", 1, "Claude is what serious buyers actually deploy. Boring, expensive, sticky.", now - 30 * DAY);
    for (let i = 0; i < 28; i += 1) {
      openPos(anthropic, crowd[i + 40], "long", 1, notes.genericLong, now - 22 * DAY);
    }
  }

  if (perplexity) {
    openPos(perplexity, bob, "short", 8, "A wrapper on other people's models with a chrome theme. Distribution is rented from SEO.", now - 16 * DAY);
    openPos(perplexity, carol, "long", 5, "The answer-engine frame is right even if the model is not theirs.", now - 9 * DAY);
  }

  vote(alice, bob, tiny);
  vote(alice, carol, tiny);
  vote(alice, crowd[0], tiny);
  vote(alice, bob, interfere);
  vote(bob, carol, cursor);

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log("Seeded alice, pgfan93, anonvc (password: testpass1).");
