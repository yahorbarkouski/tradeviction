import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { cx } from "@/lib/cx";
import { allRows } from "@/lib/db";
import { str } from "@/lib/db/codec";
import { listFeed, listFrontComments, listLeaders } from "@/lib/db/queries";
import { formatAlpha } from "@/lib/format";
import { GALLERY_CASES, GALLERY_GROUPS, GROUP_LABELS, GROUP_ROUTES, type GalleryGroup } from "@/lib/og-gallery";
import { clip, marketAlt, stanceAlt } from "@/lib/share";
import { commentPath } from "@/lib/thread";
import { nowMs } from "@/lib/time";
import { heading, kicker } from "@/lib/ui";

// Review page for every Open Graph card the site emits. Nothing links here;
// production shows it to the admin account only, everyone else gets a 404.

export const metadata: Metadata = {
  title: "og gallery",
  robots: { index: false, follow: false },
};

const SIZES = ["1200", "516", "340"] as const;
const BGS = ["light", "dark"] as const;
const FRAMES = ["plain", "x"] as const;
const SHOWS = ["all", ...GALLERY_GROUPS, "live"] as const;

type View = {
  size: (typeof SIZES)[number];
  bg: (typeof BGS)[number];
  frame: (typeof FRAMES)[number];
  show: (typeof SHOWS)[number];
};

const DEFAULT_VIEW: View = { size: "516", bg: "light", frame: "x", show: "all" };

const SIZE_LABEL: Record<View["size"], string> = {
  "1200": "1200 · actual pixels",
  "516": "516 · x desktop",
  "340": "340 · x phone",
};

// Real card widths, so the pill and domain line keep their fixed size against the image.
const CARD_WIDTH: Record<View["size"], string> = {
  "1200": "w-full",
  "516": "w-[516px] max-w-full",
  "340": "w-[340px] max-w-full",
};

function pick<T extends string>(raw: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const hit = allowed.find((option) => option === value);
  return hit ?? fallback;
}

function href(view: View, patch: Partial<View>): string {
  const next = { ...view, ...patch };
  const query = new URLSearchParams();
  for (const key of ["size", "bg", "frame", "show"] as const) {
    if (next[key] !== DEFAULT_VIEW[key]) query.set(key, next[key]);
  }
  const s = query.toString();
  return s ? `/og/gallery?${s}` : "/og/gallery";
}

export default function GalleryPage({ searchParams }: PageProps<"/og/gallery">) {
  return (
    <Suspense fallback={<p className="text-mute">Rendering cards…</p>}>
      <GalleryBody searchParams={searchParams} />
    </Suspense>
  );
}

async function GalleryBody({ searchParams }: Pick<PageProps<"/og/gallery">, "searchParams">) {
  // Request time only: the cards carry a cache-busting stamp and the live rows read the database.
  await connection();
  const viewer = await getCurrentUser();
  if (process.env.NODE_ENV === "production" && !isAdmin(viewer)) notFound();
  const params = await searchParams;
  const view: View = {
    size: pick(params.size, SIZES, DEFAULT_VIEW.size),
    bg: pick(params.bg, BGS, DEFAULT_VIEW.bg),
    frame: pick(params.frame, FRAMES, DEFAULT_VIEW.frame),
    show: pick(params.show, SHOWS, DEFAULT_VIEW.show),
  };
  // Busts the browser cache on every load, so an edit shows without a hard reload.
  const stamp = nowMs();
  const groups = GALLERY_GROUPS.filter((group) => view.show === "all" || view.show === group);
  const showLive = view.show === "all" || view.show === "live";
  return (
    <>
      <h1 className={heading}>OG gallery</h1>
      <p className="m-0 text-sm text-mute text-pretty">
        Every card the site can emit, rendered live through the real generators at 1200×630. Click a card to open the
        PNG. Not linked from anywhere. The x frame mimics the timeline card: 16px corners, the og:title in a 15px pill at
        the bottom left, the domain line below.
      </p>
      <Controls view={view} />
      {groups.map((group) => (
        <Section key={group} id={group} title={GROUP_LABELS[group]} sub={GROUP_ROUTES[group]} view={view}>
          {GALLERY_CASES.filter((c) => c.group === group).map((c, i) => (
            <Card
              key={c.id}
              src={`/og/gallery/${c.id}?r=${stamp}`}
              label={c.label}
              note={c.note}
              route={c.route}
              title={c.title}
              description={c.description}
              alt={c.alt}
              view={view}
              eager={i < 2}
            />
          ))}
        </Section>
      ))}
      {showLive ? (
        <Suspense fallback={<p className="mt-10 text-mute">Loading live cards…</p>}>
          <Live view={view} stamp={stamp} />
        </Suspense>
      ) : null}
    </>
  );
}

