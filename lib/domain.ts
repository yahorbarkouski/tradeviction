const MULTI_TLD = new Set([
  "ac.uk",
  "co.uk",
  "gov.uk",
  "ltd.uk",
  "me.uk",
  "org.uk",
  "com.au",
  "edu.au",
  "gov.au",
  "net.au",
  "org.au",
  "co.nz",
  "net.nz",
  "org.nz",
  "ac.jp",
  "co.jp",
  "go.jp",
  "ne.jp",
  "or.jp",
  "ac.kr",
  "co.kr",
  "go.kr",
  "ne.kr",
  "or.kr",
  "co.in",
  "firm.in",
  "gen.in",
  "ind.in",
  "net.in",
  "org.in",
  "com.br",
  "net.br",
  "org.br",
  "com.mx",
  "org.mx",
  "co.za",
  "org.za",
  "web.za",
  "com.sg",
  "com.hk",
  "com.tw",
  "com.tr",
  "com.ar",
  "com.cn",
  "co.id",
  "co.il",
  "co.th",
  "com.pl",
  "com.ua",
]);

const PLATFORM_SUFFIX = [
  "vercel.app",
  "netlify.app",
  "github.io",
  "gitlab.io",
  "pages.dev",
  "workers.dev",
  "herokuapp.com",
  "fly.dev",
  "railway.app",
  "onrender.com",
  "web.app",
  "firebaseapp.com",
  "azurewebsites.net",
  "blogspot.com",
  "wordpress.com",
  "tumblr.com",
  "itch.io",
  "glitch.me",
  "replit.app",
  "replit.dev",
  "substack.com",
  "framer.app",
  "webflow.io",
  "notion.site",
  "lovable.app",
  "carrd.co",
];

const CODE_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
  "huggingface.co",
]);

const CODE_SKIP = new Set([
  "about",
  "blog",
  "codespaces",
  "customer-stories",
  "explore",
  "features",
  "git-guides",
  "issues",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "pricing",
  "pulls",
  "readme",
  "settings",
  "signup",
  "sponsors",
  "topics",
]);

export type SiteIdentity = {
  domain: string;
  canonicalUrl: string;
};

function stripWww(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

function isIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function registrableDomain(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return host;
  const last2 = labels.slice(-2).join(".");
  if (MULTI_TLD.has(last2)) return labels.slice(-3).join(".");
  return last2;
}

function isPlatformHost(host: string): boolean {
  return PLATFORM_SUFFIX.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function pathParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

export function parseUrlish(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

export function identityFromUrl(raw: string): SiteIdentity | null {
  const url = parseUrlish(raw);
  if (!url) return null;
  const host = stripWww(url.hostname);
  if (!host) return null;
  if (isIp(host)) {
    return { domain: host, canonicalUrl: `${url.protocol}//${host}` };
  }
  const segs = pathParts(url.pathname);

  if (CODE_HOSTS.has(host)) {
    return codeHostIdentity(host, segs);
  }

  if (isPlatformHost(host)) {
    if (host.endsWith(".github.io") && segs[0]) {
      const domain = `${host}/${segs[0].toLowerCase()}`;
      return { domain, canonicalUrl: `https://${domain}` };
    }
    return { domain: host, canonicalUrl: `https://${host}` };
  }

  const domain = registrableDomain(host);
  return { domain, canonicalUrl: `https://${domain}` };
}

function codeHostIdentity(host: string, segs: string[]): SiteIdentity {
  const a = segs[0]?.replace(/\.git$/i, "");
  if (!a || CODE_SKIP.has(a.toLowerCase())) {
    return { domain: host, canonicalUrl: `https://${host}` };
  }
  if (host === "huggingface.co" && (a === "spaces" || a === "datasets" || a === "models")) {
    const org = segs[1];
    const name = segs[2];
    if (org && name) {
      const domain = `${host}/${a}/${org}/${name}`.toLowerCase();
      return { domain, canonicalUrl: `https://${domain}` };
    }
  }
  const b = segs[1]?.replace(/\.git$/i, "");
  const rest = b ? `${a}/${b}` : a;
  const domain = `${host}/${rest}`.toLowerCase();
  return { domain, canonicalUrl: `https://${domain}` };
}
