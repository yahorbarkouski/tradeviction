import { describe, expect, it } from "vitest";
import { faviconDomain, identityFromUrl } from "@/lib/domain";

describe("site identity", () => {
  it.each([
    ["linear.app", "linear.app", "https://linear.app"],
    ["https://app.linear.app/team/x", "linear.app", "https://linear.app"],
    ["https://www.Example.com/path?q=1", "example.com", "https://example.com"],
    ["http://sub.deep.example.co.uk", "example.co.uk", "https://example.co.uk"],
    ["myapp.vercel.app", "myapp.vercel.app", "https://myapp.vercel.app"],
    ["https://someone.github.io/project/page", "someone.github.io/project", "https://someone.github.io/project"],
    ["https://github.com/org/repo.git", "github.com/org/repo", "https://github.com/org/repo"],
    ["https://github.com/pricing", "github.com", "https://github.com"],
    ["huggingface.co/spaces/org/name", "huggingface.co/spaces/org/name", "https://huggingface.co/spaces/org/name"],
    ["https://1.2.3.4/x", "1.2.3.4", "https://1.2.3.4"],
  ])("reads %s as %s", (raw, domain, canonicalUrl) => {
    expect(identityFromUrl(raw)).toEqual({ domain, canonicalUrl });
  });

  it.each(["ftp://files.example.com", "has spaces.com", "", "http://"])("rejects %j", (raw) => {
    expect(identityFromUrl(raw)).toBeNull();
  });
});

describe("faviconDomain", () => {
  it("is the identity when it can carry an icon, else null", () => {
    expect(faviconDomain("https://github.com/org/repo")).toBe("github.com/org/repo");
    expect(faviconDomain("192.168.0.1")).toBe("192.168.0.1");
    expect(faviconDomain("localhost")).toBeNull();
    expect(faviconDomain("")).toBeNull();
  });
});