function Controls({ view }: { view: View }) {
  return (
    <div className="mt-4 flex flex-col gap-y-1 text-sm">
      <Row name="width">
        {SIZES.map((size) => (
          <Opt key={size} on={view.size === size} href={href(view, { size })}>
            {SIZE_LABEL[size]}
          </Opt>
        ))}
      </Row>
      <Row name="behind">
        {BGS.map((bg) => (
          <Opt key={bg} on={view.bg === bg} href={href(view, { bg })}>
            {bg}
          </Opt>
        ))}
      </Row>
      <Row name="frame">
        {FRAMES.map((frame) => (
          <Opt key={frame} on={view.frame === frame} href={href(view, { frame })}>
            {frame === "x" ? "x card" : "plain"}
          </Opt>
        ))}
      </Row>
      <Row name="show">
        {SHOWS.map((show) => (
          <Opt key={show} on={view.show === show} href={href(view, { show })}>
            {show === "all" || show === "live" ? show : GROUP_LABELS[show as GalleryGroup].toLowerCase()}
          </Opt>
        ))}
      </Row>
    </div>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="w-14 shrink-0 font-mono text-mute">{name}</span>
      {children}
    </div>
  );
}

function Opt({ on, href: to, children }: { on: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={to} prefetch={false} className={cx("inline-flex min-h-8 items-center", on ? "text-ink underline" : "text-mute")}>
      {children}
    </Link>
  );
}

function Section({
  id,
  title,
  sub,
  view,
  children,
}: {
  id: string;
  title: string;
  sub: string;
  view: View;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10">
      <h2 className={cx(kicker, "m-0")}>{title}</h2>
      <p className="m-0 mb-3 font-mono text-sm text-mute">{sub}</p>
      {/* Breaks out of the 56rem column so the 1200 view shows real pixels. */}
      <div
        className={cx(
          "relative left-1/2 w-[min(1200px,100vw-2rem)] -translate-x-1/2",
          view.bg === "dark" && "bg-black p-4 sm:p-6",
        )}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-8">{children}</div>
      </div>
    </section>
  );
}

