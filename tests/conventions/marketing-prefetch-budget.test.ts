import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { contentLinkPrefetch, leavesContentTree } from "@/components/shared/app-link";

import { REPO_ROOT, walkFiles } from "./walk";

// A <Link> in the viewport is prefetched, and every route outside the marketing tree lives in
// the (public) group, which mounts the CRM shell. So one "Sign in" button in the footer pulled
// the auth route's 13 chunks onto every marketing page: measured at 250-600 KB of extra transfer
// per template, and when those chunks landed before the observed first paint they joined the LCP
// graph and cost roughly 2.6s of simulated LCP. Prefetch on hover is unaffected by the rule below
// only in the sense that Next drops both; the trade is one deliberate click against every pageview.

const MARKETING_LINK_DIRECTORIES = [
  join("components", "marketing"),
  join("app", "components"),
  join("app", "[locale]", "(static)"),
];

const OUTSIDE_CONTENT_HREF = /href="\/(?:auth|onboarding|dashboard|contact)(?:\/[^"]*)?"/u;

function linkElements(source: string): string[] {
  return [...source.matchAll(/<(?:IntlLink|AppLink|NextLink|Link)\b[^>]*>/gu)].map(([element]) => element);
}

describe("marketing prefetch budget", () => {
  it("treats a link that stays inside the marketing tree as prefetchable", () => {
    expect(leavesContentTree("/pricing", "/en/blog/some-post")).toBe(false);
    expect(leavesContentTree("/en/docs", "/en")).toBe(false);
    expect(contentLinkPrefetch("/pricing")).toBeUndefined();
  });

  it("refuses to prefetch a route that leaves the marketing tree", () => {
    expect(leavesContentTree("/auth/signup", "/en")).toBe(true);
    expect(leavesContentTree("/contact", "/en/pricing")).toBe(true);
    expect(contentLinkPrefetch("/auth/signup")).toBe(false);
    expect(contentLinkPrefetch("/contact")).toBe(false);
  });

  it("leaves app-internal navigation alone, because the rule is about the page you are on", () => {
    expect(leavesContentTree("/auth/signup", "/dashboard")).toBe(false);
    expect(leavesContentTree("/contact", "/tasks")).toBe(false);
  });

  it("passes an explicit prefetch on every marketing link that hard-codes a route out of the tree", () => {
    const offenders: string[] = [];

    for (const directory of MARKETING_LINK_DIRECTORIES) {
      const files = walkFiles(join(REPO_ROOT, directory), (path) => path.endsWith(".tsx"));
      for (const path of files) {
        if (path.includes("__tests__")) continue;
        const source = readFileSync(path, "utf8");
        for (const element of linkElements(source)) {
          const href = OUTSIDE_CONTENT_HREF.exec(element);
          if (!href) continue;
          // AppLink decides for itself; every other link must say so at the call site.
          if (element.startsWith("<AppLink") || element.includes("prefetch=")) continue;
          offenders.push(`${relative(REPO_ROOT, path)}: ${element.replace(/\s+/gu, " ").slice(0, 110)}`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
