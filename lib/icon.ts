export function iconSources(domain: string, size = 64): string[] {
  const parts = domain.split("/").filter(Boolean);
  const host = parts[0] ?? domain;
  if (host === "github.com" && parts[1]) {
    return [`https://github.com/${parts[1]}.png?size=${size}`];
  }
  const page = encodeURIComponent(`https://${host}`);
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`,
    `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${page}&size=${size}`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ];
}

function alnum(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "");
}

export function iconLetter(name: string, domain: string): string {
  const fromName = alnum(name);
  if (fromName[0]) return fromName[0].toUpperCase();
  const fromDomain = alnum(domain);
  return fromDomain[0] ? fromDomain[0].toUpperCase() : "?";
}

export function iconMark(name: string, domain: string, size: number): string {
  if (size < 24) return iconLetter(name, domain);
  const fromName = alnum(name).slice(0, 2);
  if (fromName.length === 2) return fromName.toUpperCase();
  const fromDomain = alnum(domain.split("/")[0] ?? domain);
  const mixed = (fromName + fromDomain).slice(0, 2);
  return mixed ? mixed.toUpperCase() : "?";
}