function Card({
  src,
  label,
  note,
  route,
  title,
  description,
  alt,
  view,
  eager,
}: {
  src: string;
  label: string;
  note: string;
  route: string;
  title: string;
  description?: string;
  alt?: string;
  view: View;
  eager: boolean;
}) {
  const dark = view.bg === "dark";
  const x = view.frame === "x";
  return (
    <figure className={cx("m-0 min-w-0", CARD_WIDTH[view.size])}>
      <a href={src} target="_blank" className="block hover:no-underline">
        <div
          className={cx(
            "relative overflow-hidden",
            x && "rounded-2xl border",
            x && (dark ? "border-[#2f3336]" : "border-[#cfd9de]"),
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? label}
            width={1200}
            height={630}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="block h-auto w-full"
          />
          {x ? (
            <span className="absolute bottom-3 left-3 max-w-[calc(100%-24px)] truncate rounded-[4px] bg-[rgba(0,0,0,0.77)] px-2 py-1 font-sans text-[15px] leading-5 text-white">
              {title}
            </span>
          ) : null}
        </div>
        {x ? (
          <span className={cx("mt-1 block font-sans text-[15px] leading-5", dark ? "text-[#71767b]" : "text-[#536471]")}>
            From tradeviction.com
          </span>
        ) : null}
      </a>
      <figcaption className={cx("mt-1.5 text-sm", dark ? "text-white/60" : "text-mute")}>
        <div>
          <span className={dark ? "text-white" : "text-ink"}>{label}</span> · {note}
        </div>
        <div className="mt-0.5 font-mono text-[12px] leading-[1.45] break-words">
          <div>{route}</div>
          <div>title · {title}</div>
          {description ? <div>description · {description}</div> : null}
          {alt ? <div>alt · {alt}</div> : null}
        </div>
      </figcaption>
    </figure>
  );
}

async function Live({ view, stamp }: { view: View; stamp: number }) {
  await connection();
  const now = nowMs();
  const [feed, leaders, front, partyRows] = await Promise.all([
    listFeed("hot", 1, now),
    listLeaders(now, 3),
    listFrontComments(null, 1, false, now),
    allRows("SELECT slug, name, invite_code FROM parties ORDER BY created_at DESC LIMIT 3"),
  ]);
  const startups = feed.items.slice(0, 3);
  const lead = startups[0];
  const users = leaders.alpha.slice(0, 3);
  const comments = front.items.slice(0, 4);
  const parties = partyRows.map((row) => ({ slug: str(row, "slug"), name: str(row, "name"), code: str(row, "invite_code") }));
  const firstParty = parties[0];
  const empty = startups.length === 0 && users.length === 0 && comments.length === 0 && parties.length === 0;
  return (
    <Section id="live" title="Live" sub="the real routes on this database, fetched fresh" view={view}>
      {empty ? <p className="m-0 text-mute">Nothing in the database yet.</p> : null}
      {startups.map((item, i) => (
        <Card
          key={item.id}
          src={`/s/${item.slug}/opengraph-image?r=${stamp}`}
          label={item.name}
          note={`live market · ${item.market.phase}`}
          route={`/s/${item.slug}`}
          title={`${item.name} | Tradeviction`}
          description={marketAlt(item, item.market.pulse, item.market.forming)}
          alt="Tradeviction market"
          view={view}
          eager={i === 0}
        />
      ))}
      {lead
        ? (["long", "short"] as const).map((side) => (
            <Card
              key={side}
              src={`/s/${lead.slug}/${side}/opengraph-image?r=${stamp}`}
              label={`${side} ${lead.name}`}
              note="live intent"
              route={`/s/${lead.slug}/${side}`}
              title={`${side} ${lead.name} | Tradeviction`}
              description={stanceAlt(side, lead, lead.market.pulse)}
              alt="Tradeviction"
              view={view}
              eager={false}
            />
          ))
        : null}
      {users.map((user) => (
        <Card
          key={user.userId}
          src={`/u/${user.username}/opengraph-image?r=${stamp}`}
          label={user.username}
          note={`live book · alpha ${formatAlpha(user.alpha)}`}
          route={`/u/${user.username}`}
          title={`${user.username} | Tradeviction`}
          alt="Tradeviction book"
          view={view}
          eager={false}
        />
      ))}
      {parties.map((party) => (
        <Card
          key={party.slug}
          src={`/p/${party.slug}/opengraph-image?r=${stamp}`}
          label={party.name}
          note="live party"
          route={`/p/${party.slug}`}
          title={`${party.name} | Tradeviction`}
          alt="Tradeviction party"
          view={view}
          eager={false}
        />
      ))}
      {firstParty ? (
        <Card
          src={`/join/${firstParty.code}/opengraph-image?r=${stamp}`}
          label={`join ${firstParty.name}`}
          note="live invite, same card as the party"
          route="/join/[code]"
          title={`${firstParty.name} | Tradeviction`}
          alt="Join a Tradeviction party"
          view={view}
          eager={false}
        />
      ) : null}
      {comments.map((c) => (
        <Card
          key={c.id}
          src={`/og/thesis/${c.id}?r=${stamp}`}
          label={c.username}
          note={`live thesis · ${c.position ? `${c.position.direction} ${c.startupName}` : `on ${c.startupName}`}`}
          route={commentPath(c.startupSlug, c.id)}
          title={`${clip(c.text, 70)} | Tradeviction`}
          view={view}
          eager={false}
        />
      ))}
    </Section>
  );
}
